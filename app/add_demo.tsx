import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection } from 'firebase/firestore';
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
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

export default function AddDemoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  
  const { addDemo, orgList, user, updateActivityStatus, productList = [] } = useData();

  // --- STATES ---
  const [hospital, setHospital] = useState('');
  const [department, setDepartment] = useState('');
  
  // AUTO-FILL STATES
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  const [demoDate, setDemoDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // PRODUCT DETAILS
  const [product, setProduct] = useState('');
  const [model, setModel] = useState('');
  const [serialNo, setSerialNo] = useState('');

  const [contactPerson, setContactPerson] = useState(''); 
  const [designation, setDesignation] = useState(''); 
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');

  const [duration, setDuration] = useState(''); 
  const [result, setResult] = useState(''); 
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);

  // --- MODAL STATE ---
  const [modalVisible, setModalVisible] = useState(false);
  const [currentModalType, setCurrentModalType] = useState('');
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]);

  // 🔥 1. GET UNIQUE PRODUCT NAMES
  const getUniqueProductNames = () => {
      const names = productList.map((p: any) => p.name);
      return [...new Set(names), 'Other'];
  };

  // 🔥 2. GET MODELS FOR SELECTED PRODUCT
  const getModelOptions = () => {
      if (!product || product === 'Other') return ['Other'];
      
      const models = productList
          .filter((p: any) => p.name === product && p.model)
          .map((p: any) => p.model);
          
      return [...new Set(models), 'Other'];
  };

  useEffect(() => {
      if (params.hospital) {
          setHospital(params.hospital as string);
          if(orgList.length > 0) {
             const found = orgList.find((o:any) => (o.orgName === params.hospital || o.name === params.hospital));
             if(found) selectOrganization(found);
          }
      }
  }, [params, orgList]);

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // 🔥 LOCATION LOGIC
  const getCurrentLocation = async () => {
      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Location access is required to save entry.');
              return null;
          }
          let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          return {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
              timestamp: new Date().toISOString()
          };
      } catch (error) {
          Alert.alert("GPS Required", "Please turn on your GPS Location to submit.");
          return null;
      }
  };

  const selectOrganization = (orgItem: any) => {
      setHospital(orgItem.orgName || orgItem.name || '');
      setAddress(orgItem.address || orgItem.address1 || orgItem.location || ''); 
      setCity(orgItem.city || '');
      setContactPerson(orgItem.contactPerson || '');
      setDesignation(orgItem.designation || ''); 
      setContactNumber(orgItem.mobile || orgItem.phone || ''); 
      setEmail(orgItem.email || '');
      setModalVisible(false);
  };

  // --- MODAL FUNCTIONS ---
  const openModal = (type: string, data: any[]) => {
      setCurrentModalType(type);
      setFilteredData(data);
      setSearchText('');
      setModalVisible(true);
  };

  const handleSearch = (text: string) => {
      setSearchText(text);
      let sourceData: any[] = [];
      
      if(currentModalType === 'Hospital') sourceData = orgList;
      else if(currentModalType === 'Product') sourceData = getUniqueProductNames();
      else if(currentModalType === 'Model') sourceData = getModelOptions();
      else sourceData = [];

      if (text) {
          const newData = sourceData.filter(item => {
              if (typeof item === 'string') {
                  return item.toLowerCase().includes(text.toLowerCase());
              } else {
                  return (item.orgName || item.name || '').toLowerCase().includes(text.toLowerCase()) || 
                         (item.city || '').toLowerCase().includes(text.toLowerCase());
              }
          });
          setFilteredData(newData);
      } else {
          setFilteredData(sourceData);
      }
  };

  const handleSelect = (item: any) => {
      if (currentModalType === 'Hospital') {
          if(typeof item !== 'string') selectOrganization(item);
          else setHospital(item);
      } 
      else if (currentModalType === 'Product') {
          setProduct(item);
          setModel(''); // 🔥 Reset Model
      }
      else if (currentModalType === 'Model') {
          setModel(item);
      }
      setModalVisible(false);
  };

  // --- SUBMIT LOGIC ---
  const handleSubmit = async () => {
    if (!hospital || !product || !contactPerson) {
      Alert.alert("Missing Fields", "Hospital, Product Name and Contact Person are required.");
      return;
    }

    setLoading(true);

    try {
      const locationData = await getCurrentLocation();
      if (!locationData) { 
          setLoading(false); 
          return; 
      }

      const newDemo = {
        id: Date.now().toString(),
        date: demoDate.toISOString().split('T')[0],
        displayDate: formatDate(demoDate),
        
        hospital: hospital,
        address: address, 
        city: city,       
        department: department,
        
        product: product,
        model: model,
        serialNo: serialNo,

        contactPerson: contactPerson,
        designation: designation, 
        contactNumber: contactNumber,
        email: email,

        duration: duration,
        result: result,
        notes: notes,
        
        status: 'Completed',

        senderId: user?.uid || 'guest',
        senderName: user?.name || 'Unknown',
        role: user?.role || 'Employee',
        timestamp: Date.now(),

        location: locationData
      };

      await addDemo(newDemo);
      
      try {
          await addDoc(collection(db, "notifications"), {
              title: "New Demo Report 📋",
              message: `${user?.name} submitted a demo report for ${product} at ${hospital}.`,
              to: "Admin",
              route: "/demo",
              read: false,
              createdAt: new Date().toISOString(),
              type: "info"
          });
      } catch (e) {}
      
      if (params.activityId && updateActivityStatus) {
          await updateActivityStatus(params.activityId as string, 'Completed');
      }

      setLoading(false);
      Alert.alert("Success", "Demo Report Saved & Admin Notified!", [
        { text: "OK", onPress: () => router.back() }
      ]);

    } catch (error) {
      setLoading(false);
      Alert.alert("Error", "Could not save demo.");
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>New Demo Entry</Text>
            <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            
            {/* SECTION 1: CUSTOMER INFO */}
            <Text style={styles.sectionHeader}>🏥 Customer Details</Text>
            <View style={styles.card}>
                <Text style={styles.label}>Organization / Hospital *</Text>
                <TouchableOpacity style={styles.selector} onPress={() => openModal('Hospital', orgList)}>
                    <Text style={{color: hospital ? '#333' : '#999', flex:1}}>{hospital || 'Select Organization'}</Text>
                    <Ionicons name="search" size={20} color="gray" />
                </TouchableOpacity>

                <View style={styles.row}>
                    <View style={{flex:1, marginRight:10}}>
                        <Text style={styles.label}>City</Text>
                        <TextInput style={styles.inputGray} placeholder="City" value={city} onChangeText={setCity} />
                    </View>
                    <View style={{flex:1}}>
                        <Text style={styles.label}>Department</Text>
                        <TextInput style={styles.input} placeholder="e.g. ICU" value={department} onChangeText={setDepartment} />
                    </View>
                </View>

                <Text style={styles.label}>Address</Text>
                <TextInput style={styles.inputGray} placeholder="Address" value={address} onChangeText={setAddress} />

                <Text style={styles.label}>Demo Date</Text>
                <TouchableOpacity style={styles.selector} onPress={() => setShowDatePicker(true)}>
                    <Text style={{color: '#333'}}>{formatDate(demoDate)}</Text>
                    <Ionicons name="calendar-outline" size={20} color="gray" />
                </TouchableOpacity>
                {showDatePicker && <DateTimePicker value={demoDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setDemoDate(d); }} />}
            </View>

            {/* SECTION 2: CONTACT PERSON */}
            <Text style={styles.sectionHeader}>👤 Contact Person</Text>
            <View style={styles.card}>
                <Text style={styles.label}>Demo Given To (Name) *</Text>
                <TextInput style={styles.input} placeholder="Dr. Name / Staff Name" value={contactPerson} onChangeText={setContactPerson} />

                <Text style={styles.label}>Designation</Text>
                <TextInput style={styles.input} placeholder="e.g. HOD / Director" value={designation} onChangeText={setDesignation} />

                <View style={styles.row}>
                    <View style={{flex:1, marginRight:10}}>
                        <Text style={styles.label}>Mobile</Text>
                        <TextInput style={styles.input} placeholder="10 Digit" keyboardType="phone-pad" value={contactNumber} onChangeText={setContactNumber} />
                    </View>
                    <View style={{flex:1}}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" value={email} onChangeText={setEmail} />
                    </View>
                </View>
            </View>

            {/* SECTION 3: PRODUCT INFO */}
            <Text style={styles.sectionHeader}>📦 Product Details</Text>
            <View style={styles.card}>
                {/* 🔥 PRODUCT DROPDOWN */}
                <Text style={styles.label}>Product Name *</Text>
                <TouchableOpacity style={styles.selector} onPress={() => openModal('Product', getUniqueProductNames())}>
                    <Text style={{color: product ? '#333' : '#999', flex:1}}>{product || 'Select Product'}</Text>
                    <Ionicons name="cube-outline" size={20} color="gray" />
                </TouchableOpacity>

                {product === 'Other' && (
                    <TextInput 
                        style={[styles.input, {marginTop:10, borderColor:'#3b5998'}]} 
                        placeholder="Type Product Name..." 
                        onChangeText={setProduct} 
                    />
                )}

                <View style={styles.row}>
                    <View style={{flex:1, marginRight:10}}>
                        {/* 🔥 MODEL DROPDOWN */}
                        <Text style={styles.label}>Model Name</Text>
                        <TouchableOpacity style={styles.selector} onPress={() => {
                            if(!product) Alert.alert("Wait", "Select Product First");
                            else openModal('Model', getModelOptions());
                        }}>
                            <Text style={{color: model ? '#333' : '#999', flex:1}} numberOfLines={1}>{model || 'Select Model'}</Text>
                            <Ionicons name="caret-down" size={16} color="gray" />
                        </TouchableOpacity>
                        
                        {model === 'Other' && (
                            <TextInput style={[styles.input, {marginTop:5}]} placeholder="Type Model" onChangeText={setModel} />
                        )}
                    </View>
                    <View style={{flex:1}}>
                        <Text style={styles.label}>Serial No</Text>
                        <TextInput style={styles.input} placeholder="SN-123" value={serialNo} onChangeText={setSerialNo} />
                    </View>
                </View>
                    
                <Text style={styles.label}>Demo Duration (Days)</Text>
                <TextInput style={styles.input} placeholder="e.g. 5" keyboardType="numeric" value={duration} onChangeText={setDuration} />
            </View>

            {/* SECTION 4: FEEDBACK */}
            <Text style={styles.sectionHeader}>📝 Feedback & Notes</Text>
            <View style={styles.card}>
                <Text style={styles.label}>Outcome / Feedback</Text>
                <TextInput style={[styles.input, {height:60, textAlignVertical:'top'}]} placeholder="Doctor's response..." multiline value={result} onChangeText={setResult} />

                <Text style={styles.label}>Private Notes</Text>
                <TextInput style={[styles.input, {height:60, textAlignVertical:'top'}]} placeholder="Internal team notes..." multiline value={notes} onChangeText={setNotes} />
            </View>

            <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>SAVE DEMO</Text>}
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
            <View style={{height: 50}} />

        </ScrollView>

        {/* --- MODAL --- */}
        <Modal visible={modalVisible} transparent={true} animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Select {currentModalType}</Text>
                    
                    <View style={styles.modalSearchBox}>
                        <Ionicons name="search" size={20} color="gray" />
                        <TextInput style={{flex:1, marginLeft:10}} placeholder="Search..." value={searchText} onChangeText={handleSearch} />
                    </View>

                    <FlatList 
                        data={filteredData}
                        keyExtractor={(item, index) => index.toString()}
                        style={{maxHeight: 300}}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.modalItem} onPress={() => handleSelect(item)}>
                                {currentModalType === 'Hospital' && typeof item !== 'string' ? (
                                    <View style={{flexDirection:'row', alignItems:'center'}}>
                                        <View style={styles.iconBox}><Ionicons name="business" size={20} color="#3b5998" /></View>
                                        <View style={{marginLeft:10}}>
                                            <Text style={styles.modalMainText}>{item.orgName || item.name}</Text>
                                            <Text style={styles.modalSubText}>{item.city || 'No City'}</Text>
                                        </View>
                                    </View>
                                ) : (
                                    <Text style={styles.modalText}>{typeof item === 'string' ? item : item.name}</Text>
                                )}
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No matches found</Text>}
                    />
                    
                    <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                        <Text style={{color:'red', fontWeight:'bold'}}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#3b5998', paddingTop: 50, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation:4 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  content: { padding: 15, paddingBottom: 50 },
  sectionHeader: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 8, marginTop: 15, textTransform:'uppercase' },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, elevation: 2, marginBottom:5 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#7f8c8d', marginBottom: 5, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fdfdfd', color:'#333' },
  inputGray: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#f0f0f0', color:'#333' },
  selector: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, backgroundColor: '#fdfdfd', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  row: { flexDirection: 'row' },
  btn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 30, marginBottom: 10, elevation: 3 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '95%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalText: { fontSize: 16, color: '#333' },
  closeBtn: { marginTop: 15, alignItems:'center', padding: 10 },
  iconBox: { width: 35, height: 35, borderRadius: 8, justifyContent:'center', alignItems:'center', backgroundColor:'#e3f2fd' },
  modalMainText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  modalSubText: { fontSize: 12, color: 'gray' }
});