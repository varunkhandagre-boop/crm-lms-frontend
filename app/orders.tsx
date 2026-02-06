import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useData } from './context/DataContext';

// FIREBASE IMPORTS
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function OrderListScreen() {
  const router = useRouter();
  const { orderList, user, updateOrderStatus, addNotification } = useData();

  // STATES
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year' | 'All'>('Year');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // EMPLOYEE FILTER
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('All'); 
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const isAdmin = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr'].includes(user?.role || '');

  // FETCH EMPLOYEES
  useEffect(() => {
    if (isAdmin) {
      const fetchEmployees = async () => {
        try {
          const q = query(collection(db, "users"));
          const querySnapshot = await getDocs(q);
          const usersData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'Unknown User'
          }));
          setEmployees([{ id: 'All', name: 'All Staff' }, ...usersData]);
        } catch (error) {
          console.log("Error fetching employees:", error);
        }
      };
      fetchEmployees();
    }
  }, [user]);

  // DATE PARSER
  const parseDate = (dateStr: any) => {
      if (!dateStr) return 0;
      if (typeof dateStr === 'number') return dateStr; 
      if (dateStr instanceof Date) return dateStr.getTime(); 

      if (typeof dateStr === 'string') {
          let cleanStr = dateStr.replace(/\./g, '/').replace(/-/g, '/');
          const parts = cleanStr.split('/');
          
          if (parts.length === 3 && parts[0].length === 4) {
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1; 
              const day = parseInt(parts[2]);
              return new Date(year, month, day).getTime();
          }
          
          if (parts.length === 3 && parts[2].length === 4) {
              const day = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1;
              const year = parseInt(parts[2]);
              return new Date(year, month, day).getTime();
          }
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (viewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'Year') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  const getHeaderDate = () => {
      if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (viewMode === 'Year') return currentDate.getFullYear().toString();
      return "All Time";
  };

  // FILE OPENER
  const handleOpenFile = async (url: string) => {
      if (!url) {
          Alert.alert("Error", "No file link found.");
          return;
      }
      try {
          if (url.startsWith('http')) {
              Linking.openURL(url);
              return;
          }
          if (!(await Sharing.isAvailableAsync())) {
              Alert.alert("Error", "Sharing is not available");
              return;
          }
          if (url.startsWith('file://') || url.startsWith('/')) {
              const cacheDir = (FileSystem as any).cacheDirectory;
              let extension = 'jpg'; 
              if (url.toLowerCase().includes('.pdf')) extension = 'pdf';
              else if (url.toLowerCase().includes('.png')) extension = 'png';

              const safeFileName = `temp_share_${Date.now()}.${extension}`;
              const newPath = `${cacheDir}${safeFileName}`;

              try {
                  await FileSystem.copyAsync({ from: url, to: newPath });
                  await Sharing.shareAsync(newPath, {
                      mimeType: extension === 'pdf' ? 'application/pdf' : 'image/jpeg',
                      dialogTitle: 'View Attachment'
                  });
              } catch (copyError) {
                  await Sharing.shareAsync(url);
              }
          } 
      } catch (e: any) {
          Alert.alert("Error", "Could not open file.");
      }
  };

  // --- FILTER LOGIC (ROBUST) ---
  const getFilteredData = () => {
      let data = orderList ? [...orderList] : [];

      // 1. Admin Employee Filter
    if (isAdmin && selectedEmployee !== 'All') {
        const targetName = selectedEmployeeName.toLowerCase().trim();
        
        data = data.filter((item: any) => 
            (item.senderId === selectedEmployee) || 
            (item.userId === selectedEmployee) ||
            (item.senderName && item.senderName.toLowerCase().trim().includes(targetName)) ||
            (item.userName && item.userName.toLowerCase().trim().includes(targetName)) ||
            (item.bookedBy && item.bookedBy.toLowerCase().trim().includes(targetName))
        );
    } 
    else if (!isAdmin) {
        // Employee: Show if order is THEIRS or BOOKED BY them
        data = data.filter((item: any) => 
            item.senderId === user?.uid || 
            item.bookedBy === user?.name
        );
    }

      if (statusFilter !== 'All') {
          data = data.filter((item: any) => item.status === statusFilter);
      }

      if (searchText) {
          const term = searchText.toLowerCase();
          data = data.filter((item: any) => {
              const fullString = `
                  ${item.hospitalName || ''}
                  ${item.poNumber || ''}
                  ${item.orderId || ''}
                  ${item.productDetails || ''}
                  ${item.amount || ''}
                  ${item.status || ''}
                  ${item.senderName || item.userName || ''}
                  ${item.bookedBy || ''}
              `.toLowerCase();
              return fullString.includes(term);
          });
      }

      if (viewMode !== 'All') {
          const targetYear = currentDate.getFullYear();
          const targetMonth = currentDate.getMonth();
          const targetDay = currentDate.getDate();

          data = data.filter((item: any) => {
              const dateVal = item.date || item.createdAt;
              const ts = parseDate(dateVal);
              if (ts === 0) return false;

              const itemDate = new Date(ts);
              
              if (viewMode === 'Year') return itemDate.getFullYear() === targetYear;
              if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
              if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
              return true;
          });
      }

      data.sort((a: any, b: any) => parseDate(b.date) - parseDate(a.date));
      return data;
  };

  const displayList = getFilteredData();

  const handleUpdateStatus = async (newStatus: string) => {
      if (!selectedOrder || !updateOrderStatus) return;
      
      Alert.alert("Confirm", `Mark as ${newStatus}?`, [
          { text: "Cancel", style: "cancel" },
          { 
              text: "Yes", 
              onPress: async () => {
                  await updateOrderStatus(selectedOrder.id, newStatus, selectedOrder);
                  if (addNotification && selectedOrder.senderId) {
                      await addNotification({
                          title: `Order ${newStatus}`, 
                          message: `Order for ${selectedOrder.hospitalName} (PO: ${selectedOrder.poNumber}) has been ${newStatus}.`,
                          type: newStatus === 'Approved' ? 'success' : newStatus === 'Rejected' ? 'alert' : 'info',
                          userId: selectedOrder.senderId,
                          to: selectedOrder.senderName, 
                          route: '/orders'
                      });
                  }
                  setModalVisible(false);
              }
          }
      ]);
  };

  const userRole = user?.role?.toLowerCase() || '';
  const canApprove = ['admin', 'manager', 'accountant', 'account'].includes(userRole);
  const isStore = ['store', 'store keeper'].includes(userRole);

  const openDetails = (item: any) => {
      setSelectedOrder(item);
      setModalVisible(true);
  };

  const renderItem = ({ item }: any) => {
      const isApproved = item.status === 'Approved' || item.status === 'Completed' || item.status === 'Dispatched';
      const isRejected = item.status === 'Rejected';

      return (
        <TouchableOpacity style={[styles.card, isApproved && styles.cardApproved, isRejected && styles.cardRejected]} onPress={() => openDetails(item)}>
            <View style={styles.cardHeader}>
                <View style={{flex:1}}>
                    <Text style={styles.hospitalName} numberOfLines={1}>{item.hospitalName}</Text>
                    {item.city ? (
                <Text style={{fontSize: 11, color: 'gray', marginBottom: 2}}>
                    <Ionicons name="location-outline" size={11} color="gray" /> {item.city}
                </Text>
            ) : null}
                    <Text style={styles.poNumber}>PO: {item.poNumber}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isApproved ? '#e8f5e9' : (isRejected ? '#ffebee' : '#fff3e0') }]}>
                    <Text style={{color: isApproved ? 'green' : (isRejected ? 'red' : 'orange'), fontWeight:'bold', fontSize:10}}>
                        {item.status}
                    </Text>
                </View>
            </View>

            <Text style={styles.productText} numberOfLines={1}>📦 {item.productDetails}</Text>

            <View style={styles.row}>
                <Text style={styles.amount}>₹ {item.amount}</Text>
                <Text style={styles.date}>{item.date}</Text>
            </View>

            <View style={styles.divider} />

            {/* 👇 IMPROVED FOOTER FOR ADMIN ENTRY 👇 */}
            <View style={styles.footer}>
                <View style={{flex: 1}}>
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Ionicons name="person" size={14} color="#3b5998" />
                        <Text style={{color:'#3b5998', fontWeight:'bold', fontSize:12, marginLeft:5}}>
                             {item.senderName || item.userName || 'Unknown'}
                        </Text>
                    </View>

                    {item.bookedBy && item.bookedBy !== item.senderName && (
                        <Text style={{fontSize: 10, color: 'gray', marginLeft: 20}}>
                            (Entry by: {item.bookedBy})
                        </Text>
                    )}
                </View>

                {item.poFileUri ? (
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Ionicons name="attach" size={16} color="gray" />
                        <Text style={{fontSize:10, color:'gray'}}>File</Text>
                    </View>
                ) : null}
            </View>
        </TouchableOpacity>
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Order Bookings</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_order' as any)}>
            <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <View style={{backgroundColor:'white', paddingBottom:10, marginBottom:5}}>
          
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'Year', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {isAdmin && (
            <View style={{paddingHorizontal: 15, marginBottom: 10}}>
               <TouchableOpacity style={styles.employeeFilterBtn} onPress={() => setShowEmployeePicker(true)}>
                    <Ionicons name="people" size={18} color="#2e7d32" />
                    <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                        {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:'auto'}}/>
               </TouchableOpacity>
            </View>
          )}

          {viewMode !== 'All' && (
              <View style={styles.dateNav}>
                  <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                  <Text style={styles.monthText}>{getHeaderDate()}</Text>
                  <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
              </View>
          )}

          <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color="gray" />
              <TextInput style={styles.searchInput} placeholder="Search Hospital, PO, ID..." value={searchText} onChangeText={setSearchText} />
              {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="gray" /></TouchableOpacity>
              )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingLeft:15, paddingVertical:10}}>
              {['All', 'Pending', 'Approved', 'Rejected', 'Dispatched'].map(s => (
                  <TouchableOpacity key={s} style={[styles.filterChip, statusFilter === s && styles.activeChip]} onPress={() => setStatusFilter(s)}>
                      <Text style={[styles.chipText, statusFilter === s && {color:'white'}]}>{s}</Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>
          <Text style={{textAlign:'right', fontSize:12, color:'gray', paddingRight:15}}>Total: <Text style={{fontWeight:'bold', color:'#3b5998'}}>{displayList.length}</Text></Text>
      </View>

      <FlatList 
          data={displayList}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{padding: 5, paddingBottom: 50}}
          ListEmptyComponent={<Text style={{textAlign:'center', marginTop:50, color:'gray'}}>No Orders Found</Text>}
      />

      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}>
                      <Text style={styles.modalTitle}>Order Details</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={30} color="#d32f2f" /></TouchableOpacity>
                  </View>

                  {selectedOrder && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          <View style={styles.section}>
                              <Text style={styles.hospitalNameLarge}>{selectedOrder.hospitalName}</Text>
                              <Text style={{color:'gray', fontSize:12}}>{selectedOrder.address}, {selectedOrder.city}</Text>
                              <View style={styles.idRow}>
                                  <View style={styles.badge}><Text style={styles.badgeText}>ID: {selectedOrder.orderId || 'N/A'}</Text></View>
                                  <View style={[styles.badge, {backgroundColor:'#e3f2fd'}]}><Text style={[styles.badgeText, {color:'#1565c0'}]}>PO: {selectedOrder.poNumber}</Text></View>
                              </View>
                          </View>

                          <View style={styles.divider}/>

                          {/* 🔥 NEW SECTION: SALES INFO */}
                          <Text style={styles.sectionHeader}>💼 Sales Team</Text>
                          <DetailRow label="Sales Person" value={selectedOrder.senderName} highlight />
                          {selectedOrder.bookedBy && selectedOrder.bookedBy !== selectedOrder.senderName && (
                              <DetailRow label="Entry By" value={selectedOrder.bookedBy} />
                          )}

                          <Text style={styles.sectionHeader}>👤 Client Contact</Text>
                          <DetailRow label="Name" value={selectedOrder.contactPerson} />
                          <DetailRow label="Mobile" value={selectedOrder.mobile} />
                          <DetailRow label="Email" value={selectedOrder.email} />

                          <Text style={styles.sectionHeader}>📦 Order Info</Text>
                          <DetailRow label="Amount" value={`₹ ${selectedOrder.amount}`} highlight />
                          <DetailRow label="Date" value={selectedOrder.date} />
                          <View style={styles.textBox}>
                              <Text style={styles.textLabel}>Products:</Text>
                              <Text style={styles.textValue}>{selectedOrder.productDetails}</Text>
                          </View>
                          <DetailRow label="Payment" value={selectedOrder.paymentTerms} />
                          <DetailRow label="Delivery" value={selectedOrder.deliveryTerms} />

                          {selectedOrder.notes ? (
                              <View style={styles.textBox}>
                                  <Text style={styles.textLabel}>Notes:</Text>
                                  <Text style={styles.textValue}>{selectedOrder.notes}</Text>
                              </View>
                          ) : null}

                          {selectedOrder.poFileUri && (
                              <TouchableOpacity style={styles.fileBox} onPress={() => handleOpenFile(selectedOrder.poFileUri)}>
                                  <Ionicons name="document-attach" size={20} color="#3b5998" />
                                  <Text style={{marginLeft:10, flex:1, color:'#3b5998', textDecorationLine:'underline'}}>
                                      {selectedOrder.poFileName || 'Download Attachment'}
                                  </Text>
                                  <Ionicons name="open-outline" size={16} color="green" />
                              </TouchableOpacity>
                          )}
                          
                          <View style={styles.divider}/>
                          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                              <Text style={{color:'gray'}}>Status:</Text>
                              <Text style={{fontWeight:'bold', color:'#333', fontSize:16}}>{selectedOrder.status}</Text>
                          </View>

                          {canApprove && selectedOrder.status === 'Pending' && (
                              <View style={styles.actionRow}>
                                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#d32f2f'}]} onPress={() => handleUpdateStatus('Rejected')}>
                                      <Text style={styles.btnText}>Reject</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#2e7d32'}]} onPress={() => handleUpdateStatus('Approved')}>
                                      <Text style={styles.btnText}>Approve</Text>
                                  </TouchableOpacity>
                              </View>
                          )}
                          
                          {isStore && selectedOrder.status === 'Approved' && (
                              <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#1976d2', marginTop:15}]} onPress={() => handleUpdateStatus('Dispatched')}>
                                  <Text style={styles.btnText}>Mark as Dispatched</Text>
                              </TouchableOpacity>
                          )}
                      </ScrollView>
                  )}
              </View>
          </View>
      </Modal>

      <Modal visible={showEmployeePicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Employee View</Text>
                  <FlatList 
                    data={employees} 
                    keyExtractor={item => item.id} 
                    renderItem={({item}) => (
                      <TouchableOpacity 
                        style={styles.pickerItem} 
                        onPress={() => { 
                            setSelectedEmployee(item.id); 
                            setSelectedEmployeeName(item.name);
                            setShowEmployeePicker(false); 
                        }}
                      >
                          <View style={{flexDirection:'row', alignItems:'center'}}>
                             <Ionicons name="person-circle" size={24} color="#555" style={{marginRight:10}}/>
                             <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                          </View>
                          {selectedEmployee === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                      </TouchableOpacity>
                  )} />
              </View>
          </TouchableOpacity>
      </Modal>

    </View>
  );
}

