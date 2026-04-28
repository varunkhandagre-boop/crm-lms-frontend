import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

// 🔥 SAAS IMPORTS
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

export default function VisitingCardScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se sirf current user
  const { currentUser } = useData(); 

  // 🔥 2. Naya SaaS Engine
  const { fetchSaaSData, updateSaaSData, addSaaSData, isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded States
  const [cardRequestList, setCardRequestList] = useState<any[]>([]);
  const [userList, setUserList] = useState<any[]>([]);

  // --- STATES ---
  const [searchText, setSearchText] = useState('');
  const [activeStatus, setActiveStatus] = useState('All');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('All');
  const [currentDate, setCurrentDate] = useState(new Date());

  // MODAL STATES
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // State for Tracking No
  const [dispatchTracking, setDispatchTracking] = useState('');

  // LOADING STATES FOR BUTTONS
  const [isDispatching, setIsDispatching] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);

  // --- EMPLOYEE FILTER ---
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All'); 
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  // ROLE CHECK
  const myRole = (currentUser?.role || '').toLowerCase();
  const canViewAll = ['admin', 'manager', 'store', 'account', 'accountant', 'hr', 'superadmin'].some(r => myRole.includes(r));
  const canDispatch = canViewAll; 

  useEffect(() => {
      if (viewMode === 'Day' && activeStatus === 'All' && !searchText) {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, activeStatus, searchText, selectedEmployeeName]);

  // 🔥 4. LOAD SAAS DATA ON MOUNT
  const loadData = async () => {
      if (currentUser?.companyId) {
          const [cards, users] = await Promise.all([
              fetchSaaSData("card_requests"),
              fetchSaaSData("users")
          ]);
          setCardRequestList(cards);
          setUserList(users);

          if (canViewAll) {
              const uniqueUsers = Array.from(new Set(users.map((a:any) => a.name)))
                  .map(name => users.find((a:any) => a.name === name));
              setEmployees([{ id: 'All', name: 'All' }, ...uniqueUsers as any]);
          }
      }
  };

  useEffect(() => {
      loadData();
  }, [currentUser]);

  const onRefresh = async () => {
      setRefreshing(true);
      await loadData();
      setRefreshing(false);
  };

  const parseDate = (dateStr: any) => {
      if (!dateStr) return new Date();
      if (dateStr instanceof Date) return dateStr;
      if (typeof dateStr === 'string') {
          if (dateStr.includes('/')) {
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
              }
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
      let data = [...cardRequestList];

      if (canViewAll) {
          if (selectedEmployeeName !== 'All') {
              data = data.filter((item: any) => item.userName === selectedEmployeeName);
          }
      } else {
          data = data.filter((item: any) => item.senderId === currentUser?.id || item.senderId === currentUser?.uid || item.userName === currentUser?.name);
      }

      if (activeStatus !== 'All') {
          data = data.filter((item: any) => item.status === activeStatus);
      }

      if (searchText) {
          const lowerText = searchText.toLowerCase();
          data = data.filter((item: any) => {
              const fullString = `${item.reqId} ${item.userName} ${item.shippingAddress} ${item.status} ${item.trackingNo}`.toLowerCase();
              return fullString.includes(lowerText);
          });
      }

      if (viewMode !== 'All') {
          const targetYear = currentDate.getFullYear();
          const targetMonth = currentDate.getMonth();
          const targetDay = currentDate.getDate();

          const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
          const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
          const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); 

          data = data.filter((item: any) => {
              const dateField = item.dateIso || item.createdAt || item.date;
              if(!dateField) return false;
              const itemDate = parseDate(dateField);
              const itemTime = itemDate.getTime();
              
              if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
              if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
              if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
              return true;
          });
      }

      data.sort((a: any, b: any) => new Date(b.dateIso || b.createdAt || b.date).getTime() - new Date(a.dateIso || a.createdAt || a.date).getTime());

      return data;
  };

  const displayList = getFilteredData(); 
  const renderedList = displayList.slice(0, visibleCount);

  const openDetails = (item: any) => {
      setSelectedRequest(item);
      setDispatchTracking(''); 
      setModalVisible(true);
  };

  // --- 🔥 SAAS ENGINE: DISPATCH LOGIC ---
  const handleDispatch = async () => {
      if (!dispatchTracking) {
          Alert.alert("Required", "Please enter Courier Name & Tracking Number");
          return;
      }
      setIsDispatching(true); 
      try {
          const res = await updateSaaSData("card_requests", selectedRequest.id, {
               status: 'Sent',
               trackingNo: dispatchTracking,
               outDate: new Date().toISOString().split('T')[0]
          });
           
          if (res.success) {
              if (selectedRequest.senderId) {
                  await addSaaSData("notifications", {
                      title: "Cards Dispatched 🚀",
                      message: `Your visiting cards have been sent via ${dispatchTracking}.`,
                      type: "success",
                      userId: selectedRequest.senderId,
                      to: selectedRequest.userName,
                      route: '/visiting_card'
                  });
              }
              setModalVisible(false);
              await loadData();
              Alert.alert("Success", "Request Dispatched Successfully! 🚀");
          } else {
              Alert.alert("Error", "Could not dispatch request.");
          }
      } catch (error) {
           Alert.alert("Error", "Could not update status.");
      } finally {
          setIsDispatching(false); 
      }
  };

  // --- 🔥 SAAS ENGINE: RECEIVE LOGIC ---
  const handleReceive = () => {
      Alert.alert("Confirm Receipt", "Confirm that you received items?", [
          { text: "Cancel", style: "cancel" },
          { text: "Yes", onPress: async () => {
              setIsReceiving(true); 
              try {
                  const res = await updateSaaSData("card_requests", selectedRequest.id, { status: 'Received' });
                  if (res.success) {
                      setModalVisible(false);
                      await loadData();
                      Alert.alert("Success", "Marked as Received! ✅");
                  } else {
                      Alert.alert("Error", "Could not update receipt status.");
                  }
              } catch (error) { 
                  Alert.alert("Error", "Update failed."); 
              } finally {
                  setIsReceiving(false); 
              }
          }}
      ]);
  };

  const getStatusTheme = (status: string) => {
      switch(status) {
          case 'Sent': return { bg: '#E3F2FD', text: '#1565C0', icon: 'airplane' };
          case 'Received': return { bg: '#E8F5E9', text: '#2E7D32', icon: 'checkmark-done' };
          case 'Pending': return { bg: '#FFF3E0', text: '#EF6C00', icon: 'time' };
          default: return { bg: '#F5F5F5', text: '#757575', icon: 'help-circle' };
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
                 <Text style={styles.headerTitle}>Card Requests</Text>
             </View>
             
             <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_visiting_card' as any)}>
                <Ionicons name="add" size={20} color="white" />
                <Text style={styles.addBtnText}>New</Text>
            </TouchableOpacity>
        </View>
      </View>

      <View style={{backgroundColor:'white', paddingBottom:10, marginBottom:5}}>
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'FY', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {canViewAll && (
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

          <View style={styles.searchBar}>
              {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="#777" />}
              <TextInput style={styles.input} placeholder="Search ID, Name..." value={searchText} onChangeText={setSearchText} />
              {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="#777" /></TouchableOpacity>}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={{paddingHorizontal: 15}}>
              {['All', 'Pending', 'Sent', 'Received'].map((tab) => (
                  <TouchableOpacity key={tab} style={[styles.statusTab, activeStatus === tab && styles.activeStatusTab]} onPress={() => setActiveStatus(tab)}>
                      <Text style={[styles.statusTabText, activeStatus === tab && styles.activeStatusTabText]}>{tab}</Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>
          <Text style={{textAlign:'right', fontSize:12, color:'gray', paddingRight:15, marginTop:5}}>
              Total: <Text style={{fontWeight:'bold', color:'#333'}}>{displayList.length}</Text>
          </Text>
      </View>

      <FlatList 
        data={renderedList}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
            <View style={styles.emptyBox}>
                {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                    <>
                        <Ionicons name="documents-outline" size={60} color="#ccc" />
                        <Text style={styles.emptyText}>No requests found.</Text>
                    </>
                )}
            </View>
        }
        renderItem={({item}) => {
            const theme = getStatusTheme(item.status);
            return (
                <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
                    <View style={styles.cardHeader}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <View style={[styles.indicator, {backgroundColor: theme.text}]} />
                            <Text style={styles.idText}>{item.reqId || 'REQ'}</Text>
                        </View>
                        <View style={[styles.statusBadge, {backgroundColor: theme.bg}]}>
                            <Text style={{color: theme.text, fontSize:10, fontWeight:'bold'}}>{item.status}</Text>
                        </View>
                    </View>
                    
                    <View style={styles.userRow}>
                        <Ionicons name="person-circle-outline" size={16} color="#555" />
                        <Text style={styles.userNameText}>{item.userName || 'Unknown'}</Text>
                    </View>

                    <Text style={styles.addressText} numberOfLines={1}>
                        <Ionicons name="location-outline" size={12} /> {item.shippingAddress}
                    </Text>

                    <View style={styles.cardFooter}>
                        <Text style={styles.dateVal}>{item.dateIso || item.date || item.createdAt?.split('T')[0]}</Text>
                        <Text style={styles.detailLink}>View Details ➔</Text>
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

      {/* DETAILS MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Request Summary</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}>
                          <Ionicons name="close-circle" size={30} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  {selectedRequest && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          <DetailRow label="Requested By" value={selectedRequest.userName} />
                          <DetailRow label="ID" value={selectedRequest.reqId} />
                          <DetailRow label="Date" value={selectedRequest.dateIso || selectedRequest.date || selectedRequest.createdAt?.split('T')[0]} />
                          <DetailRow label="Status" value={selectedRequest.status} color={getStatusTheme(selectedRequest.status).text} />
                          
                          {selectedRequest.trackingNo ? (
                              <View style={styles.trackingBox}>
                                  <Text style={styles.trackingLabel}>Tracking Details</Text>
                                  <Text style={styles.trackingNo}>{selectedRequest.trackingNo}</Text>
                                  {selectedRequest.outDate && <Text style={styles.trackingDate}>Dispatched: {selectedRequest.outDate}</Text>}
                              </View>
                          ) : null}

                          {selectedRequest.status === 'Pending' && canDispatch && (
                              <View style={styles.adminActionBox}>
                                  <Text style={styles.adminActionTitle}>Dispatch Order</Text>
                                  <TextInput 
                                      style={styles.adminInput}
                                      placeholder="Courier Name & Tracking No"
                                      value={dispatchTracking}
                                      onChangeText={setDispatchTracking}
                                      editable={!isDispatching}
                                  />
                                  <TouchableOpacity 
                                      style={[styles.dispatchBtn, isDispatching && { opacity: 0.6 }]} 
                                      onPress={handleDispatch}
                                      disabled={isDispatching}
                                  >
                                      {isDispatching ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.dispatchBtnText}>Mark as Sent</Text>}
                                  </TouchableOpacity>
                              </View>
                          )}

                          <Text style={styles.sectionHeader}>Items</Text>
                          <View style={styles.table}>
                              {selectedRequest.items?.map((item: any, index: number) => (
                                  <View key={index} style={styles.tableRow}>
                                      <Text style={styles.tableItem}>{item.type}</Text>
                                      <Text style={styles.tableQty}>x {item.quantity}</Text>
                                  </View>
                              ))}
                          </View>

                          {selectedRequest.status === 'Sent' && (
                              <TouchableOpacity 
                                  style={[styles.receiveBtn, isReceiving && { opacity: 0.6 }]} 
                                  onPress={handleReceive}
                                  disabled={isReceiving}
                              >
                                  {isReceiving ? <ActivityIndicator color="white" size="small" /> : (
                                      <>
                                          <Ionicons name="checkmark-circle" size={20} color="white" />
                                          <Text style={styles.receiveBtnText}>Confirm Delivery</Text>
                                      </>
                                  )}
                              </TouchableOpacity>
                          )}
                      </ScrollView>
                  )}
              </View>
          </View>
          </KeyboardAvoidingView>
      </Modal>

      {/* EMPLOYEE PICKER MODAL */}
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

const DetailRow = ({label, value, color}: any) => (
    <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, {color: color || '#333'}]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: 'white', paddingTop: 50, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom:10 },
  backCircle: { backgroundColor: '#F0F0F0', padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A237E', marginLeft: 12 },
  addBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#3B5998', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: 'white', fontWeight: 'bold', marginLeft: 4, fontSize: 13 },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 15, borderRadius: 8, padding: 3, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },
  
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 10, marginHorizontal: 15, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, marginHorizontal:15, borderRadius:8, borderWidth:1, borderColor:'#2e7d32', marginBottom:10 },
  searchBar: { backgroundColor: '#F1F3F4', paddingHorizontal: 12, borderRadius: 10, flexDirection:'row', alignItems:'center', height:45, marginHorizontal: 15, marginBottom:15 },
  input: { flex:1, marginLeft:8, fontSize:15, color:'#333' },
  
  tabScroll: { flexDirection: 'row', marginBottom: 5 },
  statusTab: { paddingHorizontal: 16, paddingVertical: 8, marginRight: 10, borderRadius: 20, backgroundColor: '#F0F0F0' },
  activeStatusTab: { backgroundColor: '#3B5998' },
  statusTabText: { color: '#666', fontWeight: 'bold', fontSize:12 },
  activeStatusTabText: { color: 'white' },

  contentContainer: { padding: 15, paddingBottom: 50 },
  card: { backgroundColor: 'white', borderRadius: 15, padding: 16, marginBottom: 12, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#3B5998' },
  cardHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 5 },
  indicator: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  idText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  userNameText: { fontSize: 13, fontWeight: 'bold', color: '#1A237E', marginLeft: 5 },
  addressText: { fontSize: 13, color: '#616161', marginBottom: 10 },
  cardFooter: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  dateVal: { fontSize: 11, color: '#9E9E9E' },
  detailLink: { fontSize: 11, color: '#3B5998', fontWeight: 'bold' },
  emptyBox: { alignItems:'center', marginTop:100 },
  emptyText: { textAlign:'center', marginTop:15, color:'#9E9E9E', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 25, maxHeight: '85%' },
  modalHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A237E' },
  detailRow: { flexDirection:'row', justifyContent:'space-between', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', paddingBottom: 8 },
  detailLabel: { fontSize: 12, color: '#757575', textTransform: 'uppercase' },
  detailValue: { fontSize: 14, fontWeight: 'bold' },
  trackingBox: { backgroundColor: '#E3F2FD', padding: 15, borderRadius: 12, marginVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#BBDEFB' },
  trackingLabel: { fontSize: 11, color: '#1565C0', fontWeight: 'bold', textTransform: 'uppercase' },
  trackingNo: { fontSize: 20, fontWeight: 'bold', color: '#0D47A1', marginVertical: 4 },
  trackingDate: { fontSize: 11, color: '#546E7A' },
  adminActionBox: { backgroundColor: '#FFF3E0', padding: 15, borderRadius: 12, marginVertical: 10, borderLeftWidth:4, borderLeftColor:'#EF6C00' },
  adminActionTitle: { fontSize: 14, fontWeight: 'bold', color: '#E65100', marginBottom: 8 },
  adminInput: { backgroundColor: 'white', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FFCC80', marginBottom: 10 },
  dispatchBtn: { backgroundColor: '#EF6C00', padding: 12, borderRadius: 8, alignItems: 'center', flexDirection:'row', justifyContent:'center' },
  dispatchBtnText: { color: 'white', fontWeight: 'bold' },
  sectionHeader: { fontWeight: 'bold', color: '#1A237E', marginBottom: 8, marginTop:15, fontSize: 14 },
  table: { marginTop: 5 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tableItem: { fontSize: 13, color: '#333' },
  tableQty: { fontWeight: 'bold', color: '#3B5998' },
  receiveBtn: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 25, flexDirection:'row', justifyContent:'center', elevation: 3 },
  receiveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15, marginLeft:10 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});