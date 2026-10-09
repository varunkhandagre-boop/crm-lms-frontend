import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { fetchTeamMembers } from '../services/api/users';
import { useData } from './context/DataContext';

// 🔥 Phase 8: travel notes now come from Postgres via these adapters
import { listTravelNotesPage, settleTravelNotesForUser, TravelPageFilters } from '../services/api/travelNotes';
import { useServerPagedList } from '../hooks/useServerPagedList';
import { periodRange, useDebounced } from '../utils/periodRange';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { PeriodTabs, StaffPeriodRow } from '../components/compact';

export default function TravelNoteScreen() {
  const headerTop = useHeaderTop();
  const router = useRouter();

  // 🔥 1. Context se current user nikala
  const { currentUser } = useData(); 


  // 🔥 3. Lazy Loaded States for DB
  // userList now comes from useCachedList below (cache-first, shared 'team_members' key)

  // --- STATES ---
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('All'); 
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchText, setSearchText] = useState('');
  
  const [selectedItem, setSelectedItem] = useState<any>(null); 
  const [modalVisible, setModalVisible] = useState(false);
  
  // SETTLEMENT LOADING STATE
  const [isSettling, setIsSettling] = useState(false);

  // --- EMPLOYEE FILTER ---
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All'); 
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);


  const canManage = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr', 'SuperAdmin'].includes(currentUser?.role || '');

  // 🔥 4a. Users list — cache-first, shares the SAME 'team_members' cache
  // key as manage_team.tsx/employee_timeline.tsx.
  const { data: userList } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });
  useEffect(() => {
      if (canManage) {
          const uniqueUsers = Array.from(new Set(userList.map((a:any) => a.name)))
              .map(name => userList.find((a:any) => a.name === name));
          setEmployees([{ id: 'All', name: 'All' }, ...uniqueUsers as any]);
      }
  }, [userList, canManage]);

  // 🔥 TRAVEL NOTES — 20 per page from the server: date range (local days, not
  // UTC), employee, search, and Outstanding / Total for the whole filter.
  const usersReady = !(canManage && selectedEmployeeName !== 'All' && employees.length === 0);
  const resolveTargetUserId = (): string | undefined => {
      if (!canManage) return undefined; // self, enforced server-side
      if (selectedEmployeeName === 'All') return 'all';
      return employees.find(e => e.name === selectedEmployeeName)?.id;
  };
  const targetUserId = resolveTargetUserId();
  const debouncedSearch = useDebounced(searchText.trim());
  const travelFilters = useMemo<TravelPageFilters>(() => ({
      ...periodRange(viewMode, currentDate),
      userId: targetUserId,
      search: debouncedSearch || undefined,
  }), [viewMode, currentDate, targetUserId, debouncedSearch]);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [totalHistoryAmount, setTotalHistoryAmount] = useState(0);
  const fetchTravelPage = useCallback(async (p: TravelPageFilters & { page: number; limit: number }) => {
      const r = await listTravelNotesPage(p);
      if (p.page === 1) { setOutstandingAmount(r.outstanding); setTotalHistoryAmount(r.totalAmount); }
      return r;
  }, []);
  const isDefaultView = viewMode === 'All' && selectedEmployeeName === 'All' && !debouncedSearch;
  const {
      items: travelList,
      total: travelTotal,
      loading: travelLoading,
      loadingMore: travelLoadingMore,
      hasMore: travelHasMore,
      loadMore: loadMoreTravel,
      refreshing: travelRefreshing,
      refresh: refreshTravel,
      error: travelError,
  } = useServerPagedList<TravelPageFilters, any>({
      fetchPage: fetchTravelPage,
      filters: travelFilters,
      enabled: !!currentUser?.companyId && usersReady,
      cacheKey: isDefaultView ? buildCacheKey('travel_page1_v1', currentUser?.companyId) : null,
  });

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

  // Settlement: one atomic bulk update on the server, which also notifies the employee.
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

          await refreshTravel(); 
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
      <View style={[styles.header, { paddingTop: headerTop }]}>
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
                  {travelLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
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
          data={travelList}
          keyExtractor={(item: any) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{padding: 12}}
          refreshControl={<RefreshControl refreshing={travelRefreshing} onRefresh={refreshTravel} colors={['#3b5998']} tintColor="#3b5998" />}
          ListEmptyComponent={
              <View style={{alignItems: 'center', marginTop: 50}}>
                {travelLoading ? <ActivityIndicator size="large" color="#3b5998" /> : <Text style={{textAlign:'center', color:'gray'}}>{travelError ? 'Could not load travel notes — pull down to retry.' : 'No travel records found.'}</Text>}
              </View>
          }
          ListFooterComponent={
              <View style={{ paddingBottom: 80 }}>
                  {travelHasMore ? (
                      <TouchableOpacity 
                          onPress={loadMoreTravel}
                          disabled={travelLoadingMore}
                          style={{
                              padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', elevation: 1
                          }}
                      >
                          {travelLoadingMore ? <ActivityIndicator color="#3b5998" /> : (
                              <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({travelTotal - travelList.length} remaining)</Text>
                          )}
                      </TouchableOpacity>
                  ) : (
                      travelList.length > 0 ? (
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', elevation: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginLeft: 10 },
  addBtn: { flexDirection:'row', backgroundColor:'#3b5998', paddingHorizontal:12, paddingVertical:6, borderRadius:5, alignItems:'center' },
  
  balanceContainer: { backgroundColor: 'white', margin: 15, borderRadius: 10, padding: 15, elevation: 3, alignItems:'center', borderLeftWidth:5, borderLeftColor:'#3b5998' },
  statLabel: { fontSize:10, color:'gray', textTransform:'uppercase' },
  statValue: { fontSize:18, fontWeight:'bold', marginTop:2 },
  vDivider: { width:1, height:30, backgroundColor:'#eee' },
  
  settleBtn: { backgroundColor: '#2e7d32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginLeft: 'auto' },
  settleText: { color: 'white', fontSize: 12, fontWeight: 'bold' },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 36 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 11, marginBottom: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom:10 },
  date: { fontWeight:'bold', color:'gray', fontSize:13 },
  modeBadge: { flexDirection:'row', backgroundColor:'#f57c00', paddingHorizontal:8, paddingVertical:4, borderRadius:12, alignItems:'center' },
  amountBadge: { backgroundColor:'#e8f5e9', paddingHorizontal:8, paddingVertical:4, borderRadius:12, borderWidth:1, borderColor:'#c8e6c9' },
  amountText: { color:'#2e7d32', fontWeight:'bold', fontSize:12 },
  routeRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  label: { fontSize:10, color:'gray' },
  place: { fontSize:15, fontWeight:'600', color:'#333' },
  divider: { height:1, backgroundColor:'#eee', marginVertical:7 },
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