const DetailRow = ({label, value, highlight}: any) => (
    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:8, borderBottomWidth:1, borderColor:'#f0f0f0', paddingBottom:5}}>
        <Text style={{color:'gray', fontSize:13, width:'35%'}}>{label}</Text>
        <Text style={{color:'#333', fontWeight: highlight?'bold':'500', fontSize:14, width:'65%', textAlign:'right'}}>{value || '-'}</Text>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingTop: 50, backgroundColor: 'white', elevation: 4, alignItems:'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  addBtn: { backgroundColor:'#3b5998', padding:8, borderRadius:20 },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 10, borderRadius: 8, padding: 2, marginBottom: 5 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#2e7d32' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 6, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', marginHorizontal: 15, paddingHorizontal: 10, borderRadius: 8, height:36, alignItems:'center' },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  filterChip: { paddingHorizontal:15, paddingVertical:6, backgroundColor:'#eee', borderRadius:20, marginRight:10 },
  activeChip: { backgroundColor:'#3b5998' },
  chipText: { fontSize:12, color:'#555' },
  
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 2, borderLeftWidth:4, borderLeftColor:'#ff9800' },
  cardApproved: { borderLeftColor: '#4caf50' },
  cardRejected: { borderLeftColor: '#f44336' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  poNumber: { fontSize: 12, color: 'gray' },
  statusBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:4 },
  productText: { fontSize: 13, color: '#555', marginTop: 8, fontStyle: 'italic' },
  row: { flexDirection:'row', justifyContent:'space-between', marginTop:10 },
  amount: { fontWeight:'bold', fontSize:16, color:'#333' },
  date: { color:'gray', fontSize:12 },
  divider: { height:1, backgroundColor:'#eee', marginVertical:10 },
  footer: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  senderName: { color:'gray', fontSize:12 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight:'90%', width:'100%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
  hospitalNameLarge: { fontSize:18, fontWeight:'bold', color:'#333' },
  sectionHeader: { fontSize:14, fontWeight:'bold', color:'#3b5998', marginTop:15, marginBottom:10, backgroundColor:'#e3f2fd', padding:5, borderRadius:5 },
  section: { marginBottom: 10 },
  idRow: { flexDirection:'row', gap:10, marginTop:5 },
  badge: { backgroundColor:'#eee', paddingHorizontal:8, paddingVertical:2, borderRadius:4 },
  badgeText: { fontSize:11, fontWeight:'bold', color:'#555' },
  textBox: { backgroundColor:'#f9f9f9', padding:10, borderRadius:8, marginBottom:10 },
  textLabel: { fontSize:11, color:'gray', marginBottom:2 },
  textValue: { fontSize:13, color:'#333' },
  
  fileBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#e0f7fa', padding:12, borderRadius:8, marginTop:5, borderWidth:1, borderColor:'#26c6da' },
  
  actionRow: { flexDirection:'row', justifyContent:'space-between', marginTop:20 },
  actionBtn: { flex:0.48, padding:12, borderRadius:8, alignItems:'center', justifyContent:'center' },
  btnText: { color:'white', fontWeight:'bold' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});