import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (Firebase DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { fetchTeamMembers } from '../services/api/users';
import { useData } from './context/DataContext';

// 🔥 Phase 8: tasks now come from Postgres via these adapters
import { completeTask as completeTaskApi, fetchTasks } from '../services/api/tasks';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

export default function TaskScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se sirf current user nikala gaya hai
  const { currentUser } = useData();

  // 🔥 2. "users" still Firestore; tasks are Postgres now
  const { isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded States
  // taskList now comes from useCachedList below (cache-first)
  const [userList, setUserList] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // --- STATES ---
  const [taskViewMode, setTaskViewMode] = useState<'MyTasks' | 'Given'>('MyTasks');
  const [activeStatus, setActiveStatus] = useState('Pending'); 
  const [searchText, setSearchText] = useState(''); 
  const [priorityFilter, setPriorityFilter] = useState('All'); 
  
  // ADMIN FILTER STATE
  const [selectedEmployee, setSelectedEmployee] = useState('All'); 
  const [employeeModalVisible, setEmployeeModalVisible] = useState(false);

  // DATE FILTER STATES
  const [dateViewMode, setDateViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [completionNote, setCompletionNote] = useState('');

  // LOADING STATE FOR COMPLETE BUTTON
  const [isCompleting, setIsCompleting] = useState(false);

  // PAGINATION STATE
  const [visibleCount, setVisibleCount] = useState(20);

  // RESET PAGINATION ON FILTER CHANGE
  useEffect(() => {
      if (dateViewMode === 'Day' && activeStatus === 'Pending' && !searchText) {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [taskViewMode, activeStatus, searchText, priorityFilter, selectedEmployee, dateViewMode, currentDate]);

  const isAdminOrManager = ['Admin', 'Manager', 'SuperAdmin'].includes(currentUser?.role || '');

  function getFetchRange(): { fromDate?: string; toDate?: string } {
      const toIso = (d: Date) => d.toISOString().split('T')[0];
      if (dateViewMode === 'All') return {};
      if (dateViewMode === 'Day') return { fromDate: toIso(currentDate), toDate: toIso(currentDate) };
      if (dateViewMode === 'Month') {
          const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
          return { fromDate: toIso(start), toDate: toIso(end) };
      }
      const m = currentDate.getMonth();
      const y = currentDate.getFullYear();
      const fyStartYear = m >= 3 ? y : y - 1;
      return { fromDate: toIso(new Date(fyStartYear, 3, 1)), toDate: toIso(new Date(fyStartYear + 1, 2, 31)) };
  }

  // 🔥 4a. Users list — still Firestore, loads once per session
  useEffect(() => {
      const loadUsers = async () => {
          if (currentUser?.companyId) setUserList(await fetchTeamMembers());
      };
      loadUsers();
  }, [currentUser]);

  // 🔥 TASKS — cache-first, parameterized by date-range + employee filter
  // (same pattern as attendance.tsx/travel.tsx). Fetches both directions
  // (received + given) and merges inside the fetcher, same as before —
  // the hook only cares that the fetcher resolves to one array.
  const usersReady = !(isAdminOrManager && selectedEmployee !== 'All' && userList.length === 0);
  const { fromDate, toDate } = getFetchRange();
  const resolveTargetUserId = (): string | undefined => {
      if (isAdminOrManager && selectedEmployee !== 'All') {
          return userList.find((u: any) => u.name === selectedEmployee)?.id;
      }
      return isAdminOrManager ? 'all' : undefined;
  };
  const targetUserId = resolveTargetUserId();
  const tasksCacheKey = buildCacheKey(`tasks:${dateViewMode}:${fromDate || 'none'}:${toDate || 'none'}:${targetUserId || 'self'}`, currentUser?.companyId);
  const {
      data: taskList,
      setData: setTaskList,
      loading: tasksLoading,
      refreshing: tasksRefreshing,
      refresh: refreshTasks,
  } = useCachedList({
      cacheKey: tasksCacheKey,
      enabled: !!currentUser?.companyId && usersReady,
      fetcher: async () => {
          const [received, given] = await Promise.all([
              fetchTasks({ direction: 'received', userId: targetUserId, fromDate, toDate, limit: 500 }),
              fetchTasks({ direction: 'given', userId: targetUserId, fromDate, toDate, limit: 500 }),
          ]);
          const merged = new Map<string, any>();
          [...received, ...given].forEach((t) => merged.set(t.id, t));
          return Array.from(merged.values());
      },
  });

  const onRefresh = async () => {
      setRefreshing(true);
      await refreshTasks();
      setRefreshing(false);
  };

  // --- GENERATE EMPLOYEE LIST ---
  const employeeList = useMemo(() => {
      const names = new Set(['All']);
      if (userList) userList.forEach((u: any) => {
          if(u.name) names.add(u.name);
      });
      if (taskList) {
          taskList.forEach((t: any) => {
              if (t.to && t.to !== 'Self') names.add(t.to);
              if (t.from) names.add(t.from);
          });
      }
      return Array.from(names).sort();
  }, [taskList, userList]);

  // --- COUNTS ---
  const myPendingCount = taskList.filter((t: any) => {
      if (isAdminOrManager) {
           const matchesUser = selectedEmployee === 'All' ? true : t.to === selectedEmployee;
           return matchesUser && t.status === 'Pending';
      }
      return (t.to === 'Self' || t.to === currentUser?.name) && t.status === 'Pending';
  }).length;

  const givenPendingCount = taskList.filter((t: any) => {
      if (isAdminOrManager) {
          if (selectedEmployee !== 'All') {
              return t.from === selectedEmployee && t.to !== 'Self' && t.status === 'Pending';
          }
          return t.from && t.from !== 'Self' && t.status === 'Pending';
      }
      return t.from === currentUser?.name && t.to !== 'Self' && t.to !== currentUser?.name && t.status === 'Pending';
  }).length;

  // --- HELPER: DATE PARSER ---
  const parseDate = (dateStr: string) => {
      if (!dateStr) return new Date(0);
      if (dateStr.includes('T')) return new Date(dateStr); 
      if (dateStr.includes('-')) return new Date(dateStr);
      const parts = dateStr.split('/');
      if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      return new Date(0);
  };

  // --- TIMING CHECKER ---
  const getTaskTiming = (task: any) => {
      if (!task.dueDate) return { label: 'No Due Date', color: 'gray', bg: '#eee' };
      const dueDate = parseDate(task.dueDate).setHours(23, 59, 59, 999); 
      if (task.status === 'Completed') {
          const completedDate = task.completedAt ? new Date(task.completedAt).getTime() : new Date().getTime();
          return completedDate > dueDate 
            ? { label: 'Completed Late ⚠️', color: '#D32F2F', bg: '#FFEBEE' }
            : { label: 'On Time ✅', color: '#2E7D32', bg: '#E8F5E9' };
      } else {
          const now = new Date().getTime();
          return now > dueDate 
            ? { label: 'Overdue (Late) ⏰', color: '#C62828', bg: '#FFEBEE' }
            : { label: 'Pending', color: '#F57C00', bg: '#FFF3E0' };
      }
  };

  // --- FY DATE NAVIGATION ---
  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (dateViewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (dateViewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (dateViewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  const getHeaderDate = () => {
      if (dateViewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      if (dateViewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (dateViewMode === 'FY') {
          const m = currentDate.getMonth(); 
          const y = currentDate.getFullYear();
          const startY = m >= 3 ? y : y - 1;
          return `FY ${startY.toString().slice(-2)}-${(startY + 1).toString().slice(-2)}`;
      }
      return "All Time";
  };

  // --- COLORS ---
  const getPriorityColor = (priority: string) => {
      switch(priority) {
          case 'Most Urgent': return '#D32F2F';
          case 'High': return '#F57C00';
          case 'Medium': return '#1976D2';
          default: return '#388E3C';
      }
  };

  // --- FILTER & SORT LOGIC ---
  const getFilteredData = () => {
      let data = taskList ? [...taskList] : [];

      if (taskViewMode === 'MyTasks') {
          if (isAdminOrManager) {
              if (selectedEmployee !== 'All') data = data.filter((t: any) => t.to === selectedEmployee);
          } else {
              data = data.filter((t: any) => t.to === 'Self' || t.to === currentUser?.name);
          }
      } else {
          if (isAdminOrManager) {
              if (selectedEmployee !== 'All') {
                  data = data.filter((t: any) => t.from === selectedEmployee && t.to !== 'Self');
              } else {
                  data = data.filter((t: any) => t.from && t.to !== 'Self'); 
              }
          } else {
              data = data.filter((t: any) => t.from === currentUser?.name && t.to !== 'Self' && t.to !== currentUser?.name);
          }
      }

      if (activeStatus !== 'All') data = data.filter((t: any) => t.status === activeStatus);
      if (priorityFilter !== 'All') data = data.filter((t: any) => t.priority === priorityFilter);

      if (searchText) {
          const lowerText = searchText.toLowerCase();
          data = data.filter((t: any) => {
              const fullString = `${t.task || ''} ${t.from || ''} ${t.to || ''} ${t.priority || ''} ${t.remark || ''}`.toLowerCase();
              return fullString.includes(lowerText);
          });
      }

      if (dateViewMode !== 'All') {
          const targetYear = currentDate.getFullYear();
          const targetMonth = currentDate.getMonth();
          const targetDay = currentDate.getDate();

          const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
          const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
          const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); 

          data = data.filter((item: any) => {
              const dateField = item.status === 'Completed' ? item.completedAt : (item.dueDate || item.createdAt);
              if(!dateField) return false;
              const itemDate = parseDate(dateField);
              const itemTime = itemDate.getTime();
              
              if (dateViewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
              if (dateViewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
              if (dateViewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
              return true;
          });
      }

      data.sort((a: any, b: any) => {
          if (a.status === 'Pending' && b.status === 'Completed') return -1;
          if (a.status === 'Completed' && b.status === 'Pending') return 1;
          const dateA = parseDate(a.dueDate || a.createdAt).getTime();
          const dateB = parseDate(b.dueDate || b.createdAt).getTime();
          return dateB - dateA;
      });

      return data;
  };

  const displayList = getFilteredData(); 
  const renderedList = displayList.slice(0, visibleCount);

  const handleOpenTask = (task: any) => {
      setSelectedTask(task);
      setTaskModalVisible(true);
      setCompletionNote('');
  };

  // 🔥 5. SAAS COMPLETE TASK LOGIC — Phase 8: PATCHes via completeTaskApi().
  // (Old "notify assigner" push dropped here too, same reasoning as travel.tsx's
  // settlement notification — re-add via addNotification once notifications move
  // off Firestore in Phase 9 and the Postgres/Firestore user-id mapping is settled.)
  const handleCompleteTask = async () => {
      if (!completionNote.trim()) return Alert.alert("Note Required", "Please enter what action you took.");
      
      setIsCompleting(true); 
      try {
          const res = await completeTaskApi(selectedTask.id, completionNote);

          if (res.success) {
              setTaskList(prev => prev.map(t => t.id === selectedTask.id ? res.record : t));
              Alert.alert("Success", "Task marked as completed!");
              setTaskModalVisible(false);
          } else {
              Alert.alert("Error", "Update Failed");
          }
      } catch (error) {
          Alert.alert("Error", "Update Failed");
      } finally {
          setIsCompleting(false); 
      }
  };

  return (
    <View style={styles.container}>
      
      <View style={styles.header}>
        <View style={styles.headerTop}>
             <View style={{flexDirection:'row', alignItems:'center'}}>
                 <TouchableOpacity onPress={() => router.back()} style={styles.backCircle}>
                     <Ionicons name="arrow-back" size={22} color="#333" />
                 </TouchableOpacity>
                 <Text style={styles.headerTitle}>Task Manager</Text>
             </View>
             <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_task' as any)}>
                <Ionicons name="add" size={20} color="white" />
                <Text style={styles.addBtnText}>New Task</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.toggleContainer}>
            <TouchableOpacity style={[styles.toggleBtn, taskViewMode === 'MyTasks' && styles.activeToggleBtn]} onPress={() => setTaskViewMode('MyTasks')}>
                <Text style={[styles.toggleText, taskViewMode === 'MyTasks' && styles.activeToggleText]}>
                    {isAdminOrManager && selectedEmployee !== 'All' ? `📥 For ${selectedEmployee.split(' ')[0]}` : '📥 Received'}
                </Text>
                {myPendingCount > 0 && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{myPendingCount}</Text></View>
                )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toggleBtn, taskViewMode === 'Given' && styles.activeToggleBtn]} onPress={() => setTaskViewMode('Given')}>
                <Text style={[styles.toggleText, taskViewMode === 'Given' && styles.activeToggleText]}>
                    {isAdminOrManager && selectedEmployee !== 'All' ? `📤 By ${selectedEmployee.split(' ')[0]}` : '📤 Assigned'}
                </Text>
                {givenPendingCount > 0 && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{givenPendingCount}</Text></View>
                )}
            </TouchableOpacity>
        </View>
      </View>

      <View style={{backgroundColor:'white', paddingBottom:10, marginBottom:5}}>
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'FY', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.dateTab, dateViewMode === m && styles.activeDateTab]} onPress={() => setDateViewMode(m as any)}>
                      <Text style={[styles.dateTabText, dateViewMode === m && styles.activeDateTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {dateViewMode !== 'All' && (
              <View style={styles.dateNav}>
                  <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                  <Text style={styles.monthText}>{getHeaderDate()}</Text>
                  <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
              </View>
          )}

          <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                  {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" style={{marginRight: 5}}/> : <Ionicons name="search" size={20} color="gray" />}
                  <TextInput 
                      style={styles.input}
                      placeholder="Search tasks..."
                      value={searchText}
                      onChangeText={setSearchText}
                  />
                  {searchText.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchText('')}>
                          <Ionicons name="close-circle" size={18} color="gray" />
                      </TouchableOpacity>
                  )}
              </View>

              {isAdminOrManager && (
                  <TouchableOpacity style={styles.adminFilterBtn} onPress={() => setEmployeeModalVisible(true)}>
                      <Text style={styles.adminFilterText} numberOfLines={1}>
                          {selectedEmployee === 'All' ? 'Staff' : selectedEmployee.split(' ')[0]}
                      </Text>
                      <Ionicons name="caret-down" size={12} color="#3b5998" />
                  </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.filterBtn, priorityFilter !== 'All' && {borderColor:'#3b5998', backgroundColor:'#e3f2fd'}]} onPress={() => setFilterModalVisible(true)}>
                  <Ionicons name="filter" size={20} color={priorityFilter !== 'All' ? "#3b5998" : "#555"} />
              </TouchableOpacity>
          </View>

          <View style={styles.statusTabContainer}>
              {['Pending', 'Completed', 'All'].map((tab) => (
                  <TouchableOpacity key={tab} style={[styles.statusTab, activeStatus === tab && styles.activeStatusTab]} onPress={() => setActiveStatus(tab)}>
                      <Text style={[styles.statusTabText, activeStatus === tab && styles.activeStatusTabText]}>{tab}</Text>
                  </TouchableOpacity>
              ))}
          </View>
          
          <Text style={{textAlign:'right', fontSize:12, color:'gray', paddingRight:15, marginTop:5}}>
              Total: <Text style={{fontWeight:'bold', color:'#3b5998'}}>{displayList.length}</Text>
          </Text>
      </View>

      <FlatList 
        data={renderedList}
        keyExtractor={(item, index) => (item.id || index.toString()) + index}
        contentContainerStyle={styles.listPadding}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:2}}>
                {tasksLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                    <>
                        <Ionicons name="checkbox-outline" size={60} color="#ccc" />
                        <Text style={{color:'gray', marginTop:10}}>No Tasks Found</Text>
                        {priorityFilter !== 'All' && <Text style={{color:'#3b5998', marginTop:5}}>Filter: {priorityFilter}</Text>}
                    </>
                )}
            </View>
        }
        renderItem={({item}) => {
            const pColor = getPriorityColor(item.priority);
            const timing = getTaskTiming(item); 
            return (
                <TouchableOpacity style={[styles.card, {borderLeftColor: pColor}]} onPress={() => handleOpenTask(item)}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.taskTitle} numberOfLines={1}>{item.task}</Text>
                        <View style={[styles.priorityBadge, {backgroundColor: pColor + '20', marginRight:5}]}>
                            <Text style={[styles.priorityText, {color: pColor}]}>{item.priority}</Text>
                        </View>
                    </View>
                    
                    <View style={styles.cardBody}>
                        <View style={{flexDirection:'row', marginBottom:5}}>
                            <View style={{backgroundColor: timing.bg, paddingHorizontal:6, paddingVertical:2, borderRadius:4}}>
                                <Text style={{color: timing.color, fontSize:10, fontWeight:'bold'}}>{timing.label}</Text>
                            </View>
                        </View>
                        <View style={styles.infoRow}>
                            <Ionicons name="person-outline" size={12} color="#666" />
                            <Text style={styles.infoLabel}>{taskViewMode === 'MyTasks' ? 'From:' : 'To:'}</Text>
                            <Text style={styles.infoValue}>{taskViewMode === 'MyTasks' ? item.from : item.to}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Ionicons name="calendar-outline" size={12} color="#666" />
                            <Text style={styles.infoLabel}>Due:</Text>
                            <Text style={[styles.infoValue, {color: timing.color}]}>{item.dueDate}</Text>
                        </View>
                        
                        {/* Admin Info */}
                        {isAdminOrManager && (
                             <View style={styles.infoRow}>
                                <Ionicons name={taskViewMode === 'MyTasks' ? "arrow-forward-circle-outline" : "person-add-outline"} size={12} color="#666" />
                                <Text style={styles.infoLabel}>{taskViewMode === 'MyTasks' ? 'For:' : 'By:'}</Text>
                                <Text style={[styles.infoValue, {color:'#3b5998', fontWeight:'bold'}]}>
                                    {taskViewMode === 'MyTasks' ? item.to : item.from}
                                </Text>
                            </View>
                        )}
                        {item.status === 'Completed' && (
                            <View style={{marginTop: 5, padding: 5, backgroundColor: '#E8F5E9', borderRadius: 5}}>
                                <Text style={{fontSize: 10, color: '#2E7D32'}}>
                                    ✅ Done by <Text style={{fontWeight:'bold'}}>{item.completedBy || 'Unknown'}</Text>
                                </Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            );
        }}
        
        ListFooterComponent={
          <View style={{ paddingBottom: 80 }}>
              {visibleCount < displayList.length ? (
                  <TouchableOpacity 
                      onPress={() => setVisibleCount(prev => prev + 20)} 
                      style={{
                          padding: 12, 
                          backgroundColor: '#fff', 
                          alignItems: 'center', 
                          marginVertical: 10, 
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#ddd',
                          elevation: 1
                      }}
                  >
                      <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                          👇 Load More Tasks ({displayList.length - visibleCount} remaining)
                      </Text>
                  </TouchableOpacity>
              ) : (
                  displayList.length > 0 ? (
                      <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                          --- End of List ---
                      </Text>
                  ) : null
              )}
          </View>
      }
    />

      {/* TASK DETAIL MODAL */}
      <Modal visible={taskModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Task Details</Text>
                      <TouchableOpacity onPress={() => setTaskModalVisible(false)}>
                          <Ionicons name="close-circle" size={28} color="#777" />
                      </TouchableOpacity>
                  </View>
                  {selectedTask && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          <Text style={styles.modalTaskTitle}>{selectedTask.task}</Text>
                          <View style={{alignSelf:'flex-start', marginBottom:10}}>
                              <View style={{backgroundColor: getTaskTiming(selectedTask).bg, paddingHorizontal:8, paddingVertical:4, borderRadius:6}}>
                                  <Text style={{color: getTaskTiming(selectedTask).color, fontWeight:'bold', fontSize:12}}>
                                      {getTaskTiming(selectedTask).label}
                                  </Text>
                              </View>
                          </View>
                          <View style={styles.modalMetaRow}>
                              <Text style={styles.metaLabel}>Assigned By: <Text style={styles.metaValue}>{selectedTask.from}</Text></Text>
                              <Text style={styles.metaLabel}>Priority: <Text style={{color: getPriorityColor(selectedTask.priority), fontWeight:'bold'}}>{selectedTask.priority}</Text></Text>
                          </View>
                          <View style={styles.dateBox}>
                              <View>
                                  <Text style={styles.dateLabel}>Assigned Date</Text>
                                  <Text style={styles.dateValue}>{selectedTask.date || selectedTask.createdAt ? (selectedTask.date || selectedTask.createdAt).split('T')[0] : '-'}</Text>
                              </View>
                              <View style={{alignItems:'flex-end'}}>
                                  <Text style={styles.dateLabel}>Due Date</Text>
                                  <Text style={[styles.dateValue, {color: '#D32F2F'}]}>{selectedTask.dueDate}</Text>
                              </View>
                          </View>
                          <Text style={styles.sectionHeading}>Task Description</Text>
                          <View style={styles.descriptionBox}>
                              <Text style={styles.descriptionText}>{selectedTask.remark || 'No description provided.'}</Text>
                          </View>
                          
                          {selectedTask.status === 'Pending' ? (
                              <View style={styles.actionSection}>
                                  <Text style={styles.sectionHeading}>Your Response</Text>
                                  <TextInput 
                                      style={styles.modalInput} 
                                      multiline 
                                      placeholder="What have you done for this task?" 
                                      value={completionNote} 
                                      onChangeText={setCompletionNote} 
                                      editable={!isCompleting} 
                                  />
                                  <TouchableOpacity 
                                      style={[styles.completeBtn, isCompleting && { opacity: 0.6 }]} 
                                      onPress={handleCompleteTask}
                                      disabled={isCompleting}
                                  >
                                      {isCompleting ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.completeBtnText}>Mark as Done</Text>}
                                  </TouchableOpacity>
                              </View>
                          ) : selectedTask.status === 'Completed' ? (
                              <View style={styles.doneBox}>
                                  <Text style={styles.sectionHeading}>Completion Report</Text>
                                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}>
                                      <View><Text style={styles.metaLabel}>Done By</Text><Text style={styles.metaValue}>{selectedTask.completedBy || 'Unknown'}</Text></View>
                                      <View><Text style={styles.metaLabel}>Completed On</Text><Text style={styles.metaValue}>{selectedTask.completedAt ? selectedTask.completedAt.split('T')[0] : '-'}</Text></View>
                                  </View>
                                  <Text style={styles.sectionHeading}>Action Taken</Text>
                                  <Text style={styles.doneText}>{selectedTask.completionRemarks || selectedTask.completionNote || 'No remarks added.'}</Text>
                              </View>
                          ) : null}
                      </ScrollView>
                  )}
              </View>
          </View>
          </KeyboardAvoidingView>
      </Modal>

      {/* ADMIN EMPLOYEE MODAL */}
      <Modal visible={employeeModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEmployeeModalVisible(false)}>
            <View style={styles.dropdownModal}>
                <Text style={styles.dropdownTitle}>Select Employee</Text>
                <FlatList
                    data={employeeList}
                    keyExtractor={(item) => item}
                    renderItem={({item}) => (
                        <TouchableOpacity 
                            style={[styles.dropdownItem, selectedEmployee === item && styles.selectedDropdownItem]} 
                            onPress={() => {
                                setSelectedEmployee(item);
                                setEmployeeModalVisible(false);
                            }}
                        >
                            <Text style={[styles.dropdownText, selectedEmployee === item && {color:'white', fontWeight:'bold'}]}>{item}</Text>
                            {selectedEmployee === item && <Ionicons name="checkmark" size={18} color="white" />}
                        </TouchableOpacity>
                    )}
                />
            </View>
        </TouchableOpacity>
      </Modal>

      {/* PRIORITY FILTER MODAL */}
      <Modal visible={filterModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFilterModalVisible(false)}>
            <View style={styles.dropdownModal}>
                <Text style={styles.dropdownTitle}>Filter by Priority</Text>
                {['All', 'Most Urgent', 'High', 'Medium', 'Low'].map((item) => (
                    <TouchableOpacity 
                        key={item}
                        style={[styles.dropdownItem, priorityFilter === item && styles.selectedDropdownItem]} 
                        onPress={() => {
                            setPriorityFilter(item);
                            setFilterModalVisible(false);
                        }}
                    >
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            {item !== 'All' && <View style={{width:10, height:10, borderRadius:5, backgroundColor: getPriorityColor(item), marginRight:10}} />}
                            <Text style={[styles.dropdownText, priorityFilter === item && {color:'white', fontWeight:'bold'}]}>{item}</Text>
                        </View>
                        {priorityFilter === item && <Ionicons name="checkmark" size={18} color="white" />}
                    </TouchableOpacity>
                ))}
            </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { backgroundColor: 'white', padding: 15, paddingTop: 50, elevation: 0 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  backCircle: { backgroundColor: '#F0F0F0', padding: 6, borderRadius: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A237E', marginLeft: 10 },
  addBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#3B5998', borderRadius:8, paddingHorizontal:12, paddingVertical:8 },
  addBtnText: { color:'white', fontWeight:'bold', marginLeft:4, fontSize:13 },
  
  toggleContainer: { flexDirection: 'row', backgroundColor: '#F1F3F4', borderRadius: 10, padding: 4, marginBottom: 5 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, flexDirection:'row', justifyContent:'center' },
  activeToggleBtn: { backgroundColor: 'white', elevation: 2 },
  toggleText: { color: '#777', fontWeight: '600', fontSize:12 },
  activeToggleText: { color: '#3B5998', fontWeight: 'bold' },
  badge: { backgroundColor: '#D32F2F', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 5, minWidth: 20, alignItems: 'center' },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 2, borderRadius: 8, padding: 2, marginBottom: 5 },
  dateTab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeDateTab: { backgroundColor: 'white', elevation: 2 },
  dateTabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeDateTabText: { color: '#3b5998', fontWeight: 'bold' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 6, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchRow: { flexDirection: 'row', paddingHorizontal: 15, justifyContent: 'space-between', marginBottom:10 },
  searchBar: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 10, flexDirection:'row', alignItems:'center', paddingHorizontal: 10, height: 42 },
  input: { flex: 1, marginLeft: 8, fontSize: 14 },
  
  adminFilterBtn: { height: 42, backgroundColor: '#E3F2FD', borderRadius: 10, marginLeft: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent:'space-between', borderWidth: 1, borderColor: '#90CAF9', minWidth: 80 },
  adminFilterText: { color: '#1565C0', fontWeight: 'bold', fontSize: 12, marginRight: 4, maxWidth: 70 },
  
  filterBtn: { width: 42, height: 42, backgroundColor: 'white', borderRadius: 10, marginLeft: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#DDD' },

  statusTabContainer: { flexDirection: 'row', gap: 10, paddingHorizontal:15 },
  statusTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#F1F3F4' },
  activeStatusTab: { backgroundColor: '#3B5998' },
  statusTabText: { color: '#777', fontWeight: 'bold', fontSize: 12 },
  activeStatusTabText: { color: 'white' },

  listPadding: { padding: 15, paddingBottom: 100 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 15, marginBottom: 12, elevation: 2, borderLeftWidth: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  taskTitle: { fontWeight: 'bold', fontSize: 15, color: '#333', flex: 1 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityText: { fontSize: 10, fontWeight: 'bold' },
  cardBody: { gap: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#777', marginLeft: 4, width: 40 },
  infoValue: { fontSize: 12, color: '#333', fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, minHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A237E' },
  modalTaskTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  modalMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  metaLabel: { fontSize: 12, color: '#777' },
  metaValue: { color: '#333', fontWeight: 'bold' },
  sectionHeading: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 8, marginTop: 10 },
  descriptionBox: { backgroundColor: '#F8F9FA', padding: 15, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#3B5998' },
  descriptionText: { color: '#444', lineHeight: 20 },
  actionSection: { marginTop: 10, marginBottom: 20 },
  modalInput: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 15, height: 100, textAlignVertical: 'top', borderStyle: 'dashed', borderWidth: 1, borderColor: '#CCC' },
  completeBtn: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  completeBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  doneBox: { marginTop: 20, padding: 15, backgroundColor: '#E8F5E9', borderRadius: 12 },
  doneText: { color: '#2E7D32', fontStyle: 'italic', fontSize: 14, fontWeight: '500' },
  
  dateBox: { flexDirection:'row', justifyContent:'space-between', backgroundColor:'#f5f5f5', padding:10, borderRadius:8, marginBottom:10 },
  dateLabel: { fontSize:11, color:'gray' },
  dateValue: { fontWeight:'bold', fontSize:14, color:'#333' },

  dropdownModal: { backgroundColor: 'white', width: '80%', alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto', borderRadius: 15, padding: 20, elevation: 10, maxHeight: '60%' },
  dropdownTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#333' },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  selectedDropdownItem: { backgroundColor: '#3b5998', borderRadius: 8, borderBottomWidth: 0 },
  dropdownText: { fontSize: 16, color: '#333' }
});
