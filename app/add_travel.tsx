import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

// 🔥🔥 1. FIREBASE IMPORTS ADDED
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig'; // ⚠️ Path check karein

export default function AddTravelScreen() {
  const router = useRouter();
  const { addTravelNote, user } = useData(); 

  // Form States
  const [date, setDate] = useState(new Date()); 
  const [showDatePicker, setShowDatePicker] = useState(false); 
  
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [mode, setMode] = useState('Select Mode');
  const [distance, setDistance] = useState('');
  const [amount, setAmount] = useState(''); // 🔥 NEW: Amount State
  const [purpose, setPurpose] = useState('');
  
  // Loading States
  const [locLoading, setLocLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  
  const modes = ["Bike", "Car", "Bus", "Train", "Flight", "Taxi/Cab"];

  // --- Date Format ---
  const formatDate = (rawDate: any) => {
    let d = new Date(rawDate);
    let day = d.getDate().toString().padStart(2, '0');
    let month = (d.getMonth() + 1).toString().padStart(2, '0');
    let year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  // --- AUTO LOCATION ---
  const getCurrentLocation = async () => {
    setLocLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission Denied", "Allow location to auto-fill.");
        setLocLoading(false);
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      let address = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      });

      if (address.length > 0) {
        const addr = address[0];
        setFromLoc(`${addr.city || ''}, ${addr.region || ''}`);
      }
    } catch (error) {
      Alert.alert("Error", "Could not fetch location.");
    } finally {
      setLocLoading(false);
    }
  };

  // --- SAVE FUNCTION ---
  const handleSave = async () => {
    // 🔥 Check if Amount is filled
    if (!fromLoc || !toLoc || !distance || !amount) {
        Alert.alert("Missing Fields", "Please fill From, To, Distance and Amount.");
        return;
    }

    setSaveLoading(true); 

    try {
        const newNote = {
            id: Date.now().toString(),
            timestamp: Date.now(), 
            date: formatDate(date), 
            rawDate: date.toISOString(), 
            from: fromLoc,
            to: toLoc,
            mode: mode === 'Select Mode' ? 'Bike' : mode,
            distance: distance,
            amount: amount, // 🔥 NEW: Saving Amount
            purpose: purpose || 'Official Visit',
            
            senderName: user?.name || 'Unknown Employee', 
            senderId: user?.uid || 'guest',
            organization: user?.organization || 'Global',
            status: 'Pending' 
        };

        await addTravelNote(newNote); 
        
        // 🔥🔥 2. NOTIFICATION TRIGGER ADDED 🔥🔥
        try {
            await addDoc(collection(db, "notifications"), {
                title: "New Travel Logged 🚴",
                message: `${user?.name} logged travel: ${fromLoc} to ${toLoc} (${distance} km).`,
                to: "Admin",
                route: "/travel",
                read: false,
                createdAt: new Date().toISOString(),
                type: "info"
            });
        } catch (e) {
            console.log("Notification Error:", e);
        }

        Alert.alert("Success", "Travel Note Added & Admin Notified!");
        router.back();
    } catch (error) {
        Alert.alert("Error", "Failed to save travel note.");
        console.error(error);
    } finally {
        setSaveLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Travel Note</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{flex: 1}}
      >
        <ScrollView 
            style={styles.contentContainer} 
            contentContainerStyle={{paddingBottom: 100}} 
        >
            
            {/* Date Picker */}
            <Text style={styles.label}>Date</Text>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.inputBox}>
                <Text style={{color: '#333'}}>{formatDate(date)}</Text>
                <Ionicons name="calendar-outline" size={20} color="#3b5998" />
            </TouchableOpacity>

            {showDatePicker && (
                <DateTimePicker
                    value={date}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange}
                />
            )}

            {/* From Location */}
            <Text style={styles.label}>From Location *</Text>
            <View style={styles.rowInput}>
                <TextInput 
                    style={[styles.inputBox, {flex:1, marginBottom:0}]} 
                    value={fromLoc} 
                    onChangeText={setFromLoc}
                    placeholder="Start Point"
                />
                <TouchableOpacity style={styles.gpsBtn} onPress={getCurrentLocation} disabled={locLoading}>
                    {locLoading ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="locate" size={22} color="white" />}
                </TouchableOpacity>
            </View>

            {/* To Location */}
            <Text style={styles.label}>To Location *</Text>
            <TextInput 
                style={styles.inputBox} 
                value={toLoc} 
                onChangeText={setToLoc}
                placeholder="End Point / Client Name"
            />

            {/* Mode & Distance Row */}
            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Mode</Text>
                    <TouchableOpacity style={styles.inputBox} onPress={() => setModalVisible(true)}>
                        <Text style={{color: mode === 'Select Mode' ? 'gray' : 'black'}}>{mode}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Distance (Km) *</Text>
                    <TextInput 
                        style={styles.inputBox} 
                        value={distance} 
                        onChangeText={setDistance}
                        keyboardType="numeric"
                        placeholder="0"
                    />
                </View>
            </View>

            {/* 🔥 NEW: Amount Field */}
            <Text style={styles.label}>Total Amount (₹) *</Text>
            <TextInput 
                style={styles.inputBox} 
                value={amount} 
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="Total Expense (e.g. 500)"
            />

            {/* Purpose */}
            <Text style={styles.label}>Purpose / Remark</Text>
            <TextInput 
                style={[styles.inputBox, {height: 80, textAlignVertical:'top'}]} 
                value={purpose} 
                onChangeText={setPurpose}
                multiline
                placeholder="Reason for travel..."
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saveLoading}>
                {saveLoading ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text style={styles.saveBtnText}>Save Note</Text>
                )}
            </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Mode Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Travel Mode</Text>
                {modes.map((item) => (
                    <TouchableOpacity key={item} style={styles.modalItem} onPress={() => { setMode(item); setModalVisible(false); }}>
                        <Text style={styles.modalItemText}>{item}</Text>
                    </TouchableOpacity>
                ))}
                 <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                    <Text style={{color:'red', fontWeight:'bold'}}>Close</Text>
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
  label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13, marginTop:10 },
  inputBox: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, fontSize:16, marginBottom: 10 },
  rowInput: { flexDirection:'row', alignItems:'center', marginBottom:10 },
  gpsBtn: { backgroundColor:'#3b5998', padding:12, borderRadius:8, marginLeft:10, justifyContent:'center', alignItems:'center', height: 50, width: 50 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
  saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#3b5998', textAlign:'center' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalItemText: { fontSize: 16, color: '#333' },
  closeBtn: { marginTop:15, alignItems:'center', padding:10 }
});