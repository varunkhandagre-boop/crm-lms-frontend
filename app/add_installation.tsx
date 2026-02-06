import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

export default function AddInstallationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  
  const { addInstallation, orgList, user, userList, productList } = useData();

  // --- COMMON DETAILS ---
  const [hospital, setHospital] = useState('');
  
  // Auto-Fill States
  const [department, setDepartment] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  
  const [installDate, setInstallDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [engineer, setEngineer] = useState(user?.name || '');

  // --- MACHINE DETAILS ---
  const [product, setProduct] = useState('');
  const [model, setModel] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [warrantyYears, setWarrantyYears] = useState('1 Year');
  const [notes, setNotes] = useState('');

  // --- LIST ---
  const [addedMachines, setAddedMachines] = useState<any[]>([]);

  // MODAL STATES
  const [modalVisible, setModalVisible] = useState(false);
  const [currentModalType, setCurrentModalType] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]); 
  const [searchText, setSearchText] = useState(''); 
  const [isSaving, setIsSaving] = useState(false);
  
  // --- OPTIONS ---
  const warrantyOptions = ['1 Year', '2 Years', '3 Years', '5 Years'];

  const getEngineerOptions = () => {
    const engineers = userList.map((u: any) => u.name);
    // 'Self' hata diya, ab sirf engineers list aur 'Other' rahega
    return [...engineers, 'Other'];
};

  // 🔥 1. GET UNIQUE PRODUCT NAMES (Duplicates hata kar)
  const getUniqueProductNames = () => {
      const names = productList.map((p: any) => p.name);
      // Set use karke duplicates remove kiye
      return [...new Set(names), 'Other'];
  };

  // 🔥 2. GET MODELS FOR SELECTED PRODUCT
  const getModelOptions = () => {
      if (!product || product === 'Other') return ['Other'];
      
      // Sirf wahi models dhundo jo selected product ke hain
      const models = productList
          .filter((p: any) => p.name === product && p.model) // Name match kare aur Model exist kare
          .map((p: any) => p.model);
          
      return [...new Set(models), 'Other'];
  };

  useEffect(() => {
      if (params.hospital) {
          setHospital(params.hospital as string);
          if(orgList.length > 0) {
             const found = orgList.find((o:any) => o.orgName === params.hospital);
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

  const getWarrantyExpiry = (dateObj: Date, yearsStr: string) => {
      const years = parseInt(yearsStr.split(' ')[0]);
      const expiryDate = new Date(dateObj);
      expiryDate.setFullYear(expiryDate.getFullYear() + years);
      expiryDate.setDate(expiryDate.getDate() - 1);
      return expiryDate.toISOString().split('T')[0];
  };

  // 🔥 LOCATION LOGIC
  const getCurrentLocation = async () => {
      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Location access is required.');
              return null;
          }
          let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          return {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
              timestamp: new Date().toISOString()
          };
      } catch (error) {
          Alert.alert("GPS Required", "Please turn on GPS.");
          return null;
      }
  };

  // --- MODAL LOGIC ---
  const openModal = (type: string) => {
      setCurrentModalType(type);
      setSearchText('');
      
      let data: any[] = [];
      if (type === 'Hospital') data = orgList; 
      else if (type === 'Warranty') data = warrantyOptions; 
      else if (type === 'Engineer') data = getEngineerOptions(); 
      else if (type === 'Product') data = getUniqueProductNames(); // 🔥 Unique Products
      else if (type === 'Model') data = getModelOptions(); // 🔥 Filtered Models
      
      setFilteredData(data);
      setModalVisible(true);
  };

  const handleSearch = (text: string) => {
      setSearchText(text);
      let sourceList: any[] = [];
      
      if (currentModalType === 'Hospital') sourceList = orgList;
      else if (currentModalType === 'Warranty') sourceList = warrantyOptions;
      else if (currentModalType === 'Engineer') sourceList = getEngineerOptions();
      else if (currentModalType === 'Product') sourceList = getUniqueProductNames();
      else if (currentModalType === 'Model') sourceList = getModelOptions();

      if (text) {
          const newData = sourceList.filter(item => {
              if(typeof item === 'string') return item.toLowerCase().includes(text.toLowerCase());
              const val = item.orgName || item.name || '';
              return val.toLowerCase().includes(text.toLowerCase()) || (item.city || '').toLowerCase().includes(text.toLowerCase());
          });
          setFilteredData(newData);
      } else {
          setFilteredData(sourceList);
      }
  };

  const selectOrganization = (orgItem: any) => {
      setHospital(orgItem.orgName || orgItem.name);
      setCity(orgItem.city || orgItem.City || '');
      setAddress(orgItem.address || orgItem.address1 || orgItem.location || '');
      setContactPerson(orgItem.contactPerson || '');
      setMobile(orgItem.mobile || orgItem.phone || '');
      setModalVisible(false);
  };

  const handleSelect = (item: any) => {
      if (currentModalType === 'Hospital') {
          if (typeof item === 'string') {
             const found = orgList.find((o:any) => o.orgName === item);
             if(found) selectOrganization(found);
             else setHospital(item);
          } else {
             selectOrganization(item);
          }
      }
      else if (currentModalType === 'Warranty') { setWarrantyYears(item); }
      else if (currentModalType === 'Engineer') { setEngineer(item); }
      
      else if (currentModalType === 'Product') { 
          setProduct(item); 
          setModel(''); // 🔥 Reset Model when Product changes
      } 
      else if (currentModalType === 'Model') { setModel(item); }

      setModalVisible(false);
  };

  const handleAddMachine = () => {
      if (!product || !serialNo) {
          Alert.alert("Missing Info", "Product Name and Serial No are required.");
          return;
      }

      const machineEntry = {
          id: Date.now().toString(),
          product,
          model,
          serialNo,
          warrantyYears,
          warrantyExpiry: getWarrantyExpiry(installDate, warrantyYears),
          note: notes
      };

      setAddedMachines([...addedMachines, machineEntry]);
      // Reset machine fields
      setProduct(''); setModel(''); setSerialNo(''); setNotes('');
  };

  const removeMachine = (index: number) => {
      const newList = [...addedMachines];
      newList.splice(index, 1);
      setAddedMachines(newList);
  };

  const handleFinalSubmit = async () => {
      if (!hospital) return Alert.alert("Missing", "Select Hospital.");
      if (addedMachines.length === 0) return Alert.alert("Empty", "Add at least one machine.");

      setIsSaving(true); 

      // 🔥 Capture Location
      const locationData = await getCurrentLocation();
      if (!locationData) {
          setIsSaving(false);
          return; 
      }

      const promises = addedMachines.map(async (machine) => {
          const newEntry = {
              id: Date.now().toString() + Math.random(),
              date: installDate.toISOString().split('T')[0],
              hospital: hospital,
              orgName: hospital,
              
              city, address, contactPerson, mobile, department,
              
              engineer,
              status: 'Installed',
              
              product: machine.product, 
              productName: machine.product, 
              model: machine.model,
              serialNo: machine.serialNo, 
              warrantyExpiry: machine.warrantyExpiry,
              note: machine.note,

              senderId: user?.uid || 'guest',
              senderName: user?.name || 'Unknown',
              createdAt: new Date().toISOString(),
              location: locationData // 🔥 Save Location
          };
          return addInstallation(newEntry);
      });

      await Promise.all(promises);

      try {
          await addDoc(collection(db, "notifications"), {
              title: "New Installation Report 🛠️",
              message: `${user?.name} installed ${addedMachines.length} machine(s) at ${hospital}.`,
              to: "Admin",
              route: "/installation",
              read: false,
              createdAt: new Date().toISOString(),
              type: "success"
          });
      } catch (e) {}

      setIsSaving(false);
      Alert.alert("Success", "Installation Report Saved!");
      router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Installation</Text>
          <View style={{width:24}} /> 
        </View>

        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}} keyboardShouldPersistTaps="handled">
            
            {/* SECTION 1 */}
            <Text style={styles.sectionHeader}>1. Client & Site Details</Text>
            
            <Text style={styles.label}>Hospital / Client *</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Hospital')}>
                <Text style={{color: hospital ? 'black' : 'gray'}}>{hospital || 'Select from List'}</Text>
                <Ionicons name="search" size={18} color="gray" />
            </TouchableOpacity>

            {hospital ? (
                <View style={styles.autoFillBox}>
                    <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginBottom:8}}>AUTO-FILLED DETAILS</Text>
                    <View style={styles.row}>
                        <View style={styles.col}><Text style={styles.label}>City</Text><TextInput style={styles.inputGray} value={city} onChangeText={setCity} /></View>
                        <View style={styles.col}><Text style={styles.label}>Contact Name</Text><TextInput style={styles.inputGray} value={contactPerson} onChangeText={setContactPerson} /></View>
                    </View>
                    <View style={styles.row}>
                        <View style={styles.col}><Text style={styles.label}>Mobile</Text><TextInput style={styles.inputGray} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" /></View>
                    </View>
                    <Text style={styles.label}>Address</Text><TextInput style={styles.inputGray} value={address} onChangeText={setAddress} />
                </View>
            ) : null}

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Department</Text>
                    <TextInput style={styles.input} placeholder="e.g. ICU/OT" value={department} onChangeText={setDepartment} />
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Install Date</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                        <Text style={{color: '#333'}}>{formatDate(installDate)}</Text>
                        <Ionicons name="calendar-outline" size={18} color="gray" />
                    </TouchableOpacity>
                    {showDatePicker && <DateTimePicker value={installDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setInstallDate(d); }} />}
                </View>
            </View>

            <Text style={styles.label}>Installation Engineer</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Engineer')}>
                <Text>{engineer || user?.name || 'Select Engineer'}</Text>
                <Ionicons name="caret-down" size={14} color="gray" />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* SECTION 2 */}
            <Text style={styles.sectionHeader}>2. Add Machine Details</Text>

            {/* 🔥 PRODUCT SELECTION FROM MASTER */}
            <Text style={styles.label}>Product Name *</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Product')}>
                <Text style={{color: product ? 'black' : 'gray'}}>{product || 'Select Product'}</Text>
                <Ionicons name="cube-outline" size={18} color="gray" />
            </TouchableOpacity>

            {product === 'Other' && (
                <TextInput style={[styles.input, {marginTop:5, borderColor:'#3b5998'}]} placeholder="Type Product Name..." onChangeText={setProduct} />
            )}

            {/* 🔥 MODEL SELECTION FROM MASTER (FILTERED) */}
            <Text style={styles.label}>Model Name</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => {
                if(!product) Alert.alert("Wait", "Please select Product first.");
                else openModal('Model');
            }}>
                <Text style={{color: model ? 'black' : 'gray'}}>{model || 'Select Model'}</Text>
                <Ionicons name="layers-outline" size={18} color="gray" />
            </TouchableOpacity>

            {model === 'Other' && (
                <TextInput style={[styles.input, {marginTop:5}]} placeholder="Type Model Name..." onChangeText={setModel} />
            )}

            <Text style={styles.label}>Serial Number *</Text>
            <TextInput style={styles.input} placeholder="e.g. AN-2025-XX" value={serialNo} onChangeText={setSerialNo} />

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Warranty</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Warranty')}>
                        <Text>{warrantyYears}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Expiry (Preview)</Text>
                    <TextInput style={[styles.input, {backgroundColor:'#eee'}]} editable={false} value={getWarrantyExpiry(installDate, warrantyYears)} />
                </View>
            </View>

            <Text style={styles.label}>Accessories / Notes</Text>
            <TextInput style={[styles.input, {height: 60}]} placeholder="UPS, Stand etc." value={notes} onChangeText={setNotes} />

            <TouchableOpacity style={styles.addMachineBtn} onPress={handleAddMachine}>
                <Ionicons name="add-circle" size={20} color="white" />
                <Text style={styles.addMachineText}>Add This Machine</Text>
            </TouchableOpacity>

            {/* SECTION 3: LIST */}
            {addedMachines.length > 0 && (
                <View style={styles.addedListContainer}>
                    <Text style={styles.listTitle}>Machines to be Added ({addedMachines.length})</Text>
                    {addedMachines.map((m, index) => (
                        <View key={index} style={styles.addedItem}>
                            <View style={{flex:1}}>
                                <Text style={{fontWeight:'bold'}}>{m.product} <Text style={{fontWeight:'normal', color:'gray'}}>({m.model})</Text></Text>
                                <Text style={{fontSize:12, color:'#333'}}>SN: {m.serialNo} • Warranty: {m.warrantyYears}</Text>
                            </View>
                            <TouchableOpacity onPress={() => removeMachine(index)}>
                                <Ionicons name="trash-outline" size={20} color="red" />
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}

            <TouchableOpacity style={[styles.saveBtn, {backgroundColor: addedMachines.length > 0 ? '#3b5998' : 'gray'}]} onPress={handleFinalSubmit} disabled={addedMachines.length === 0 || isSaving}>
                <Text style={styles.saveBtnText}>{isSaving ? 'Submitting...' : `Submit All (${addedMachines.length})`}</Text>
            </TouchableOpacity>
            
            {/* 🔥 Location Disclaimer */}
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
        </ScrollView>

        {/* MODAL */}
        <Modal visible={modalVisible} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select {currentModalType}</Text>
                  
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
                              {currentModalType === 'Hospital' && typeof item !== 'string' ? (
                                  <View style={{flexDirection:'row', alignItems:'center'}}>
                                      <View style={styles.iconBox}><Ionicons name="business" size={20} color="#3b5998" /></View>
                                      <View style={{marginLeft:10}}>
                                          <Text style={styles.modalMainText}>{item.orgName || item.name}</Text>
                                          <Text style={styles.modalSubText}>{item.city || 'No City'}</Text>
                                      </View>
                                  </View>
                              ) : (
                                  <View style={{flexDirection:'row', alignItems:'center'}}>
                                      <Ionicons name="radio-button-on" size={18} color="#666" style={{marginRight:10}}/>
                                      <Text style={styles.modalText}>{typeof item === 'string' ? item : (item.orgName || item.name)}</Text>
                                  </View>
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
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#3b5998', marginTop: 15, marginBottom: 10 },
  label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13, marginTop:10 },
  input: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, fontSize:16 },
  
  autoFillBox: { backgroundColor: '#f0f8ff', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#d0eaff' },
  inputGray: { backgroundColor: '#ffffff', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 10, fontSize: 15, color:'#333' },

  dropdown: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
  divider: { height:1, backgroundColor:'#eee', marginVertical:20 },
  addMachineBtn: { flexDirection:'row', backgroundColor:'#3b5998', padding:12, borderRadius:8, justifyContent:'center', alignItems:'center', marginTop:15 },
  addMachineText: { color:'white', fontWeight:'bold', marginLeft:5 },
  addedListContainer: { marginTop: 20, backgroundColor:'#f0f4f8', padding:10, borderRadius:8 },
  listTitle: { fontWeight:'bold', marginBottom:10, color:'#555' },
  addedItem: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'white', padding:10, borderRadius:6, marginBottom:8, elevation:1 },
  saveBtn: { padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '90%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalText: { fontSize: 16, color: '#333' },
  closeBtn: { marginTop: 15, alignItems:'center', padding: 10 },
  iconBox: { width: 35, height: 35, borderRadius: 8, justifyContent:'center', alignItems:'center', backgroundColor:'#e3f2fd' },
  modalMainText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  modalSubText: { fontSize: 12, color: 'gray' }
});