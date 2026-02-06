import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// Firebase imports update kiye
import { collection, getDocs, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
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
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

export default function DemoScreen() {
  const router = useRouter();
  
  // 🔥 GET DATA (Demo, Sales, Org, User)
  const { demoList = [], salesVisitList = [], orgList = [], user } = useData(); 

  // --- STATES ---
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year' | 'All'>('Year');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [orgDetails, setOrgDetails] = useState<any>(null); // For Popup

  // --- NEW: EMPLOYEE FILTER STATES ---
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('All'); 
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const isAdmin = ['Admin', 'Manager', 'Accountant' , 'Account', 'Hr'].includes(user?.role || '');

  // --- FETCH EMPLOYEES (ADMIN ONLY) ---
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

  // --- HELPER: DATE PARSER ---
  const parseDate = (dateStr: string) => {
      if (!dateStr) return new Date(0);
      if (dateStr.includes('T')) return new Date(dateStr);
      if (dateStr.includes('-')) return new Date(dateStr);
      const parts = dateStr.split('/');
      if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      return new Date(0);
  };

  // --- DATE NAVIGATION ---
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

  // --- 🔥 SMART MERGE LOGIC ---
  const getAllDemos = () => {
      // 1. From Sales Visits (Partial Data)
      const salesDemos = salesVisitList ? salesVisitList.filter((item: any) => 
          (item.discussion && item.discussion.toLowerCase().includes('demo')) || 
          (item.outcome && item.outcome.toLowerCase().includes('demo'))
      ).map((item: any) => ({
          id: item.id, 
          hospital: item.hospital,
          date: item.date,
          product: 'See Details', 
          result: item.outcome || 'N/A',
          status: 'Completed',    
          isFromSales: true,      
          fullData: item,
          senderId: item.senderId,
          senderName: item.senderName || 'Unknown'
      })) : [];

      // 2. From Direct Demos (Full Data)
      const actualDemos = demoList || [];
      
      // 3. Combine
      let combined = [...actualDemos, ...salesDemos].map(item => {
    // OrgList se city dhundo agar item me nahi hai
    const org = orgList.find((o: any) => (o.orgName === item.hospital) || (o.name === item.hospital));
    return { ...item, city: item.city || (org ? org.city : '') };
});

      // 4. SECURITY FILTER (Already handled in getFilteredData but good for safety)
      if (!isAdmin) {
          combined = combined.filter((item: any) => item.senderId === user?.uid || item.userName === user?.name);
      }

      return combined;
  };

  const allData = getAllDemos(); 

  // --- FILTER LOGIC (Date + Search + Employee) ---
  const getFilteredData = () => {
    let data = allData;

    // 0. Employee Filter (Only for Admin/Manager)
    if (isAdmin && selectedEmployee !== 'All') {
        data = data.filter((item: any) => 
          (item.senderId === selectedEmployee) || 
          (item.userId === selectedEmployee) ||
          (item.senderName === selectedEmployeeName)
        );
    }

    // 1. SUPER SEARCH
    if (searchText) {
        const lowerTerm = searchText.toLowerCase();
        data = data.filter((item: any) => {
           const fullString = `
               ${item.hospital || ''} 
               ${item.product || ''} 
               ${item.result || ''} 
               ${item.senderName || ''}
               ${item.date || ''}
               ${item.id || ''}
           `.toLowerCase();
           return fullString.includes(lowerTerm);
        });
    }

    // 2. DATE FILTER
    if (viewMode !== 'All') {
        const targetYear = currentDate.getFullYear();
        const targetMonth = currentDate.getMonth();
        const targetDay = currentDate.getDate();

        data = data.filter((item: any) => {
            if(!item.date) return false;
            const itemDate = parseDate(item.date);
            
            if (viewMode === 'Year') return itemDate.getFullYear() === targetYear;
            if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
            if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
            return true;
        });
    }

    // 3. Sort by Date (Newest First)
    return data.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  };

  const displayList = getFilteredData();

  // --- OPEN DETAILS ---
  const openDetails = (item: any) => {
      setSelectedItem(item);
      
      // 🔥 Fetch Organization Details from Master List
      const foundOrg = orgList.find((o: any) => (o.orgName === item.hospital) || (o.name === item.hospital));
      setOrgDetails(foundOrg || null);

      setModalVisible(true);
  };

  const handleCall = (num: string) => {
      if(num) Linking.openURL(`tel:${num}`);
  };

  // --- RENDER CARD ---
  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.row}>
            {/* 🔥 REMOVED THE #ID TEXT, REPLACED WITH DATE */}
            <Text style={{color:'gray', fontSize:12, fontWeight:'bold'}}>{item.date}</Text>
            
            <View style={item.isFromSales ? styles.badgeOrange : styles.badgeBlue}>
                <Text style={item.isFromSales ? styles.textOrange : styles.textBlue}>
                    {item.isFromSales ? 'From Sales' : 'Direct Demo'}
                </Text>
            </View>
        </View>
        
        <Text style={styles.title}>{item.hospital || 'Unknown Hospital'}</Text>
        {/* 🔥 City Code Start */}
{item.city ? (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom: 5}}>
        <Ionicons name="location-outline" size={12} color="gray" />
        <Text style={{fontSize: 11, color: 'gray', marginLeft: 2}}>
            {item.city}
        </Text>
    </View>
) : null}
{/* 🔥 City Code End */}
        
        <View style={styles.row}>
            {/* 🔥 ADMIN VIEW: Show Employee Name in List */}
            {isAdmin && (
                 <View style={{flexDirection:'row', alignItems:'center'}}>
                     <Ionicons name="person" size={10} color="#3b5998" />
                     <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginLeft:2}}>
                         {item.senderName ? item.senderName.split(' ')[0] : 'Unknown'}
                     </Text>
                 </View>
            )}
        </View>
        
        <View style={styles.divider} />
        
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
             {/* 🔥 SEPARATED MODEL FROM PRODUCT IN LIST */}
             <View style={{flex: 1}}>
                 <Text style={{fontSize:13, color:'#3b5998', fontWeight:'bold'}}>
                     {item.product}
                 </Text>
                 {item.model ? (
                     <Text style={{fontSize:11, color:'#555'}}>Model: {item.model}</Text>
                 ) : null}
             </View>
             
             <Text style={styles.resultText} numberOfLines={1}>Result: {item.result || 'Pending'}</Text>
        </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Demonstration Note</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/add_demo')}>
            <Ionicons name="add-circle" size={32} color="#3b5998" />
        </TouchableOpacity>
      </View>

      {/* 🔥 NEW FILTER UI STARTS */}
      <View style={{backgroundColor:'white', paddingBottom:10}}>
          
          {/* TABS */}
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'Year', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {/* --- ADMIN STAFF DROPDOWN --- */}
          {isAdmin && (
            <View style={{paddingHorizontal: 15, marginBottom: 10}}>
               <TouchableOpacity 
                    style={styles.employeeFilterBtn} 
                    onPress={() => setShowEmployeePicker(true)}
               >
                    <Ionicons name="people" size={18} color="#2e7d32" />
                    <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                        {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:'auto'}}/>
               </TouchableOpacity>
            </View>
          )}

          {/* DATE NAVIGATOR */}
          {viewMode !== 'All' && (
              <View style={styles.dateNav}>
                  <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                  <Text style={styles.monthText}>{getHeaderDate()}</Text>
                  <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
              </View>
          )}

          {/* SUPER SEARCH BAR */}
          <View style={{paddingHorizontal:15}}>
              <View style={styles.searchBar}>
                  <Ionicons name="search" size={20} color="gray" />
                  <TextInput 
                      style={styles.searchInput}
                      placeholder={isAdmin ? "Search Hospital, Product, Employee..." : "Search Hospital, Product..."}
                      value={searchText}
                      onChangeText={setSearchText}
                  />
                  {searchText.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchText('')}>
                          <Ionicons name="close-circle" size={20} color="gray" />
                      </TouchableOpacity>
                  )}
              </View>
              <Text style={{textAlign:'right', fontSize:12, color:'gray', marginTop:5}}>
                  Total: <Text style={{fontWeight:'bold', color:'green'}}>{displayList.length}</Text> Records
              </Text>
          </View>
      </View>
      {/* 🔥 FILTER UI ENDS */}

      {/* LIST */}
      <FlatList 
        data={displayList}
        keyExtractor={(item, index) => (item.id || index.toString()) + index} 
        renderItem={renderItem}
        contentContainerStyle={{padding: 15}}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                <Ionicons name="flask-outline" size={60} color="#ccc" />
                <Text style={{color:'gray', marginTop:10}}>No Demo Records Found</Text>
            </View>
        }
      />

      {/* --- 🔥 FULL DETAILS POPUP (KEPT ORIGINAL) --- */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  
                  {/* Modal Header */}
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                      <Text style={styles.modalTitle}>Demo Report</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}>
                          <Ionicons name="close-circle" size={30} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  {selectedItem && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          
                          {/* 1. Basic Info */}
                          <View style={styles.section}>
                              <Text style={styles.hospitalHeader}>{selectedItem.hospital}</Text>
                              <Text style={{color:'gray', fontSize:12, marginBottom:5}}>{selectedItem.date}</Text>
                              
                              {/* Fetched Org Details */}
                              {orgDetails && (
                                  <View style={{flexDirection:'row', alignItems:'center', marginTop:5}}>
                                      <Ionicons name="location" size={14} color="#555" />
                                      <Text style={{fontSize:12, color:'#555', marginLeft:5}}>
                                          {orgDetails.city}, {orgDetails.state}
                                      </Text>
                                  </View>
                              )}
                          </View>

                          {/* 2. Contact Person Details (From Add Demo) */}
                          <View style={styles.section}>
                              <Text style={styles.sectionTitle}>Contact Person</Text>
                              <DetailRow label="Name" value={selectedItem.contactPerson || 'N/A'} icon="person" />
                              <TouchableOpacity onPress={() => handleCall(selectedItem.contactNumber)}>
                                  <DetailRow label="Mobile" value={selectedItem.contactNumber} icon="call" highlight />
                              </TouchableOpacity>
                              <DetailRow label="Email" value={selectedItem.email} icon="mail" />
                              <DetailRow label="Dept" value={selectedItem.department} icon="medkit" />
                          </View>

                          {/* 3. Product Details */}
                          <View style={styles.section}>
                              <Text style={styles.sectionTitle}>Product Details</Text>
                              <DetailRow label="Product" value={selectedItem.product} icon="cube" />
                              {/* 🔥 SHOW MODEL SEPARATELY IN POPUP */}
                              <DetailRow label="Model" value={selectedItem.model} icon="hardware-chip" />
                              <DetailRow label="Serial No" value={selectedItem.serialNo} icon="barcode" />
                              <DetailRow label="Duration" value={selectedItem.duration ? `${selectedItem.duration} Days` : 'N/A'} icon="time" />
                          </View>

                          {/* 4. Feedback & Notes */}
                          <View style={styles.section}>
                              <Text style={styles.sectionTitle}>Feedback & Notes</Text>
                              <View style={styles.noteBox}>
                                  <Text style={styles.noteLabel}>Outcome / Feedback:</Text>
                                  <Text style={styles.noteText}>{selectedItem.result || selectedItem.fullData?.outcome || 'No feedback yet.'}</Text>
                              </View>

                              {selectedItem.notes ? (
                                  <View style={[styles.noteBox, {marginTop:10, backgroundColor:'#f3e5f5', borderColor:'#e1bee7'}]}>
                                      <Text style={[styles.noteLabel, {color:'#7b1fa2'}]}>Private Notes:</Text>
                                      <Text style={styles.noteText}>{selectedItem.notes}</Text>
                                  </View>
                              ) : null}
                          </View>

                          {/* 5. Admin Info */}
                          <View style={[styles.section, {borderBottomWidth:0}]}>
                              <DetailRow label="Entry By" value={selectedItem.senderName} icon="person-circle" />
                          </View>

                          <View style={{height:20}} />
                      </ScrollView>
                  )}
              </View>
          </View>
      </Modal>

      {/* EMPLOYEE PICKER MODAL */}
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

