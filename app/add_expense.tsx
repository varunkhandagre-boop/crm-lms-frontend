import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
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

// 🔥 SAAS IMPORTS (kept for parity, not used for writes anymore)
import { useData } from './context/DataContext';
// 🔥 Phase 6: expenses now via new backend API
import { createExpense } from '../services/api/expenses';

export default function AddExpenseScreen() {
  const router = useRouter();
  
  const { currentUser, addNotification } = useData();

  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [type, setType] = useState('Select Type');
  const [amount, setAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const expenseTypes = ["Travel", "Food", "Lodging/Hotel", "Fuel", "Mobile/Internet", "Office Stationary", "Misc"];

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const pickImage = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
          Alert.alert("Permission Denied", "Camera access is needed to upload bills.");
          return;
      }

      let result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false, 
          quality: 0.5,
      });

      if (!result.canceled) {
          setImage(result.assets[0].uri);
      }
  };

  // 🔥 SAVE LOGIC — via new backend API. Note: imageUri is passed through as
  // a local file URI only — it isn't uploaded to Supabase Storage yet, same
  // known gap as Order PO files and Service Call photos.
  const handleSave = async () => {
      if (type === 'Select Type' || !amount) {
          Alert.alert("Missing Fields", "Please select Type and enter Amount.");
          return;
      }

      setLoading(true);
      try {
          await createExpense({
              date: date.toISOString(),
              type,
              amount: parseFloat(amount) || 0,
              remark,
              imageUri: image || undefined,
          });

          if (addNotification) {
              await addNotification({
                  title: "New Expense Claim 💸",
                  message: `${currentUser?.name} claimed ₹${amount} for ${type}.`,
                  to: "Accountant",
                  route: "/expense",
                  type: "warning"
              });
          }

          Alert.alert("Success", "Expense Claim Submitted & Admin Notified!");
          router.back();
      } catch (e: any) {
          Alert.alert("Error", e?.message || "Could not submit claim.");
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
        <Text style={styles.headerTitle}>New Expense Claim</Text>
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
            
            <Text style={styles.label}>Date</Text>
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

            <Text style={styles.label}>Expense Type *</Text>
            <TouchableOpacity style={styles.inputBox} onPress={() => setModalVisible(true)}>
                <Text style={{color: type === 'Select Type' ? 'gray' : 'black'}}>{type}</Text>
                <Ionicons name="caret-down" size={14} color="gray" />
            </TouchableOpacity>

            <Text style={styles.label}>Amount (₹) *</Text>
            <TextInput 
                style={styles.inputBox} 
                value={amount} 
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0.00"
            />

            <Text style={styles.label}>Description / Remark</Text>
            <TextInput 
                style={[styles.inputBox, {height: 80, textAlignVertical:'top'}]} 
                value={remark} 
                onChangeText={setRemark}
                multiline
                placeholder="Details..."
            />

            <Text style={styles.label}>Upload Bill / Ticket</Text>
            <View style={styles.uploadContainer}>
                {image ? (
                    <View>
                        <Image source={{ uri: image }} style={styles.previewImage} />
                        <TouchableOpacity style={styles.removeBtn} onPress={() => setImage(null)}>
                            <Ionicons name="trash" size={18} color="white" />
                            <Text style={{color:'white', fontSize:12, marginLeft:5}}>Remove</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.cameraBtn} onPress={pickImage}>
                        <Ionicons name="camera" size={30} color="#3b5998" />
                        <Text style={{color:'#3b5998', fontWeight:'bold', marginTop:5}}>Take Photo</Text>
                    </TouchableOpacity>
                )}
            </View>

            <TouchableOpacity 
                style={[styles.saveBtn, loading && { opacity: 0.6 }]} 
                onPress={handleSave} 
                disabled={loading}
            >
                {loading ? <ActivityIndicator color="white"/> : <Text style={styles.saveBtnText}>Submit Claim</Text>}
            </TouchableOpacity>
            
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Type</Text>
                <FlatList 
                    data={expenseTypes}
                    keyExtractor={item => item}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => { setType(item); setModalVisible(false); }}>
                            <Text style={styles.modalItemText}>{item}</Text>
                            {type === item && <Ionicons name="checkmark" size={20} color="#3b5998" />}
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
  
  uploadContainer: { marginTop: 5, marginBottom: 10 },
  cameraBtn: { height: 120, borderWidth: 1, borderColor: '#3b5998', borderStyle: 'dashed', borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef2ff' },
  previewImage: { width: '100%', height: 200, borderRadius: 10, resizeMode: 'cover' },
  removeBtn: { position:'absolute', bottom: 10, right: 10, backgroundColor:'red', flexDirection:'row', padding:8, borderRadius:5, alignItems:'center' },

  saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight:'60%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#3b5998', textAlign:'center' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection:'row', justifyContent:'space-between' },
  modalItemText: { fontSize: 16, color: '#333' },
  closeBtn: { marginTop:15, alignItems:'center', padding:10 }
});
