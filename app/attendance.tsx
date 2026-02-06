import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useData } from './context/DataContext';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function AttendanceScreen() {
  const router = useRouter();
  const contextData = useData();
  
  // 🔥 FIX 1: Safe Defaults
  const { attendanceList = [], leaveList = [], holidayList = [], user, userList = [] } = contextData || {}; 
  
  // States
  const [currentDate, setCurrentDate] = useState(new Date()); 
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year'>('Day'); 
  const [isCalendarView, setIsCalendarView] = useState(false); 
  
  const [filterUser, setFilterUser] = useState('All'); 
  const [showUserModal, setShowUserModal] = useState(false);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [holidayModalVisible, setHolidayModalVisible] = useState(false); 
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);

  // 1. DEFINE VARIABLES
  const DEFAULT_QUOTA = 18;
  const canManage = ['Admin', 'Manager', 'Account', 'Accountant' ,'Hr'].includes(user?.role || '');
  
  const targetName = (filterUser === 'All' || !canManage) ? user?.name : filterUser;

  // --- SORT USERS ---
  const uniqueUsers = useMemo(() => {
    if (!canManage) return [];
    const safeList = Array.isArray(userList) ? userList : [];
    return safeList.map((u: any) => ({ name: u.name, quota: u.yearlyLeaves || DEFAULT_QUOTA })).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [userList, canManage]);

  // --- HELPER: Dates ---
  const formatMonth = (date: Date) => date.toLocaleString('default', { month: 'long', year: 'numeric' });
  const formatFullDate = (date: Date) => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  
  // 🔥 FIX 2: Never Return Null (Returns string or empty string)
  const getStandardDate = (dateInput: any): string => {
      if (!dateInput) return "";
      try {
          if (dateInput instanceof Date) {
              const year = dateInput.getFullYear();
              const month = String(dateInput.getMonth() + 1).padStart(2, '0');
              const day = String(dateInput.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
          }
          if (typeof dateInput === 'string') {
              const clean = dateInput.trim();
              if (clean.includes('/')) {
                  const parts = clean.split('/');
                  if (parts.length === 3) {
                      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                  }
              }
              if (clean.includes('-')) {
                  return clean.substring(0, 10); 
              }
          }
      } catch (e) { return ""; }
      return "";
  };

  const formatDateDisplay = (dateStr: string) => {
      const std = getStandardDate(dateStr);
      if(!std) return "-";
      const [y, m, d] = std.split('-');
      return `${d}/${m}/${y}`;
  };
  
  const getDayName = (dateStr: string) => {
      const std = getStandardDate(dateStr);
      if(!std) return "";
      const d = new Date(std);
      return d.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const changeDate = (direction: number) => {
      const newDate = new Date(currentDate);
      if (viewMode === 'Day') newDate.setDate(newDate.getDate() + direction);
      else if (viewMode === 'Month') newDate.setMonth(newDate.getMonth() + direction);
      else newDate.setFullYear(newDate.getFullYear() + direction);
      setCurrentDate(newDate);
  };

  const getHeaderDateText = () => {
      if (viewMode === 'Day') return formatFullDate(currentDate);
      if (viewMode === 'Month') return formatMonth(currentDate);
      return currentDate.getFullYear().toString();
  };

  // --- STATUS LOGIC ---
  const getStatus = (item: any) => {
      if (item.type === 'LEAVE') return 'LEAVE';
      if (item.type === 'HOLIDAY') return 'HOLIDAY';
      if (item.type === 'ABSENT') return 'ABSENT';

      const todayStr = getStandardDate(new Date());
      const itemDateStr = getStandardDate(item.date);
      const isToday = itemDateStr === todayStr;
      const hasLoggedOut = item.outTime && item.outTime !== '--';
      
      let hours = 0;
      if(item.workHrs && item.workHrs.includes(':')) {
          const p = item.workHrs.split(':');
          hours = parseInt(p[0]) + (parseInt(p[1])/60);
      }

      if (hasLoggedOut && hours < 4) return 'SHORT';
      if (!hasLoggedOut && !isToday) return 'SHORT'; 
      return 'PRESENT';
  };

  // --- CORE DATA LOGIC ---
  const getDisplayData = () => {
    let finalOutput: any[] = [];
    
    let startDate = new Date(currentDate);
    let endDate = new Date(currentDate);

    if (viewMode === 'Day') {
        // Same
    } else if (viewMode === 'Month') {
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    } else {
        startDate = new Date(currentDate.getFullYear(), 0, 1);
        endDate = new Date(currentDate.getFullYear(), 11, 31);
    }

    // 🔥 FIX 3: No '!' assertion needed because it returns string now
    const startStr = getStandardDate(startDate);
    const endStr = getStandardDate(endDate);
    const todayStr = getStandardDate(new Date());

    const safeAttendance = Array.isArray(attendanceList) ? attendanceList : [];
    const safeLeaves = Array.isArray(leaveList) ? leaveList : [];
    const safeHolidays = Array.isArray(holidayList) ? holidayList : [];
    const safeUsers = Array.isArray(userList) ? userList : [];

    const findHoliday = (dStr: string) => safeHolidays.find((h:any) => getStandardDate(h.date) === dStr);
    const findLeave = (uName: string, dStr: string) => safeLeaves.find((l:any) => 
        l.status === 'Approved' && l.senderName === uName && 
        getStandardDate(l.fromDate) <= dStr && getStandardDate(l.toDate || l.fromDate) >= dStr
    );
    const findAttendance = (uName: string, dStr: string) => safeAttendance.find((a:any) => 
        (a.userName === uName || a.senderName === uName) && getStandardDate(a.date) === dStr
    );

    // ---------------------------------------------------------
    // CASE A: DAY VIEW
    // ---------------------------------------------------------
    if (viewMode === 'Day') {
        const targetDateStr = getStandardDate(currentDate);
        const targetDayObj = new Date(targetDateStr);
        const isSunday = targetDayObj.getDay() === 0;
        const holidayObj = findHoliday(targetDateStr);

        let targetUsers: any[] = [];
        if (filterUser === 'All' && canManage) {
            targetUsers = safeUsers;
        } else if (canManage) {
            targetUsers = safeUsers.filter((u:any) => u.name === filterUser);
        } else {
            targetUsers = user ? [user] : [];
        }

        if (targetUsers.length > 0) {
            targetUsers.forEach((u: any) => {
                const att = findAttendance(u.name, targetDateStr);
                const lv = findLeave(u.name, targetDateStr);

                if (att) {
                    finalOutput.push({ ...att, type: 'ATTENDANCE', senderName: u.name });
                } 
                else if (lv) {
                    finalOutput.push({ id: `lv-${u.id}`, date: targetDateStr, type: 'LEAVE', senderName: u.name, outTime: lv.type, location: 'On Leave' });
                } 
                else if (holidayObj) {
                    finalOutput.push({ id: `hol-${u.id}`, date: targetDateStr, type: 'HOLIDAY', senderName: u.name, outTime: holidayObj.name });
                } 
                else if (isSunday) {
                    finalOutput.push({ id: `sun-${u.id}`, date: targetDateStr, type: 'HOLIDAY', senderName: u.name, outTime: 'Sunday Off' });
                } 
                else if (targetDateStr <= todayStr) {
                    finalOutput.push({ id: `abs-${u.id}`, date: targetDateStr, type: 'ABSENT', senderName: u.name, inTime: '-', outTime: '-', workHrs: '0' });
                }
            });
        }
    } 
    // ---------------------------------------------------------
    // CASE B: MONTH/YEAR VIEW
    // ---------------------------------------------------------
    else {
        const targetUserName = (filterUser === 'All' || !canManage) ? user?.name : filterUser;
        let loop = new Date(startDate);

        while (loop <= endDate) {
            const dStr = getStandardDate(loop);
            
            // Stop if Future (allows viewing current month holidays though)
            if (dStr > todayStr && viewMode !== 'Month') break; 

            const isSunday = loop.getDay() === 0;
            const att = findAttendance(targetUserName, dStr);
            const lv = findLeave(targetUserName, dStr);
            const hol = findHoliday(dStr);

            if (att) {
                finalOutput.push({ ...att, type: 'ATTENDANCE', senderName: targetUserName });
            } 
            else if (lv) {
                finalOutput.push({ id: `lv-${dStr}`, date: dStr, type: 'LEAVE', senderName: targetUserName, outTime: lv.type, location: 'On Leave' });
            } 
            else if (hol) {
                finalOutput.push({ id: `hol-${dStr}`, date: dStr, type: 'HOLIDAY', senderName: targetUserName, outTime: hol.name });
            } 
            else if (isSunday) {
                finalOutput.push({ id: `sun-${dStr}`, date: dStr, type: 'HOLIDAY', senderName: targetUserName, outTime: 'Sunday Off' });
            } 
            else if (dStr <= todayStr) {
                finalOutput.push({ id: `abs-${dStr}`, date: dStr, type: 'ABSENT', senderName: targetUserName, inTime: '-', outTime: '-', workHrs: '0' });
            }

            loop.setDate(loop.getDate() + 1);
        }
    }

    return finalOutput.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const finalData = getDisplayData();

  // --- 🔥 FIX 4: STATS CALCULATION (Removed '!' and added empty check) ---
  const todayStr = getStandardDate(new Date());
  
  const countStatus = (type: string) => finalData.filter((i: any) => {
      const d = getStandardDate(i.date);
      const isDateValid = d !== "" && d <= todayStr;
      return getStatus(i) === type && isDateValid;
  }).length;

  const daysPresent = countStatus('PRESENT');
  const daysShort = countStatus('SHORT');
  const daysAbsent = countStatus('ABSENT');
  
  // Leave and Holiday don't strictly need <= today check for counts, usually we count all in view
  const daysLeave = finalData.filter((i: any) => getStatus(i) === 'LEAVE').length;
  const daysHoliday = finalData.filter((i: any) => getStatus(i) === 'HOLIDAY').length;
  const totalExpense = finalData.reduce((acc: number, item: any) => {
      // Sirf 'ATTENDANCE' wale items ka expense jodo
      if (item.type === 'ATTENDANCE' && item.expenses?.totalAmount) {
          const amt = parseFloat(item.expenses.totalAmount);
          return acc + (isNaN(amt) ? 0 : amt);
      }
      return acc;
  }, 0);

  // Quota
  const safeUsersList = Array.isArray(userList) ? userList : [];
  const targetUserObj = safeUsersList.find((u:any) => u.name === targetName);
  
  const userQuota = targetUserObj?.yearlyLeaves || user?.yearlyLeaves || DEFAULT_QUOTA;
  const currentYearStr = currentDate.getFullYear().toString();
  
  const safeLeavesList = Array.isArray(leaveList) ? leaveList : [];
  const yearlyLeavesTaken = safeLeavesList.filter((l: any) => {
      const d = getStandardDate(l.fromDate);
      return l.senderName === targetName && l.status === 'Approved' && d && d.startsWith(currentYearStr);
  }).reduce((acc: number, curr: any) => acc + (parseFloat(curr.days) || 0), 0);
  
  const leaveBalance = userQuota - yearlyLeavesTaken;
  const isLeaveExceeded = leaveBalance < 0;
  const leavePercentage = Math.min((yearlyLeavesTaken / userQuota) * 100, 100);

  // Download Report (Updated with Expenses)
  const downloadReport = async () => {
      try {
          // 1. Header me 'Total Expense' column add kiya
          let csvHeader = "Date,Employee,Status,In Time,Out Time,Work Hrs,Total Expense,Note\n";
          
          let csvRows = "";
          finalData.forEach((item: any) => {
              const date = formatDateDisplay(item.date);
              const name = item.senderName || 'Unknown';
              const status = getStatus(item);
              const inTime = item.inTime || '-';
              const outTime = item.outTime || '-';
              const hrs = item.workHrs || '-';
              
              // 2. Yahan Expense nikala (Agar nahi hai to '0')
              const expense = item.expenses?.totalAmount || '0';
              
              const note = item.location === 'On Leave' ? 'Leave' : (item.outTime === 'Sunday Off' ? 'Sunday' : '-');
              
              // 3. Row me Expense variable jod diya
              csvRows += `${date},${name},${status},${inTime},${outTime},${hrs},${expense},${note}\n`;
          });

          const fileUri = (FileSystem as any).cacheDirectory + `Attendance_${targetName || 'Report'}.csv`;
          await FileSystem.writeAsStringAsync(fileUri, csvHeader + csvRows, { encoding: 'utf8' });
          
          if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri);
      
      } catch (error: any) { 
          Alert.alert("Error", error.message); 
      }
  };

  const handleItemClick = (item: any) => { setSelectedItem(item); setDetailModalVisible(true); };

  const renderItem = ({ item }: any) => {
    const status = getStatus(item);
    const isLeave = status === 'LEAVE';
    const isHoliday = status === 'HOLIDAY';
    const isAbsent = status === 'ABSENT';
    const isPresent = status === 'PRESENT';
    const isShort = status === 'SHORT';
    const showForgot = isShort && (!item.outTime || item.outTime === '--');
    const isSummaryRow = item.senderName === 'Summary';

    return (
      <TouchableOpacity onPress={() => handleItemClick(item)} activeOpacity={isAbsent ? 1 : 0.7} 
        style={[styles.row, isLeave && styles.leaveRow, isHoliday && styles.holidayRow, isAbsent && styles.absentRow]}>
          <View style={styles.dateBox}>
              <Text style={styles.dateText}>{formatDateDisplay(item.date).split('/')[0]}</Text>
              <Text style={styles.dayText}>{getDayName(item.date)}</Text>
              <Text style={{fontSize:10, color:'#999'}}>{formatDateDisplay(item.date).split('/').slice(1).join('/')}</Text>
          </View>
          <View style={styles.timeBox}>
              {isSummaryRow ? (
                  <Text style={{color:'#3b5998', fontWeight:'bold'}}>👥 {item.inTime}</Text>
              ) : isLeave ? (
                <>
                    <Text style={{color:'#e65100', fontWeight:'bold'}}>On Leave ({item.outTime})</Text>
                    {(viewMode === 'Day') && <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginTop:2}}>👤 {item.senderName?.split(' ')[0]}</Text>}
                </>
              ) : isHoliday ? (
                  <Text style={{color:'#c2185b', fontWeight:'bold'}}>🎉 {item.outTime}</Text>
              ) : isAbsent ? (
                  <><Text style={{color:'#d32f2f', fontWeight:'bold'}}>Absent</Text>{(viewMode === 'Day') && <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginTop:2}}>👤 {item.senderName?.split(' ')[0]}</Text>}</>
              ) : (
                  <View style={{flexDirection:'column'}}>
                      <View style={{flexDirection:'row', alignItems:'center'}}>
                          <Text style={{fontSize:12, color:'green', fontWeight:'bold'}}>IN: {item.inTime}</Text>
                          <Text style={{fontSize:12, color: showForgot?'orange':'red', fontWeight:'bold', marginLeft:8}}>OUT: {showForgot ? 'Forgot?' : (item.outTime || '--')}</Text>
                      </View>
                      {item.workHrs ? (
                          <Text style={{fontSize:11, color:'#555', marginTop:2}}>
                              ⏳ Hrs: <Text style={{fontWeight:'bold', color:'#333'}}>{item.workHrs}</Text>
                          </Text>
                      ) : null}
                      {(viewMode === 'Day') && <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginTop:2}}>👤 {item.senderName?.split(' ')[0]}</Text>}
                  </View>
              )}
          </View>
          <View style={[styles.statusBox, isLeave ? styles.statusLeave : (isHoliday ? styles.statusHoliday : (isAbsent ? styles.statusAbsent : (isPresent ? styles.statusPresent : (isShort ? styles.statusShort : styles.statusPresent))))]}>
              <Text style={[styles.statusText, isLeave ? {color:'#e65100'} : (isHoliday ? {color:'#c2185b'} : (isAbsent ? {color:'#d32f2f'} : (isPresent ? {color:'green'} : (isShort ? {color:'#ff9800'} : {color:'gray'}))))]}>
                  {isSummaryRow ? 'i' : (isLeave ? 'L' : (isHoliday ? 'H' : (isAbsent ? 'A' : (isPresent ? 'P' : 'S'))))}
              </Text>
          </View>
      </TouchableOpacity>
    );
  };

  const renderCalendar = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1).getDay(); 
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const calendarDays = [];
      for (let i = 0; i < firstDay; i++) { calendarDays.push(<View key={`empty-${i}`} style={styles.calDayEmpty} />); }

      for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const item = finalData.find((d: any) => d.date === dateStr);
          let statusColor = null;
          if (item) {
              const status = getStatus(item);
              if (status === 'PRESENT') statusColor = 'green';
              else if (status === 'LEAVE') statusColor = '#e65100';
              else if (status === 'HOLIDAY') statusColor = '#c2185b';
              else if (status === 'ABSENT') statusColor = '#d32f2f';
              else if (status === 'SHORT') statusColor = '#ff9800';
          }
          const isSelected = selectedCalDate === dateStr;
          calendarDays.push(
              <TouchableOpacity key={day} style={[styles.calDay, isSelected && styles.calDaySelected]} onPress={() => { setSelectedCalDate(dateStr); if (item) handleItemClick(item); }}>
                  <Text style={[styles.calDateText, isSelected && {color:'white'}]}>{day}</Text>
                  {statusColor && <View style={[styles.calDot, {backgroundColor: statusColor}]} />}
              </TouchableOpacity>
          );
      }
      return (
          <View style={styles.calendarContainer}>
              <View style={styles.weekHeader}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d: string) => (<Text key={d} style={[styles.weekText, d==='Sun' && {color:'#d32f2f'}]}>{d}</Text>))}</View>
              <View style={styles.daysGrid}>{calendarDays}</View>
              <View style={styles.legendContainer}>
                  <View style={styles.legendItem}><View style={[styles.calDot, {backgroundColor: 'green', marginTop:0}]} /><Text style={styles.legendText}>Present</Text></View>
                  <View style={styles.legendItem}><View style={[styles.calDot, {backgroundColor: '#d32f2f', marginTop:0}]} /><Text style={styles.legendText}>Absent</Text></View>
                  <View style={styles.legendItem}><View style={[styles.calDot, {backgroundColor: '#e65100', marginTop:0}]} /><Text style={styles.legendText}>Leave</Text></View>
                  <View style={styles.legendItem}><View style={[styles.calDot, {backgroundColor: '#c2185b', marginTop:0}]} /><Text style={styles.legendText}>Holiday</Text></View>
              </View>
          </View>
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
            <Text style={styles.headerTitle}>Attendance Log</Text>
        </View>
        <View style={{flexDirection:'row'}}>
            <TouchableOpacity onPress={downloadReport} style={[styles.holidayBtn, {marginRight:10, backgroundColor:'#e3f2fd'}]}>
                <Ionicons name="download-outline" size={20} color="#1565c0" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setHolidayModalVisible(true)} style={styles.holidayBtn}>
                <Ionicons name="gift-outline" size={20} color="#e67e22" />
            </TouchableOpacity>
        </View>
      </View>

      {canManage && (
          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowUserModal(true)}>
              <Ionicons name="person" size={16} color="white" /><Text style={styles.filterBtnText}>{filterUser === 'All' ? 'Filter: All Employees' : `User: ${filterUser}`}</Text><Ionicons name="chevron-down" size={16} color="white" />
          </TouchableOpacity>
      )}

      <View style={styles.monthSelector}>
          <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
          <View style={{flexDirection:'row', alignItems:'center'}}><Ionicons name="calendar" size={18} color="#3b5998" style={{marginRight:8}} /><Text style={styles.monthText}>{getHeaderDateText()}</Text></View>
          <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
          {viewMode === 'Month' && filterUser !== 'All' && <TouchableOpacity onPress={() => setIsCalendarView(!isCalendarView)} style={{marginLeft:15}}><Ionicons name={isCalendarView ? "list" : "grid"} size={22} color="#3b5998" /></TouchableOpacity>}
      </View>

      <ScrollView contentContainerStyle={{paddingBottom:20}}>
        {(filterUser !== 'All' || !canManage) && (
            <View style={styles.compactCard}>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                    <Text style={{fontWeight:'bold', color:'#555', fontSize:12}}>
                        Leave Quota ({targetName?.split(' ')[0]})
                    </Text>
                    <Text style={{fontWeight:'bold', color:'#333', fontSize:12}}>
                        {yearlyLeavesTaken}/{userQuota}
                    </Text>
                </View>
                <View style={styles.progressBarBackground}>
                    <View style={[styles.progressBarFill, { width: `${leavePercentage}%`, backgroundColor: isLeaveExceeded ? '#ff5252' : '#4caf50' }]} />
                </View>
                <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                    <Text style={{fontSize:10, color:'gray'}}>Used: {yearlyLeavesTaken}</Text>
                    <Text style={{fontSize:10, color: isLeaveExceeded ? 'red' : 'green'}}>Bal: {isLeaveExceeded ? 0 : leaveBalance}</Text>
                </View>
            </View>
        )}

        <View style={styles.tabContainer}>
            {['Day', 'Month', 'Year'].map(m => (
                <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => { setViewMode(m as any); if(m==='Day') setIsCalendarView(false); setCurrentDate(new Date()); }}>
                    <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m === 'Day' ? 'Daily' : m === 'Month' ? 'Monthly' : 'Yearly'}</Text>
                </TouchableOpacity>
            ))}
        </View>

        {/* 🔥 UPDATED: HORIZONTAL SCROLLABLE STATS */}
        <View style={{height: 70, marginBottom: 10}}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 15, alignItems: 'center'}}>
                
                <SummaryItem label="Present" value={daysPresent} color="#e8f5e9" textColor="green" />
                <SummaryItem label="Absent" value={daysAbsent} color="#ffebee" textColor="#d32f2f" />
                <SummaryItem label="Leave" value={daysLeave} color="#fff3e0" textColor="#e65100" />
                <SummaryItem label="Short" value={daysShort} color="#fff8e1" textColor="#ff9800" />
                
                {/* Expense Box */}
                <View style={[styles.summaryBox, { backgroundColor: '#fff8e1', borderColor: '#ffb300', borderWidth: 1 }]}>
                    <Text style={[styles.summaryBoxValue, { color: '#ff6f00', fontSize: 13 }]}>₹{totalExpense}</Text>
                    <Text style={[styles.summaryBoxLabel, { color: '#ff6f00' }]}>Expense</Text>
                </View>

                <SummaryItem label="Holiday" value={daysHoliday} color="#fce4ec" textColor="#c2185b" />
                
                {/* Extra padding at end */}
                <View style={{width: 10}} />
            </ScrollView>
        </View>

        {viewMode === 'Month' && isCalendarView ? renderCalendar() : (
            <FlatList data={finalData} keyExtractor={(item, index) => item.id || `key-${index}`} renderItem={renderItem} scrollEnabled={false} contentContainerStyle={{paddingHorizontal: 15}} ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No data for {getHeaderDateText()}</Text>} />
        )}
      </ScrollView>

      {/* USER MODAL */}
      <Modal visible={showUserModal} transparent={true} animationType="slide"><View style={styles.modalOverlay}><View style={styles.userModalContent}><Text style={styles.modalTitle}>Select Employee</Text><ScrollView style={{maxHeight: 300}}><TouchableOpacity style={styles.userItem} onPress={() => { setFilterUser('All'); setShowUserModal(false); }}><Text style={{fontWeight: filterUser==='All'?'bold':'normal', color: filterUser==='All'?'#e67e22':'#333'}}>All Employees</Text></TouchableOpacity>{uniqueUsers.map((u:any, i:number) => (<TouchableOpacity key={i} style={styles.userItem} onPress={() => { setFilterUser(u.name); setShowUserModal(false); }}><Text style={{fontWeight: filterUser===u.name?'bold':'normal', color: filterUser===u.name?'#e67e22':'#333'}}>{u.name}</Text></TouchableOpacity>))}</ScrollView><TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowUserModal(false)}><Text style={{color:'white'}}>Close</Text></TouchableOpacity></View></View></Modal>

      {/* FULL DETAILS MODAL */}
      <Modal visible={detailModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={[styles.detailCard, { maxHeight: '80%' }]}> 
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                    <Text style={styles.modalTitle}>Full Details</Text>
                    <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                        <Ionicons name="close-circle" size={30} color="#d32f2f" />
                    </TouchableOpacity>
                </View>
                
                {selectedItem && (
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <DetailRow label="Employee" value={selectedItem.senderName} highlight />
                        <DetailRow label="Date" value={formatDateDisplay(selectedItem.date)} />
                        <DetailRow 
                            label="Status" 
                            value={getStatus(selectedItem) === 'SHORT' ? 'Short Day' : (getStatus(selectedItem) === 'PRESENT' ? 'Present' : selectedItem.type)} 
                            highlight 
                            color={getStatus(selectedItem) === 'PRESENT' ? 'green' : (getStatus(selectedItem) === 'SHORT' ? '#ff9800' : (getStatus(selectedItem) === 'LEAVE' ? '#e65100' : '#d32f2f'))} 
                        />
                        
                        {selectedItem.inTime && selectedItem.inTime !== '-' && selectedItem.inTime !== 'LEAVE' ? (
                            <>
                                <View style={styles.divider}/>
                                <View style={{flexDirection:'row', justifyContent:'space-between', backgroundColor:'#f9f9f9', padding:10, borderRadius:8}}>
                                    <View style={{alignItems:'center'}}>
                                        <Text style={{fontSize:11, color:'gray'}}>IN TIME</Text>
                                        <Text style={{fontWeight:'bold', color:'green', fontSize:14}}>{selectedItem.inTime}</Text>
                                    </View>
                                    <View style={{alignItems:'center'}}>
                                        <Text style={{fontSize:11, color:'gray'}}>OUT TIME</Text>
                                        <Text style={{fontWeight:'bold', color:'red', fontSize:14}}>{selectedItem.outTime || '--'}</Text>
                                    </View>
                                    <View style={{alignItems:'center'}}>
                                        <Text style={{fontSize:11, color:'gray'}}>TOTAL HRS</Text>
                                        <Text style={{fontWeight:'bold', color:'#333', fontSize:14}}>{selectedItem.workHrs || '--'}</Text>
                                    </View>
                                </View>

                                <View style={styles.divider}/>
                                <Text style={{fontSize:14, fontWeight:'bold', color:'#3b5998', marginBottom:8}}>📍 Locations</Text>
                                <View style={{marginBottom:10}}>
                                    <Text style={{fontSize:11, color:'green', fontWeight:'bold'}}>Login Location:</Text>
                                    <Text style={{fontSize:12, color:'#333'}}>{selectedItem.location?.address || 'Unknown Location'}</Text>
                                </View>
                                {selectedItem.outTime && selectedItem.outTime !== '--' && (
                                    <View>
                                        <Text style={{fontSize:11, color:'red', fontWeight:'bold'}}>Logout Location:</Text>
                                        <Text style={{fontSize:12, color:'#333'}}>{selectedItem.outAddress || 'Unknown Location'}</Text>
                                    </View>
                                )}

                                <View style={styles.divider}/>
                                <Text style={{fontSize:14, fontWeight:'bold', color:'#3b5998', marginBottom:8}}>💰 Today's Expenses</Text>
                                {selectedItem.expenses ? (
                                    <View style={{backgroundColor:'#fff3e0', padding:10, borderRadius:8}}>
                                        <DetailRow label="DA (Daily Allowance)" value={`₹${selectedItem.expenses.da || '0'}`} />
                                        <DetailRow label="Hotel/Stay" value={`₹${selectedItem.expenses.hotel || '0'}`} />
                                        <DetailRow label="Misc/Other" value={`₹${selectedItem.expenses.misc || '0'}`} />
                                        <View style={{height:1, backgroundColor:'#ccc', marginVertical:5}}/>
                                        <DetailRow label="Total Amount" value={`₹${selectedItem.expenses.totalAmount || '0'}`} highlight color="#e65100" />
                                        {selectedItem.expenses.note ? (
                                            <View style={{marginTop: 5, backgroundColor:'#fffde7', padding:8, borderRadius:5, borderLeftWidth:3, borderLeftColor:'#fbc02d'}}>
                                                <Text style={{fontSize:10, color:'#fbc02d', fontWeight:'bold'}}>REMARK:</Text>
                                                <Text style={{fontSize:12, color:'#333'}}>{selectedItem.expenses.note}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                ) : (
                                    <Text style={{color:'gray', fontStyle:'italic'}}>No expenses added.</Text>
                                )}
                            </>
                        ) : null}

                        {selectedItem.type === 'LEAVE' && <Text style={{color:'gray', fontStyle:'italic', marginTop:10}}>Reason: {selectedItem.outTime}</Text>}
                        {selectedItem.type === 'HOLIDAY' && <Text style={{color:'gray', fontStyle:'italic', marginTop:10}}>Occasion: {selectedItem.outTime}</Text>}
                        <View style={{height: 20}} />
                    </ScrollView>
                )}
            </View>
        </View>
      </Modal>

      {/* HOLIDAY LIST MODAL */}
      <Modal visible={holidayModalVisible} transparent={true} animationType="slide"><View style={styles.modalOverlay}><View style={styles.detailCard}><View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}><Text style={styles.modalTitle}>🎉 Holiday List</Text><TouchableOpacity onPress={() => setHolidayModalVisible(false)}><Ionicons name="close-circle" size={30} color="#d32f2f" /></TouchableOpacity></View><ScrollView style={{maxHeight:400}}>{Array.isArray(holidayList) && holidayList.length > 0 ? holidayList.map((h:any, i:number) => (<View key={i} style={{flexDirection:'row', padding:10, borderBottomWidth:1, borderColor:'#eee'}}><Text style={{fontWeight:'bold', width:100}}>{formatDateDisplay(h.date)}</Text><Text style={{flex:1, color:'#555'}}>{h.name}</Text></View>)) : <Text style={{textAlign:'center', color:'gray', padding:20}}>No holidays added yet.</Text>}</ScrollView></View></View></Modal>
    </View>
  );
}

