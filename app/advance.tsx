import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

// 🔥 SAAS IMPORTS (users still Firestore, needed for employee names)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { fetchTeamMembers } from '../services/api/users';
import { useData } from './context/DataContext';
// 🔥 Phase 6: advances now via new backend API
import { listAdvances, settleAdvancesForEmployee, updateAdvanceStatus } from '../services/api/advances';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

export default function EmployeeAdvanceScreen() {
  const router = useRouter();
  
  const { currentUser, addNotification } = useData();
  // 🔥 SaaS Engine kept only for isDbLoading (search-icon spinner); advances no longer go through this
  const { isDbLoading } = useSaaSDB();

  // advanceList now comes from useCachedList below (cache-first, raw — senderName enrichment happens at filter time)
  // usersList now comes from useCachedList too (see the team-members hook further below)
  const [senderNameMap, setSenderNameMap] = useState<Map<string, string>>(new Map());

  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('All'); 
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchText, setSearchText] = useState('');
  
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('All');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All'); 
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20); 

  const canManage = ['Admin', 'Manager', 'Account', 'Accountant' ,'Hr', 'SuperAdmin'].includes(currentUser?.role || '');

  useEffect(() => {
      if (viewMode === 'Day') setVisibleCount(100); 
      else setVisibleCount(20); 
  }, [viewMode, currentDate, selectedEmployeeName, searchText]);

  // 🔥 ADVANCES — cache-first (instant from AsyncStorage, then background
  // refresh from the API). Cached raw — senderName enrichment happens at
  // filter time from senderNameMap below, same pattern as expense.tsx.
  const advancesCacheKey = buildCacheKey('advances', currentUser?.companyId);
  const {
      data: advanceList,
      setData: setAdvanceList,
      loading: advancesLoading,
      refreshing: advancesRefreshing,
      refresh: refreshAdvances,
  } = useCachedList({
      cacheKey: advancesCacheKey,
      enabled: !!currentUser?.companyId,
      fetcher: listAdvances, // was: fetchSaaSData("advances")
  });

  // 🔥 TEAM MEMBERS — cache-first, shares the SAME 'team_members' cache key
  // as manage_team.tsx/employee_timeline.tsx (visiting any of those screens
  // warms this one's cache too). See hooks/useCachedList.ts.
  const { data: usersList } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });
  useEffect(() => {
      setSenderNameMap(new Map(usersList.map((u: any) => [u.id, u.name])));
      if (canManage) {
          const uniqueMap = new Map();
          usersList.forEach((u: any) => {
              if (u.name && !uniqueMap.has(u.name)) {
                  uniqueMap.set(u.name, { id: u.id || '0', name: u.name });
              }
          });
          setEmployees([{ id: 'All', name: 'All' }, ...Array.from(uniqueMap.values())]);
      }
  }, [usersList, canManage]);

  const parseDate = (dateStr: any) => {
      if (!dateStr) return new Date();
      if (dateStr instanceof Date) return dateStr;
      if (typeof dateStr === 'string' && dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
              return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          }
      }
      return new Date(dateStr);
  };

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

  // --- FILTER LOGIC — filters by senderId now, not senderName ---
  const getFilteredData = () => {
    let data = Array.isArray(advanceList)
        ? advanceList.map((a: any) => ({ ...a, senderName: senderNameMap.get(a.senderId) || 'Unknown' }))
        : [];

    if (canManage) {
        if(selectedEmployeeId !== 'All') {
            data = data.filter((item: any) => item.senderId === selectedEmployeeId);
        }
    } else {
        if(currentUser?.id) {
            data = data.filter((item: any) => item.senderId === currentUser.id);
        }
    }

    if (viewMode !== 'All') {
        const targetYear = currentDate.getFullYear();
        const targetMonth = currentDate.getMonth();
        const targetDay = currentDate.getDate();

        const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
        const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
        const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime();

        data = data.filter(item => {
            if(!item.date) return false;
            const itemDate = parseDate(item.date);
            const itemTime = itemDate.getTime();
            
            if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
            if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
            if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
            return true;
        });
    }

    if (searchText) {
        const term = searchText.toLowerCase();
        data = data.filter((item: any) => {
            const row = `${item.date} ${item.amount} ${item.reason} ${item.senderName} ${item.status}`.toLowerCase();
            return row.includes(term);
        });
    }

    data.sort((a: any, b: any) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
    return data;
  };

  const fullFilteredList = getFilteredData(); 
  const renderedList = fullFilteredList.slice(0, visibleCount);

  const outstandingAmount = fullFilteredList
      .filter((item: any) => item.status === 'Approved')
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const totalHistoryAmount = fullFilteredList
      .filter((item: any) => item.status === 'Approved' || item.status === 'Settled')
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  // 🔥 SETTLEMENT — via new backend API bulk-settle endpoint
  const handleSettlement = async () => {
      if (selectedEmployeeId === 'All') {
          Alert.alert("Error", "Please select a specific employee to settle accounts.");
          return;
      }
      
      if (outstandingAmount === 0) {
          Alert.alert("Info", "No outstanding approved balance to settle.");
          return;
      }

      Alert.alert(
          "Confirm Settlement",
          `Clear ₹${outstandingAmount} for ${selectedEmployeeName}? This will mark all 'Approved' requests as 'Settled'.`,
          [
              { text: "Cancel", style: "cancel" },
              { text: "Confirm & Settle", onPress: processSettlement }
          ]
      );
  };

  const processSettlement = async () => {
      setIsSettling(true);
      try {
          await settleAdvancesForEmployee(selectedEmployeeId);
          await refreshAdvances(); // Silent reload
          Alert.alert("Success", "Account Settled! Balance is now 0.");
      } catch (error) {
          Alert.alert("Error", "Settlement failed.");
      } finally {
          setIsSettling(false);
      }
  };

  const openDetails = (item: any) => {
      setSelectedItem(item);
      setModalVisible(true);
  };

  const [installmentAmount, setInstallmentAmount] = useState('');

  // 🔥 STATUS UPDATE — via new backend API
  const handleStatusUpdate = async (status: string) => {
      setUpdatingStatus(status);
      try {
          const monthlyDeductionAmount = status === 'Approved' && installmentAmount ? Number(installmentAmount) : undefined;
          await updateAdvanceStatus(selectedItem.id, status as 'Approved' | 'Rejected', monthlyDeductionAmount);
          
          const targetUserId = selectedItem.senderId;
          if (addNotification && targetUserId && targetUserId !== currentUser?.id) {
              await addNotification({
                  title: `Advance ${status}`, 
                  message: `Your advance request of ₹${selectedItem.amount} has been ${status}.`,
                  type: status === 'Approved' ? 'success' : 'alert',
                  userId: targetUserId, 
                  to: selectedItem.senderName,
                  route: '/advance'
              });
          }

          setAdvanceList(prev => prev.map(item => item.id === selectedItem.id ? { ...item, status: status } : item));
          setModalVisible(false);
          Alert.alert("Updated", `Request marked as ${status}`);
      } catch (error) {
          Alert.alert("Error", "Could not update status.");
      } finally {
          setUpdatingStatus(null); 
      }
  };

  const renderItem = ({ item }: any) => {
    let statusColor = '#fff3e0'; 
    let statusTextCol = '#ef6c00';

    if (item.status === 'Approved') { statusColor = '#e8f5e9'; statusTextCol = '#2e7d32'; }
    else if (item.status === 'Rejected') { statusColor = '#ffebee'; statusTextCol = '#c62828'; }
    else if (item.status === 'Settled') { statusColor = '#e3f2fd'; statusTextCol = '#1565c0'; }

    return (
        <TouchableOpacity style={[styles.card, item.status === 'Settled' && {opacity: 0.7, backgroundColor:'#f9f9f9'}]} onPress={() => openDetails(item)}>
            <View style={styles.cardHeader}>
                <Text style={styles.date}>{item.date}</Text>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                        <Text style={[styles.statusText, { color: statusTextCol }]}>{item.status}</Text>
                    </View>
                </View>
            </View>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                <Text style={styles.amount}>₹ {item.amount}</Text>
                {canManage && <Text style={{fontSize:12, fontWeight:'bold', color:'#3b5998'}}>👤 {item.senderName}</Text>}
            </View>
            <Text style={styles.reason} numberOfLines={1}>{item.reason}</Text>
        </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Employee Advance</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_advance' as any)}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>Request</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.balanceContainer}>
          <View style={{flexDirection:'row', justifyContent:'space-between', width:'100%'}}>
              <View style={{alignItems:'center', flex:1}}>
                  <Text style={styles.statLabel}>Outstanding (Due)</Text>
                  <Text style={[styles.statValue, {color:'#d32f2f'}]}>₹{outstandingAmount.toLocaleString()}</Text>
              </View>

              <View style={styles.vDivider} />

              <View style={{alignItems:'center', flex:1}}>
                  <Text style={styles.statLabel}>Total Taken</Text>
                  <Text style={[styles.statValue, {color:'#3b5998'}]}>₹{totalHistoryAmount.toLocaleString()}</Text>
              </View>
          </View>
          
          <View style={{flexDirection:'row', justifyContent:'space-between', width:'100%', marginTop:10, alignItems:'center', borderTopWidth:1, borderTopColor:'#eee', paddingTop:10}}>
              {canManage && selectedEmployeeId !== 'All' ? (
                  <>
                    <Text style={{color:'#3b5998', fontSize:12, fontWeight:'bold'}}>👤 {selectedEmployeeName}</Text>
                    <TouchableOpacity style={[styles.settleBtn, outstandingAmount === 0 && {backgroundColor:'#ccc'}]} onPress={handleSettlement} disabled={isSettling || outstandingAmount === 0}>
                        {isSettling ? <ActivityIndicator color="white" size="small"/> : <Text style={styles.settleText}>Clear Due</Text>}
                    </TouchableOpacity>
                  </>
              ) : (
                  <Text style={{color:'gray', fontSize:11, fontStyle:'italic', width:'100%', textAlign:'center'}}>
                      {canManage ? "Select an employee to settle accounts" : "Your Advance Summary"}
                  </Text>
              )}
          </View>
      </View>

      <View style={{backgroundColor:'white', paddingBottom:10}}>
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'FY', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {canManage && (
              <TouchableOpacity style={styles.employeeFilterBtn} onPress={() => setShowEmployeePicker(true)}>
                  <Ionicons name="people" size={18} color="#2e7d32" />
                  <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                      {selectedEmployeeId === 'All' ? 'View All Staff' : selectedEmployeeName}
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
                  {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
                  <TextInput 
                      style={styles.searchInput}
                      placeholder={canManage ? "Search Name, Amount..." : "Search Amount, Date..."}
                      value={searchText}
                      onChangeText={setSearchText}
                  />
                  {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="gray" /></TouchableOpacity>}
              </View>
          </View>
      </View>

      <FlatList 
        data={renderedList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{padding: 15, paddingBottom: 50}} 
        refreshControl={
            <RefreshControl refreshing={advancesRefreshing} onRefresh={refreshAdvances} colors={['#3b5998']} tintColor="#3b5998" />
        }
        ListEmptyComponent={
            <Text style={{textAlign:'center', marginTop:50, color:'gray'}}>{advancesLoading ? 'Loading data...' : 'No advance records found.'}</Text>
        }
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < fullFilteredList.length ? (
                    <TouchableOpacity 
                        onPress={() => setVisibleCount(prev => prev + 20)} 
                        style={{
                            padding: 12, 
                            backgroundColor: '#fff', 
                            alignItems: 'center', 
                            marginVertical: 10, 
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#ddd'
                        }}
                    >
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                            👇 Load More Records ({fullFilteredList.length - visibleCount} remaining)
                        </Text>
                    </TouchableOpacity>
                ) : (
                    fullFilteredList.length > 0 ? (
                        <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                            --- End of List ---
                        </Text>
                    ) : null
                )}
            </View>
        }
      />

      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                    <Text style={styles.modalTitle}>Request Details</Text>
                    <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={28} color="#d32f2f" /></TouchableOpacity>
                </View>

                {selectedItem && (
                    <ScrollView>
                        {canManage && <View style={{backgroundColor:'#e3f2fd', padding:10, borderRadius:8, marginBottom:10}}><Text style={{color:'#1565c0', fontWeight:'bold', textAlign:'center'}}>👤 {selectedItem.senderName}</Text></View>}
                        
                        <DetailRow label="Date" value={selectedItem.date} icon="calendar" />
                        <DetailRow label="Status" value={selectedItem.status} icon="information-circle" />
                        <View style={styles.divider} />
                        <DetailRow label="Amount" value={`₹ ${selectedItem.amount}`} icon="cash" highlight />
                        
                        {selectedItem.status === 'Settled' && (
                            <Text style={{textAlign:'center', color:'green', fontWeight:'bold', marginBottom:10}}>( PAID / SETTLED )</Text>
                        )}

                        <View style={styles.divider} />
                        <Text style={{fontSize:12, color:'gray', marginBottom:5}}>Reason:</Text>
                        <View style={styles.noteBox}>
                            <Text style={{fontSize:14, color:'#333'}}>{selectedItem.reason}</Text>
                        </View>

                        {canManage && selectedItem.status === 'Pending' && (
    <>
        <View style={{ marginTop: 20, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: '#777', marginBottom: 5 }}>Monthly Installment (₹) — optional, leave blank to deduct as salary allows</Text>
            <TextInput
                style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, backgroundColor: '#fafafa', height: 44 }}
                placeholder="e.g. 3000"
                keyboardType="numeric"
                value={installmentAmount}
                onChangeText={setInstallmentAmount}
            />
        </View>

        <View style={styles.actionContainer}>
            <TouchableOpacity 
                style={[styles.rejectBtn, updatingStatus !== null && { opacity: 0.6 }]} 
                onPress={() => handleStatusUpdate('Rejected')}
                disabled={updatingStatus !== null}
            >
                {updatingStatus === 'Rejected' ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.btnText}>Reject</Text>}
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.approveBtn, updatingStatus !== null && { opacity: 0.6 }]} 
                onPress={() => handleStatusUpdate('Approved')}
                disabled={updatingStatus !== null}
            >
                {updatingStatus === 'Approved' ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.btnText}>Approve</Text>}
            </TouchableOpacity>
        </View>
    </>
)}
                    </ScrollView>
                )}
            </View>
          </View>
      </Modal>

      <Modal visible={showEmployeePicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Employee</Text>
                  <FlatList 
                    data={employees} 
                    keyExtractor={(item, index) => index.toString()} 
                    renderItem={({item}) => (
                      <TouchableOpacity style={styles.pickerItem} onPress={() => { setSelectedEmployeeId(item.id); setSelectedEmployeeName(item.name); setShowEmployeePicker(false); }}>
                          <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                          {selectedEmployeeId === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                      </TouchableOpacity>
                  )} />
              </View>
          </TouchableOpacity>
      </Modal>
    </View>
  );
}

