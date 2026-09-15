import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
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

// 🔥 SAAS IMPORTS (kept for parity, not used for writes anymore)
import { useData } from './context/DataContext';
// 🔥 Phase 6: advances now via new backend API
import { createAdvance } from '../services/api/advances';

export default function AddAdvanceScreen() {
  const router = useRouter();
  
  const { currentUser, addNotification } = useData();

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // 🔥 SAVE LOGIC — via new backend API
  const handleSave = async () => {
      if (!amount || !reason) {
          Alert.alert("Missing Fields", "Please enter Amount and Reason.");
          return;
      }

      setLoading(true);
      try {
          await createAdvance({
              amount: parseFloat(amount),
              reason,
              date: date.toISOString(),
          });

          if (addNotification) {
              await addNotification({
                  title: "New Advance Request 💰",
                  message: `${currentUser?.name} requested ₹${amount} advance.`,
                  to: "Accountant",
                  route: "/advance", 
                  type: "warning"
              });
          }

          Alert.alert("Success", "Advance Request Sent & Admin Notified!");
          router.back();
      } catch (e: any) {
          Alert.alert("Error", e?.message || "Something went wrong.");
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
        <Text style={styles.headerTitle}>Request Advance</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{flex: 1}}
      >
        <ScrollView 
            style={styles.contentContainer} 
            contentContainerStyle={{paddingBottom: 100}} 
            keyboardShouldPersistTaps="handled"
        >
            
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

            <Text style={styles.label}>Amount Required (₹) *</Text>
            <TextInput 
                style={styles.inputBox} 
                value={amount} 
                onChangeText={setAmount} 
                keyboardType="numeric"
                placeholder="Ex: 5000"
            />

            <Text style={styles.label}>Reason / Remark *</Text>
            <TextInput 
                style={[styles.inputBox, {height: 100, textAlignVertical:'top'}]} 
                value={reason} 
                onChangeText={setReason} 
                multiline
                placeholder="Why do you need advance?"
            />

            <TouchableOpacity 
                style={[styles.saveBtn, loading && { opacity: 0.6 }]} 
                onPress={handleSave} 
                disabled={loading}
            >
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
