import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform } from 'react-native';
// Firebase Imports
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

export default function SalesReportScreen() {
  const router = useRouter();
  const { salesVisitList = [], user, orgList = [], refreshData } = useData();

  // STATES
  const [statusFilter, setStatusFilter] = useState<'FollowUp' | 'Closed' | 'All'>('FollowUp');
  const [searchText, setSearchText] = useState('');
  
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year' | 'All'>('Year');
  const [currentDate, setCurrentDate] = useState(new Date());

  // EMPLOYEE FILTER
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('All'); 
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  // UPDATE MODAL
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  const [editOutcome, setEditOutcome] = useState(''); 
  const [editNote, setEditNote] = useState('');
  const [editNextDate, setEditNextDate] = useState(new Date());
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const visitOutcomes = ['Interested', 'Follow Up', 'Demo Planned', 'Order Expected', 'Not Interested', 'Order Closed', 'Lost'];

  const userRole = user?.role ? user.role.toLowerCase() : 'unknown';
  const isAdmin = userRole === 'admin' || userRole === 'manager' || userRole === 'accountant' || userRole === 'hr' || userRole === 'store';

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
        } catch (error) {}
      };
      fetchEmployees();
    }
  }, [user]);

  const getCity = (item: any) => {
      if (item.city) return item.city;
      const orgData = orgList.find((o: any) => o.orgName === item.hospital);
      return orgData?.city || '';
  };

  const parseDate = (dateStr: any) => {
      if (!dateStr) return 0;
      if (typeof dateStr === 'number') return dateStr;
      if (dateStr instanceof Date) return dateStr.getTime();
      if (typeof dateStr === 'string') {
          if (dateStr.includes('T')) return new Date(dateStr).getTime();
          if (dateStr.includes('-')) return new Date(dateStr).getTime();
          if (dateStr.includes('/')) {
              const parts = dateStr.split('/');
              if (parts.length === 3 && parts[2].length === 4) {
                 return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
              }
          }
      }
      return new Date(dateStr).getTime();
  };

  const formatDateDisplay = (dateStr: any) => {
      if (!dateStr) return 'N/A';
      const ts = parseDate(dateStr);
      return ts === 0 ? 'N/A' : new Date(ts).toLocaleDateString('en-GB'); 
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

  const isClosed = (item: any) => {
      const outcome = (item.outcome || '').toLowerCase();
      return outcome.includes('order closed') || outcome.includes('lost') || outcome.includes('not interested');
  };

  // --- FILTER LOGIC ---
  const getData = () => {
      let list = salesVisitList || [];

      // 1. Employee Filter
      if (!isAdmin) {
          list = list.filter((item: any) => item.senderId === user?.uid || item.senderUid === user?.uid);
      } else if (selectedEmployee !== 'All') {
          list = list.filter((item: any) => 
            (item.senderId === selectedEmployee) || 
            (item.senderUid === selectedEmployee) || 
            (item.senderName === selectedEmployeeName)
          );
      }

      // 2. Status Filter
      if (statusFilter === 'FollowUp') list = list.filter((i: any) => !isClosed(i));
      else if (statusFilter === 'Closed') list = list.filter((i: any) => isClosed(i));

      // 3. Search
      if (searchText) {
          const term = searchText.toLowerCase();
          list = list.filter((item: any) => {
              const city = getCity(item).toLowerCase();
              const mainText = `
                ${item.hospital || ''} ${city} 
                ${item.person || ''} ${item.senderName || ''} 
                ${item.outcome || ''} ${item.product || ''}
              `.toLowerCase();
              return mainText.includes(term);
          });
      } 
      // 4. Date Filter
      else if (viewMode !== 'All') {
          const tYear = currentDate.getFullYear();
          const tMonth = currentDate.getMonth();
          const tDay = currentDate.getDate();

          list = list.filter((item: any) => {
              const dateField = item.date || item.createdAt;
              if(!dateField) return false;
              const itemDate = new Date(parseDate(dateField));
              
              if (viewMode === 'Year') return itemDate.getFullYear() === tYear;
              if (viewMode === 'Month') return itemDate.getFullYear() === tYear && itemDate.getMonth() === tMonth;
              if (viewMode === 'Day') return itemDate.getFullYear() === tYear && itemDate.getMonth() === tMonth && itemDate.getDate() === tDay;
              return true;
          });
      }

      return list.sort((a: any, b: any) => {
          const dateA = a.nextFollowUp ? parseDate(a.nextFollowUp) : parseDate(a.date);
          const dateB = b.nextFollowUp ? parseDate(b.nextFollowUp) : parseDate(b.date);
          return dateB - dateA;
      });
  };

  const displayList = getData();
  const counts = {
      total: displayList.length,
      followUp: displayList.filter((i: any) => !isClosed(i)).length,
      closed: displayList.filter((i: any) => isClosed(i)).length
  };

  // --- SHARE REPORT ---
  const shareDailyReport = async () => {
      const now = new Date();
      const localTodayStr = now.toISOString().split('T')[0];

      const todaysVisits = salesVisitList.filter((item: any) => {
          const isDateMatch = item.date === localTodayStr;
          const targetId = selectedEmployee !== 'All' ? selectedEmployee : user?.uid;
          const isUserMatch = item.senderId === targetId || item.senderId === user?.id; 
          return isDateMatch && isUserMatch;
      });

      if (todaysVisits.length === 0) return Alert.alert("No Data", `No visits found for date: ${localTodayStr}`);

      const reportName = selectedEmployee !== 'All' ? selectedEmployeeName : (user?.name || 'Sales Person');
      let message = `📅 *Daily Sales Report (DSR)* \n👤 *${reportName}*\n📆 Date: ${now.toLocaleDateString('en-GB')}\n\n`;

      todaysVisits.forEach((visit: any, index: number) => {
          const note = (visit.discussion || '-').split('\n')[0].substring(0, 30);
          const productLine = visit.product ? `   └ 📦 Item: ${visit.product}\n` : ''; 
          message += `${index + 1}. *${visit.hospital}*\n${productLine}   └ 📊 Status: ${visit.outcome}\n   └ 📝 Note: ${note}...\n\n`;
      });

      message += `------------------\n*Total Visits: ${todaysVisits.length}* 🚀`;
      try { await Share.share({ message }); } catch (error) {}
  };

  // --- UPDATE LOGIC ---
  const openDetails = (item: any) => {
      setSelectedItem(item);
      setEditOutcome(item.outcome || 'Follow Up');
      setEditNote(''); 
      if (item.nextFollowUp) setEditNextDate(new Date(parseDate(item.nextFollowUp)));
      else setEditNextDate(new Date());
      setModalVisible(true);
  };

  const handleUpdate = async () => {
      if (!selectedItem) return;
      setIsUpdating(true);
      try {
          const docRef = doc(db, 'sales_reports', selectedItem.id);
          
          // Date Formatting
          const day = editNextDate.getDate().toString().padStart(2, '0');
          const month = (editNextDate.getMonth() + 1).toString().padStart(2, '0');
          const year = editNextDate.getFullYear();
          const nextDateISO = editNextDate.toISOString().split('T')[0];
          const todayString = new Date().toLocaleDateString('en-GB');
          
          // Note History Update
          const newLog = `📅 ${todayString}: ${editNote || 'Updated'} [${editOutcome}]`;
          const updatedDiscussion = selectedItem.discussion ? `${newLog}\n\n────────────────\n\n${selectedItem.discussion}` : newLog;
          
          // 1. Update Sales Visit Data
          let updateData: any = {
              outcome: editOutcome,
              nextFollowUp: nextDateISO,
              discussion: updatedDiscussion,
              lastUpdated: new Date().toISOString()
          };

          const isPositiveOutcome = ['Interested', 'Demo Planned', 'Order Expected'].includes(editOutcome);
          
          if (isPositiveOutcome) {
              updateData.isLeadConverted = true; 
          }
          await updateDoc(docRef, updateData);
      try {
          const targetUser = user?.role === 'Admin' ? selectedItem.senderId : 'Admin';
          
          await addDoc(collection(db, "notifications"), {
              title: "Visit Updated 📝",
              message: `${selectedItem.hospital} visit updated: ${editOutcome}`,
              to: targetUser, 
              screen: "/sales", 
              read: false,
              createdAt: new Date().toISOString(),
              type: isPositiveOutcome ? "success" : "info"
          });
      } catch (notifError) {
          console.log("Notification Error:", notifError);
      }

          // 2. LEAD LOGIC
          if (isPositiveOutcome) {
              
              let leadStage = 'New';
              let leadType = 'Warm';
              let leadProbability = '25';
              let leadStatus = 'Follow up';

              if (editOutcome === 'Order Expected') {
                  leadStage = 'Negotiation';
                  leadType = 'Hot';
                  leadProbability = '75';
              } else if (editOutcome === 'Demo Planned') {
                  leadStage = 'Technical Review';
                  leadType = 'Warm';
                  leadProbability = '50';
              } else if (editOutcome === 'Interested') {
                  leadStage = 'Introduction';
                  leadType = 'Warm';
                  leadProbability = '25';
              }

              // 🔍 CHECK FOR EXISTING LEAD
              const leadsRef = collection(db, "leads");
              const q = query(leadsRef, where("org", "==", selectedItem.hospital));
              const querySnapshot = await getDocs(q);

              // Active Lead Dhundo
              const existingLead = querySnapshot.docs.find(doc => {
                  const d = doc.data();
                  return d.status !== 'Closed' && d.status !== 'Converted' && d.status !== 'Lost';
              });

              if (existingLead) {
                  // ✅ UPDATE EXISTING LEAD (With Product Merge)
                  const existingData = existingLead.data();
                  const leadDocRef = doc(db, "leads", existingLead.id);

                  // 1. Merge Product Requirements
                  let currentReqs = existingData.requirements || [];
                  let updatedReqs = [...currentReqs];
                  
                  // Sales Visit ka product (selectedItem se milega)
                  const visitProduct = selectedItem.product; 

                  if (visitProduct && !currentReqs.includes(visitProduct)) {
                      updatedReqs.push(visitProduct);
                  }

                  // 2. Update Logic
                  await updateDoc(leadDocRef, {
                      stage: leadStage,
                      status: leadStatus,
                      probability: leadProbability,
                      type: leadType,
                      isHot: leadType === 'Hot' ? true : existingData.isHot,
                      requirements: updatedReqs, // 🔥 Updated Requirements saved
                      nextDate: nextDateISO,
                      lastUpdated: new Date().toISOString(),
                      discussion: `🔄 Updated via DSR Status Change (${editOutcome}).\n${editNote || ''}\n\n` + (existingData.discussion || '')
                  });
                  
                  // 🔔 Notification
                  try {
                      await addDoc(collection(db, "notifications"), {
                          title: "Lead Updated/Merged 🔄",
                          message: `Sales visit updated for ${selectedItem.hospital}. Product/Stage updated.`,
                          to: "Admin",
                          screen: "/leads", 
                          type: "info",
                          createdAt: new Date().toISOString()
                      });
                  } catch(e) {}

                  Alert.alert("Lead Updated 🔄", `Existing Lead moved to '${leadStage}' & Product Merged.`);

              } else {
                  // ✅ CREATE NEW LEAD
                  const newLeadData = {
                      org: selectedItem.hospital,
                      orgName: selectedItem.hospital, // 🔥 ADDED THIS FIX
                      contactPerson: selectedItem.person,
                      mobile: selectedItem.mobile || '',
                      address: selectedItem.address || getCity(selectedItem),
                      city: getCity(selectedItem),
                      product: selectedItem.product, 
                      requirements: selectedItem.product ? [selectedItem.product] : [],
                      status: leadStatus,
                      stage: leadStage,
                      probability: leadProbability,
                      isHot: leadType === 'Hot',
                      type: leadType,
                      source: 'Sales Visit',
                      nextDate: nextDateISO,
                      date: new Date().toISOString().split('T')[0],
                      
                      userId: user?.uid || user?.id || 'guest',     
                      assignedTo: user?.uid || user?.id || 'guest', 
                      senderId: user?.uid || user?.id || 'guest',
                      senderName: user?.name || 'Unknown',
                      role: user?.role || 'Employee',
                      
                      timestamp: Date.now(),
                      createdAt: new Date().toISOString(),
                      
                      discussion: `Auto-generated from DSR Update.\nStatus: ${editOutcome}\nNote: ${editNote}`,
                      history: [{
                          date: new Date().toLocaleString(),
                          msg: `Lead Created from Visit Update. Stage: ${leadStage}`,
                          type: 'System',
                          by: 'System'
                      }]
                  };

                  await addDoc(collection(db, "leads"), newLeadData);
                  
                  // Notification Logic
                  await addDoc(collection(db, "notifications"), {
                      title: "New Lead from DSR ⚡",
                      message: `Visit to ${selectedItem.hospital} converted to Lead by ${user?.name}.`,
                      to: "Admin",
                      screen: "/leads",
                      type: "info",
                      createdAt: new Date().toISOString()
                  });

                  Alert.alert("Lead Created! 🚀", `Added to Pipeline as '${leadStage}'`);
              }
          }

          if(refreshData) await refreshData();
          setModalVisible(false);
      } catch (error: any) {
          Alert.alert("Error", error.message);
      } finally {
          setIsUpdating(false);
      }
  };

  const renderItem = ({ item }: any) => {
      const closed = isClosed(item);
      const city = getCity(item); 
      const createdBy = item.senderName || item.userName || 'Unknown';

      return (
          <TouchableOpacity 
              style={[styles.card, { borderLeftColor: closed ? '#4caf50' : '#f57f17', borderLeftWidth: 4 }]} 
              onPress={() => openDetails(item)}
          >
              <View style={styles.cardHeader}>
                  <View style={{flex:1, marginRight: 5}}>
                      <Text style={styles.hospitalName} numberOfLines={1}>{item.hospital}</Text>
                      
                      {item.product ? (
                          <View style={{flexDirection:'row', alignItems:'center', marginTop:2}}>
                                <Ionicons name="cube-outline" size={12} color="#555" />
                                <Text style={{fontSize:12, color:'#444', marginLeft:4, fontWeight:'500'}}>{item.product}</Text>
                          </View>
                      ) : null}

                      <Text style={styles.subText} numberOfLines={1}>
                          {city ? `📍 ${city} • ` : ''} {item.person}
                      </Text>
                      <View style={{flexDirection:'row', alignItems:'center', marginTop:3}}>
                          <Ionicons name="person-circle-outline" size={14} color="#666" />
                          <Text style={{fontSize:11, color:'#555', marginLeft:2, fontWeight:'bold'}}>{createdBy}</Text>
                      </View>
                  </View>
                  
                  <View style={[styles.badge, { backgroundColor: closed ? '#e8f5e9' : '#fff3e0' }]}>
                      <Text style={[styles.badgeText, { color: closed ? 'green' : 'orange' }]}>
                          {item.outcome}
                      </Text>
                  </View>
              </View>
              <View style={styles.divider} />
              <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                  <Text style={styles.dateText}>📅 {formatDateDisplay(item.date)}</Text>
                  {item.nextFollowUp && <Text style={[styles.dateText, {color: '#d32f2f', fontWeight:'bold'}]}>⏰ {item.nextFollowUp}</Text>}
              </View>
              {item.discussion ? <Text style={styles.noteText} numberOfLines={1}>📝 {item.discussion.split('\n')[0]}</Text> : null}
          </TouchableOpacity>
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()} style={{padding:5}}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Visits DSR</Text>
        </View>
        <View style={{flexDirection:'row'}}>
            <TouchableOpacity style={[styles.addBtn, {backgroundColor:'#4caf50', marginRight:10}]} onPress={shareDailyReport}>
                <Ionicons name="share-social" size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_sales' as any)}>
                <Ionicons name="add" size={20} color="white" /><Text style={styles.addBtnText}>New</Text>
            </TouchableOpacity>
        </View>
      </View>

      <View style={styles.subTabContainer}>
          <TouchableOpacity style={[styles.subTab, statusFilter === 'FollowUp' && styles.activeSubTabFollow]} onPress={() => setStatusFilter('FollowUp')}>
              <Text style={[styles.subTabText, statusFilter === 'FollowUp' && {color:'white'}]}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.subTab, statusFilter === 'Closed' && styles.activeSubTabClosed]} onPress={() => setStatusFilter('Closed')}>
              <Text style={[styles.subTabText, statusFilter === 'Closed' && {color:'white'}]}>Closed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.subTab, statusFilter === 'All' && styles.activeSubTabAll]} onPress={() => setStatusFilter('All')}>
              <Text style={[styles.subTabText, statusFilter === 'All' && {color:'white'}]}>All</Text>
          </TouchableOpacity>
      </View>

      <View style={{backgroundColor:'white', padding:10, marginBottom:5}}>
          <View style={styles.searchBar}>
              <Ionicons name="search" size={24} color="#1565c0" /> 
              <TextInput style={styles.input} placeholder="Search: Hospital, City..." value={searchText} onChangeText={setSearchText} />
              {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="#d32f2f" /></TouchableOpacity>
              )}
          </View>

          {!searchText && (
            <>
              <View style={styles.dateTabContainer}>
                  {['Day', 'Month', 'Year', 'All'].map((m) => (
                      <TouchableOpacity key={m} style={[styles.dateTab, viewMode === m && styles.activeDateTab]} onPress={() => setViewMode(m as any)}>
                          <Text style={[styles.dateTabText, viewMode === m && styles.activeDateTabText]}>{m}</Text>
                      </TouchableOpacity>
                  ))}
              </View>

              {isAdmin && (
                <View style={{flexDirection:'row', justifyContent:'space-between', paddingHorizontal:15, marginBottom:10}}>
                    <TouchableOpacity style={styles.employeeFilterBtn} onPress={() => setShowEmployeePicker(true)}>
                        <Ionicons name="people" size={18} color="#2e7d32" />
                        <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                            {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:5}}/>
                    </TouchableOpacity>
                    {viewMode !== 'All' && (
                        <View style={styles.miniDateNav}>
                            <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={20} color="#555" /></TouchableOpacity>
                            <Text style={{fontWeight:'bold', color:'#3b5998', fontSize:12, marginHorizontal:5}}>{getHeaderDate()}</Text>
                            <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={20} color="#555" /></TouchableOpacity>
                        </View>
                    )}
                </View>
              )}

              {(!isAdmin && viewMode !== 'All') && (
                  <View style={styles.dateNav}>
                      <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                      <Text style={styles.monthText}>{getHeaderDate()}</Text>
                      <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
                  </View>
              )}
            </>
          )}
      </View>

      <FlatList 
          data={displayList}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ListEmptyComponent={<View style={{alignItems:'center', marginTop:50}}><Ionicons name="folder-open-outline" size={60} color="#ddd" /><Text style={{color:'gray', marginTop:0}}>No Visits Found.</Text></View>}
      />

      {/* UPDATE MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15, alignItems:'center'}}>
                      <Text style={styles.modalTitle}>Update Visit</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color="gray" /></TouchableOpacity>
                  </View>
                  {selectedItem && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          <View style={styles.readOnlyBox}>
                              <Text style={styles.roTitle}>{selectedItem.hospital}</Text>
                              <Text style={styles.roSub}>{selectedItem.person} • {getCity(selectedItem)}</Text>
                              {selectedItem.product && <Text style={{marginTop:5, fontWeight:'bold', color:'#333'}}>📦 {selectedItem.product}</Text>}
                          </View>
                          
                          <Text style={styles.sectionHeader}>UPDATE STATUS</Text>
                          <View style={styles.updateBox}>
                              <Text style={styles.label}>Outcome:</Text>
                              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowStatusPicker(true)}>
                                  <Text style={{color:'#333'}}>{editOutcome}</Text>
                                  <Ionicons name="chevron-down" size={20} color="gray" />
                              </TouchableOpacity>
                              
                              <Text style={styles.label}>Next Follow-up:</Text>
                              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
                                  <Text style={{color:'#333'}}>{editNextDate.toLocaleDateString('en-GB')}</Text>
                                  <Ionicons name="calendar" size={20} color="#3b5998" />
                              </TouchableOpacity>
                              {showDatePicker && <DateTimePicker value={editNextDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setEditNextDate(d); }} />}
                              
                              <Text style={styles.label}>Discussion / Note:</Text>
                              <TextInput style={styles.textArea} multiline value={editNote} onChangeText={setEditNote} placeholder="Visit summary..." />
                              
                              <TouchableOpacity style={[styles.saveButton, isUpdating && {backgroundColor:'#ccc'}]} onPress={handleUpdate} disabled={isUpdating}>
                                  {isUpdating ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save & Create Lead</Text>}
                              </TouchableOpacity>
                          </View>

                          <View style={styles.divider} />
                          <Text style={styles.sectionHeader}>📜 HISTORY</Text>
                          <View style={styles.historyBox}>
                              <Text style={styles.historyText}>{selectedItem.discussion || 'No history.'}</Text>
                          </View>
                      </ScrollView>
                  )}
              </KeyboardAvoidingView>
          </View>
      </Modal>

      {/* EMPLOYEE PICKER */}
      <Modal visible={showEmployeePicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Employee View</Text>
                  <FlatList 
                    data={employees} 
                    keyExtractor={item => item.id} 
                    renderItem={({item}) => (
                      <TouchableOpacity style={styles.pickerItem} onPress={() => { setSelectedEmployee(item.id); setSelectedEmployeeName(item.name); setShowEmployeePicker(false); }}>
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

      {/* STATUS PICKER */}
      <Modal visible={showStatusPicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowStatusPicker(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Status</Text>
                  <FlatList
                      data={visitOutcomes}
                      keyExtractor={item => item}
                      renderItem={({item}) => (
                          <TouchableOpacity style={styles.pickerItem} onPress={() => { setEditOutcome(item); setShowStatusPicker(false); }}>
                              <Text style={{fontSize:16, color:'#333'}}>{item}</Text>
                              {editOutcome === item && <Ionicons name="checkmark" size={18} color="green" />}
                          </TouchableOpacity>
                      )}
                  />
              </View>
          </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 0, zIndex: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  addBtn: { flexDirection:'row', backgroundColor:'#3b5998', paddingHorizontal:12, paddingVertical:8, borderRadius:20, alignItems:'center' },
  addBtnText: { color:'white', fontWeight:'bold', marginLeft:5 },
  
  subTabContainer: { flexDirection: 'row', padding: 5, backgroundColor: 'white', justifyContent:'space-between', borderTopWidth:1, borderTopColor:'#eee' },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, marginHorizontal: 4, backgroundColor: '#f0f0f0' },
  activeSubTabFollow: { backgroundColor: '#f57f17' },
  activeSubTabClosed: { backgroundColor: '#4caf50' },
  activeSubTabAll: { backgroundColor: '#3b5998' },
  subTabText: { fontSize: 12, fontWeight: 'bold', color: '#555' },
  
  dateTabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 5, borderRadius: 8, padding: 3, marginBottom: 5 },
  dateTab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeDateTab: { backgroundColor: 'white', elevation: 2 },
  dateTabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeDateTabText: { color: '#3b5998', fontWeight: 'bold' },
  
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 10, marginHorizontal: 15, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#eee' },
  miniDateNav: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:15, paddingHorizontal:5, paddingVertical:5 },
  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:8, borderRadius:20, borderWidth:1, borderColor:'#2e7d32' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
  
  searchBar: { backgroundColor: '#e3f2fd', borderRadius: 10, flexDirection:'row', alignItems:'center', paddingHorizontal: 15, height: 40, marginHorizontal: 15, marginBottom: 0, borderWidth: 1, borderColor: '#90caf9', elevation: 0 },
  input: { flex:1, marginLeft:10, fontSize:16, color:'#1565c0', fontWeight:'500' },
  
  listContent: { paddingHorizontal: 15, paddingBottom: 20 },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 5, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  subText: { fontSize: 13, color: '#555', marginTop: 2 }, 
  badge: { paddingHorizontal:8, paddingVertical:4, borderRadius:4 },
  badgeText: { fontSize:10, fontWeight:'bold' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  dateText: { fontSize: 12, color: '#555' },
  noteText: { fontSize: 13, color: '#444', marginTop:5, fontStyle:'italic' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '95%', backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  readOnlyBox: { backgroundColor:'#e3f2fd', padding:10, borderRadius:8, marginBottom:15, borderLeftWidth:4, borderLeftColor:'#3b5998' },
  roTitle: { fontSize:16, fontWeight:'bold', color:'#3b5998' },
  roSub: { fontSize:12, color:'#555', marginTop:2 },
  
  updateBox: { backgroundColor:'#fff', borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10 },
  label: { marginTop:10, marginBottom:5, fontWeight:'600', color:'#555', fontSize:12 },
  pickerBtn: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:10, borderWidth:1, borderColor:'#ddd', borderRadius:8, backgroundColor:'#f9f9f9' },
  textArea: { borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10, minHeight: 100, textAlignVertical:'top', backgroundColor:'#f9f9f9' },
  saveButton: { backgroundColor: '#3b5998', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  
  historyBox: { backgroundColor:'#f5f5f5', padding:15, borderRadius:8, borderWidth:1, borderColor:'#ddd', marginBottom:20 },
  historyText: { fontSize:13, color:'#333', lineHeight:20 },
  sectionHeader: { fontWeight:'bold', marginBottom:5, color:'#777', fontSize:12, marginTop:10 },
  
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between' }
});