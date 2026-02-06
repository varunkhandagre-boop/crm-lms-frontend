import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker'; // 🔥 Golden Rule: Calendar
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

export default function AddAdvanceScreen() {
  const router = useRouter();
  
  // 🔥 GET DATA & USER INFO
  const { addAdvance, user } = useData();

  // STATES
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // 🔥 DATE PICKER STATE
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // DATE FORMATTER
  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleSave = async () => {
      if (!amount || !reason) {
          Alert.alert("Missing Fields", "Please enter Amount and Reason.");
          return;
      }

      setLoading(true);
      try {
          const newEntry = {
              id: Date.now().toString(),
              
              date: formatDate(date), // Display Date
              dateIso: date.toISOString().split('T')[0], // Sorting Date
              
              amount: amount,
              reason: reason,
              status: 'Pending', // Default Pending
              
              // SECURITY METADATA
              senderId: user?.uid || 'guest',
              senderName: user?.name || 'Unknown',
              role: user?.role || 'Employee',
              createdAt: new Date().toISOString()
          };

          await addAdvance(newEntry);
          
          // 🔥🔥 2. NOTIFICATION TRIGGER ADDED 🔥🔥
          try {
              await addDoc(collection(db, "notifications"), {
                  title: "New Advance Request 💰",
                  message: `${user?.name} requested ₹${amount} advance.`,
                  to: "Admin",
                  route: "/advance", // Click karne par Advance page khulega
                  read: false,
                  createdAt: new Date().toISOString(),
                  type: "warning"
              });
          } catch (e) {
              console.log("Notification Error:", e);
          }

          Alert.alert("Success", "Advance Request Sent & Admin Notified!");
          router.back();
      } catch (e) {
          Alert.alert("Error", "Could not submit request.");
      } finally {
          setLoading(false);
      }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Advance</Text>
        <View style={{width:24}} /> 
      </View>

      {/* Keyboard Avoiding View */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{flex: 1}}
      >
        <ScrollView 
            style={styles.contentContainer} 
            contentContainerStyle={{paddingBottom: 100}} 
        >
            
            {/* 🔥 DATE PICKER */}
            <Text style={styles.label}>Date Required</Text>
            <TouchableOpacity style={styles.inputBox} onPress={() => setShowDatePicker(true)}>
                <Text style={{flex:1, color:'#333'}}>{formatDate(date)}</Text>
                <Ionicons name="calendar-outline" size={20} color="gray" />
            </TouchableOpacity>
            
            {showDatePicker && (
                <DateTimePicker 
                    value={date} 
                    mode="date" 
                    onChange={(e, d) => { setShowDatePicker(false); if(d) setDate(d); }} 
                />
            )}

            {/* Amount */}
            <Text style={styles.label}>Amount Required (₹) *</Text>
            <TextInput 
                style={styles.inputBox} 
                value={amount} 
                onChangeText={setAmount} 
                keyboardType="numeric"
                placeholder="Ex: 5000"
            />

            {/* Reason */}
            <Text style={styles.label}>Reason / Remark *</Text>
            <TextInput 
                style={[styles.inputBox, {height: 100, textAlignVertical:'top'}]} 
                value={reason} 
                onChangeText={setReason} 
                multiline
                placeholder="Why do you need advance?"
            />

            {/* Submit */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Submit Request</Text>}
            </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  contentContainer: { padding: 20 },
  label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13, marginTop:15 },
  inputBox: { flexDirection:'row', alignItems:'center', backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, fontSize:16 },
  saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
});