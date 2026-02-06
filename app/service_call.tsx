import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
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
// 🔥 FIREBASE IMPORTS
import { addDoc, collection, doc, getDocs, query, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function ServiceCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { serviceCallList = [], user, addNotification } = useData();

  // --- STATES ---
  const [statusFilter, setStatusFilter] = useState<'Open' | 'Closed' | 'All'>('Open');
  useEffect(() => {
      if (params.filter === 'Closed') {
          setStatusFilter('Closed');
      }
  }, [params]);
  const [searchText, setSearchText] = useState('');

  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year' | 'All'>('Year');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedCall, setSelectedCall] = useState<any>(null);

  const [resolutionNote, setResolutionNote] = useState('');
  const [loading, setLoading] = useState(false);

  // --- NEW: EMPLOYEE FILTER STATES ---
  const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const isAdmin = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr'].includes(user?.role || '');

  // --- COUNTS ---
  const openCount = serviceCallList.filter((i: any) => i.status === 'Open' || i.status === 'Assigned').length;

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

  // --- UNIVERSAL DATE PARSER ---
  const parseDate = (dateStr: any) => {
    if (!dateStr) return 0;
    if (typeof dateStr === 'number') return dateStr;
    if (dateStr instanceof Date) return dateStr.getTime();

    if (typeof dateStr === 'string') {
      let cleanStr = dateStr.replace(/\./g, '/').replace(/-/g, '/');
      const parts = cleanStr.split('/');

      if (parts.length === 3 && parts[0].length === 4) {
        return new Date(cleanStr).getTime();
      }
      if (parts.length === 3 && parts[2].length === 4) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
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
    if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (viewMode === 'Year') return currentDate.getFullYear().toString();
    return "All Time";
  };

  // --- FILTER LOGIC ---
  const getSortedFilteredData = () => {
    let data = serviceCallList ? [...serviceCallList] : [];

    // 0. Employee Filter
    if (isAdmin && selectedEmployee !== 'All') {
      data = data.filter((item: any) => {
        if (item.senderId === selectedEmployee) return true;
        if (item.assignedToId === selectedEmployee) return true;
        if (item.senderName && item.senderName.toLowerCase() === selectedEmployeeName.toLowerCase()) return true;
        if (item.userName && item.userName.toLowerCase() === selectedEmployeeName.toLowerCase()) return true;
        return false;
      });
    } else if (!isAdmin) {
      data = data.filter((item: any) => item.senderId === user?.uid || item.assignedToId === user?.uid);
    }

    // 1. STATUS FILTER
    if (statusFilter === 'Open') {
      data = data.filter((item: any) => item.status === 'Open' || item.status === 'Assigned');
    } else if (statusFilter === 'Closed') {
      data = data.filter((item: any) => item.status === 'Resolved' || item.status === 'Closed');
    }

    // 2. SEARCH
    if (searchText) {
      const lowerText = searchText.toLowerCase();
      data = data.filter((item: any) =>
        `${item.hospitalName} ${item.scrId} ${item.serialNo} ${item.city} ${item.model}`.toLowerCase().includes(lowerText)
      );
    }

    // 3. DATE FILTER
    if (viewMode !== 'All') {
      const tYear = currentDate.getFullYear();
      const tMonth = currentDate.getMonth();
      const tDay = currentDate.getDate();

      data = data.filter((item: any) => {
        const ts = parseDate(item.createdAt || item.date);
        if (!ts) return false;
        const d = new Date(ts);

        if (viewMode === 'Year') return d.getFullYear() === tYear;
        if (viewMode === 'Month') return d.getFullYear() === tYear && d.getMonth() === tMonth;
        if (viewMode === 'Day') return d.getFullYear() === tYear && d.getMonth() === tMonth && d.getDate() === tDay;
        return true;
      });
    }

    // 4. SORT
    data.sort((a: any, b: any) => parseDate(b.date || b.createdAt) - parseDate(a.date || a.createdAt));

    return data;
  };

  const displayList = getSortedFilteredData();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Resolved': return { bg: '#e8f5e9', text: '#2e7d32' };
      case 'Assigned': return { bg: '#e3f2fd', text: '#1565c0' };
      case 'Open': return { bg: '#ffebee', text: '#c62828' };
      default: return { bg: '#f5f5f5', text: 'gray' };
    }
  };

  const openDetails = (item: any) => {
    setSelectedCall(item);
    setResolutionNote(item.resolutionNote || '');
    setDetailsModalVisible(true);
  };

  const handleCloseCall = async () => {
    if (!resolutionNote) { Alert.alert("Required", "Please enter a resolution note."); return; }
    setLoading(true);
    try {
      const callRef = doc(db, "service_calls", selectedCall.id);
      await updateDoc(callRef, {
        status: 'Resolved',
        resolutionNote: resolutionNote,
        resolvedAt: new Date().toISOString(),
        resolvedBy: user?.name || 'Admin'
      });
      try {
          const targetUser = user?.role === 'Admin' ? selectedCall.senderId : 'Admin';
          await addDoc(collection(db, "notifications"), {
              title: "Service Call Resolved ✅",
              message: `Ticket #${selectedCall.scrId} resolved by ${user?.name}.`,
              to: targetUser, 
              screen: "/service_call?filter=Closed",
              read: false,
              createdAt: new Date().toISOString(),
              type: "success"
          });
      } catch (error) {
          console.log("Notification Failed:", error);
      }
      setDetailsModalVisible(false);
      Alert.alert("Success", "Call Closed Successfully!");
    } catch (error) { Alert.alert("Error", "Could not update status."); }
    finally { setLoading(false); }
  };

  const renderCard = ({ item }: any) => {
    const statusStyle = getStatusColor(item.status);
    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.cardHeader}>
          <Text style={styles.hospitalName} numberOfLines={1}>{item.hospitalName}</Text>
          <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
            <Text style={{ color: statusStyle.text, fontSize: 10, fontWeight: 'bold' }}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.addressText}><Ionicons name="location-outline" size={12} /> {item.city || 'N/A'}</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Machine:</Text>
          <Text style={styles.value} numberOfLines={1}>
            {item.machine}
            {item.model ? ` • ${item.model}` : ''}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Ticket:</Text>
          <Text style={[styles.value, { fontWeight: 'bold' }]}>{item.scrId}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>{item.date}</Text>
          <Text style={[styles.footerText, { color: '#3b5998', fontWeight: 'bold' }]}>
            {item.senderName ? item.senderName.split(' ')[0] : 'Unknown'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10 }}>
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Service Calls</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_service_call' as any)}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={{ color: 'white', fontWeight: 'bold', marginLeft: 5 }}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 1. STATUS TABS */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity style={[styles.tab, statusFilter === 'Open' && styles.activeTabOpen]} onPress={() => setStatusFilter('Open')}>
          <Text style={[styles.tabText, statusFilter === 'Open' && { color: 'white' }]}>Open ({openCount})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, statusFilter === 'Closed' && styles.activeTabClosed]} onPress={() => setStatusFilter('Closed')}>
          <Text style={[styles.tabText, statusFilter === 'Closed' && { color: 'white' }]}>Closed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, statusFilter === 'All' && styles.activeTabAll]} onPress={() => setStatusFilter('All')}>
          <Text style={[styles.tabText, statusFilter === 'All' && { color: 'white' }]}>All</Text>
        </TouchableOpacity>
      </View>

      {/* 2. TIME & STAFF FILTERS */}
      <View style={{ backgroundColor: 'white', paddingBottom: 10, marginBottom: 5 }}>
        <View style={styles.dateTabRow}>
          {['Day', 'Month', 'Year', 'All'].map((m) => (
            <TouchableOpacity key={m} style={[styles.dateTab, viewMode === m && styles.activeDateTab]} onPress={() => setViewMode(m as any)}>
              <Text style={[styles.dateTabText, viewMode === m && styles.activeDateTabText]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* --- ADMIN STAFF DROPDOWN --- */}
        {isAdmin && (
          <View style={{ paddingHorizontal: 10, marginBottom: 5 }}>
            <TouchableOpacity
              style={styles.employeeFilterBtn}
              onPress={() => setShowEmployeePicker(true)}
            >
              <Ionicons name="people" size={18} color="#2e7d32" />
              <Text style={{ fontSize: 13, marginLeft: 8, color: '#2e7d32', fontWeight: '600' }}>
                {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{ marginLeft: 'auto' }} />
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

        {/* SEARCH */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="gray" />
            <TextInput style={styles.input} placeholder="Search Ticket, Hospital..." value={searchText} onChangeText={setSearchText} />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="gray" /></TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* LIST */}
      <FlatList
        data={displayList}
        keyExtractor={item => item.id}
        renderItem={renderCard}
        contentContainerStyle={styles.contentContainer}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            <Ionicons name="construct-outline" size={60} color="#ddd" />
            <Text style={{ textAlign: 'center', marginTop: 10, color: 'gray' }}>No Data Found</Text>
          </View>
        }
      />

      {/* FULL DETAILS MODAL */}
      <Modal visible={detailsModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedCall && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 5 }}>
                  <Text style={styles.modalTitle}>Ticket Details</Text>
                  <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                    <Ionicons name="close-circle" size={30} color="#d32f2f" />
                  </TouchableOpacity>
                </View>

                {/* Basic Info */}
                <DetailRow label="Hospital" value={selectedCall.hospitalName} icon="business" highlight />
                {/* 🔥 ADDED CITY HERE */}
                <DetailRow label="City" value={selectedCall.city} icon="location" />
                
                <DetailRow label="Ticket No" value={selectedCall.scrId} icon="pricetag" />
                <DetailRow label="Date" value={selectedCall.date} icon="calendar" />
                <DetailRow label="Engineer" value={selectedCall.senderName || selectedCall.userName} icon="person" />

                <View style={styles.divider} />

                {/* 🔥 SEPARATED MODEL FROM MACHINE */}
                <DetailRow label="Machine" value={selectedCall.machine} icon="cube" />
                <DetailRow label="Model" value={selectedCall.model} icon="layers" />
                
                <DetailRow label="Serial No" value={selectedCall.serialNo} icon="barcode" />
                <DetailRow label="Type" value={selectedCall.serviceType || 'Unknown'} icon="document-text" />

                <View style={styles.divider} />

                {/* Complaint */}
                <Text style={styles.sectionHeader}>COMPLAINT / ISSUE</Text>
                <View style={{ backgroundColor: '#ffebee', padding: 10, borderRadius: 8, marginBottom: 10 }}>
                  <Text style={{ color: '#c62828' }}>{selectedCall.remark}</Text>
                </View>

                {/* SPARE PARTS */}
                {selectedCall.partsText && (
                  <View>
                    <Text style={styles.sectionHeader}>SPARE PARTS USED</Text>
                    <View style={{ backgroundColor: '#fff3e0', padding: 10, borderRadius: 8, marginBottom: 10 }}>
                      <Text style={{ color: '#e65100' }}>{selectedCall.partsText}</Text>
                    </View>
                  </View>
                )}

                {/* ACTION / RESOLUTION */}
                {(selectedCall.status === 'Open' || selectedCall.status === 'Assigned') ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.sectionHeader}>ACTION TAKEN (TO CLOSE)</Text>
                    <TextInput
                      style={styles.actionInput}
                      multiline
                      placeholder="Describe repair details..."
                      value={resolutionNote}
                      onChangeText={setResolutionNote}
                    />
                    <TouchableOpacity style={[styles.resolveBtn, loading && { backgroundColor: '#ccc' }]} onPress={handleCloseCall} disabled={loading}>
                      <Text style={styles.btnText}>{loading ? 'Updating...' : 'Mark as Closed'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.sectionHeader}>RESOLUTION NOTE</Text>
                    <View style={{ backgroundColor: '#e8f5e9', padding: 10, borderRadius: 8 }}>
                      <Text style={{ color: '#2e7d32' }}>{selectedCall.resolutionNote || 'Closed without notes.'}</Text>
                    </View>
                  </View>
                )}

                {/* PHOTO */}
                {selectedCall.imageUri && (
                  <View style={{ marginTop: 15 }}>
                    <Text style={styles.sectionHeader}>PHOTO</Text>
                    <Image source={{ uri: selectedCall.imageUri }} style={{ width: '100%', height: 200, borderRadius: 10, resizeMode: 'cover' }} />
                  </View>
                )}
                <View style={{ height: 30 }} />
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
            <Text style={styles.pickerHeader}>Select Employee View</Text>
            <FlatList
              data={employees}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setSelectedEmployee(item.id);
                    setSelectedEmployeeName(item.name);
                    setShowEmployeePicker(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="person-circle" size={24} color="#555" style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 16, color: '#333' }}>{item.name}</Text>
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

