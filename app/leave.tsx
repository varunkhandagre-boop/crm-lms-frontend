import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
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
  const { leaveList, updateLeaveStatus, user, addNotification } = useData();

  // STATES
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year' | 'All'>('All'); // Default All rakha taaki data dikhe
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchText, setSearchText] = useState('');
  
  // STATS
  const [stats, setStats] = useState({ total: 0, used: 0, balance: 0 });

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // --- EMPLOYEE FILTER ---
  // 🔥 NOTE: Hum 'Name' use karenge matching ke liye taaki ID mismatch ka issue na ho
  const [employees, setEmployees] = useState<{name: string, yearlyLeaves?: number}[]>([]);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All'); 
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const canManage = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr'].includes(user?.role || '');

  // ==========================================
  // 0. FETCH EMPLOYEES (ADMIN ONLY)
  // ==========================================
  useEffect(() => {
    if (canManage) {
      const fetchEmployees = async () => {
        try {
          const q = query(collection(db, "users"));
          const querySnapshot = await getDocs(q);
          const usersData = querySnapshot.docs.map(doc => ({
            name: doc.data().name || 'Unknown User', // 🔥 Name is key
            yearlyLeaves: doc.data().yearlyLeaves || 18 
          }));
          // Remove duplicates just in case
          const uniqueUsers = Array.from(new Set(usersData.map(a => a.name)))
            .map(name => {
              return usersData.find(a => a.name === name)
            });

          setEmployees([{ name: 'All', yearlyLeaves: 0 }, ...uniqueUsers as any]);
        } catch (error) {}
      };
      fetchEmployees();
    }
  }, [user]);

  // ==========================================
  // 🔥 1. DYNAMIC BALANCE CALCULATION (By Name)
  // ==========================================
  useEffect(() => {
      if (!leaveList) return;

      let targetName = user?.name;
      let targetTotal = user?.yearlyLeaves || 18;

      // Agar Admin ne dropdown se kisi ko select kiya hai
      if (canManage && selectedEmployeeName !== 'All') {
          targetName = selectedEmployeeName;
          const emp = employees.find(e => e.name === selectedEmployeeName);
          if (emp) targetTotal = emp.yearlyLeaves || 18;
      }

      // Calculate Used Leaves using NAME matching
      const used = leaveList
          .filter((l: any) => l.senderName === targetName && l.status === 'Approved')
          .reduce((acc: number, curr: any) => acc + (parseFloat(curr.days) || 0), 0);

      setStats({
          total: targetTotal,
          used: used,
          balance: targetTotal - used
      });

  }, [leaveList, user, selectedEmployeeName, employees]);

  // ==========================================
  // 2. ROBUST DATE PARSER
  // ==========================================
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
      else if (viewMode === 'Year') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  const getHeaderDate = () => {
      if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (viewMode === 'Year') return currentDate.getFullYear().toString();
      return "All Time";
  };

  // --- 🔥 FILTER LOGIC (By Name) ---
  const getFilteredData = () => {
    let filtered = Array.isArray(leaveList) ? [...leaveList] : [];

    // 1. SECURITY FILTER
    if (canManage) {
        // Admin: Filter by Name
        if(selectedEmployeeName !== 'All') {
            filtered = filtered.filter((item: any) => item.senderName === selectedEmployeeName);
        }
    } else {
        // User: Only own data (By ID is safe here, but can use name too)
        if(user?.uid) {
            filtered = filtered.filter((item: any) => item.senderId === user.uid);
        }
    }

    // 2. DATE FILTER
    if (viewMode !== 'All') {
        const targetYear = currentDate.getFullYear();
        const targetMonth = currentDate.getMonth();
        const targetDay = currentDate.getDate();

        filtered = filtered.filter(item => {
            const dStr = item.fromDate || item.createdAt;
            if(!dStr) return false;
            
            const itemDate = parseDate(dStr);
            
            if (viewMode === 'Year') return itemDate.getFullYear() === targetYear;
            if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
            if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
            return true;
        });
    }

    // 3. SEARCH
    if (searchText) {
        const text = searchText.toLowerCase();
        filtered = filtered.filter((item: any) => {
            const row = `${item.fromDate} ${item.type} ${item.status} ${item.senderName} ${item.reason}`.toLowerCase();
            return row.includes(text);
        });
    }

    filtered.sort((a: any, b: any) => parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime());
    return filtered;
  };

  const displayList = getFilteredData();
  const pendingCount = displayList.filter(i => i.status === 'Pending').length;

  // --- ACTIONS ---
  const handleStatusChange = async (status: string) => {
      if(updateLeaveStatus) {
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
      }
  };

  const openDetails = (item: any) => {
      setSelectedItem(item);
      setModalVisible(true);
  };

  const renderItem = ({ item }: any) => {
    const statusInfo = getStatusColor(item.status);
    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
          <View style={styles.cardHeader}>
              <Text style={styles.date}>{item.fromDate} ({item.days} Day)</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                  <Text style={[styles.statusText, {color: statusInfo.text}]}>{item.status}</Text>
              </View>
          </View>
          <Text style={styles.type}>{item.type}</Text>
          <Text style={styles.reason} numberOfLines={1}>{item.reason}</Text>
          {canManage && <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginTop:5}}>👤 {item.senderName}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Leave Applications</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_leave' as any)}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>Apply</Text>
        </TouchableOpacity>
      </View>

      {/* 🔥 BALANCE CARD (Dynamic based on Selection) */}
      {(selectedEmployeeName !== 'All' || !canManage) && (
          <View style={styles.balanceContainer}>
              <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Total</Text>
                  <Text style={styles.statValue}>{stats.total}</Text>
              </View>
              <View style={styles.vDivider}/>
              <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Used</Text>
                  <Text style={[styles.statValue, {color:'#e67e22'}]}>{stats.used}</Text>
              </View>
              <View style={styles.vDivider}/>
              <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Balance</Text>
                  <Text style={[styles.statValue, {color:'#27ae60'}]}>{stats.balance}</Text>
              </View>
          </View>
      )}
      {pendingCount > 0 && (
    <View style={{backgroundColor:'#ffebee', padding:10, marginHorizontal:15, borderRadius:8, marginBottom:10, flexDirection:'row', alignItems:'center', marginTop: 10}}>
        <Ionicons name="alert-circle" size={20} color="#d32f2f" />
        <Text style={{color:'#d32f2f', fontWeight:'bold', marginLeft:10}}>
            {pendingCount} Pending Requests Needs Action!
        </Text>
    </View>
)}

      <View style={{backgroundColor:'white', paddingBottom:10}}>
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'Year', 'All'].map((m) => (
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
                  <Ionicons name="search" size={20} color="gray" />
                  <TextInput style={styles.searchInput} placeholder="Search..." value={searchText} onChangeText={setSearchText} />
                  {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="gray" /></TouchableOpacity>}
              </View>
              <Text style={{textAlign:'right', fontSize:12, color:'gray', marginTop:5}}>
                  Found: <Text style={{fontWeight:'bold', color:'green'}}>{displayList.length}</Text>
              </Text>
          </View>
      </View>

      <FlatList 
        data={displayList} 
        keyExtractor={item => item.id} 
        renderItem={renderItem}
        contentContainerStyle={{padding: 15}}
        ListEmptyComponent={<Text style={{textAlign:'center', marginTop:50, color:'gray'}}>No leave records found.</Text>}
      />

      {/* MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={styles.modalTitle}>Leave Details</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={28} color="#d32f2f" /></TouchableOpacity>
                  </View>
                  {selectedItem && (
                      <ScrollView>
                          {canManage && <Text style={{color:'#1565c0', fontWeight:'bold', marginBottom:10}}>👤 {selectedItem.senderName}</Text>}
                          <DetailRow label="From" value={selectedItem.fromDate} />
                          <DetailRow label="To" value={selectedItem.toDate} />
                          <DetailRow label="Days" value={selectedItem.days} highlight />
                          <DetailRow label="Type" value={selectedItem.type} />
                          <DetailRow label="Status" value={selectedItem.status} color={getStatusColor(selectedItem.status).text} />
                          <View style={styles.divider}/>
                          <Text style={{fontSize:12, color:'gray'}}>Reason:</Text>
                          <Text style={{fontSize:14, color:'#333', marginTop:2}}>{selectedItem.reason}</Text>
                          {canManage && selectedItem.status === 'Pending' && (
                              <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:20}}>
                                  <TouchableOpacity style={styles.rejectBtn} onPress={() => handleStatusChange('Rejected')}><Text style={{color:'white', fontWeight:'bold'}}>Reject</Text></TouchableOpacity>
                                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleStatusChange('Approved')}><Text style={{color:'white', fontWeight:'bold'}}>Approve</Text></TouchableOpacity>
                              </View>
                          )}
                      </ScrollView>
                  )}
              </View>
          </View>
      </Modal>

      {/* NAME PICKER MODAL */}
      <Modal visible={showEmployeePicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Employee</Text>
                  <FlatList 
                    data={employees} 
                    keyExtractor={(item, index) => index.toString()} 
                    renderItem={({item}) => (
                      <TouchableOpacity 
                        style={styles.pickerItem} 
                        onPress={() => { 
                            setSelectedEmployeeName(item.name);
                            setShowEmployeePicker(false); 
                        }}
                      >
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

const getStatusColor = (status: string) => {
    if(status === 'Approved') return { bg: '#e8f5e9', text: 'green' };
    if(status === 'Rejected') return { bg: '#ffebee', text: 'red' };
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
  balanceContainer: { flexDirection: 'row', backgroundColor: 'white', margin: 15, borderRadius: 10, padding: 15, elevation: 3, justifyContent:'space-around', alignItems:'center' },
  statBox: { alignItems: 'center' },
  statLabel: { color: 'gray', fontSize: 12, textTransform:'uppercase', marginBottom:5 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#333' },
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
  statusText: { fontSize:11, fontWeight:'bold' },
  type: { fontWeight:'bold', fontSize:16, color:'#333', marginBottom:5 },
  reason: { color:'gray', fontSize:13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998' },
  divider: { height:1, backgroundColor:'#eee', marginVertical:10 },
  approveBtn: { backgroundColor:'green', padding:12, borderRadius:8, flex:1, alignItems:'center', marginLeft:5 },
  rejectBtn: { backgroundColor:'#d32f2f', padding:12, borderRadius:8, flex:1, alignItems:'center', marginRight:5 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});