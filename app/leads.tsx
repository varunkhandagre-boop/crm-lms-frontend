import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useData } from './context/DataContext';

// FIREBASE IMPORTS
import { addDoc, collection, doc, getDocs, query, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function LeadsScreen() {
  const router = useRouter();
  const { leadsList = [], user, refreshData } = useData();

  // --- STATES ---
  const [activeFilter, setActiveFilter] = useState('All');
  const [quickFilter, setQuickFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year' | 'All'>('Year');
  const [currentDate, setCurrentDate] = useState(new Date());

  // EMPLOYEE FILTER
  const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  // MODAL STATES
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);

  // EDITABLE STATES
  const [editStatus, setEditStatus] = useState('');
  const [editStage, setEditStage] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editNextDate, setEditNextDate] = useState(new Date());

  const [isUpdating, setIsUpdating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showStagePicker, setShowStagePicker] = useState(false);

  // OPTIONS
  const leadStatuses = ['All', 'Open', 'Replied', 'Follow Up', 'Converted (Win)', 'Plan Drop', 'Lost'];
  const leadStages = ['New', 'Introduction', 'Technical Review', 'Quotation', 'Negotiation', 'Order Closed'];

  const canViewEmployeeFilter = ['Admin', 'Manager', 'Accountant', 'Hr'].includes(user?.role || '');

  // 1. FETCH EMPLOYEES
  useEffect(() => {
    if (canViewEmployeeFilter) {
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

  // DATE HELPER
  const parseDate = (dateStr: any) => {
    if (!dateStr) return new Date(0);
    if (dateStr instanceof Date) return dateStr;
    if (typeof dateStr === 'string') {
      if (dateStr.includes('-')) return new Date(dateStr);
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
      }
    }
    return new Date(0);
  };

  const getFollowUpStatus = (dateStr: string) => {
    if (!dateStr) return { color: '#757575', label: 'No Date', icon: 'calendar-outline', bg: '#eeeeee' };
    const targetDate = parseDate(dateStr);
    const today = new Date();
    targetDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diff = targetDate.getTime() - today.getTime();

    if (diff < 0) return { color: '#d32f2f', label: 'Overdue', icon: 'alert-circle', bg: '#ffebee' };
    else if (diff === 0) return { color: '#f57c00', label: 'Today', icon: 'alarm', bg: '#fff3e0' };
    else return { color: '#388e3c', label: 'Upcoming', icon: 'calendar', bg: '#e8f5e9' };
  };

  const changeDate = (dir: number) => {
    const d = new Date(currentDate);
    if (viewMode === 'Day') d.setDate(d.getDate() + dir);
    else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
    else if (viewMode === 'Year') d.setFullYear(d.getFullYear() + dir);
    setCurrentDate(d);
  };

  const getHeaderDate = () => {
    if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (viewMode === 'Year') return currentDate.getFullYear().toString();
    return "All Time";
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'New': return '#2196f3';
      case 'Quotation': return '#9c27b0';
      case 'Negotiation': return '#ff9800';
      case 'Order Closed': return '#4caf50';
      case 'Lost': return '#f44336';
      default: return '#607d8b';
    }
  };

  // --- FILTER LOGIC (UPDATED) ---
  const getFilteredData = () => {
    let data = Array.isArray(leadsList) ? [...leadsList] : [];
    
    // 1. SECURITY FILTER (Sabse Pehle)
    // Agar user Admin nahi hai, to sirf apni leads dikhao
    const userRole = user?.role ? user.role.toLowerCase() : 'employee';
    const isMaster = ['admin', 'manager', 'accountant', 'hr', 'store'].includes(userRole);

    if (!isMaster) {
        // Employee can see leads assigned to them OR created by them
        data = data.filter((item: any) => 
            item.userId === user?.uid || 
            item.assignedTo === user?.uid || 
            item.senderId === user?.uid ||
            item.senderUid === user?.uid
        );
    }

    // 2. Admin Employee Filter (Dropdown se select kiya hua)
    if (isMaster && selectedEmployee !== 'All') {
      data = data.filter((item: any) =>
        // 🆔 Check IDs
        (item.senderUid === selectedEmployee) || 
        (item.uid === selectedEmployee) || 
        (item.userId === selectedEmployee) || 
        (item.assignedTo === selectedEmployee) ||
        
        // 🔥 NAME CHECKS (Agar ID fail ho jaye, to Name se pakdo)
        (item.senderName === selectedEmployeeName) ||
        (item.ownerName === selectedEmployeeName) ||
        (item.userName === selectedEmployeeName) ||
        (item.assignedToName === selectedEmployeeName)
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 3. Dashboard Quick Filters (Overdue/Today/Hot)
    if (quickFilter === 'overdue') {
      data = data.filter((item: any) => {
        if (!item.nextDate) return false;
        const d = parseDate(item.nextDate);
        return d < today && item.status !== 'Converted (Win)' && item.status !== 'Lost' && item.status !== 'Order Closed';
      });
    } else if (quickFilter === 'today') {
      data = data.filter((item: any) => {
        if (!item.nextDate) return false;
        const d = parseDate(item.nextDate);
        return d.getTime() === today.getTime() && item.status !== 'Converted (Win)' && item.status !== 'Lost';
      });
    } else if (quickFilter === 'hot') {
      data = data.filter((item: any) => item.isHot === true);
    }

    // 4. Status Filter
    if (!quickFilter) {
      if (activeFilter === 'All') {
        data = data.filter((item: any) =>
          item.status !== 'Converted (Win)' &&
          item.status !== 'Lost' &&
          item.status !== 'Plan Drop' &&
          item.status !== 'Order Closed'
        );
      } else {
        // 🔥 FIX: Simple & Safe Matching
        data = data.filter((item: any) => {
            const dbStatus = (item.status || '').toLowerCase().trim(); // Database wala status (lowercase)
            const filterStatus = activeFilter.toLowerCase().trim();    // Filter wala status (lowercase)
            
            return dbStatus === filterStatus;
        });
      }
    }

    // 5. Search
    if (searchText) {
      const lowerText = searchText.toLowerCase();
      data = data.filter((item: any) => {
        const fullString = `${item.org || ''} ${item.contactPerson || ''} ${item.status || ''} ${item.requirements || item.product || ''} ${item.source || ''}`.toLowerCase();
        return fullString.includes(lowerText);
      });
    } 
    // 6. Date Filter (Only if not searching)
    else if (viewMode !== 'All' && !quickFilter) {
      const targetYear = currentDate.getFullYear();
      const targetMonth = currentDate.getMonth();
      const targetDay = currentDate.getDate();

      data = data.filter((item: any) => {
        const dateToCheck = item.nextDate || item.date;
        if (!dateToCheck) return false;
        const itemDate = parseDate(dateToCheck);

        if (viewMode === 'Year') return itemDate.getFullYear() === targetYear;
        if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
        if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
        return true;
      });
    }

    // Sort: Overdue & Upcoming first
    data.sort((a: any, b: any) => {
      const dateA = a.nextDate ? parseDate(a.nextDate).getTime() : 0;
      const dateB = b.nextDate ? parseDate(b.nextDate).getTime() : 0;
      if (dateA === 0) return 1;
      if (dateB === 0) return -1;
      return dateA - dateB;
    });

    return data;
  };

  const displayList = getFilteredData(); // Ye line aapke code me pehle se hai
  // 🔥 UPDATED COUNTS LOGIC (Secure)
  const getActionCounts = () => {
    // 1. Base Data Le (Array Check)
    let baseData = Array.isArray(leadsList) ? [...leadsList] : [];

    // 2. Security Check (Role Base)
    const userRole = user?.role ? user.role.toLowerCase() : 'employee';
    const isMaster = ['admin', 'manager', 'accountant', 'hr', 'store'].includes(userRole);
    
    if (!isMaster) {
        // Employee ko sirf apna data count me dikhega
        baseData = baseData.filter((item: any) => 
            item.userId === user?.uid || 
            item.assignedTo === user?.uid || 
            item.senderId === user?.uid ||
            item.senderUid === user?.uid
        );
    }
    
    // 3. Admin Employee Filter (Agar Admin ne kisi employee ko select kiya hai)
    if (isMaster && selectedEmployee !== 'All') {
        baseData = baseData.filter((item: any) => 
            // 🆔 Check IDs
            item.senderUid === selectedEmployee || 
            item.uid === selectedEmployee ||
            item.userId === selectedEmployee ||
            item.assignedTo === selectedEmployee ||

            // 🔥 NAME CHECKS ADDED HERE TOO
            item.senderName === selectedEmployeeName ||
            item.ownerName === selectedEmployeeName ||
            item.userName === selectedEmployeeName
        );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 4. Counts Calculate Karein
    const overdue = baseData.filter((i: any) => i.nextDate && parseDate(i.nextDate) < today && i.status !== 'Converted (Win)' && i.status !== 'Lost' && i.status !== 'Order Closed').length;
    const dueToday = baseData.filter((i: any) => i.nextDate && parseDate(i.nextDate).getTime() === today.getTime() && i.status !== 'Converted (Win)' && i.status !== 'Lost').length;
    const hot = baseData.filter((i: any) => i.isHot && i.status !== 'Converted (Win)' && i.status !== 'Lost').length;

    return { overdue, dueToday, hot };
  };
  
  const actionCounts = getActionCounts();

  // 🔥 NAVIGATE TO PRODUCT MASTER
  const openProductLibrary = () => {
    setDetailsModalVisible(false);
    router.push('/product_master');
  };

  // DIRECT CHAT
  const openWhatsApp = (item: any) => {
    const mobile = item.mobile || item.contactNumber || '';
    if (!mobile) return Alert.alert("Error", "No mobile number found.");

    const name = item.contactPerson;
    const org = item.org;
    const product = item.requirements || item.product || 'your inquiry';

    let msg = `Hello ${name},\n\nGreetings from our Sales Team.\nWe are following up regarding requirements for *${product}* at *${org}*.\n\nPlease let us know a convenient time to discuss.\n\nRegards,\n*LMS Team*`;

    let url = `whatsapp://send?phone=91${mobile}&text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => Alert.alert("Error", "WhatsApp not installed"));
  };


  // --- HANDLERS ---
  const handleLeadClick = (item: any) => {
    setSelectedLead(item);
    setEditStatus(item.status || 'Open');
    setEditStage(item.stage || 'New');
    setEditNote('');
    if (item.nextDate) {
      const d = parseDate(item.nextDate);
      if (d.getTime() !== 0) setEditNextDate(d);
      else setEditNextDate(new Date());
    } else {
      setEditNextDate(new Date());
    }
    setDetailsModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!selectedLead) return;
    setIsUpdating(true);
    try {
      const docRef = doc(db, 'leads', selectedLead.id);
      const nextDateISO = editNextDate.toISOString().split('T')[0];
      const nextDateDisplay = editNextDate.toLocaleDateString('en-GB');
      const todayString = new Date().toLocaleDateString('en-GB');

      const logEntry = `📅 ${todayString}: ${editNote || 'Status Updated'} [${editStatus} - ${editStage}] -> Next: ${nextDateDisplay}`;
      const updatedDiscussion = selectedLead.discussion ? `${logEntry}\n────────────────\n${selectedLead.discussion}` : logEntry;

      await updateDoc(docRef, {
        status: editStatus,
        stage: editStage,
        nextDate: nextDateISO,
        nextFollowUp: nextDateISO,
        discussion: updatedDiscussion,
        lastUpdated: new Date().toISOString()
      });
      // 👇👇👇 NOTIFICATION LOGIC START 👇👇👇
      try {
          // Logic: Agar Admin change kare to Employee ko bataye, 
          // Agar Employee change kare to Admin ko bataye.
          const targetUser = user?.role === 'Admin' ? selectedLead.senderId : 'Admin';
          
          await addDoc(collection(db, "notifications"), {
              title: "Lead Updated 🚀",
              message: `${selectedLead.org} status changed to ${editStatus} by ${user?.name}`,
              to: targetUser, // Dynamic Target
              route: "/leads",
              read: false,
              createdAt: new Date().toISOString(),
              type: "info"
          });
      } catch (notifError) {
          console.log("Notification Error:", notifError);
      }
      // 👆👆👆 NOTIFICATION LOGIC END 👆👆👆

      if (refreshData) await refreshData();
      setDetailsModalVisible(false);
      Alert.alert("Success", "Lead updated successfully!");
    } catch (error: any) {
      Alert.alert("Error", "Update failed: " + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Leads Pipeline</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_lead')}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={{ color: 'white', fontWeight: 'bold', marginLeft: 2 }}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ backgroundColor: 'white', paddingBottom: 5 }}>
        {/* ACTION CARDS */}
        <View style={styles.actionCardsRow}>
          <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#ffebee', borderColor: quickFilter === 'overdue' ? '#d32f2f' : 'transparent', borderWidth: 1 }]} onPress={() => setQuickFilter(quickFilter === 'overdue' ? '' : 'overdue')}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#d32f2f' }}>{actionCounts.overdue}</Text>
            <Text style={{ fontSize: 10, color: '#d32f2f', fontWeight: '600' }}>OVERDUE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#fff3e0', borderColor: quickFilter === 'today' ? '#f57c00' : 'transparent', borderWidth: 1 }]} onPress={() => setQuickFilter(quickFilter === 'today' ? '' : 'today')}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#f57c00' }}>{actionCounts.dueToday}</Text>
            <Text style={{ fontSize: 10, color: '#f57c00', fontWeight: '600' }}>DUE TODAY</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#e8f5e9', borderColor: quickFilter === 'hot' ? '#2e7d32' : 'transparent', borderWidth: 1 }]} onPress={() => setQuickFilter(quickFilter === 'hot' ? '' : 'hot')}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32' }}>{actionCounts.hot}</Text>
            <Text style={{ fontSize: 10, color: '#2e7d32', fontWeight: '600' }}>HOT LEADS</Text>
          </TouchableOpacity>
        </View>

        {/* SEARCH & FILTERS */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#1565c0" />
          <TextInput style={styles.input} placeholder="Search Leads..." value={searchText} onChangeText={setSearchText} />
          {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="#d32f2f" /></TouchableOpacity>}
        </View>

        {!searchText && !quickFilter && (
          <>
            <View style={styles.tabContainer}>
              {['Day', 'Month', 'Year', 'All'].map((m) => (
                <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                  <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {viewMode !== 'All' && (
              <View style={styles.dateNav}>
                <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                <Text style={styles.monthText}>{getHeaderDate()}</Text>
                <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
              </View>
            )}
          </>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, marginTop: 5, alignItems: 'center' }}>
          <TouchableOpacity style={[styles.filterBtn, activeFilter !== 'All' && { backgroundColor: '#e3f2fd', borderColor: '#3b5998' }]} onPress={() => setFilterModalVisible(true)}>
            <Ionicons name="filter" size={14} color={activeFilter !== 'All' ? "#3b5998" : "gray"} />
            <Text style={{ fontSize: 12, marginLeft: 5, color: activeFilter !== 'All' ? "#3b5998" : "gray" }}>{activeFilter === 'All' ? 'Status' : activeFilter}</Text>
          </TouchableOpacity>
          {canViewEmployeeFilter && (
            <TouchableOpacity style={[styles.filterBtn, selectedEmployee !== 'All' && { backgroundColor: '#e8f5e9', borderColor: '#2e7d32' }]} onPress={() => setShowEmployeePicker(true)}>
              <Ionicons name="person" size={14} color={selectedEmployee !== 'All' ? "#2e7d32" : "gray"} />
              <Text style={{ fontSize: 12, marginLeft: 5, color: selectedEmployee !== 'All' ? "#2e7d32" : "gray", maxWidth: 100 }} numberOfLines={1}>{selectedEmployeeName}</Text>
            </TouchableOpacity>
          )}
          <Text style={{ fontSize: 12, color: 'gray' }}>Total: <Text style={{ fontWeight: 'bold', color: '#3b5998' }}>{displayList.length}</Text></Text>
        </View>
      </View>

      <FlatList
        data={displayList}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.contentContainer}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 50, color: 'gray' }}>No Leads Found</Text>}
        renderItem={({ item }) => {
          const creatorName = item.senderName || item.ownerName || item.userName || 'Unknown';
          const dateStatus = getFollowUpStatus(item.nextDate);
          const productInfo = item.requirements || item.product || null;
          return (
            <TouchableOpacity style={[styles.card, { borderLeftColor: getStageColor(item.stage), borderLeftWidth: 4 }]} onPress={() => handleLeadClick(item)}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.hospitalName} numberOfLines={1}>{item.org}</Text>
                    <View style={{ flexDirection: 'row' }}>
                      {/* 📞 CALL BUTTON */}
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.mobile}`)} style={{ marginRight: 15 }}>
                        <Ionicons name="call" size={20} color="#3b5998" />
                      </TouchableOpacity>

                      {/* 💬 WHATSAPP BUTTON */}
                      <TouchableOpacity onPress={() => openWhatsApp(item)} style={{ marginRight: 5 }}>
                        <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                    {productInfo && <View style={styles.tag}><Text style={styles.tagText}>{productInfo}</Text></View>}
                    {item.source && <View style={[styles.tag, { backgroundColor: '#e0f7fa' }]}><Text style={[styles.tagText, { color: '#006064' }]}>{item.source}</Text></View>}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    {item.isHot && <Text style={styles.hotBadge}>🔥 HOT</Text>}
                    <Text style={styles.subText}>{item.type}, {item.address}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStageColor(item.stage) + '20' }]}><Text style={{ color: getStageColor(item.stage), fontSize: 10, fontWeight: 'bold' }}>{item.stage}</Text></View>
              </View>
              <View style={styles.divider} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person" size={14} color="gray" />
                  <Text style={styles.contactText}>{item.contactPerson}</Text>
                  <Text style={{ color: '#ccc', marginHorizontal: 5 }}>|</Text>
                  <Text style={{ fontSize: 11, color: '#777' }}>By: {creatorName}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: dateStatus.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                  <Ionicons name={dateStatus.icon as any} size={12} color={dateStatus.color} style={{ marginRight: 3 }} />
                  <Text style={{ fontSize: 11, color: dateStatus.color, fontWeight: 'bold' }}>{dateStatus.label} {item.nextDate ? `(${new Date(item.nextDate).toLocaleDateString('en-GB').slice(0, 5)})` : ''}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* DETAILS MODAL */}
      <Modal visible={detailsModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center' }}>
              <Text style={styles.modalTitle}>Update Lead</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}><Ionicons name="close" size={24} color="gray" /></TouchableOpacity>
            </View>

            {selectedLead && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.readOnlyBox}>
                  <Text style={styles.roTitle}>{selectedLead.org}</Text>
                  <Text style={styles.roSub}>{selectedLead.contactPerson} | {selectedLead.mobile}</Text>
                  {(selectedLead.product || selectedLead.requirements) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 5 }}>
                      <Ionicons name="cube" size={16} color="#3b5998" />
                      <Text style={{ marginLeft: 6, color: '#333', fontWeight: 'bold', fontSize: 14 }}>
                        {selectedLead.product || selectedLead.requirements}
                      </Text>
                    </View>
                  )}

                  {/* 🔥 OPEN PRODUCT MASTER BUTTON */}
                  <TouchableOpacity style={styles.productMasterBtn} onPress={openProductLibrary}>
                    <Ionicons name="library" size={20} color="white" />
                    <Text style={styles.productMasterBtnText}>📂 Open Product Library</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.sectionHeader}>UPDATE DETAILS</Text>
                <View style={styles.updateBox}>
                  <Text style={styles.label}>Status / Stage:</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <TouchableOpacity style={[styles.pickerBtn, { flex: 0.48 }]} onPress={() => setShowStatusPicker(true)}><Text style={{ color: '#333' }}>{editStatus}</Text><Ionicons name="chevron-down" size={20} color="gray" /></TouchableOpacity>
                    <TouchableOpacity style={[styles.pickerBtn, { flex: 0.48 }]} onPress={() => setShowStagePicker(true)}><Text style={{ color: '#333' }}>{editStage}</Text><Ionicons name="stats-chart" size={20} color="gray" /></TouchableOpacity>
                  </View>

                  <Text style={styles.label}>Next Follow-up:</Text>
                  <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
                    <Text style={{ color: '#333' }}>{editNextDate.toLocaleDateString('en-GB')}</Text>
                    <Ionicons name="calendar" size={20} color="#3b5998" />
                  </TouchableOpacity>
                  {showDatePicker && <DateTimePicker value={editNextDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if (d) setEditNextDate(d); }} />}

                  <Text style={styles.label}>Note:</Text>
                  <TextInput style={styles.textArea} multiline value={editNote} onChangeText={setEditNote} placeholder="Discussion details..." />

                  <TouchableOpacity style={[styles.saveButton, isUpdating && { backgroundColor: '#ccc' }]} onPress={handleUpdate} disabled={isUpdating}>
                    {isUpdating ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Update</Text>}
                  </TouchableOpacity>
                </View>

                <Text style={styles.sectionHeader}>📜 HISTORY</Text>
                <View style={styles.historyBox}><Text style={styles.historyText}>{selectedLead.discussion || 'No previous history.'}</Text></View>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PICKERS */}
      <Modal visible={showEmployeePicker} transparent animationType="fade"><TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}><View style={styles.pickerContainer}><FlatList data={employees} keyExtractor={item => item.id} renderItem={({ item }) => (<TouchableOpacity style={styles.pickerItem} onPress={() => { setSelectedEmployee(item.id); setSelectedEmployeeName(item.name); setShowEmployeePicker(false); }}><Text style={{ fontSize: 16, color: '#333' }}>{item.name}</Text>{selectedEmployee === item.id && <Ionicons name="checkmark" size={18} color="green" />}</TouchableOpacity>)} /></View></TouchableOpacity></Modal>
      <Modal visible={filterModalVisible} transparent animationType="fade"><TouchableOpacity style={styles.pickerOverlay} onPress={() => setFilterModalVisible(false)}><View style={styles.pickerContainer}><FlatList data={leadStatuses} keyExtractor={item => item} renderItem={({ item }) => (<TouchableOpacity style={styles.pickerItem} onPress={() => { setActiveFilter(item); setFilterModalVisible(false); }}><Text style={{ fontSize: 16, color: '#333' }}>{item}</Text>{activeFilter === item && <Ionicons name="checkmark" size={18} color="green" />}</TouchableOpacity>)} /></View></TouchableOpacity></Modal>
      <Modal visible={showStatusPicker} transparent animationType="fade"><TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowStatusPicker(false)}><View style={styles.pickerContainer}><FlatList data={leadStatuses} keyExtractor={item => item} renderItem={({ item }) => (<TouchableOpacity style={styles.pickerItem} onPress={() => { setEditStatus(item); setShowStatusPicker(false); }}><Text style={{ fontSize: 16, color: '#333' }}>{item}</Text>{editStatus === item && <Ionicons name="checkmark" size={18} color="green" />}</TouchableOpacity>)} /></View></TouchableOpacity></Modal>
      <Modal visible={showStagePicker} transparent animationType="fade"><TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowStagePicker(false)}><View style={styles.pickerContainer}><FlatList data={leadStages} keyExtractor={item => item} renderItem={({ item }) => (<TouchableOpacity style={styles.pickerItem} onPress={() => { setEditStage(item); setShowStagePicker(false); }}><Text style={{ fontSize: 16, color: '#333' }}>{item}</Text>{editStage === item && <Ionicons name="checkmark" size={18} color="green" />}</TouchableOpacity>)} /></View></TouchableOpacity></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgb(245, 245, 245)' },
  header: { backgroundColor: 'white', paddingTop: 55, paddingBottom: 2, elevation: 2 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, marginBottom: 5 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b5998', borderRadius: 5, paddingHorizontal: 10, paddingVertical: 6 },

  actionCardsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, marginBottom: 10, marginTop: 10 },
  actionCard: { flex: 1, alignItems: 'center', paddingVertical: 3, borderRadius: 8, marginHorizontal: 3, elevation: 1 },

  searchBar: { backgroundColor: '#e3f2fd', borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 45, marginHorizontal: 15, marginBottom: 5, borderWidth: 1, borderColor: '#90caf9', elevation: 2 },
  input: { flex: 1, marginLeft: 10, fontSize: 15, color: '#1565c0', fontWeight: '500' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: 'white', marginRight: 5 },

  contentContainer: { padding: 15, paddingBottom: 100 },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
  hospitalName: { fontWeight: 'bold', fontSize: 16, color: '#333', maxWidth: '70%' },
  hotBadge: { color: '#d32f2f', fontSize: 10, marginLeft: 5, fontWeight: 'bold' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  contactText: { fontWeight: '600', fontSize: 12, color: '#333' },
  subText: { color: 'gray', fontSize: 12, marginLeft: 5 },
  tag: { backgroundColor: '#f0f0f0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6, marginBottom: 4 },
  tagText: { fontSize: 10, color: '#555' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },

  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', marginHorizontal: 15, borderRadius: 8, padding: 2, marginBottom: 5 },
  tab: { flex: 1, paddingVertical: 5, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 5, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  productMasterBtn: { flexDirection: 'row', backgroundColor: '#0335a1', padding: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10, elevation: 2 },
  productMasterBtnText: { color: 'white', fontWeight: 'bold', marginLeft: 8, fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '95%', backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  readOnlyBox: { backgroundColor: '#e3f2fd', padding: 10, borderRadius: 8, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#3b5998' },
  roTitle: { fontSize: 16, fontWeight: 'bold', color: '#3b5998' },
  roSub: { fontSize: 12, color: '#555', marginTop: 2 },
  roMeta: { fontSize: 11, color: '#1565c0', fontWeight: '600' },
  updateBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 },
  label: { marginTop: 10, marginBottom: 5, fontWeight: '600', color: '#555', fontSize: 12 },
  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#f9f9f9' },
  textArea: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, height: 60, textAlignVertical: 'top', backgroundColor: '#f9f9f9' },
  saveButton: { backgroundColor: '#3b5998', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  historyBox: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', marginBottom: 20 },
  historyText: { fontSize: 13, color: '#333', lineHeight: 20 },
  sectionHeader: { fontWeight: 'bold', marginBottom: 5, color: '#777', fontSize: 12, marginTop: 10 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation: 10 },
  pickerHeader: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#3b5998', textAlign: 'center' },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});