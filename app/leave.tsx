import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (still used for "users" — user profile master list stays on Firestore until Phase 10)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

// 🔥 Phase 7: leaves/attendance/holidays now come from Postgres via these adapters
import { fetchLeaveSummary, getLeave, LeaveFeedFilters, LeaveFeedKind, listLeaveFeedPage, LeaveTypeBalance, updateLeaveStatus as updateLeaveStatusApi } from '../services/api/leaves';
import { fetchTeamMembers } from '../services/api/users';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { useServerPagedList } from '../hooks/useServerPagedList';
import { periodRange, useDebounced } from '../utils/periodRange';
import { PeriodTabs, StaffPeriodRow, TotalBar } from '../components/compact';

export default function LeaveApplicationScreen() {
  const headerTop = useHeaderTop();
  const router = useRouter();

  // 🔥 1. Context se sirf user aur notifications
  const { currentUser } = useData();
  // 🔥 2. "users" abhi bhi Firestore se (Phase 10 tak) — baaki sab Postgres se
  const { isDbLoading: isUsersLoading } = useSaaSDB();

  // STATES
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('All'); 
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchText, setSearchText] = useState('');
  
  // 🔥 Phase 7: quota/used/balance/absents/short/lwp now come from GET /api/v1/leaves/summary
  // (server-computed for the employee's current FY) instead of a client-side day-by-day loop.
  // Note: this card is always FY-scoped now, regardless of the Day/Month/FY/All tabs below —
  // those tabs still filter the *list* of leave records, just not this balance summary.
  const [stats, setStats] = useState({ 
      baseTotal: 0, earned: 0, total: 0, used: 0, absents: 0, shortDays: 0, balance: 0, lwp: 0,
      typed: null as LeaveTypeBalance[] | null, // Leave Policy on: CL / SL / EL / Comp Off
  });
  const [summaryLoading, setSummaryLoading] = useState(false);
  

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const [employees, setEmployees] = useState<{name: string, id?: string, yearlyLeaves?: number, joiningDate?: any, createdAt?: any}[]>([]);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All'); 
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const userRole = (currentUser?.role || '').toLowerCase().trim();
  const canManage = ['admin', 'manager', 'account', 'accountant', 'hr', 'superadmin'].includes(userRole);

  const currentFyStartYear = () => {
      const m = currentDate.getMonth();
      const y = currentDate.getFullYear();
      return m >= 3 ? y : y - 1;
  };

  // 🔥 LEAVES — 20 per page from the server: leave requests + Absent / Half Day /
  // Earned rows (worked out on the server from attendance), date range,
  // employee and search. Field staff always get only their own (server-enforced).
  const usersReady = !(canManage && selectedEmployeeName !== 'All' && employees.length === 0);
  const resolveTargetUserId = (): string | undefined => {
      if (!canManage) return undefined;
      if (selectedEmployeeName === 'All') return 'all';
      return employees.find(e => e.name === selectedEmployeeName)?.id;
  };
  const targetUserId = resolveTargetUserId();
  const debouncedSearch = useDebounced(searchText.trim());
  // Tap on a summary box → the list shows only that kind of row (tap again to clear).
  type BoxFilter = { key: string; label: string; kind: LeaveFeedKind; bucket?: LeaveFeedFilters['bucket'] };
  const [boxFilter, setBoxFilter] = useState<BoxFilter | null>(null);
  const toggleBox = (f: BoxFilter) => {
      if (boxFilter?.key === f.key) { setBoxFilter(null); return; }
      setBoxFilter(f);
      // The boxes count the financial year, so show the same FY in the list.
      if (viewMode !== 'FY') setViewMode('FY');
  };
  const leaveFilters = useMemo<LeaveFeedFilters>(() => ({
      ...periodRange(viewMode, currentDate),
      userId: targetUserId,
      search: debouncedSearch || undefined,
      kind: boxFilter?.kind,
      bucket: boxFilter?.bucket,
  }), [viewMode, currentDate, targetUserId, debouncedSearch, boxFilter]);
  const [pendingCount, setPendingCount] = useState(0);
  const fetchLeavePage = useCallback(async (p: LeaveFeedFilters & { page: number; limit: number }) => {
      const r = await listLeaveFeedPage(p);
      if (p.page === 1) setPendingCount(r.pending);
      return r;
  }, []);
  const isDefaultView = viewMode === 'All' && selectedEmployeeName === 'All' && !debouncedSearch && !boxFilter;
  const {
      items: leaveList,
      setItems: setLeaveList,
      total: leaveTotal,
      loading: leaveLoading,
      loadingMore: leaveLoadingMore,
      hasMore: leaveHasMore,
      loadMore: loadMoreLeaves,
      refreshing: leaveRefreshing,
      refresh: refreshLeaves,
      error: leaveError,
  } = useServerPagedList<LeaveFeedFilters, any>({
      fetchPage: fetchLeavePage,
      filters: leaveFilters,
      enabled: !!currentUser?.companyId && usersReady,
      cacheKey: isDefaultView ? buildCacheKey('leave_feed_page1_v1', currentUser?.companyId) : null,
  });
  const isDbLoading = isUsersLoading || leaveLoading;

  // 🔥 Users list (+ derived employee picker options) — cache-first, shares
  // the SAME 'team_members' cache key as manage_team.tsx/employee_timeline.tsx.
  const { data: userList } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });
  useEffect(() => {
      if (canManage) {
          const uniqueUsersMap = new Map();
          userList.forEach((u: any) => {
              if (u.name && !uniqueUsersMap.has(u.name)) {
                  uniqueUsersMap.set(u.name, {
                      name: u.name,
                      id: u.id,
                      yearlyLeaves: u.yearlyLeaves || 18,
                      joiningDate: u.joiningDate || null,
                      createdAt: u.createdAt || null
                  });
              }
          });
          setEmployees([{ name: 'All', yearlyLeaves: 0, joiningDate: null, createdAt: null }, ...Array.from(uniqueUsersMap.values())]);
      }
  }, [userList, canManage]);

  // 🔥 Phase 7: fetch the server-computed balance summary whenever the target employee
  // or the visible FY (driven by currentDate) changes.
  useEffect(() => {
      const loadSummary = async () => {
          if (!currentUser?.companyId) return;
          setSummaryLoading(true);
          try {
              const targetEmployee = employees.find(e => e.name === selectedEmployeeName);
              const targetUserId = canManage
                  ? (selectedEmployeeName === 'All' ? undefined : targetEmployee?.id)
                  : undefined; // self

              // "All employees" selected by a manager: summary card doesn't make sense for
              // a whole company at once, so we skip the call and zero it out.
              if (canManage && selectedEmployeeName === 'All') {
                  setStats({ baseTotal: 0, earned: 0, total: 0, used: 0, absents: 0, shortDays: 0, balance: 0, lwp: 0, typed: null });
                  return;
              }

              const summary = await fetchLeaveSummary({ userId: targetUserId, fyStartYear: currentFyStartYear() });
              setStats({
                  baseTotal: summary.baseQuota,
                  earned: summary.earned,
                  total: summary.totalQuota,
                  used: summary.used,
                  absents: summary.absents,
                  shortDays: summary.shortDays,
                  balance: summary.balance,
                  lwp: summary.lwp,
                  typed: summary.policy?.enabled && summary.balances ? summary.balances : null,
              });
          } catch (e) {
              console.log('Leave summary fetch failed', e);
          } finally {
              setSummaryLoading(false);
          }
      };
      loadSummary();
  }, [currentUser, selectedEmployeeName, employees, currentDate]);



  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (viewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  const getHeaderDate = () => {
      if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (viewMode === 'FY') {
          const m = currentDate.getMonth(); 
          const y = currentDate.getFullYear();
          const startY = m >= 3 ? y : y - 1;
          return `FY ${startY.toString().slice(-2)}-${(startY + 1).toString().slice(-2)}`;
      }
      return "All Time";
  };


  // 🔥 5. SAAS STATUS UPDATE LOGIC — Phase 7: now calls PATCH /api/v1/leaves/:id/status
  const handleStatusChange = async (status: string) => {
      if(selectedItem.isAutoRecord) {
          Alert.alert("Action Not Allowed", "This is an auto-generated system record.");
          return;
      }
      setUpdatingStatus(status); 
      try {
          const res = await updateLeaveStatusApi(selectedItem.id, status as 'Approved' | 'Rejected');

          if (res.success) {
              
              // Silent local reload
              setLeaveList(prev => prev.map(item => item.id === selectedItem.id ? { ...item, status: status } : item));
              refreshLeaves(); // pending count + system rows change with an approval

              setModalVisible(false);
              Alert.alert("Updated", `Leave marked as ${status}`);
          } else {
              Alert.alert("Error", "Could not update status.");
          }
      } catch (error) { 
          Alert.alert("Error", "Could not update status."); 
      } finally { 
          setUpdatingStatus(null); 
      }
  };

  const openDetails = (item: any) => { setSelectedItem(item); setModalVisible(true); };

  // Opened from a notification: /leave?id=<request id> → show that request.
  const linkParams = useLocalSearchParams<{ id?: string }>();
  const openedFromLink = useRef<string | null>(null);
  useEffect(() => {
      const id = typeof linkParams.id === 'string' ? linkParams.id : undefined;
      if (!id || openedFromLink.current === id) return;
      openedFromLink.current = id;
      const item = leaveList.find((x: any) => x.id === id);
      if (item) { openDetails(item); return; }
      // Not on the loaded page — fetch just that request.
      getLeave(id).then(openDetails).catch(() => {});
  }, [linkParams.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderItem = ({ item }: any) => {
    const isAbsentRecord = item.status === 'Absent';
    const isEarnedRecord = item.isEarned;
    const isCancelledRecord = item.isCancelled;

    // Half Day counts in the SHORT card (0.5), not in ABSENT — label it the same way.
    const isShortRecord = item.isAutoRecord && item.type === 'Half Day';
    let statusInfo = getStatusColor(item.status);
    if (isCancelledRecord) statusInfo = { bg: '#e3f2fd', text: '#1565c0' };
    if (isShortRecord) statusInfo = { bg: '#fff3e0', text: '#e65100' };

    let cardBorderColor = 'transparent';
    if (isAbsentRecord) cardBorderColor = item.type === 'Half Day' ? '#ff9800' : '#d32f2f';
    if (isEarnedRecord) cardBorderColor = '#2e7d32';
    if (isCancelledRecord) cardBorderColor = '#1565c0';

    return (
      <TouchableOpacity 
          style={[styles.card, (isAbsentRecord || isEarnedRecord || isCancelledRecord) && { borderLeftWidth: 4, borderLeftColor: cardBorderColor }]} 
          onPress={() => openDetails(item)}
      >
          <View style={styles.cardHeader}>
              <Text style={styles.date}>{item.fromDate} ({item.days} Day)</Text>
              <View style={[styles.statusBadge, { backgroundColor: isEarnedRecord ? '#e8f5e9' : statusInfo.bg }]}>
                  <Text style={[styles.statusText, {color: isEarnedRecord ? 'green' : statusInfo.text}]}>{isShortRecord ? 'Short' : item.status}</Text>
              </View>
          </View>
          <Text style={[styles.type, isAbsentRecord && {color: item.type === 'Half Day' ? '#e65100' : '#d32f2f'}, isEarnedRecord && {color: '#2e7d32'}, isCancelledRecord && {color: '#1565c0'}]}>
              {item.type}
          </Text>
          <Text style={styles.reason} numberOfLines={1}>{item.reason}</Text>
          {canManage && <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginTop:5}}>👤 {item.senderName}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Leave & Absents</Text>
        {canManage && (
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#6a1b9a', marginRight: 8 }]} onPress={() => router.push('/leave_balances' as any)} accessibilityLabel="Leave balances">
                <Ionicons name="wallet-outline" size={18} color="white" />
            </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_leave' as any)}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>Apply</Text>
        </TouchableOpacity>
      </View>

      {stats.typed ? (
      <View style={styles.balanceContainer}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems:'center'}}>
              {stats.typed.map((b, i) => (
                  <React.Fragment key={b.type}>
                      {i > 0 && <View style={styles.vDivider}/>}
                      <TouchableOpacity
                          style={[styles.statBox, boxFilter?.key === b.type && styles.statBoxActive]}
                          onPress={() => toggleBox({ key: b.type, label: b.type === 'COMP' ? 'Comp Off' : b.type, kind: 'leave', bucket: b.type })}
                      >
                          <Text style={styles.statLabel}>{b.type === 'COMP' ? 'Comp Off' : b.type}</Text>
                          <Text style={[styles.statValue, {color:'#27ae60'}]}>{summaryLoading ? '...' : b.balance}</Text>
                          <Text style={{fontSize:9, color:'gray'}}>used {b.used} / {b.quota + b.opening}</Text>
                      </TouchableOpacity>
                  </React.Fragment>
              ))}
              {stats.lwp > 0 && (
                <>
                  <View style={styles.vDivider}/>
                  <TouchableOpacity
                      style={[styles.statBox, boxFilter?.key === 'LWP' && styles.statBoxActive]}
                      onPress={() => toggleBox({ key: 'LWP', label: 'Leave Without Pay', kind: 'leave', bucket: 'LWP' })}
                  >
                      <Text style={[styles.statLabel, {color: '#c62828'}]}>LWP</Text>
                      <Text style={[styles.statValue, {color:'#c62828'}]}>{stats.lwp}</Text>
                  </TouchableOpacity>
                </>
              )}
          </View>
      </View>
      ) : (
      <View style={styles.balanceContainer}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems:'center'}}>
              <TouchableOpacity
                  style={[styles.statBox, boxFilter?.key === 'earned' && styles.statBoxActive]}
                  disabled={!stats.earned}
                  onPress={() => toggleBox({ key: 'earned', label: 'Earned', kind: 'earned' })}
              >
                  <Text style={styles.statLabel}>Total Quota</Text>
                  <Text style={styles.statValue}>
                      {summaryLoading ? '...' : stats.total}
                      {stats.earned > 0 && <Text style={{fontSize:10, color:'#2e7d32'}}> (+{stats.earned})</Text>}
                  </Text>
              </TouchableOpacity>
              <View style={styles.vDivider}/>
              <TouchableOpacity
                  style={[styles.statBox, boxFilter?.key === 'leave' && styles.statBoxActive]}
                  onPress={() => toggleBox({ key: 'leave', label: 'Leave', kind: 'leave' })}
              >
                  <Text style={styles.statLabel}>Leave</Text>
                  <Text style={[styles.statValue, {color:'#e67e22'}]}>{stats.used}</Text>
              </TouchableOpacity>
              <View style={styles.vDivider}/>
              <TouchableOpacity
                  style={[styles.statBox, boxFilter?.key === 'absent' && styles.statBoxActive]}
                  onPress={() => toggleBox({ key: 'absent', label: 'Absent', kind: 'absent' })}
              >
                  <Text style={[styles.statLabel, {color: '#d32f2f'}]}>Absent</Text>
                  <Text style={[styles.statValue, {color:'#d32f2f'}]}>{stats.absents}</Text>
              </TouchableOpacity>
              <View style={styles.vDivider}/>
              <TouchableOpacity
                  style={[styles.statBox, boxFilter?.key === 'short' && styles.statBoxActive]}
                  onPress={() => toggleBox({ key: 'short', label: 'Short', kind: 'short' })}
              >
                  <Text style={[styles.statLabel, {color: '#ff9800'}]}>Short</Text>
                  <Text style={[styles.statValue, {color:'#ff9800'}]}>{stats.shortDays}</Text>
              </TouchableOpacity>
              <View style={styles.vDivider}/>
              <View style={styles.statBox}>
                  <Text style={[styles.statLabel, {color: '#27ae60'}]}>Bal</Text>
                  <Text style={[styles.statValue, {color:'#27ae60'}]}>{stats.balance}</Text>
              </View>
              
              {stats.lwp > 0 && (
                <>
                  <View style={styles.vDivider}/>
                  <TouchableOpacity
                      style={[styles.statBox, boxFilter?.key === 'leave' && styles.statBoxActive]}
                      onPress={() => toggleBox({ key: 'leave', label: 'Leave', kind: 'leave' })}
                  >
                      <Text style={[styles.statLabel, {color: '#c62828'}]}>LWP</Text>
                      <Text style={[styles.statValue, {color:'#c62828'}]}>{stats.lwp}</Text>
                  </TouchableOpacity>
                </>
              )}
          </View>
      </View>
      )}
      
      {pendingCount > 0 && (
        <View style={{backgroundColor:'#ffebee', padding:10, marginHorizontal:15, borderRadius:8, marginBottom:10, flexDirection:'row', alignItems:'center'}}>
            <Ionicons name="alert-circle" size={20} color="#d32f2f" />
            <Text style={{color:'#d32f2f', fontWeight:'bold', marginLeft:10}}>{pendingCount} Pending Requests Needs Action!</Text>
        </View>
      )}

      {/* FILTERS */}
      <View style={{backgroundColor:'white', paddingBottom:6}}>
          <PeriodTabs value={viewMode} onChange={setViewMode} />
          <StaffPeriodRow
              showStaff={canManage}
              staffLabel={selectedEmployeeName === 'All' ? 'All Staff' : selectedEmployeeName}
              onStaffPress={() => setShowEmployeePicker(true)}
              periodLabel={viewMode !== 'All' ? getHeaderDate() : undefined}
              onPrev={() => changeDate(-1)}
              onNext={() => changeDate(1)}
          />
          <View style={{paddingHorizontal:12, marginTop:6}}>
              <View style={styles.searchBar}>
                  {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
                  <TextInput style={styles.searchInput} placeholder="Search..." value={searchText} onChangeText={setSearchText} />
                  {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="gray" /></TouchableOpacity>}
              </View>
          </View>
          {boxFilter && (
              <TouchableOpacity onPress={() => setBoxFilter(null)} style={styles.filterHint}>
                  <Text style={styles.filterHintText}>Showing only {boxFilter.label} rows</Text>
                  <Ionicons name="close-circle" size={16} color="#3b5998" />
              </TouchableOpacity>
          )}
          <TotalBar label="Found" count={leaveTotal} accent="#2e7d32" />
      </View>

      <FlatList 
        data={leaveList} 
        keyExtractor={(item, index) => item.id || index.toString()} 
        renderItem={renderItem}
        contentContainerStyle={{padding: 12}}
        refreshControl={
            <RefreshControl refreshing={leaveRefreshing} onRefresh={refreshLeaves} colors={['#3b5998']} tintColor="#3b5998" />
        }
        ListEmptyComponent={
            <View style={{alignItems: 'center', marginTop: 50}}>
                {leaveLoading ? <ActivityIndicator size="large" color="#3b5998" /> : <Text style={{color:'gray'}}>{leaveError ? 'Could not load leaves — pull down to retry.' : 'No leave records found.'}</Text>}
            </View>
        }
        
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {leaveHasMore ? (
                    <TouchableOpacity onPress={loadMoreLeaves} disabled={leaveLoadingMore} style={styles.loadMoreBtn}>
                        {leaveLoadingMore ? <ActivityIndicator color="#3b5998" /> : (
                            <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({leaveTotal - leaveList.length} remaining)</Text>
                        )}
                    </TouchableOpacity>
                ) : (leaveList.length > 0 ? <Text style={styles.endListText}>--- End of List ---</Text> : null)}
            </View>
        }
      />

      {/* POPUP MODALS */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={styles.modalTitle}>
                          {selectedItem?.isCancelled ? 'Cancelled Leave' : (selectedItem?.isAutoRecord ? (selectedItem?.isEarned ? 'Earned Leave Details' : (selectedItem?.type === 'Half Day' ? 'Short Day Details' : 'Absent Details')) : 'Leave Details')}
                      </Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={28} color="#d32f2f" /></TouchableOpacity>
                  </View>
                  {selectedItem && (
                      <ScrollView>
                          {canManage && <View style={{backgroundColor:'#e3f2fd', padding:10, borderRadius:8, marginBottom:10}}><Text style={{color:'#1565c0', fontWeight:'bold', textAlign:'center'}}>👤 {selectedItem.senderName}</Text></View>}
                          
                          <DetailRow label="Date" value={selectedItem.fromDate} />
                          {!selectedItem.isAutoRecord && <DetailRow label="To" value={selectedItem.toDate} />}
                          <DetailRow label={selectedItem.isEarned ? "Days Earned" : (selectedItem.isCancelled ? "Days Refunded" : "Days Deducted")} value={selectedItem.days} highlight />
                          <DetailRow label="Type" value={selectedItem.type} color={selectedItem.isCancelled ? '#1565c0' : (selectedItem.isAutoRecord ? (selectedItem.isEarned ? '#2e7d32' : (selectedItem.type === 'Half Day' ? '#e65100' : '#d32f2f')) : undefined)} />
                          <DetailRow
                              label="Status"
                              value={selectedItem.isAutoRecord && selectedItem.type === 'Half Day' ? 'Short (0.5 day)' : selectedItem.status}
                              color={selectedItem.isCancelled ? '#1565c0' : (selectedItem.isEarned ? 'green' : (selectedItem.isAutoRecord && selectedItem.type === 'Half Day' ? '#e65100' : getStatusColor(selectedItem.status).text))}
                          />
                          <View style={styles.divider}/>
                          <Text style={{fontSize:12, color:'gray'}}>Reason/Note:</Text>
                          <Text style={{fontSize:14, color:'#333', marginTop:2}}>{selectedItem.reason}</Text>
                          
                          {canManage && selectedItem.status === 'Pending' && !selectedItem.isAutoRecord && (
                              <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:20}}>
                                  <TouchableOpacity style={[styles.rejectBtn, updatingStatus !== null && { opacity: 0.6 }]} onPress={() => handleStatusChange('Rejected')} disabled={updatingStatus !== null}>
                                      {updatingStatus === 'Rejected' ? <ActivityIndicator color="white" size="small" /> : <Text style={{color:'white', fontWeight:'bold'}}>Reject</Text>}
                                  </TouchableOpacity>
                                  <TouchableOpacity style={[styles.approveBtn, updatingStatus !== null && { opacity: 0.6 }]} onPress={() => handleStatusChange('Approved')} disabled={updatingStatus !== null}>
                                      {updatingStatus === 'Approved' ? <ActivityIndicator color="white" size="small" /> : <Text style={{color:'white', fontWeight:'bold'}}>Approve</Text>}
                                  </TouchableOpacity>
                              </View>
                          )}
                      </ScrollView>
                  )}
              </View>
          </View>
      </Modal>

      <Modal visible={showEmployeePicker} transparent animationType="fade">
          <View style={styles.pickerOverlay}>
              <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowEmployeePicker(false)} />
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Employee</Text>
                  <FlatList 
                    data={employees} 
                    keyExtractor={(item, index) => index.toString()} 
                    renderItem={({item}) => (
                      <TouchableOpacity style={styles.pickerItem} onPress={() => { setSelectedEmployeeName(item.name); setShowEmployeePicker(false); }}>
                          <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                          {selectedEmployeeName === item.name && <Ionicons name="checkmark" size={18} color="green" />}
                      </TouchableOpacity>
                  )} />
              </View>
          </View>
      </Modal>
    </View>
  );
}