const DetailRow = ({label, value, icon, highlight}: any) => (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom:12}}>
        <View style={{width:30}}><Ionicons name={icon} size={20} color="#3b5998" /></View>
        <View>
            <Text style={{fontSize:11, color:'gray'}}>{label}</Text>
            <Text style={{fontSize:15, fontWeight: highlight ? 'bold' : '500', color: highlight ? '#3b5998' : '#333'}}>{value}</Text>
        </View>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 10 },
  addBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#3b5998', borderRadius:20, paddingHorizontal:12, paddingVertical:6 },
  
  balanceContainer: { backgroundColor: 'white', margin: 15, borderRadius: 10, padding: 20, elevation: 3, alignItems:'center', borderLeftWidth:5, borderLeftColor:'#3b5998' },
  statLabel: { fontSize:10, color:'gray', textTransform:'uppercase' },
  statValue: { fontSize:18, fontWeight:'bold', marginTop:2 },
  vDivider: { width:1, height:30, backgroundColor:'#eee' },
  settleBtn: { backgroundColor: '#2e7d32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginLeft: 'auto' },
  settleText: { color: 'white', fontSize: 12, fontWeight: 'bold' },

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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom:5 },
  date: { fontWeight:'bold', color:'gray', fontSize:13 },
  statusBadge: { paddingHorizontal:8, paddingVertical:4, borderRadius:4 },
  statusText: { fontSize:10, fontWeight:'bold' },
  amount: { fontSize:20, fontWeight:'bold', color:'#333', marginVertical:5 },
  reason: { color:'gray', fontSize:13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998' },
  divider: { height:1, backgroundColor:'#eee', marginVertical:10 },
  noteBox: { backgroundColor: '#f9f9f9', padding: 10, borderRadius: 5, marginTop: 2, borderLeftWidth: 3, borderLeftColor: '#3b5998' },
  actionContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
  rejectBtn: { flex:1, backgroundColor: '#d32f2f', flexDirection:'row', alignItems:'center', justifyContent:'center', padding: 12, borderRadius: 8, marginRight: 10 },
  approveBtn: { flex:1, backgroundColor: '#2e7d32', flexDirection:'row', alignItems:'center', justifyContent:'center', padding: 12, borderRadius: 8 },
  btnText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});
