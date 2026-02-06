import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
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

// 🔥🔥 1. IMPORTS UPDATED (Location Added)
import * as Location from 'expo-location'; // 📍 Added Location
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function AddActivityScreen() {
  const router = useRouter();
  const { addActivityPlan, orgList, user } = useData();

  // DATES
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // --- NEW FIELDS ---
  const [organization, setOrganization] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(''); 
  const [state, setState] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');

  const [selectedActivity, setSelectedActivity] = useState('Select Activity');
  const [selectedPurpose, setSelectedPurpose] = useState('Select Purpose');
  const [planningNotes, setPlanningNotes] = useState('');
  
  // MODALS
  const [modalVisible, setModalVisible] = useState(false);
  const [currentModalType, setCurrentModalType] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');

  const activityOptions = ['Sales', 'Service', 'Dealer Meet', 'Conference/Exhibitions'];
  
  const purposeMapping: any = {
    'Sales': ['Cold Call', 'AMC/CMC Follow up', 'Demonstration', 'Lead Follow up', 'Others'],
    'Service': ['Breakdown', 'Demo/ Training', 'Installation', 'PMS', 'Training'],
    'Dealer Meet': ['Sales Follow up', 'Others'],
    'Conference/Exhibitions': ['Conference', 'Exhibitions', 'Medical Fair']
  };

  // DATE FORMATTER
  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // 🔥🔥 2. GET CURRENT LOCATION FUNCTION (NEW) 🔥🔥
  const getCurrentLocation = async () => {
      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Location access is required to save entry.');
              return null;
          }
          // Get location silently
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

  // --- MODAL LOGIC (Searchable) ---
  const openModal = (type: string) => {
      setCurrentModalType(type);
      setSearchText('');
      
      let data: any[] = [];
      if (type === 'Organization') data = orgList; 
      else if (type === 'Activity') data = activityOptions;
      else if (type === 'Purpose') data = purposeMapping[selectedActivity] || [];
      
      setFilteredData(data);
      setModalVisible(true);
  };

  const handleSearch = (text: string) => {
      setSearchText(text);
      let sourceList: any[] = [];
      
      if (currentModalType === 'Organization') sourceList = orgList;
      else if (currentModalType === 'Activity') sourceList = activityOptions;
      else if (currentModalType === 'Purpose') sourceList = purposeMapping[selectedActivity] || [];

      if (text) {
          const newData = sourceList.filter(item => {
              const val = typeof item === 'string' ? item : (item.orgName || item.name);
              return val?.toLowerCase().includes(text.toLowerCase());
          });
          setFilteredData(newData);
      } else {
          setFilteredData(sourceList);
      }
  };

  const handleSelect = (item: any) => {
      if (currentModalType === 'Organization') {
          setOrganization(item.orgName || item.name);
          setAddress(item.address || '');
          setCity(item.city || '');
          setState(item.state || '');
          setContactPerson(item.contactPerson || '');
          setContactNumber(item.mobile || '');
          setEmail(item.email || '');
      }
      else if (currentModalType === 'Activity') {
          setSelectedActivity(item);
          setSelectedPurpose('Select Purpose'); // Reset Purpose
      }
      else if (currentModalType === 'Purpose') {
          setSelectedPurpose(item);
      }
      
      setModalVisible(false);
  };

  // 🔥 Made Async for Notification
  const handleSave = async () => {
      if (!organization || !city || !contactPerson) {
          Alert.alert("Missing Info", "Organization, City, and Contact Person are required.");
          return;
      }
      if (selectedActivity === 'Select Activity' || selectedPurpose === 'Select Purpose') {
          Alert.alert("Incomplete", "Please select Activity and Purpose");
          return;
      }

      // 📍 3. CAPTURE LOCATION BEFORE SAVING
      const locationData = await getCurrentLocation();
      if (!locationData) return; // Stop if location fails

      let finalType: any = 'Sales Visit';
      if (selectedPurpose === 'Installation') finalType = 'Installation';
      else if (selectedPurpose === 'PMS') finalType = 'PMS';
      else if (selectedPurpose.includes('Demo')) finalType = 'Demo';
      else if (selectedActivity === 'Service') finalType = 'Field Service';
      else if (selectedActivity === 'Sales') finalType = 'Sales Visit';

      const newPlan = {
          id: Date.now().toString(),
          
          date: formatDate(date),
          dateIso: date.toISOString().split('T')[0],
          
          hospital: organization,
          address, city, state, 
          contactPerson, contactNumber, email,
          
          type: finalType,
          activity: selectedActivity,
          purpose: selectedPurpose,
          
          status: 'Planned',
          planningNotes: planningNotes,

          senderId: user?.uid || 'guest',
          senderName: user?.name || 'Unknown',
          role: user?.role || 'Employee',
          createdAt: new Date().toISOString(),

          // 🔥 Added Location
          location: locationData
      };

      await addActivityPlan(newPlan);

      // NOTIFICATION
      try {
          await addDoc(collection(db, "notifications"), {
              title: "New Activity Planned 📅",
              message: `${user?.name} planned a ${selectedActivity} at ${organization}.`,
              to: "Admin",
              route: "/activity_plan",
              read: false,
              createdAt: new Date().toISOString(),
              type: "info"
          });
      } catch (e) {
          console.log("Notification Error:", e);
      }

      Alert.alert("Success", "Activity Planned & Admin Notified!");
      router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>New Activity Plan</Text>
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
            {/* Date */}
            <View style={styles.row}>
                <View style={styles.halfInput}>
                    <Text style={styles.label}>Date *</Text>
                    <TouchableOpacity style={styles.inputBox} onPress={() => setShowDatePicker(true)}>
                        <Text style={{flex:1}}>{formatDate(date)}</Text>
                        <Ionicons name="calendar-outline" size={20} color="gray" />
                    </TouchableOpacity>
                    {showDatePicker && (
                        <DateTimePicker 
                            value={date} mode="date" minimumDate={new Date()}
                            onChange={(e, d) => { setShowDatePicker(false); if(d) setDate(d); }} 
                        />
                    )}
                </View>
                <View style={styles.halfInput}>
                    <Text style={styles.label}>Status</Text>
                    <View style={[styles.inputBox, {backgroundColor:'#eee'}]}>
                        <Text style={{color:'gray'}}>Planned</Text>
                        <Ionicons name="time-outline" size={16} color="orange" />
                    </View>
                </View>
            </View>

            {/* --- ORGANIZATION DETAILS --- */}
            <Text style={styles.sectionHeader}>Organization Details</Text>
            
            <Text style={styles.label}>Organization Name *</Text>
            <TouchableOpacity style={styles.inputBox} onPress={() => openModal('Organization')}>
                <Text style={{flex:1, color: organization ? 'black' : 'gray'}}>{organization || 'Select Organization'}</Text>
                <Ionicons name="search" size={20} color="gray" />
            </TouchableOpacity>

            <Text style={styles.label}>Address</Text>
            <TextInput style={styles.input} placeholder="Full Address" value={address} onChangeText={setAddress} />

            <View style={styles.row}>
                <View style={styles.halfInput}>
                    <Text style={styles.label}>City *</Text>
                    <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />
                </View>
                <View style={styles.halfInput}>
                    <Text style={styles.label}>State</Text>
                    <TextInput style={styles.input} placeholder="State" value={state} onChangeText={setState} />
                </View>
            </View>

            {/* --- CONTACT DETAILS --- */}
            <Text style={styles.sectionHeader}>Contact Person</Text>
            
            <Text style={styles.label}>Name *</Text>
            <TextInput style={styles.input} placeholder="Dr. / Mr. Name" value={contactPerson} onChangeText={setContactPerson} />

            <View style={styles.row}>
                <View style={styles.halfInput}>
                    <Text style={styles.label}>Mobile No</Text>
                    <TextInput style={styles.input} placeholder="10 Digit No" keyboardType="phone-pad" value={contactNumber} onChangeText={setContactNumber} />
                </View>
                <View style={styles.halfInput}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput style={styles.input} placeholder="Email ID" keyboardType="email-address" value={email} onChangeText={setEmail} />
                </View>
            </View>

            {/* --- ACTIVITY DETAILS --- */}
            <Text style={styles.sectionHeader}>Activity Setup</Text>

            <Text style={styles.label}>Activity Type *</Text>
            <TouchableOpacity style={styles.inputBox} onPress={() => openModal('Activity')}>
                <Text style={{flex:1, color: selectedActivity === 'Select Activity' ? 'gray' : 'black'}}>{selectedActivity}</Text>
                <Ionicons name="chevron-down" size={20} color="gray" />
            </TouchableOpacity>

            <Text style={styles.label}>Purpose *</Text>
            <TouchableOpacity style={styles.inputBox} onPress={() => selectedActivity !== 'Select Activity' ? openModal('Purpose') : Alert.alert("Select Activity First")}>
                <Text style={{flex:1, color: selectedPurpose === 'Select Purpose' ? 'gray' : 'black'}}>{selectedPurpose}</Text>
                <Ionicons name="chevron-down" size={20} color="gray" />
            </TouchableOpacity>

            <Text style={styles.label}>Planning Agenda / Notes</Text>
            <TextInput 
                style={[styles.input, {height: 80, textAlignVertical:'top'}]} 
                multiline placeholder="Meeting se pehle ka plan/agenda..."
                value={planningNotes}
                onChangeText={setPlanningNotes}
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save Plan</Text>
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
        </ScrollView>
      </KeyboardAvoidingView>

      {/* SEARCHABLE MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select {currentModalType}</Text>
                
                {/* Search Bar */}
                <View style={styles.modalSearchBox}>
                    <Ionicons name="search" size={20} color="gray" />
                    <TextInput 
                        style={{flex:1, marginLeft:10}} 
                        placeholder="Search..." 
                        value={searchText} 
                        onChangeText={handleSearch} 
                    />
                </View>

                <FlatList 
                    data={filteredData}
                    keyExtractor={(item, index) => index.toString()}
                    style={{maxHeight: 300}}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => handleSelect(item)}>
                            {typeof item === 'string' ? (
                                <Text style={styles.modalText}>{item}</Text>
                            ) : (
                                <View>
                                    <Text style={[styles.modalText, {fontWeight:'bold'}]}>{item.orgName || item.name}</Text>
                                    <Text style={{fontSize:12, color:'gray'}}>{item.city || 'No City'}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No matches found</Text>}
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  contentContainer: { padding: 20 },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#3b5998', marginTop: 20, marginBottom: 5, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 5 },
  
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfInput: { width: '48%' },
  
  label: { marginTop: 15, marginBottom: 5, fontWeight: '600', color:'gray' },
  inputBox: { flexDirection:'row', alignItems:'center', backgroundColor: 'white', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12 },
  input: { backgroundColor: 'white', borderWidth:1, borderColor:'#ddd', padding: 12, borderRadius: 8, fontSize:16, color:'#333' },
  
  saveButton: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '90%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalText: { fontSize: 16, color: '#333' },
  closeBtn: { marginTop: 15, alignItems:'center', padding: 10 }
});