const getStatusColor = (status: string) => {
    if(status === 'Approved') return { bg: '#e8f5e9', text: 'green' };
    if(status === 'Rejected') return { bg: '#ffebee', text: 'red' };
    if(status === 'Absent') return { bg: '#ffebee', text: '#d32f2f' }; 
    if(status === 'Worked') return { bg: '#e3f2fd', text: '#1565c0' }; 
    return { bg: '#fff3e0', text: '#e65100' };
};

const DetailRow = ({label, value, highlight, color}: any) => (
    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:8}}>
        <Text style={{color:'gray', fontWeight:'600'}}>{label}</Text>
        <Text style={{fontWeight:'bold', color: color ? color : (highlight ? '#2e7d32' : '#333')}}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: 'white', elevation: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 10 },
  addBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#3b5998', borderRadius:5, paddingHorizontal:12, paddingVertical:8 },
  balanceContainer: { backgroundColor: 'white', margin: 15, borderRadius: 10, padding: 15, elevation: 3 },
  statBox: { alignItems: 'center', flex: 1, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  statBoxActive: { borderColor: '#3b5998', backgroundColor: '#eef2fb' },
  filterHint: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginHorizontal: 12, marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#eef2fb' },
  filterHintText: { fontSize: 12, color: '#3b5998', fontWeight: '600' },
  statLabel: { color: 'gray', fontSize: 10, textTransform:'uppercase', marginBottom:5, fontWeight: 'bold' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  vDivider: { width: 1, height: 30, backgroundColor: '#eee' },
  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 36 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 11, marginBottom: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom:5 },
  date: { fontWeight:'bold', color:'gray', fontSize:13 },
  statusBadge: { paddingHorizontal:8, paddingVertical:4, borderRadius:12 },
  statusText: { fontSize:10, fontWeight:'bold' },
  type: { fontWeight:'bold', fontSize:16, color:'#333', marginBottom:5 },
  reason: { color:'gray', fontSize:13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998' },
  divider: { height:1, backgroundColor:'#eee', marginVertical:7 },
  approveBtn: { backgroundColor:'green', padding:12, borderRadius:8, flex:1, alignItems:'center', marginLeft:5 },
  rejectBtn: { backgroundColor:'#d32f2f', padding:12, borderRadius:8, flex:1, alignItems:'center', marginRight:5 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  endListText: { textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic' },
});