const SummaryItem = ({ label, value, color, textColor }: any) => (<View style={[styles.summaryBox, { backgroundColor: color }]}><Text style={[styles.summaryBoxValue, { color: textColor }]}>{value}</Text><Text style={[styles.summaryBoxLabel, { color: textColor }]}>{label}</Text></View>);
const DetailRow = ({label, value, highlight, color}: any) => (<View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:8}}><Text style={{color:'gray', fontWeight:'600', fontSize:13}}>{label}</Text><Text style={{fontWeight:'bold', fontSize:13, color: color ? color : (highlight ? '#2e7d32' : '#333')}}>{value}</Text></View>);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft:10 },
  backBtn: { padding: 5 }, 
  holidayBtn: { padding: 8, backgroundColor:'#fff3e0', borderRadius:20 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#3b5998', margin: 15, marginBottom:5, padding: 12, borderRadius: 8, elevation: 3 },
  filterBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: 'white', borderBottomWidth:1, borderColor:'#eee' },
  monthText: { fontSize: 16, fontWeight: 'bold', color: '#3b5998' },
  compactCard: { backgroundColor: 'white', marginHorizontal: 15, marginTop: 10, padding: 10, borderRadius: 8, elevation: 1, borderLeftWidth:4, borderLeftColor:'#3b5998' },
  progressBarBackground: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, marginVertical: 5, overflow:'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', marginHorizontal: 15, borderRadius: 8, padding: 3, marginVertical: 15 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize:12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },
  summaryBox: { 
      width: 85,  // Fixed width taki sab barabar dikhe
      height: 60, // Fixed height
      marginRight: 8, // Thoda gap
      paddingVertical: 8, 
      borderRadius: 10, 
      alignItems: 'center', 
      justifyContent: 'center', // Center content
      elevation: 2,
      backgroundColor: 'white' // Default bg
  }, 
  summaryBoxValue: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  summaryBoxLabel: { fontSize: 9, fontWeight: '600', textAlign:'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor:'white', borderRadius:8, marginBottom:8, elevation:1, borderBottomWidth:1, borderColor:'#f0f0f0' },
  leaveRow: { backgroundColor: '#fff3e0' }, holidayRow: { backgroundColor: '#fce4ec' }, absentRow: { backgroundColor: '#ffebee', opacity: 0.8 }, 
  dateBox: { width: '20%', alignItems:'center', borderRightWidth:1, borderColor:'#eee', paddingRight:5 },
  dateText: { fontWeight: 'bold', fontSize: 16, color:'#333' }, dayText: { fontSize: 10, color:'gray', textTransform:'uppercase' },
  timeBox: { flex: 1, paddingLeft: 10 },
  statusBox: { width: 30, height: 30, borderRadius: 15, alignItems:'center', justifyContent:'center' },
  statusPresent: { backgroundColor: '#e8f5e9' }, statusShort: { backgroundColor: '#fff8e1', borderWidth:1, borderColor:'#ffb74d' }, statusLeave: { backgroundColor: '#ffe0b2' }, statusHoliday: { backgroundColor: '#f48fb1' }, statusAbsent: { backgroundColor: '#ffebee' },
  statusText: { fontWeight: 'bold', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  userModalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: 400 },
  userItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  closeModalBtn: { backgroundColor: '#3b5998', padding: 10, marginTop: 10, borderRadius: 5, alignItems: 'center' },
  detailCard: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color:'#3b5998' }, divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  calendarContainer: { backgroundColor:'white', margin: 15, borderRadius: 10, padding: 10, elevation: 2 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  weekText: { width: '14%', textAlign: 'center', fontWeight: 'bold', color: '#555', fontSize: 12 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: { width: '14%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 2 },
  calDayEmpty: { width: '14%', aspectRatio: 1 }, calDateText: { fontSize: 14, color: '#333' }, calDaySelected: { backgroundColor: '#3b5998', borderRadius: 20 },
  calDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  legendContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 15, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginBottom: 4 }, legendText: { fontSize: 10, color: '#555', marginLeft: 4, fontWeight: '600' }
});