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

// 🔥 SAAS IMPORTS (Direct DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { fetchTeamMembers } from '../services/api/users';
import { useData } from './context/DataContext';

// 🔥 Phase 8: travel notes now come from Postgres via these adapters
import { fetchTravelNotes, settleTravelNotesForUser } from '../services/api/travelNotes';

export default function TravelNoteScreen() {
  const router = useRouter();

  // 🔥 1. Context se current user nikala
  const { currentUser } = useData(); 

  // 🔥 2. "users" still Firestore; travel notes are Postgres now
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded States for DB
  const [travelList, setTravelList] = useState<any[]>([]);
  const [userList, setUserList] = useState<any[]>([]);

  // --- STATES ---
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('All'); 
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchText, setSearchText] = useState('');
  
  const [selectedItem, setSelectedItem] = useState<any>(null); 
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // SETTLEMENT LOADING STATE
  const [isSettling, setIsSettling] = useState(false);

  // --- EMPLOYEE FILTER ---
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All'); 
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  const canManage = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr', 'SuperAdmin'].includes(currentUser?.role || '');

  useEffect(() => {
      if (viewMode === 'Day') {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, searchText, selectedEmployeeName]);

  function getFetchRange(): { fromDate?: string; toDate?: string } {
      const toIso = (d: Date) => d.toISOString().split('T')[0];
      if (viewMode === 'All') return {};
      if (viewMode === 'Day') return { fromDate: toIso(currentDate), toDate: toIso(currentDate) };
      if (viewMode === 'Month') {
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
  const loadUsers = async () => {
      if (!currentUser?.companyId) return;
      const users = await fetchTeamMembers();
      setUserList(users);
      if (canManage) {
          const uniqueUsers = Array.from(new Set(users.map((a:any) => a.name)))
              .map(name => users.find((a:any) => a.name === name));
          setEmployees([{ id: 'All', name: 'All' }, ...uniqueUsers as any]);
      }
  };

  useEffect(() => {
      loadUsers();
  }, [currentUser]);

  // 🔥 4b. Travel notes — Postgres, bounded by view window + employee filter
  const loadData = async () => {
      if (!currentUser?.companyId) return;
      if (canManage && selectedEmployeeName !== 'All' && employees.length === 0) return; // wait for employees to resolve the picked id

      const { fromDate, toDate } = getFetchRange();
      let targetUserId: string | undefined;
      if (canManage) {
          if (selectedEmployeeName === 'All') targetUserId = 'all';
          else targetUserId = employees.find(e => e.name === selectedEmployeeName)?.id;
      }

      const travels = await fetchTravelNotes({ userId: targetUserId, fromDate, toDate, limit: 500 });
      setTravelList(travels);
  };

  useEffect(() => {
      loadData();
  }, [currentUser, viewMode, currentDate, selectedEmployeeName, employees]);

  const onRefresh = async () => {
      setRefreshing(true);
      await loadData();
      setRefreshing(false);
  };

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

  // --- FILTER LOGIC ---
  const getFilteredData = () => {
      let data = Array.isArray(travelList) ? [...travelList] : [];

      // employee + date-range already applied server-side (see loadData above);
      // search stays client-side over the bounded fetched set.

      if (searchText) {
          const term = searchText.toLowerCase();
          data = data.filter((item: any) => {
             const fullString = `
                ${item.dateIso || item.date || ''} 
                ${item.amount ? item.amount.toString() : ''} 
                ${item.from || ''} 
                ${item.to || ''} 
                ${item.senderName || item.userName || ''} 
                ${item.mode || ''} 
                ${item.status || ''}
             `.toLowerCase();
             return fullString.includes(term);
          });
      }

      if (viewMode !== 'All') {
          const targetYear = currentDate.getFullYear();
          const targetMonth = currentDate.getMonth();
          const targetDay = currentDate.getDate();

          const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
          const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
          const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime();

          data = data.filter(item => {
              const dateField = item.dateIso || item.date || item.createdAt;
              if(!dateField) return false;
              
              const itemDate = parseDate(dateField);
              const itemTime = itemDate.getTime();
              
              if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
              if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
              if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
              return true;
          });
      }

      data.sort((a: any, b: any) => parseDate(b.dateIso || b.date).getTime() - parseDate(a.dateIso || a.date).getTime());
      return data;
  };

  const displayList = getFilteredData(); 
  const renderedList = displayList.slice(0, visibleCount);
  
  const outstandingAmount = displayList
      .filter((item: any) => item.status === 'Pending' || item.status === 'Approved')
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const totalHistoryAmount = displayList
      .filter((item: any) => item.status !== 'Rejected')
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  // --- 🔥 SAAS ENGINE: SETTLEMENT LOGIC ---
  const handleSettlement = async () => {
      if (selectedEmployeeName === 'All') {
          Alert.alert("Error", "Please select a specific employee to settle.");
          return;
      }
      
      if (outstandingAmount === 0) {
          Alert.alert("Info", "No outstanding travel balance to settle.");
          return;
      }

      Alert.alert(
          "Confirm Payment",
          `Mark ₹${outstandingAmount} as PAID for ${selectedEmployeeName}?`,
          [
              { text: "Cancel", style: "cancel" },
              { text: "Confirm & Pay", onPress: processSettlement }
          ]
      );
  };

  // --- 🔥 Phase 8: SETTLEMENT via settleTravelNotesForUser() — single atomic bulk update.
  // (The old "notify employee their claims were settled" push is dropped here: the old
  // code sourced the Firestore userId off the first pre-fetched note; the new bulk
  // endpoint settles server-side without returning individual records to key off of.
  // Re-add via addNotification once notifications move off Firestore in Phase 9.)
  const processSettlement = async () => {
      setIsSettling(true);
      try {
          const targetUserId = employees.find(e => e.name === selectedEmployeeName)?.id;
          if (!targetUserId) {
              Alert.alert("Error", "Could not resolve the selected employee.");
              setIsSettling(false);
              return;
          }

          const result = await settleTravelNotesForUser(targetUserId);
          if (result.settledCount === 0) {
              Alert.alert("Info", "No pending items to settle.");
              setIsSettling(false);
              return;
          }

          await loadData(); 
          Alert.alert("Success", "Travel Expenses Settled!");
      } catch (error) {
          Alert.alert("Error", "Settlement failed. Check console.");
      } finally {
          setIsSettling(false);
      }
  };

  const openDetails = (item: any) => {
      setSelectedItem(item);
      setModalVisible(true);
  };

  const getModeIcon = (mode: string) => {
      if(!mode) return 'walk';
      const m = mode.toLowerCase();
      if(m.includes('bike')) return 'bicycle';
      if(m.includes('car') || m.includes('taxi')) return 'car';
      if(m.includes('bus')) return 'bus';
      if(m.includes('train')) return 'train';
      if(m.includes('flight')) return 'airplane';
      return 'walk';
  };

  const renderItem = ({ item }: any) => {
    const isSettled = item.status === 'Settled' || item.status === 'Paid';
    const isPending = item.status === 'Pending';
    
    return (
        <TouchableOpacity style={[styles.card, isSettled && {opacity: 0.7, backgroundColor:'#f9f9f9'}]} onPress={() => openDetails(item)}>
            <View style={styles.cardHeader}>
                <Text style={styles.date}>{item.date}</Text>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <View style={[styles.amountBadge, isSettled && {backgroundColor:'#e0e0e0', borderColor:'#ccc'}]}>
                        <Text style={[styles.amountText, isSettled && {color:'gray'}]}>₹{item.amount || '0'}</Text>
                    </View>
                    
                    {isSettled && (
                        <View style={{marginLeft:5, backgroundColor:'#e3f2fd', paddingHorizontal:6, paddingVertical:2, borderRadius:4}}>
                            <Text style={{color:'#1565c0', fontSize:10, fontWeight:'bold'}}>PAID</Text>
                        </View>
                    )}
                    {isPending && (
                        <View style={{marginLeft:5, backgroundColor:'#fff3e0', paddingHorizontal:6, paddingVertical:2, borderRadius:4}}>
                            <Text style={{color:'#ef6c00', fontSize:10, fontWeight:'bold'}}>PENDING</Text>
                        </View>
                    )}
                </View>
            </View>
            
            <View style={styles.routeRow}>
                <View style={{flex:1}}>
                    <Text style={styles.label}>From</Text>
                    <Text style={styles.place} numberOfLines={1}>{item.from}</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color="#bbb" style={{marginHorizontal:10, marginTop:12}} />
                <View style={{flex:1, alignItems:'flex-end'}}>
                    <Text style={styles.label}>To</Text>
                    <Text style={styles.place} numberOfLines={1}>{item.to}</Text>
                </View>
            </View>

            <View style={styles.divider} />
            
            <View style={styles.footer}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Ionicons name="person-circle-outline" size={16} color="gray" />
                    <Text style={styles.senderName} numberOfLines={1}> {item.senderName || item.userName || 'Unknown'}</Text>
                </View>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Ionicons name={getModeIcon(item.mode) as any} size={14} color="#3b5998" style={{marginRight:4}}/>
                    <Text style={styles.distance}>{item.distance} km</Text>
                </View>
            </View>
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
            <Text style={styles.headerTitle}>Travel History</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_travel' as any)}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>Add</Text>
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
                  <Text style={styles.statLabel}>Total Spent</Text>
                  <Text style={[styles.statValue, {color:'#3b5998'}]}>�{totalHistoryAmount.toLocaleString()}</Text>
              </View>
          </View>

          <View style={{flexDirection:'row', justifyContent:'space-between', width:'100%', marginTop:15, alignItems:'center', borderTopWidth:1, borderTopColor:'#eee', paddingTop:10}}>
              {canManage && selectedEmployeeName !== 'All' ? (
                  <>
                    <Text style={{color:'#3b5998', fontSize:12, fontWeight:'bold'}}>👤 {selectedEmployeeName}</Text>
                    <TouchableOpacity 
                        style={[
                            styles.settleBtn, 
                            (outstandingAmount === 0 || isSettling) && {backgroundColor:'#ccc', opacity: 0.6}
                        ]} 
                        onPress={handleSettlement} 
                        disabled={isSettling || outstandingAmount === 0}
                    >
                        {isSettling ? <ActivityIndicator color="white" size="small"/> : <Text style={styles.settleText}>Clear Due</Text>}
                    </TouchableOpacity>
                  </>
              ) : (
                  <Text style={{color:'gray', fontSize:11, fontStyle:'italic', width:'100%', textAlign:'center'}}>
                      {canManage ? "Select an employee to settle accounts" : "Your Travel Summary"}
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
                  {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
                  <TextInput 
                      style={styles.searchInput}
                      placeholder="Search..."
                      value={searchText}
                      onChangeText={setSearchText}
                  />
                  {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="gray" /></TouchableOpacity>}
              </View>
          </View>
      </View>

      <FlatList 
          data={renderedList}
          keyExtractor={(item: any) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{padding: 15}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
              <View style={{alignItems: 'center', marginTop: 50}}>
                {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : <Text style={{textAlign:'center', color:'gray'}}>No travel records found.</Text>}
              </View>
          }
          ListFooterComponent={
              <View style={{ paddingBottom: 80 }}>
                  {visibleCount < displayList.length ? (
                      <TouchableOpacity 
                          onPress={() => setVisibleCount(prev => prev + 20)} 
                          style={{
                              padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', elevation: 1
                          }}
                      >
                          <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                              👇 Load More Records ({displayList.length - visibleCount} remaining)
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

      {/* DETAIL POPUP */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                    <Text style={styles.modalTitle}>Travel Receipt</Text>
                    <TouchableOpacity onPress={() => setModalVisible(false)}>
                        <Ionicons name="close-circle" size={30} color="#d32f2f" />
                    </TouchableOpacity>
                </View>

                {selectedItem && (
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {canManage && (
                            <View style={{backgroundColor:'#e3f2fd', padding:10, borderRadius:8, marginBottom:10}}>
                                <Text style={{color:'#1565c0', fontWeight:'bold', textAlign:'center'}}>👤 {selectedItem.senderName}</Text>
                            </View>
                        )}

                        <Text style={styles.sectionHeader}>Journey Details</Text>
                        <DetailRow label="Date" value={selectedItem.date} icon="calendar" />
                        <DetailRow label="Mode" value={selectedItem.mode} icon={getModeIcon(selectedItem.mode)} />
                        <DetailRow label="From" value={selectedItem.from} icon="location" />
                        <DetailRow label="To" value={selectedItem.to} icon="flag" />
                        <DetailRow label="Distance" value={`${selectedItem.distance} km`} icon="resize" />

                        <Text style={styles.sectionHeader}>Expense Details</Text>
                        <View style={styles.amountBox}>
                            <Text style={{fontSize:14, color:'gray'}}>Claim Amount</Text>
                            <Text style={{fontSize:24, fontWeight:'bold', color:'#2e7d32'}}>₹{selectedItem.amount || 0}</Text>
                            {selectedItem.status === 'Settled' && <Text style={{color:'green', fontSize:12, fontWeight:'bold', marginTop:5}}>(PAID / SETTLED)</Text>}
                        </View>

                        <Text style={styles.sectionHeader}>Purpose / Note</Text>
                        <View style={styles.noteBox}>
                            <Text style={{fontSize:14, color:'#333', lineHeight:20}}>
                                {selectedItem.purpose || selectedItem.note || 'No description provided.'}
                            </Text>
                        </View>
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
                      <TouchableOpacity style={styles.pickerItem} onPress={() => { setSelectedEmployeeName(item.name); setShowEmployeePicker(false); }}>
                          <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                          {selectedEmployeeName === item.name && <Ionicons name="checkmark" size={18} color="green" />}
                      </TouchableOpacity>
                  )} />
              </View>
          </TouchableOpacity>
      </Modal>

    </View>
  );
}

const DetailRow = ({label, value, icon}: any) => (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom:12, borderBottomWidth:1, borderBottomColor:'#f0f0f0', paddingBottom:8}}>
        <View style={{width:30}}><Ionicons name={icon as any} size={20} color="#3b5998" /></View>
        <View style={{flex:1, flexDirection:'row', justifyContent:'space-between'}}>
            <Text style={{fontSize:13, color:'gray'}}>{label}</Text>
            <Text style={{fontSize:14, fontWeight:'600', color:'#333'}}>{value}</Text>
        </View>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginLeft: 10 },
  addBtn: { flexDirection:'row', backgroundColor:'#3b5998', paddingHorizontal:12, paddingVertical:6, borderRadius:5, alignItems:'center' },
  
  balanceContainer: { backgroundColor: 'white', margin: 15, borderRadius: 10, padding: 15, elevation: 3, alignItems:'center', borderLeftWidth:5, borderLeftColor:'#3b5998' },
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom:10 },
  date: { fontWeight:'bold', color:'gray', fontSize:13 },
  modeBadge: { flexDirection:'row', backgroundColor:'#f57c00', paddingHorizontal:8, paddingVertical:4, borderRadius:12, alignItems:'center' },
  amountBadge: { backgroundColor:'#e8f5e9', paddingHorizontal:8, paddingVertical:4, borderRadius:12, borderWidth:1, borderColor:'#c8e6c9' },
  amountText: { color:'#2e7d32', fontWeight:'bold', fontSize:12 },
  routeRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  label: { fontSize:10, color:'gray' },
  place: { fontSize:15, fontWeight:'600', color:'#333' },
  divider: { height:1, backgroundColor:'#eee', marginVertical:10 },
  footer: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  senderName: { color:'gray', fontSize:12, fontStyle:'italic' },
  distance: { fontWeight:'bold', color:'#3b5998', fontSize:16 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight:'85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998' },
  userInfoBox: { backgroundColor:'#f0f4f8', padding:15, borderRadius:10, marginBottom:15 },
  infoLabel: { color:'gray', fontSize:12 },
  infoValue: { fontWeight:'bold', color:'#333', fontSize:13 },
  sectionHeader: { fontSize:14, fontWeight:'bold', color:'#555', marginTop:10, marginBottom:10, textTransform:'uppercase' },
  amountBox: { alignItems:'center', backgroundColor:'#e8f5e9', padding:15, borderRadius:10, marginBottom:10, borderStyle:'dashed', borderWidth:1, borderColor:'green' },
  noteBox: { backgroundColor: '#fff', padding: 10, borderRadius: 5, marginTop: 2, borderWidth:1, borderColor:'#eee' },
  
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});
