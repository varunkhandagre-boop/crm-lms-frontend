import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
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

// 🔥 SAAS IMPORTS
import { useData } from './context/DataContext';

// 🔥 Phase 8: visiting card requests now go to Postgres via this adapter
import { createVisitingCardRequest } from '../services/api/visitingCards';

export default function AddVisitingCardScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se User aur Notification engine (cardRequestList ab zaroori nahi —
  // reqId ab server-side generate hota hai, is FY ke count se)
  const { currentUser, addNotification } = useData();

  // --- FORM DATA ---
  const [shippingAddress, setShippingAddress] = useState('');
  const [loading, setLoading] = useState(false); 
  
  // --- DYNAMIC TABLE STATE ---
  const [rows, setRows] = useState([
    { id: 1, type: 'Select Request Type', quantity: '' }
  ]);

  // --- MODAL STATES ---
  const [modalVisible, setModalVisible] = useState(false);
  const [currentRowId, setCurrentRowId] = useState<number | null>(null);

  const requestTypes = [
    "Visiting Card", "Service Report", "Delivery Challan", "Receipt Book", "Letterhead",
    "Catalog", "Catalog (Manual Entry)", "Others"
  ];

  const handleAddRow = () => {
    const newId = rows.length > 0 ? rows[rows.length - 1].id + 1 : 1;
    setRows([...rows, { id: newId, type: 'Select Request Type', quantity: '' }]);
  };

  const handleDeleteRow = (id: number) => {
    if (rows.length === 1) {
        Alert.alert("Warning", "At least one item is required.");
        return;
    }
    setRows(rows.filter(row => row.id !== id));
  };

  const openSelectionModal = (id: number) => {
    setCurrentRowId(id);
    setModalVisible(true);
  };

  const handleSelectType = (item: string) => {
    setRows(rows.map(row => row.id === currentRowId ? { ...row, type: item } : row));
    setModalVisible(false);
  };

  const handleQuantityChange = (text: string, id: number) => {
    setRows(rows.map(row => row.id === id ? { ...row, quantity: text } : row));
  };

  const handleManualTypeChange = (text: string, id: number) => {
    setRows(rows.map(row => row.id === id ? { ...row, customType: text } : row));
  };

  // 🔥 3. SAAS SAVE LOGIC — Phase 8: posts to Postgres; server generates reqId
  const handleSave = async () => {
      if (!shippingAddress) {
          Alert.alert("Required", "Please enter shipping address.");
          return;
      }
      
      const isValid = rows.every(r => (r.type !== 'Select Request Type') && r.quantity !== '');
      if (!isValid) {
          Alert.alert("Incomplete", "Please select type and quantity for all rows.");
          return;
      }

      setLoading(true); 

      try {
          // Prepare final items list
          const finalItems = rows.map(r => ({
              type: r.type === 'Catalog (Manual Entry)' ? (r as any).customType || 'Manual Catalog' : r.type,
              quantity: r.quantity
          }));

          const res = await createVisitingCardRequest({ shippingAddress, items: finalItems });

          if (res.success) {
              // 🔥 REAL PUSH NOTIFICATION
              if (addNotification) {
                  const itemSummary = finalItems.map(i => `${i.type} (${i.quantity})`).join(', ');
                  await addNotification({
                      title: "New Stationery Request 📇",
                      message: `${currentUser?.name} requested: ${itemSummary}.`,
                      to: "Admin", // Ya 'Store'
                      route: "/visiting_cards",
                      type: "warning"
                  });
              }

              Alert.alert("Success", "Request Submitted & Admin Notified!");
              router.back();
          } else {
              Alert.alert("Error", "Could not submit request.");
          }
      } catch (error) {
          Alert.alert("Error", "Could not submit request. Try again.");
      } finally {
          setLoading(false); 
      }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Request</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{flex: 1}}
      >
        <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
            
            {/* User Info */}
            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>User</Text>
                    <TextInput style={styles.inputDisabled} value={currentUser?.name || 'N/A'} editable={false} />
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Mobile</Text>
                    <TextInput style={styles.inputDisabled} value={currentUser?.mobile || 'N/A'} editable={false} />
                </View>
            </View>

            {/* Address */}
            <Text style={styles.label}>Shipping Address</Text>
            <TextInput 
                style={[styles.inputGray, {height: 80, textAlignVertical:'top'}]} 
                multiline 
                value={shippingAddress}
                onChangeText={setShippingAddress}
                placeholder="Enter address..."
            />

            {/* --- TABLE --- */}
            <Text style={styles.tableTitle}>Request Items</Text>
            
            <View style={styles.tableHeader}>
                <Text style={[styles.headerText, {width: '15%', textAlign:'center'}]}>Action</Text>
                <Text style={[styles.headerText, {width: '60%'}]}>Request Type</Text>
                <Text style={[styles.headerText, {width: '25%'}]}>Qty</Text>
            </View>

            {rows.map((row) => (
                <View key={row.id} style={styles.tableRow}>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteRow(row.id)}>
                        <Ionicons name="trash" size={18} color="#d32f2f" />
                    </TouchableOpacity>

                    <View style={{width: '60%', paddingRight: 5}}>
                        {row.type === 'Catalog (Manual Entry)' ? (
                            <View style={styles.manualInputWrapper}>
                                 <TextInput 
                                    style={styles.manualInput} 
                                    placeholder="Type Name" 
                                    autoFocus={true}
                                    onChangeText={(text) => handleManualTypeChange(text, row.id)}
                                 />
                                 <TouchableOpacity onPress={() => {
                                     setRows(rows.map(r => r.id === row.id ? { ...r, type: 'Select Request Type' } : r));
                                 }}>
                                    <Ionicons name="close-circle" size={18} color="gray" />
                                 </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.dropdownInput} onPress={() => openSelectionModal(row.id)}>
                                <Text style={{color: row.type.includes('Select') ? 'gray' : 'black', fontSize: 13}} numberOfLines={1}>
                                    {row.type}
                                </Text>
                                <Ionicons name="caret-down" size={12} color="gray" />
                            </TouchableOpacity>
                        )}
                    </View>

                    <TextInput 
                        style={styles.qtyInput} 
                        keyboardType="numeric" 
                        placeholder="0"
                        value={row.quantity}
                        onChangeText={(text) => handleQuantityChange(text, row.id)}
                    />
                </View>
            ))}

            <TouchableOpacity style={styles.addRowBtn} onPress={handleAddRow}>
                <Text style={styles.addRowText}>+ Add Item</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.saveButton, loading && { opacity: 0.6 }]} 
                onPress={handleSave}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="white" size="small" />
                ) : (
                    <Text style={styles.saveBtnText}>Submit Request</Text>
                )}
            </TouchableOpacity>
            
            <View style={{height:50}} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Item</Text>
                <FlatList 
                    data={requestTypes}
                    keyExtractor={(item) => item}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectType(item)}>
                            <Text style={styles.modalItemText}>{item}</Text>
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
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  contentContainer: { padding: 20, paddingBottom: 100 },
  label: { marginBottom: 5, color:'#aaa', fontWeight:'600', fontSize:13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  col: { width: '48%' },
  inputDisabled: { backgroundColor: '#e0e0e0', borderRadius: 8, padding: 10, color:'gray' },
  inputGray: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, marginBottom: 20, fontSize:16 },
  tableTitle: { fontWeight:'bold', fontSize:16, marginBottom: 10 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#e0e0e0', padding: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  headerText: { fontWeight: 'bold', fontSize: 13, color: '#333' },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 10 },
  deleteBtn: { width: '15%', alignItems: 'center', justifyContent: 'center' },
  dropdownInput: { backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', borderRadius: 5, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  manualInputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#3b5998', borderRadius: 5, paddingHorizontal: 5 },
  manualInput: { flex: 1, paddingVertical: 8, fontSize: 13 },
  qtyInput: { width: '25%', borderWidth: 1, borderColor: '#ddd', borderRadius: 5, padding: 8, textAlign: 'center' },
  addRowBtn: { backgroundColor: '#e0e0e0', padding: 12, borderRadius: 5, marginTop: 10, alignItems:'center' },
  addRowText: { fontWeight: 'bold', color: '#333' },
  saveButton: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalItemText: { fontSize: 16, color: '#333' }
});
