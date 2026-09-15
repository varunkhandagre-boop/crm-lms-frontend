import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

import { useData } from './context/DataContext';

// 🔥 Phase 7: leaves now go to Postgres via this adapter instead of addSaaSData("leaves", ...)
import { applyLeave } from '../services/api/leaves';

export default function AddLeaveScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se Current User aur Notification Engine nikala
  const { currentUser, addNotification } = useData();

  // States
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [type, setType] = useState('Select Leave Type');
  const [days, setDays] = useState('1'); // Auto Calculated
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  
  const leaveTypes = [
      "Compensatory Off", "Leave Without Pay", "Sick Leave", 
      "Casual Leave", "Regional Festival", "Earned Leave", "Marriage Leave", "Others" 
  ];

  // DATE FORMATTER
  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // --- ⚡ AUTO CALCULATE DAYS LOGIC ---
  useEffect(() => {
    if(fromDate && toDate) {
        // Reset hours for accurate day calculation
        const start = new Date(fromDate); start.setHours(0,0,0,0);
        const end = new Date(toDate); end.setHours(0,0,0,0);
        
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        const total = diffDays + 1; // Include start date

        if(total > 0) {
            setDays(total.toString());
        } else {
            setDays('Invalid'); // End date before Start date
        }
    }
  }, [fromDate, toDate]);

  // 🔥 3. SAAS SAVE LOGIC (Phase 7: now calls the Postgres API adapter directly)
  const handleSave = async () => {
      if (type === 'Select Leave Type' || !reason) {
          Alert.alert("Missing Fields", "Please select Type and enter Reason.");
          return;
      }
      if (days === 'Invalid' || parseInt(days) <= 0) {
          Alert.alert("Invalid Dates", "To Date must be same or after From Date.");
          return;
      }

      setLoading(true);
      try {
          // 🔥 Phase 7: applyLeave() posts to /api/v1/leaves — server derives company_id,
          // user_id and role from the authenticated request; it also recalculates `days`
          // server-side, so this is treated as a display-only echo of the local calc.
          const result = await applyLeave({
              fromDate: fromDate.toISOString().split('T')[0],
              toDate: toDate.toISOString().split('T')[0],
              type: type,
              reason: reason,
          });
          
          if (result.success) {
              // 🔥 5. REAL PUSH NOTIFICATION
              if (addNotification) {
                  await addNotification({
                      title: "New Leave Application 📅",
                      message: `${currentUser?.name} applied for ${days} day(s) leave (${type}).`,
                      to: "Admin", // Manager ya HR ko bhi set kar sakte hain future me
                      route: "/leave",
                      type: "alert" // High priority
                  });
              }

              Alert.alert("Success", `Applied for ${days} Day(s) Leave & Admin Notified!`);
              router.back();
          } else {
              Alert.alert("Error", "Could not apply leave.");
          }
      } catch (e) {
          Alert.alert("Error", "Could not apply leave.");
          console.error(e);
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
        <Text style={styles.headerTitle}>New Leave Application</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{flex: 1}}
      >
        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}} keyboardShouldPersistTaps="handled">
            
            {/* Type Dropdown */}
            <Text style={styles.label}>Leave Type <Text style={{color:'red'}}>*</Text></Text>
            <TouchableOpacity style={styles.inputBox} onPress={() => setModalVisible(true)}>
                <Text style={{color: type === 'Select Leave Type' ? 'gray' : 'black'}}>{type}</Text>
                <Ionicons name="caret-down" size={14} color="gray" />
            </TouchableOpacity>

            {/* Dates Row */}
            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>From Date</Text>
                    <TouchableOpacity style={styles.inputBox} onPress={() => setShowFromPicker(true)}>
                        <Text style={{flex:1}}>{formatDate(fromDate)}</Text>
                        <Ionicons name="calendar-outline" size={18} color="gray" />
                    </TouchableOpacity>
                    {showFromPicker && (
                        <DateTimePicker 
                            value={fromDate} mode="date" 
                            onChange={(e, d) => { setShowFromPicker(false); if(d) setFromDate(d); }} 
                        />
                    )}
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>To Date</Text>
                    <TouchableOpacity style={styles.inputBox} onPress={() => setShowToPicker(true)}>
                        <Text style={{flex:1}}>{formatDate(toDate)}</Text>
                        <Ionicons name="calendar-outline" size={18} color="gray" />
                    </TouchableOpacity>
                    {showToPicker && (
                        <DateTimePicker 
                            value={toDate} mode="date" minimumDate={fromDate}
                            onChange={(e, d) => { setShowToPicker(false); if(d) setToDate(d); }} 
                        />
                    )}
                </View>
            </View>

            {/* Total Days (Auto Calculated) */}
            <Text style={styles.label}>Total Days (Auto-Calculated)</Text>
            <View style={[styles.inputBox, {backgroundColor:'#e0e0e0'}]}> 
                <Text style={{flex:1, color: days === 'Invalid' ? 'red' : 'black', fontWeight:'bold'}}>
                    {days}
                </Text>
                <Text style={{fontSize:12, color:'gray'}}>Days</Text>
            </View>

            {/* Reason */}
            <Text style={styles.label}>Reason <Text style={{color:'red'}}>*</Text></Text>
            <TextInput 
                style={[styles.inputBox, {height: 100, textAlignVertical:'top'}]} 
                value={reason} 
                onChangeText={setReason}
                multiline
                placeholder="Reason for leave..."
            />

            {/* SUBMIT BUTTON WITH BLUR EFFECT */}
            <TouchableOpacity 
                style={[styles.saveBtn, loading && { opacity: 0.6 }]} 
                onPress={handleSave} 
                disabled={loading}
            >
                {loading ? <ActivityIndicator color="white"/> : <Text style={styles.saveBtnText}>Apply</Text>}
            </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Type Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Leave Type</Text>
                <FlatList 
                    data={leaveTypes}
                    keyExtractor={item => item}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => { setType(item); setModalVisible(false); }}>
                            <Text style={styles.modalItemText}>{item}</Text>
                            {type === item && <Ionicons name="checkmark" size={18} color="#3b5998" />}
                        </TouchableOpacity>
                    )}
                />
                <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                    <Text style={{color:'red'}}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  contentContainer: { padding: 20 },
  label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13, marginTop:15 },
  inputBox: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, fontSize:16 },
  row: { flexDirection:'row', justifyContent:'space-between' },
  col: { width:'48%' },
  saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#3b5998', textAlign:'center' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection:'row', justifyContent:'space-between' },
  modalItemText: { fontSize: 16, color: '#333' },
  closeBtn: { marginTop:15, alignItems:'center', padding:10 }
});