const DetailRow = ({ label, value, icon, highlight }: any) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
    <View style={{ width: 25 }}><Ionicons name={icon} size={16} color="#3b5998" /></View>
    <Text style={{ fontSize: 12, color: 'gray', width: 80 }}>{label}</Text>
    <Text style={{ fontSize: 14, fontWeight: highlight ? 'bold' : '500', color: '#333', flex: 1 }}>{value || '-'}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: 'white', paddingTop: 40, paddingBottom: 0, elevation: 0 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, marginBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998', marginLeft: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b5998', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },

  // Status Tabs
  tabsContainer: { flexDirection: 'row', padding: 2, backgroundColor: 'white', justifyContent: 'space-between' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, marginHorizontal: 4, backgroundColor: '#f0f0f0' },
  activeTabOpen: { backgroundColor: '#d32f2f' },
  activeTabClosed: { backgroundColor: '#388e3c' },
  activeTabAll: { backgroundColor: '#3b5998' },
  tabText: { fontSize: 13, fontWeight: 'bold', color: '#555' },

  // Date Filter Tabs
  dateTabRow: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 10, borderRadius: 8, padding: 3 },
  dateTab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeDateTab: { backgroundColor: 'white', elevation: 2 },
  dateTabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeDateTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2e7d32' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 4, marginHorizontal: 10, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchRow: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 5 },
  searchBar: { flex: 1, backgroundColor: '#e0e0e0', paddingHorizontal: 10, borderRadius: 5, flexDirection: 'row', alignItems: 'center', height: 36 },
  input: { flex: 1, marginLeft: 5, fontSize: 15, color: 'black' },

  contentContainer: { padding: 5, paddingBottom: 100 },

  // Card
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
  hospitalName: { fontWeight: 'bold', fontSize: 16, width: '75%', color: '#333' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: 'center' },
  addressText: { color: 'gray', fontSize: 12, marginBottom: 10 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 70, color: 'gray', fontSize: 12, fontWeight: '600' },
  value: { color: '#333', fontSize: 13, fontWeight: '500', flex: 1 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { color: 'gray', fontSize: 12 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, width: '90%', maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', width: '85%' },
  sectionHeader: { fontSize: 12, fontWeight: 'bold', color: '#999', marginTop: 15, marginBottom: 5 },
  resolveBtn: { backgroundColor: '#d32f2f', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: 'bold' },
  actionInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, height: 80, textAlignVertical: 'top', marginBottom: 10, backgroundColor: '#f9f9f9' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation: 10 },
  pickerHeader: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#3b5998', textAlign: 'center' },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});