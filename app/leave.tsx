import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

export default function LeaveApplicationScreen() {
  const router = useRouter();
  const { leaveList, updateLeaveStatus, user, addNotification, attendanceList, holidayList } = useData();

  // STATES
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('All'); 
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchText, setSearchText] = useState('');
  
  const [stats, setStats] = useState({ 
      baseTotal: 0, earned: 0, total: 0, used: 0, absents: 0, shortDays: 0, balance: 0, lwp: 0 
  });
  
  const [autoRecords, setAutoRecords] = useState<any[]>([]);

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const [employees, setEmployees] = useState<{name: string, yearlyLeaves?: number, joiningDate?: any, createdAt?: any}[]>([]);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All'); 
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  // 🔥 FIX 1: Robust Role Checking (Case Insensitive)
  const userRole = (user?.role || '').toLowerCase().trim();
  const canManage = ['admin', 'manager', 'account', 'accountant', 'hr'].includes(userRole);

  useEffect(() => {
      if (viewMode === 'Day') setVisibleCount(500); 
      else setVisibleCount(20); 
  }, [viewMode, currentDate, searchText, selectedEmployeeName]);

  useEffect(() => {
    if (canManage) {
      const fetchEmployees = async () => {
        try {
          const q = query(collection(db, "users"));
          const querySnapshot = await getDocs(q);
          const usersData = querySnapshot.docs.map(doc => ({
            name: doc.data().name || 'Unknown User', 
            yearlyLeaves: doc.data().yearlyLeaves || 18,
            joiningDate: doc.data().joiningDate || null,
            createdAt: doc.data().createdAt || null
          }));
          const uniqueUsers = Array.from(new Set(usersData.map(a => a.name)))
            .map(name => usersData.find(a => a.name === name));

          setEmployees([{ name: 'All', yearlyLeaves: 0, joiningDate: null, createdAt: null }, ...uniqueUsers as any]);
        } catch (error) {}
      };
      fetchEmployees();
    }
  }, [user]);

  // DATE HELPERS
  const getTimestampFromDDMMYYYY = (dateStr: string) => {
      if (!dateStr) return 0;
      if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
      }
      return new Date(dateStr).getTime();
  };

  const getStandardDate = (dateObj: Date) => {
      const offset = dateObj.getTimezoneOffset() * 60000;
      return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
  };

  const parseDate = (dateStr: any) => {
      if (!dateStr) return new Date();
      if (dateStr instanceof Date) return dateStr;
      if (typeof dateStr === 'string' && dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      return new Date(dateStr);
  };

  // ==========================================
  // 🔥 CORE LOGIC: ADVANCED ATTENDANCE & LEAVE ENGINE
  // ==========================================
  useEffect(() => {
      if (!leaveList || !attendanceList) return;

      let generatedRecords: any[] = [];
      let totalBase = 0, totalEarned = 0, totalUsed = 0, totalAbsents = 0, totalShort = 0, totalCancelled = 0;

      // 1. Determine users to process
      let usersToProcess = [];
      if (canManage && selectedEmployeeName === 'All') {
          usersToProcess = employees.filter(e => e.name !== 'All');
      } else if (canManage) {
          usersToProcess = employees.filter(e => e.name === selectedEmployeeName);
      } else {
          usersToProcess = [{ name: user?.name, yearlyLeaves: user?.yearlyLeaves || 18, joiningDate: user?.joiningDate, createdAt: user?.createdAt }];
      }

      // 2. Determine ViewMode Boundaries
      const targetY = currentDate.getFullYear();
      const targetM = currentDate.getMonth();
      const targetD = currentDate.getDate();
      
      const fYearStart = targetM >= 3 ? targetY : targetY - 1;
      const fyStartMs = new Date(fYearStart, 3, 1).getTime(); 
      const fyEndMs = new Date(fYearStart + 1, 2, 31, 23, 59, 59).getTime();

      const todayObj = new Date();
      const todayStr = getStandardDate(todayObj);

      // 3. Process each user
      usersToProcess.forEach(emp => {
          if (!emp || !emp.name) return;
          const empName = emp.name;
          totalBase += (emp.yearlyLeaves || 18);

          // Find start date for this employee
          let startOfCalculation = new Date(fYearStart, 3, 1); 
          const APP_LAUNCH_DATE = new Date(2026, 0, 1); 
          if (startOfCalculation < APP_LAUNCH_DATE) startOfCalculation = APP_LAUNCH_DATE;
          
          if (emp.joiningDate) {
              const joinD = new Date(emp.joiningDate);
              if (joinD > startOfCalculation) startOfCalculation = joinD; 
          } else if (emp.createdAt) {
              const createD = new Date(emp.createdAt);
              if (createD > startOfCalculation) startOfCalculation = createD;
          }

          let d = new Date(startOfCalculation);
          d.setHours(0,0,0,0);
          const todayLimit = new Date();
          todayLimit.setHours(0,0,0,0);

          while (d <= todayLimit) {
              const dateStr = getStandardDate(d);
              const loopTime = d.getTime();

              const isSunday = d.getDay() === 0;
              const isHoliday = holidayList?.some((h:any) => h.date === dateStr);
              
              const isOnLeave = leaveList?.some((l:any) => {
                  if (l.senderName !== empName || l.status !== 'Approved') return false;
                  const startLeave = getTimestampFromDDMMYYYY(l.fromDate);
                  const endLeave = getTimestampFromDDMMYYYY(l.toDate || l.fromDate);
                  return loopTime >= startLeave && loopTime <= endLeave;
              });

              const attRecord = attendanceList?.find((a:any) => 
                  (a.userName === empName || a.senderName === empName) && a.date === dateStr && a.status !== 'Absent' && a.status !== 'ABSENT' && a.inTime && a.inTime !== '-'
              );

              const isToday = (dateStr === todayStr);
              let isPresent = false;
              let isHalfDay = false;

              if (attRecord) {
                  isPresent = true;
                  const hasLoggedOut = attRecord.outTime && attRecord.outTime !== '--';
                  let hours = 0;
                  if (attRecord.workHrs && String(attRecord.workHrs).includes(':')) {
                      const p = String(attRecord.workHrs).split(':');
                      hours = parseInt(p[0]) + (parseInt(p[1])/60);
                  }
                  if (isToday) { if (hasLoggedOut && hours < 4) isHalfDay = true; } 
                  else { if ((hasLoggedOut && hours < 4) || !hasLoggedOut) isHalfDay = true; }
              }

              // Check if this day falls within our currently selected View Mode
              let shouldCountForStats = false;
              if (viewMode === 'All') shouldCountForStats = true;
              else if (viewMode === 'FY') shouldCountForStats = (loopTime >= fyStartMs && loopTime <= fyEndMs);
              else if (viewMode === 'Month') shouldCountForStats = (d.getFullYear() === targetY && d.getMonth() === targetM);
              else if (viewMode === 'Day') shouldCountForStats = (d.getFullYear() === targetY && d.getMonth() === targetM && d.getDate() === targetD);

              const parts = dateStr.split('-');
              const displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

              // ADVANCED LOGIC KICK-IN
              if (isPresent) {
                  if (isOnLeave) {
                      // Work on Leave Day -> Cancel Leave
                      if (shouldCountForStats) totalCancelled += (isHalfDay ? 0.5 : 1);
                      if (shouldCountForStats) generatedRecords.push({
                          id: `cancel-${dateStr}-${empName}`, isAutoRecord: true, isCancelled: true, senderName: empName, fromDate: displayDate,
                          days: `-${isHalfDay ? 0.5 : 1}`, type: 'Leave Cancelled', status: 'Worked', reason: 'Present on an approved leave day', createdAt: d.toISOString() 
                      });
                  } else if (isSunday || isHoliday) {
                      // Work on Sunday/Holiday -> Earn Leave
                      if (shouldCountForStats) totalEarned += (isHalfDay ? 0.5 : 1);
                      if (shouldCountForStats) generatedRecords.push({
                          id: `earned-${dateStr}-${empName}`, isAutoRecord: true, isEarned: true, senderName: empName, fromDate: displayDate,
                          days: `+${isHalfDay ? 0.5 : 1}`, type: 'Earned Leave', status: 'Approved', reason: isSunday ? 'Worked on Sunday' : 'Worked on Holiday', createdAt: d.toISOString() 
                      });
                  }
                  
                  if (isHalfDay) {
                      // Short Day -> Half Day Absent
                      if (shouldCountForStats) totalShort += 0.5;
                      if (shouldCountForStats) generatedRecords.push({
                          id: `half-${dateStr}-${empName}`, isAutoRecord: true, senderName: empName, fromDate: displayDate,
                          days: "0.5", type: 'Half Day', status: 'Absent', reason: isToday ? 'Short Working Hours' : 'Short Hours / Forgot Day-Out', createdAt: d.toISOString() 
                      });
                  }
              } else {
                  if (!isSunday && !isHoliday && !isOnLeave && dateStr <= todayStr) {
                      // Unexplained Absence
                      if (shouldCountForStats) totalAbsents += 1;
                      if (shouldCountForStats) generatedRecords.push({
                          id: `absent-${dateStr}-${empName}`, isAutoRecord: true, senderName: empName, fromDate: displayDate,
                          days: "1", type: 'Auto-Deduction', status: 'Absent', reason: 'System Auto-Marked Absent', createdAt: d.toISOString() 
                      });
                  }
              }

              d.setDate(d.getDate() + 1);
          }

          // Count Approved Leaves from DB
          leaveList?.forEach((l: any) => {
              if (l.senderName === empName && l.status === 'Approved') {
                  const lTime = getTimestampFromDDMMYYYY(l.fromDate);
                  let shouldCount = false;
                  
                  if (viewMode === 'All') shouldCount = lTime >= startOfCalculation.getTime();
                  else if (viewMode === 'FY') shouldCount = (lTime >= fyStartMs && lTime <= fyEndMs);
                  else if (viewMode === 'Month') {
                      const lDate = parseDate(l.fromDate);
                      shouldCount = (lDate.getFullYear() === targetY && lDate.getMonth() === targetM);
                  }
                  else if (viewMode === 'Day') {
                      const lDate = parseDate(l.fromDate);
                      shouldCount = (lDate.getFullYear() === targetY && lDate.getMonth() === targetM && lDate.getDate() === targetD);
                  }

                  if (shouldCount) totalUsed += (parseFloat(l.days) || 0);
              }
          });
      });

      setAutoRecords(generatedRecords);

      const actualTotalQuota = totalBase + totalEarned; 
      const actualUsedLeaves = totalUsed - totalCancelled;
      const finalAbsents = totalAbsents + totalShort;
      
      let remainingBalance = actualTotalQuota - actualUsedLeaves - finalAbsents;
      let lwpDays = 0;

      if (remainingBalance < 0) {
          lwpDays = Math.abs(remainingBalance);
          remainingBalance = 0; 
      }

      setStats({
          baseTotal: totalBase,
          earned: totalEarned,
          total: actualTotalQuota,
          used: actualUsedLeaves,
          absents: totalAbsents,
          shortDays: totalShort, 
          balance: remainingBalance,
          lwp: lwpDays
      });

  }, [leaveList, attendanceList, holidayList, user, selectedEmployeeName, employees, viewMode, currentDate]);


  // NAVIGATION LOGIC
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

  // FILTER LIST LOGIC
  const getFilteredData = () => {
    let combinedData = Array.isArray(leaveList) ? [...leaveList] : [];
    
    // Merge DB leaves with our newly generated Absents/Earned/Cancelled Records
    combinedData = [...combinedData, ...autoRecords];

    let filtered = combinedData;

    if (canManage) {
        if(selectedEmployeeName !== 'All') {
            filtered = filtered.filter((item: any) => item.senderName === selectedEmployeeName);
        }
    } else {
        if(user?.uid) {
            filtered = filtered.filter((item: any) => item.senderId === user.uid || (item.isAutoRecord && item.senderName === user.name));
        }
    }

    // Filter DB Leaves by Date (Auto records are already filtered)
    if (viewMode !== 'All') {
        const targetYear = currentDate.getFullYear();
        const targetMonth = currentDate.getMonth();
        const targetDay = currentDate.getDate();

        const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
        const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
        const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); 

        filtered = filtered.filter(item => {
            if (item.isAutoRecord) return true; 
            
            const dStr = item.fromDate || item.createdAt;
            if(!dStr) return false;
            
            const itemDate = parseDate(dStr);
            const itemTime = itemDate.getTime();

            if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
            if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
            if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
            return true;
        });
    }

    if (searchText) {
        const text = searchText.toLowerCase();
        filtered = filtered.filter((item: any) => {
            const row = `${item.fromDate} ${item.type} ${item.status} ${item.senderName} ${item.reason}`.toLowerCase();
            return row.includes(text);
        });
    }

    // Sort uniquely generated UI records with database records
    // 🔥 NEW SORTING: 'Pending' status at the absolute top, then by Date
    filtered.sort((a: any, b: any) => {
        // 1. Pending Status Logic
        const aIsPending = a.status === 'Pending';
        const bIsPending = b.status === 'Pending';

        if (aIsPending && !bIsPending) return -1; // 'a' goes up
        if (!aIsPending && bIsPending) return 1;  // 'b' goes up

        // 2. Date Logic (If both are pending, or both are not pending)
        const dateA = a.isAutoRecord ? new Date(a.createdAt).getTime() : parseDate(a.createdAt).getTime();
        const dateB = b.isAutoRecord ? new Date(b.createdAt).getTime() : parseDate(b.createdAt).getTime();
        
        return dateB - dateA; // Newest first
    });

    return filtered;
  };

  const fullList = getFilteredData(); 
  const renderedList = fullList.slice(0, visibleCount);
  const pendingCount = fullList.filter(i => i.status === 'Pending' && !i.isAutoRecord).length;

  const handleStatusChange = async (status: string) => {
      if(selectedItem.isAutoRecord) {
          Alert.alert("Action Not Allowed", "This is an auto-generated system record.");
          return;
      }
      if(updateLeaveStatus) {
          setUpdatingStatus(status); 
          try {
              await updateLeaveStatus(selectedItem.id, status);
              const targetUserId = selectedItem.senderId || selectedItem.userId;
              if (addNotification && targetUserId && targetUserId !== user?.uid) {
                  await addNotification({
                      title: `Leave ${status}`, 
                      message: `Your leave request for ${selectedItem.days} days has been ${status}.`,
                      type: status === 'Approved' ? 'success' : 'alert',
                      userId: targetUserId,
                      to: selectedItem.senderName || 'Employee', 
                      route: '/leave'
                  });
              }
              setModalVisible(false);
              Alert.alert("Updated", `Leave marked as ${status}`);
          } catch (error) { Alert.alert("Error", "Could not update status."); } 
          finally { setUpdatingStatus(null); }
      }
  };

  const openDetails = (item: any) => { setSelectedItem(item); setModalVisible(true); };

  const renderItem = ({ item }: any) => {
    const isAbsentRecord = item.status === 'Absent';
    const isEarnedRecord = item.isEarned;
    const isCancelledRecord = item.isCancelled;

    let statusInfo = getStatusColor(item.status);
    if (isCancelledRecord) statusInfo = { bg: '#e3f2fd', text: '#1565c0' }; // Blue for cancelled

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
                  <Text style={[styles.statusText, {color: isEarnedRecord ? 'green' : statusInfo.text}]}>{item.status}</Text>
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Leave & Absents</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_leave' as any)}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>Apply</Text>
        </TouchableOpacity>
      </View>

      {/* 🔥 FIX 2: ALWAYS SHOW DASHBOARD CARDS TO EVERYONE */}
      <View style={styles.balanceContainer}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems:'center'}}>
              <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Total Quota</Text>
                  <Text style={styles.statValue}>
                      {stats.total} 
                      {stats.earned > 0 && <Text style={{fontSize:10, color:'#2e7d32'}}> (+{stats.earned})</Text>}
                  </Text>
              </View>
              <View style={styles.vDivider}/>
              <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Leave</Text>
                  <Text style={[styles.statValue, {color:'#e67e22'}]}>{stats.used}</Text>
              </View>
              <View style={styles.vDivider}/>
              <View style={styles.statBox}>
                  <Text style={[styles.statLabel, {color: '#d32f2f'}]}>Absent</Text>
                  <Text style={[styles.statValue, {color:'#d32f2f'}]}>{stats.absents}</Text>
              </View>
              <View style={styles.vDivider}/>
              <View style={styles.statBox}>
                  <Text style={[styles.statLabel, {color: '#ff9800'}]}>Short</Text>
                  <Text style={[styles.statValue, {color:'#ff9800'}]}>{stats.shortDays}</Text>
              </View>
              <View style={styles.vDivider}/>
              <View style={styles.statBox}>
                  <Text style={[styles.statLabel, {color: '#27ae60'}]}>Bal</Text>
                  <Text style={[styles.statValue, {color:'#27ae60'}]}>{stats.balance}</Text>
              </View>
              
              {stats.lwp > 0 && (
                <>
                  <View style={styles.vDivider}/>
                  <View style={styles.statBox}>
                      <Text style={[styles.statLabel, {color: '#c62828'}]}>LWP</Text>
                      <Text style={[styles.statValue, {color:'#c62828'}]}>{stats.lwp}</Text>
                  </View>
                </>
              )}
          </View>
      </View>
      
      {pendingCount > 0 && (
        <View style={{backgroundColor:'#ffebee', padding:10, marginHorizontal:15, borderRadius:8, marginBottom:10, flexDirection:'row', alignItems:'center'}}>
            <Ionicons name="alert-circle" size={20} color="#d32f2f" />
            <Text style={{color:'#d32f2f', fontWeight:'bold', marginLeft:10}}>{pendingCount} Pending Requests Needs Action!</Text>
        </View>
      )}

      {/* FILTERS */}
      <View style={{backgroundColor:'white', paddingBottom:10}}>
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'FY', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m === 'FY' ? 'FY (Yearly)' : m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {canManage && (
              <TouchableOpacity style={styles.employeeFilterBtn} onPress={() => setShowEmployeePicker(true)}>
                  <Ionicons name="people" size={18} color="#2e7d32" />
                  <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                      {selectedEmployeeName === 'All' ? 'View All Staff' : selectedEmployeeName}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:'auto'}}/>
              </TouchableOpacity>
          )}

          {viewMode !== 'All' && (
              <View style={styles.dateNav}>
                  <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                  <Text style={styles.monthText}>{getHeaderDate()}</Text>
                  <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
              </View>
          )}

          <View style={{paddingHorizontal:15}}>
              <View style={styles.searchBar}>
                  <Ionicons name="search" size={20} color="gray" />
                  <TextInput style={styles.searchInput} placeholder="Search..." value={searchText} onChangeText={setSearchText} />
                  {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="gray" /></TouchableOpacity>}
              </View>
              <Text style={{textAlign:'right', fontSize:12, color:'gray', marginTop:5}}>Found: <Text style={{fontWeight:'bold', color:'green'}}>{fullList.length}</Text></Text>
          </View>
      </View>

      <FlatList 
        data={renderedList} 
        keyExtractor={item => item.id} 
        renderItem={renderItem}
        contentContainerStyle={{padding: 15}}
        ListEmptyComponent={<Text style={{textAlign:'center', marginTop:50, color:'gray'}}>No leave records found.</Text>}
        
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < fullList.length ? (
                    <TouchableOpacity onPress={() => setVisibleCount(prev => prev + 20)} style={styles.loadMoreBtn}>
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({fullList.length - visibleCount} remaining)</Text>
                    </TouchableOpacity>
                ) : (fullList.length > 0 ? <Text style={styles.endListText}>--- End of List ---</Text> : null)}
            </View>
        }
      />

      {/* POPUP MODALS */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={styles.modalTitle}>
                          {selectedItem?.isCancelled ? 'Cancelled Leave' : (selectedItem?.isAutoRecord ? (selectedItem?.isEarned ? 'Earned Leave Details' : 'Absent Details') : 'Leave Details')}
                      </Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={28} color="#d32f2f" /></TouchableOpacity>
                  </View>
                  {selectedItem && (
                      <ScrollView>
                          {canManage && <Text style={{color:'#1565c0', fontWeight:'bold', marginBottom:10}}>👤 {selectedItem.senderName}</Text>}
                          <DetailRow label="Date" value={selectedItem.fromDate} />
                          {!selectedItem.isAutoRecord && <DetailRow label="To" value={selectedItem.toDate} />}
                          <DetailRow label={selectedItem.isEarned ? "Days Earned" : (selectedItem.isCancelled ? "Days Refunded" : "Days Deducted")} value={selectedItem.days} highlight />
                          <DetailRow label="Type" value={selectedItem.type} color={selectedItem.isCancelled ? '#1565c0' : (selectedItem.isAutoRecord ? (selectedItem.isEarned ? '#2e7d32' : (selectedItem.type === 'Half Day' ? '#e65100' : '#d32f2f')) : undefined)} />
                          <DetailRow label="Status" value={selectedItem.status} color={selectedItem.isCancelled ? '#1565c0' : (selectedItem.isEarned ? 'green' : getStatusColor(selectedItem.status).text)} />
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
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  addBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#3b5998', borderRadius:5, paddingHorizontal:12, paddingVertical:8 },
  balanceContainer: { backgroundColor: 'white', margin: 15, borderRadius: 10, padding: 15, elevation: 3 },
  statBox: { alignItems: 'center', flex: 1 },
  statLabel: { color: 'gray', fontSize: 10, textTransform:'uppercase', marginBottom:5, fontWeight: 'bold' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  vDivider: { width: 1, height: 30, backgroundColor: '#eee' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 15, borderRadius: 8, padding: 3, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 10, marginHorizontal: 15, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, marginHorizontal:15, borderRadius:8, borderWidth:1, borderColor:'#2e7d32', marginBottom:10 },
  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 40 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom:5 },
  date: { fontWeight:'bold', color:'gray' },
  statusBadge: { paddingHorizontal:8, paddingVertical:4, borderRadius:12 },
  statusText: { fontSize:10, fontWeight:'bold' },
  type: { fontWeight:'bold', fontSize:16, color:'#333', marginBottom:5 },
  reason: { color:'gray', fontSize:13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998' },
  divider: { height:1, backgroundColor:'#eee', marginVertical:10 },
  approveBtn: { backgroundColor:'green', padding:12, borderRadius:8, flex:1, alignItems:'center', marginLeft:5 },
  rejectBtn: { backgroundColor:'#d32f2f', padding:12, borderRadius:8, flex:1, alignItems:'center', marginRight:5 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  endListText: { textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic' },
});