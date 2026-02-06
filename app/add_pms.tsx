import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { useData } from './context/DataContext';

// 🔥🔥 1. IMPORTS
import * as Location from 'expo-location';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function AddPMSScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const { addPMS, orgList, installList, user, updateActivityStatus } = useData();

  // --- FORM STATES ---
  const [org, setOrg] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [machineName, setMachineName] = useState('');
  const [modelName, setModelName] = useState('');
  
  // 🔥 NEW AUTO-FILL STATES
  const [department, setDepartment] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  // --- DATE STATES ---
  const [pmsDate, setPmsDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(new Date()); // 🔥 1. New Due Date State
  
  const [showPmsDatePicker, setShowPmsDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false); // 🔥 2. New Due Date Picker State

  const [remarks, setRemarks] = useState('');
  const [pmsType, setPmsType] = useState('Preventive'); 

  // --- MODAL STATES ---
  const [modalVisible, setModalVisible] = useState(false);
  const [currentSelection, setCurrentSelection] = useState(''); 
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]);

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // 🔥 3. Auto-Calculate Next Due Date (3 Months later)
  useEffect(() => {
      const nextDate = new Date(pmsDate);
      nextDate.setMonth(nextDate.getMonth() + 3); // Add 3 Months
      setDueDate(nextDate);
  }, [pmsDate]);

  useEffect(() => {
      if (params.org && org !== params.org) {
          setOrg(params.org as string);
          // Auto fill city if coming from params
          if(orgList.length > 0) {
             const found = orgList.find((o:any) => o.orgName === params.org);
             if(found) { 
                 setCity(found.city || ''); 
                 setAddress(found.address || found.address1 || ''); // Updated check
             }
          }
      }
      if (params.serial && serialNo !== params.serial) {
          const serial = params.serial as string;
          setSerialNo(serial);
          
          if (installList.length > 0) {
              const machine = installList.find((m:any) => m.serialNo === serial);
              if (machine) {
                  setMachineName(machine.productName || machine.machineName || '');
                  setModelName(machine.model || '');
                  setDepartment(machine.department || '');
              }
          }
      }
  }, [params, installList, orgList]); 

  const getMachinesForOrg = () => {
      if (!org || installList.length === 0) return [];
      const target = org.toLowerCase().trim();
      return installList.filter((inst: any) => {
          const orgName = inst.orgName || inst.hospital || inst.hospitalName || '';
          return orgName.toLowerCase().trim() === target;
      });
  };

  // 🔥 LOCATION
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

  // --- MODAL LOGIC ---
  const openModal = (type: string) => {
    setCurrentSelection(type);
    setSearchText('');
    
    let data: any[] = [];
    if (type === 'Org') data = orgList;
    else if (type === 'Serial') data = getMachinesForOrg();
    
    setFilteredData(data);
    setModalVisible(true);
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    let sourceList: any[] = [];
    
    if (currentSelection === 'Org') sourceList = orgList;
    else if (currentSelection === 'Serial') sourceList = getMachinesForOrg();

    if (text) {
        const newData = sourceList.filter(item => {
            if (typeof item === 'string') return item.toLowerCase().includes(text.toLowerCase());
            
            if (currentSelection === 'Org') return (item.orgName || item.name || '').toLowerCase().includes(text.toLowerCase());
            
            if (currentSelection === 'Serial') {
                return (item.serialNo || '').toLowerCase().includes(text.toLowerCase()) || 
                       (item.productName || '').toLowerCase().includes(text.toLowerCase());
            }
            return false;
        });
        setFilteredData(newData);
    } else {
        setFilteredData(sourceList);
    }
  };

  // 🔥🔥 SMART SELECTION LOGIC (UPDATED) 🔥🔥
  const handleSelect = (item: any) => {
    if (currentSelection === 'Org') { 
        setOrg(item.orgName || item.name);
        
        // 🔥 IMPROVED AUTO-FILL (Checks address1 too)
        setCity(item.city || item.City || '');       
        setAddress(item.address || item.address1 || item.location || ''); 
        
        // Reset Machine Data on Org Change
        setSerialNo(''); setMachineName(''); setModelName(''); setDepartment('');
    } 
    else if (currentSelection === 'Serial') { 
        setSerialNo(item.serialNo);
        setMachineName(item.productName || item.machineName || item.product || '');
        setModelName(item.model || '');
        setDepartment(item.department || '');
    }
    setModalVisible(false);
  };

  // --- SAVE ---
  const handleSave = async () => {
      if (!org || !serialNo) {
          Alert.alert("Error", "Organization and Serial No are required.");
          return;
      }

      const locationData = await getCurrentLocation();
      if (!locationData) return; 

      const newPMS = {
          id: Date.now().toString(),
          
          // 🔥 Save both dates
          date: pmsDate.toISOString().split('T')[0], // Done Date
          lastDoneDate: pmsDate.toISOString().split('T')[0], // For legacy support
          dueDate: dueDate.toISOString().split('T')[0], // 🔥 Next Due Date Saved!

          hospitalName: org,
          city: city, // 🔥 Saved
          address: address, // 🔥 Saved
          
          machine: machineName || 'Unknown',
          model: modelName || 'Unknown', 
          serialNo: serialNo,
          
          department: department, 
          
          type: pmsType,
          remarks: remarks,
          status: 'Completed', 

          senderId: user?.uid || user?.id || 'guest',
          senderName: user?.name || 'Unknown', 
          role: user?.role || 'Employee',
          timestamp: Date.now(),
          location: locationData
      };

      await addPMS(newPMS);

      try {
          await addDoc(collection(db, "notifications"), {
              title: "PMS Report Submitted ⚙️",
              message: `${user?.name} submitted a ${pmsType} report for ${machineName} at ${org}.`,
              to: "Admin",
              route: "/pms_schedule",
              read: false,
              createdAt: new Date().toISOString(),
              type: "info"
          });
      } catch (e) {
          console.log("Notification Error:", e);
      }

      if (params.activityId && updateActivityStatus) {await updateActivityStatus(params.activityId as string, 'Completed');} 
      alert("PMS Report Saved Successfully!"); 
      // Alert.alert("Success", "PMS Report Saved & Admin Notified!");
      router.back();
  };

  return (
    // 🔥 1. Added KeyboardAvoidingView
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
          <Text style={styles.headerTitle}>New PMS Report</Text>
          <View style={{width:24}} /> 
        </View>

        {/* 🔥 2. Wrapped ScrollView correctly */}
        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}} keyboardShouldPersistTaps="handled">
            
            <View style={styles.row}>
                {/* DATE */}
                <View style={styles.col}>
                    <Text style={styles.label}>Done Date</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowPmsDatePicker(true)}>
                        <Text style={{color: '#333', fontSize:13}}>{formatDate(pmsDate)}</Text>
                        <Ionicons name="calendar-outline" size={16} color="gray" />
                    </TouchableOpacity>
                    {showPmsDatePicker && <DateTimePicker value={pmsDate} mode="date" onChange={(e, d) => { setShowPmsDatePicker(false); if(d) setPmsDate(d); }} />}
                </View>

                {/* 🔥 NEXT DUE DATE */}
                <View style={styles.col}>
                    <Text style={styles.label}>Next Due *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowDueDatePicker(true)}>
                        <Text style={{color: '#d32f2f', fontWeight:'bold', fontSize:13}}>{formatDate(dueDate)}</Text>
                        <Ionicons name="calendar" size={16} color="#d32f2f" />
                    </TouchableOpacity>
                    {showDueDatePicker && <DateTimePicker value={dueDate} mode="date" onChange={(e, d) => { setShowDueDatePicker(false); if(d) setDueDate(d); }} />}
                </View>
            </View>

            {/* ORG */}
            <Text style={styles.label}>Organization / Hospital *</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Org')}>
                <Text style={{color: org ? 'black' : 'gray'}}>{org || 'Select Organization'}</Text>
                <Ionicons name="search" size={18} color="gray" />
            </TouchableOpacity>

            {/* SERIAL DROPDOWN */}
            <Text style={styles.label}>Machine Serial No *</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => {
                if(!org) Alert.alert("Wait", "Please select Organization first.");
                else openModal('Serial');
            }}>
                <View>
                    <Text style={{color: serialNo ? 'black' : 'gray', fontWeight: serialNo ? 'bold' : 'normal'}}>
                        {serialNo || 'Select Serial No'}
                    </Text>
                    {machineName ? <Text style={{fontSize:11, color:'gray'}}>{machineName} ({modelName})</Text> : null}
                </View>
                <Ionicons name="caret-down" size={18} color="gray" />
            </TouchableOpacity>

            {/* 🔥🔥 NEW INFO BOX (READ ONLY) 🔥🔥 */}
            <View style={styles.infoBox}>
                <Text style={{fontSize:11, fontWeight:'bold', color:'#555', marginBottom:5}}>ADDITIONAL INFO (Auto-Filled)</Text>
                <View style={styles.row}>
                    <View style={styles.col}>
                        <Text style={styles.subLabel}>City</Text>
                        <Text style={styles.infoText}>{city || '-'}</Text>
                    </View>
                    <View style={styles.col}>
                        <Text style={styles.subLabel}>Department</Text>
                        <Text style={styles.infoText}>{department || '-'}</Text>
                    </View>
                </View>
                <View style={{marginTop:5}}>
                    <Text style={styles.subLabel}>Address</Text>
                    <Text style={styles.infoText} numberOfLines={1}>{address || '-'}</Text>
                </View>
            </View>

            {/* MACHINE DETAILS (Read Only) */}
            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Machine Name</Text>
                    <TextInput style={styles.inputGray} value={machineName} editable={false} placeholder="Auto-filled" />
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Model Name</Text>
                    <TextInput style={styles.inputGray} value={modelName} editable={false} placeholder="Auto-filled" />
                </View>
            </View>

            {/* PMS TYPE */}
            <Text style={styles.label}>PMS Type</Text>
            <View style={styles.typeContainer}>
                {['Preventive', 'Breakdown', 'Installation'].map(t => (
                    <TouchableOpacity key={t} style={[styles.typeBtn, pmsType === t && styles.activeTypeBtn]} onPress={() => setPmsType(t)}>
                        <Text style={[styles.typeText, pmsType === t && {color:'white'}]}>{t}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* REMARKS */}
            <Text style={styles.label}>Checklist / Remarks</Text>
            <TextInput 
                style={[styles.inputGray, {height: 100, textAlignVertical: 'top'}]} 
                multiline 
                placeholder="Enter PMS details, parts checked, etc..." 
                value={remarks} 
                onChangeText={setRemarks} 
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save PMS Report</Text>
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
        </ScrollView>

        {/* --- IMPROVED LIST UI MODAL --- */}
        <Modal visible={modalVisible} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select {currentSelection}</Text>
                  <View style={styles.modalSearchBox}>
                      <Ionicons name="search" size={20} color="gray" />
                      <TextInput style={{flex:1, marginLeft:10}} placeholder="Search..." value={searchText} onChangeText={handleSearch} autoFocus={true} />
                  </View>

                  <FlatList 
                      data={filteredData}
                      keyExtractor={(item, index) => index.toString()}
                      style={{maxHeight: 300}}
                      renderItem={({item}) => (
                          <TouchableOpacity style={styles.modalItem} onPress={() => handleSelect(item)}>
                              {currentSelection === 'Serial' ? (
                                  // 🔥 SERIAL ITEM UI
                                  <View style={{flexDirection:'row', alignItems:'center'}}>
                                      <View style={[styles.iconBox, {backgroundColor:'#e3f2fd'}]}>
                                          <Ionicons name="pricetag" size={20} color="#3b5998" />
                                      </View>
                                      <View style={{marginLeft:10}}>
                                          <Text style={styles.modalMainText}>{item.serialNo}</Text>
                                          <Text style={styles.modalSubText}>
                                              {item.productName || item.machineName || 'Machine'} • {item.model || 'No Model'}
                                          </Text>
                                      </View>
                                  </View>
                              ) : (
                                  // 🔥 ORG ITEM UI
                                  <View style={{flexDirection:'row', alignItems:'center'}}>
                                      <View style={[styles.iconBox, {backgroundColor:'#f3e5f5'}]}>
                                          <Ionicons name="business" size={20} color="#8e44ad" />
                                      </View>
                                      <View style={{marginLeft:10}}>
                                          <Text style={styles.modalMainText}>{item.orgName || item.name}</Text>
                                          <Text style={styles.modalSubText}>{item.city || 'No City'}</Text>
                                      </View>
                                  </View>
                              )}
                          </TouchableOpacity>
                      )}
                      ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No Data Found</Text>}
                  />
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}><Text style={{color:'red'}}>Close</Text></TouchableOpacity>
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
  label: { marginBottom: 5, color:'#333', fontWeight:'600', fontSize:13, marginTop:10 },
  dropdown: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 15, marginBottom: 5, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  inputGray: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, marginBottom: 5, fontSize:16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' }, col: { width:'48%' },
  typeContainer: { flexDirection:'row', justifyContent:'space-between', marginBottom:10 },
  typeBtn: { flex:1, padding:10, borderWidth:1, borderColor:'#ddd', alignItems:'center', borderRadius:8, marginRight:5 },
  activeTypeBtn: { backgroundColor:'#3b5998', borderColor:'#3b5998' },
  typeText: { color:'#555', fontWeight:'bold', fontSize:12 },
  
  // 🔥 INFO BOX STYLE
  infoBox: { backgroundColor: '#f0f4f8', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#e0e0e0' },
  subLabel: { fontSize:11, color:'gray' },
  infoText: { fontWeight:'bold', color:'#333', fontSize:14 },

  saveButton: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  closeBtn: { marginTop: 15, alignItems:'center', padding: 10 },

  // 🔥 LIST STYLES
  iconBox: { width: 35, height: 35, borderRadius: 8, justifyContent:'center', alignItems:'center' },
  modalMainText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  modalSubText: { fontSize: 12, color: 'gray' }
});