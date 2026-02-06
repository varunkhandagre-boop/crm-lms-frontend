import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useData } from './context/DataContext';

// 🔥 FIREBASE IMPORTS FOR EMPLOYEES
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function InstallationListScreen() {
  const router = useRouter();
  const { installList, user } = useData();

  // --- STATES ---
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year' | 'All'>('Year');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [selectedItem, setSelectedItem] = useState<any>(null); 
  const [modalVisible, setModalVisible] = useState(false);

  // --- NEW: EMPLOYEE FILTER STATES ---
  const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  // 🔥 Role Check
  const isAdmin = ['Admin', 'Manager', 'Hr', 'Account', 'Accountant'].includes(user?.role || '');

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

  // --- SORTING & FILTER LOGIC ---
  const getSortedAndFilteredData = () => {
    let data = installList ? [...installList] : [];

    // 1. Admin Employee Filter (Based on your Firebase Data)
    if (isAdmin && selectedEmployee !== 'All') {
      
      // Naam ko lowercase aur trim karein taaki matching pakki ho
      const targetName = selectedEmployeeName ? selectedEmployeeName.toLowerCase().trim() : '';

      data = data.filter((item: any) => {
        // A. ID Check (Agar ID match ho jaye)
        if (item.senderId === selectedEmployee) return true;

        // B. Name Check (Yahan Data Match Hoga)
        
        // 1. Check Engineer (Jaise: "Niraj")
        if (item.engineer && item.engineer.toLowerCase().trim() === targetName) return true;

        // 2. Check Sender Name (Jaise: "Satish Dhote")
        if (item.senderName && item.senderName.toLowerCase().trim() === targetName) return true;

        // 3. Check User Name (Backup)
        if (item.userName && item.userName.toLowerCase().trim() === targetName) return true;

        return false;
      });
    } 
    
    // 2. Regular Employee Filter (Agar Admin nahi hai)
    else if (!isAdmin) {
      data = data.filter((item: any) => 
          item.senderId === user?.uid || 
          (item.engineer && item.engineer.toLowerCase() === user?.name?.toLowerCase())
      );
    }

    if (searchText) {
      const term = searchText.toLowerCase();
      data = data.filter((item: any) => {
        const fullString = `
          ${item.hospital || ''}
          ${item.orgName || ''}
          ${item.serialNo || ''}
          ${item.product || ''}
          ${item.productName || ''}
          ${item.model || ''}
          ${item.senderName || ''}
          ${item.department || ''}
          ${item.city || ''}
        `.toLowerCase();
        return fullString.includes(term);
      });
    }

    if (viewMode !== 'All') {
      const targetYear = currentDate.getFullYear();
      const targetMonth = currentDate.getMonth();
      const targetDay = currentDate.getDate();

      data = data.filter((item: any) => {
        const dateField = item.createdAt || item.date;
        if (!dateField) return false;
        const ts = parseDate(dateField);
        if (ts === 0) return false;
        const itemDate = new Date(ts);

        if (viewMode === 'Year') return itemDate.getFullYear() === targetYear;
        if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
        if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
        return true;
      });
    }

    data.sort((a: any, b: any) => {
      const dateA = parseDate(a.createdAt || a.date);
      const dateB = parseDate(b.createdAt || b.date);
      return dateB - dateA;
    });

    return data;
  };

  const displayList = getSortedAndFilteredData();

  const openDetails = (item: any) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const getWarrantyStatus = (expiryDate: string) => {
    if (!expiryDate) return { label: 'No Date', color: 'gray' };
    const ts = parseDate(expiryDate);
    if (ts === 0) return { label: 'Invalid', color: 'gray' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(ts);
    expiry.setHours(0, 0, 0, 0);

    if (expiry.getTime() < today.getTime()) {
      return { label: 'Expired', color: '#d32f2f' };
    } else {
      return { label: 'Active', color: '#2e7d32' };
    }
  };

  const renderItem = ({ item, index }: any) => {
    const warranty = getWarrantyStatus(item.warrantyExpiry);
    const isNewEntry = !searchText && index < 3;

    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.hospitalName}>{item.orgName || item.hospital}</Text>
              {isNewEntry && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>🆕 NEW</Text>
                </View>
              )}
            </View>
            
            {/* 🔥 CITY ADDED HERE */}
            {item.city ? (
                <Text style={{fontSize: 11, color: 'gray', marginBottom: 3}}>
                    <Ionicons name="location-outline" size={11} color="gray" /> {item.city}
                </Text>
            ) : null}

            {/* 🔥 PRODUCT & MODEL */}
            <Text style={styles.productName}>{item.product || item.productName}</Text>
            {item.model ? <Text style={{fontSize:11, color:'gray', marginTop:2}}>Model: {item.model}</Text> : null}
            
          </View>
          <View style={[styles.statusBadge, { backgroundColor: warranty.color + '20' }]}>
            <Text style={{ color: warranty.color, fontWeight: 'bold', fontSize: 10 }}>{warranty.label}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.infoBox}>
            <Text style={styles.label}>Serial No</Text>
            <Text style={styles.value}>{item.serialNo}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.label}>Install Date</Text>
            <Text style={styles.value}>{item.date}</Text>
          </View>
        </View>

        <View style={{ height: 5 }} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Eng: {item.engineer}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="person-circle-outline" size={14} color="#3b5998" />
            <Text style={[styles.footerText, { color: '#3b5998', marginLeft: 2 }]}>
              Ad: {item.senderName || 'Unknown'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Installation Reports</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_installation')}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {/* FILTER UI */}
      <View style={{ backgroundColor: 'white', paddingBottom: 10 }}>
        <View style={styles.tabContainer}>
          {['Day', 'Month', 'Year', 'All'].map((m) => (
            <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
              <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isAdmin && (
          <View style={{ paddingHorizontal: 15, marginBottom: 10 }}>
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

        {viewMode !== 'All' && (
          <View style={styles.dateNav}>
            <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
            <Text style={styles.monthText}>{getHeaderDate()}</Text>
            <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
          </View>
        )}

        <View style={{ paddingHorizontal: 15 }}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="gray" />
            <TextInput
              style={styles.input}
              placeholder="Search Hospital, Serial, Product..."
              value={searchText}
              onChangeText={setSearchText}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={20} color="gray" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={{ textAlign: 'right', fontSize: 12, color: 'gray', marginTop: 5 }}>
            Total: <Text style={{ fontWeight: 'bold', color: 'green' }}>{displayList.length}</Text> Records
          </Text>
        </View>
      </View>

      {/* LIST */}
      <FlatList
        data={displayList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 5, paddingBottom: 50 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            <Ionicons name="cube-outline" size={60} color="#ddd" />
            <Text style={{ textAlign: 'center', marginTop: 10, color: 'gray' }}>No Installations Found</Text>
          </View>
        }
      />

      {/* DETAILS MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={styles.modalTitle}>Installation Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#d32f2f" />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <View>
                <DetailRow label="Hospital" value={selectedItem.orgName || selectedItem.hospital} icon="business" />
                {/* 🔥 CITY ADDED HERE TOO */}
                <DetailRow label="City" value={selectedItem.city} icon="location" />
                
                <DetailRow label="Department" value={selectedItem.department || 'N/A'} icon="medkit" />
                <DetailRow label="Engineer" value={selectedItem.engineer} icon="construct" />

                <View style={styles.divider} />

                <Text style={styles.sectionHeader}>Machine Details</Text>
                <DetailRow label="Product" value={selectedItem.product || selectedItem.productName} icon="cube" />
                {/* 🔥 MODEL ADDED HERE TOO */}
                <DetailRow label="Model" value={selectedItem.model} icon="hardware-chip" />
                <DetailRow label="Serial No" value={selectedItem.serialNo} icon="barcode" highlight />

                <View style={styles.divider} />

                <Text style={styles.sectionHeader}>Warranty Info</Text>
                <DetailRow label="Installed On" value={selectedItem.date} icon="calendar" />
                <DetailRow label="Warranty Expiry" value={selectedItem.warrantyExpiry} icon="hourglass" color="#d32f2f" />

                <View style={styles.divider} />
                <DetailRow label="Entry By" value={selectedItem.senderName || 'Unknown'} icon="person" />

                {selectedItem.note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Accessories / Notes:</Text>
                    <Text style={styles.noteText}>{selectedItem.note}</Text>
                  </View>
                ) : null}
              </View>
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

// Helper Component
const DetailRow = ({ label, value, icon, highlight, color }: any) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
    <View style={{ width: 30 }}><Ionicons name={icon} size={18} color={highlight ? "#3b5998" : "gray"} /></View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: 'gray' }}>{label}</Text>
      <Text style={{
        fontSize: 14,
        fontWeight: highlight ? 'bold' : '500',
        color: color || '#333'
      }}>{value || '-'}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, paddingTop: 50, backgroundColor: 'white', elevation: 0 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  addBtn: { flexDirection: 'row', backgroundColor: '#3b5998', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignItems: 'center' },
  addBtnText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },

  // Filter UI
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 10, borderRadius: 8, padding: 2, marginBottom: 5 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2e7d32' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 4, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 36 },
  input: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  // Card Styles
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  productName: { fontSize: 13, color: '#3b5998', marginTop: 2, fontWeight: '600' },
  statusBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },

  newBadge: { backgroundColor: '#ffeb3b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  newBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#f57f17' },

  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  infoBox: { width: '48%' },
  label: { fontSize: 11, color: 'gray', marginBottom: 2 },
  value: { fontSize: 13, color: '#333', fontWeight: '500' },

  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, borderTopWidth: 1, borderTopColor: '#f5f5f5', paddingTop: 5 },
  footerText: { fontSize: 11, color: 'gray' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
  sectionHeader: { fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 10, marginBottom: 10, textDecorationLine: 'underline' },

  noteBox: { backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, marginTop: 15, borderWidth: 1, borderColor: '#eee' },
  noteLabel: { fontSize: 12, fontWeight: 'bold', color: '#3b5998', marginBottom: 5 },
  noteText: { fontSize: 13, color: '#333', fontStyle: 'italic' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation: 10 },
  pickerHeader: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#3b5998', textAlign: 'center' },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});