// Helper Components
const DetailRow = ({label, value, icon, highlight}: any) => (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom:8}}>
        <View style={{width:30}}><Ionicons name={icon} size={18} color="#3b5998" /></View>
        <Text style={{fontSize:12, color:'gray', width:70}}>{label}</Text>
        <Text style={{fontSize:14, fontWeight: highlight ? 'bold' : '500', color: highlight ? '#2e7d32' : '#333', flex:1}}>
            {value || '-'}
        </Text>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 0 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  
  // 🔥 New Filter UI
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 15, borderRadius: 8, padding: 3, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#2e7d32' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 4, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 36 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  // Card Styles
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, alignItems:'center' },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 5, color:'#333' },
  boldText: { fontWeight: 'bold', color:'#3b5998', fontSize:12 },
  resultText: { fontSize:12, color:'#555', maxWidth:'60%' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  
  badgeBlue: { backgroundColor: '#e3f2fd', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  textBlue: { color: '#1565c0', fontSize: 10, fontWeight:'bold' },
  badgeOrange: { backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  textOrange: { color: '#e65100', fontSize: 10, fontWeight:'bold' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width:'100%', backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color:'#3b5998' },
  
  // Modal Sections
  section: { borderBottomWidth:1, borderBottomColor:'#eee', paddingBottom:15, marginBottom:15 },
  hospitalHeader: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 10, textDecorationLine:'underline' },
  
  noteBox: { backgroundColor: '#fffde7', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#fff9c4' },
  noteLabel: { fontSize: 12, fontWeight: 'bold', color: '#f57f17', marginBottom: 5 },
  noteText: { fontSize: 13, color: '#333' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});