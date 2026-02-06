import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
// Firebase Imports
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
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
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

export default function AddSalesScreen() {
  const router = useRouter();
  
  const { addSalesVisit, orgList = [], user, productList = [] } = useData(); 

  // --- FORM STATES ---
  const [hospital, setHospital] = useState(''); 
  const [person, setPerson] = useState(''); 
  const [mobile, setMobile] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  const [product, setProduct] = useState('');
  const [discussion, setDiscussion] = useState('');
  const [outcome, setOutcome] = useState('Follow Up');
  
  const [nextDate, setNextDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // 🔥 Loading State
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [currentModalType, setCurrentModalType] = useState('');

  const outcomeOptions = ['Interested', 'Follow Up', 'Demo Planned', 'Order Expected', 'Not Interested', 'Order Closed', 'Lost'];

  const getProductOptions = () => {
      const dbProducts = productList.map((p: any) => {
          return p.model ? `${p.name} - ${p.model}` : p.name;
      });
      return [...dbProducts, "Other"];
  };

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

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
          return null;
      }
  };

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
    else if(currentModalType === 'Outcome') sourceData = outcomeOptions;
    else if(currentModalType === 'Product') sourceData = getProductOptions();
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
        if (typeof item !== 'string') {
            setHospital(item.orgName || item.name); 
            setPerson(item.contactPerson || '');
            setMobile(item.mobile || '');
            setCity(item.city || '');
            setAddress(item.address || '');
        } else {
            setHospital(item);
        }
    }
    else if (currentModalType === 'Product') setProduct(item);
    else if (currentModalType === 'Outcome') setOutcome(item);
    
    setModalVisible(false);
  };

  const handleSave = async () => {
      // 🔥 1. Double Click Prevention
      if (isSubmitting) return;

      if (!hospital || !discussion) {
          Alert.alert("Missing Fields", "Hospital and Discussion are required.");
          return;
      }

      // 🔥 2. Start Loading
      setIsSubmitting(true);

      const locationData = await getCurrentLocation();
      if (!locationData) {
          setIsSubmitting(false); 
          return; 
      }

      const safeUserId = user?.uid || user?.id || 'guest';

      // 1. Save Sales Visit (DSR)
      const newVisit = {
          id: Date.now().toString(),
          hospital,
          person,
          mobile,
          city,
          address,
          product, 
          discussion,
          outcome,
          
          nextFollowUp: nextDate.toISOString().split('T')[0],
          date: new Date().toISOString().split('T')[0],
          
          senderId: safeUserId, 
          senderName: user?.name || 'Unknown',
          role: user?.role || 'Employee',
          timestamp: Date.now(),
          location: locationData,
      };

      await addSalesVisit(newVisit);

      // 🔥🔥🔥 2. SMART LEAD LOGIC (Check Duplicate) 🔥🔥🔥
      if (['Interested', 'Demo Planned', 'Order Expected', 'Follow Up'].includes(outcome)) {
          
          let leadStage = 'New';
          let leadType = 'Warm';
          let leadProbability = '25';
          let leadStatus = 'Follow up';

          // Smart Mapping
          if (outcome === 'Order Expected') {
              leadStage = 'Negotiation';
              leadType = 'Hot';
              leadProbability = '75';
          } else if (outcome === 'Demo Planned') {
              leadStage = 'Technical Review';
              leadType = 'Warm';
              leadProbability = '50';
          } else if (outcome === 'Interested') {
              leadStage = 'Introduction';
              leadType = 'Warm';
              leadProbability = '25';
          } else if (outcome === 'Follow Up') {
              leadStage = 'New';
              leadType = 'Cold';
              leadProbability = '10';
          }

          // 🔍 CHECK: Kya is Hospital ki koi Open Lead pehle se hai?
          try {
              const leadsRef = collection(db, "leads");
              // 🔥 FIX IS HERE: org -> orgName
              const q = query(leadsRef, where("orgName", "==", hospital)); 
              const querySnapshot = await getDocs(q);

              // Find active lead (Not closed)
              const existingLead = querySnapshot.docs.find(doc => {
                  const d = doc.data();
                  return d.status !== 'Closed' && d.status !== 'Converted' && d.status !== 'Lost';
              });

              if (existingLead) {
                  // ✅ UPDATE EXISTING LEAD (Merge Logic)
                  const existingData = existingLead.data();
                  const leadDocRef = doc(db, "leads", existingLead.id);

                  // Merge Product Requirements
                  let currentReqs = existingData.requirements || [];
                  let updatedReqs = [...currentReqs];
                  
                  if (product && !currentReqs.includes(product)) {
                      updatedReqs.push(product);
                  }

                  await updateDoc(leadDocRef, {
                      stage: leadStage,
                      status: leadStatus,
                      probability: leadProbability,
                      type: leadType,
                      isHot: leadType === 'Hot' ? true : existingData.isHot,
                      requirements: updatedReqs,
                      nextDate: nextDate.toISOString().split('T')[0],
                      lastUpdated: new Date().toISOString(),
                      discussion: `🔄 Updated via Sales Visit (${outcome}).\nAdded Product: ${product || 'None'}\n${discussion}\n\n` + (existingData.discussion || '')
                  });
                  console.log("✅ Existing Lead Merged & Updated");

                  // 🔔 Notification
                  await addDoc(collection(db, "notifications"), {
                      title: "Lead Merged/Updated 🔄",
                      message: `${user?.name} visited ${hospital}. New product/note added.`,
                      to: "Admin",
                      screen: "/leads", 
                      type: "info",
                      createdAt: new Date().toISOString()
                  });

              } else {
                  // ✅ CREATE NEW LEAD
                  const newLeadData = {
                      org: hospital,
                      orgName: hospital, // 🔥 FIELD ADDED
                      
                      contactPerson: person,
                      mobile: mobile,
                      address: address || city,
                      city: city,
                      
                      product: product, 
                      requirements: product ? [product] : [],
                      
                      status: leadStatus,
                      stage: leadStage,
                      probability: leadProbability,
                      isHot: leadType === 'Hot',
                      type: leadType,
                      source: 'Sales Visit',
                      
                      nextDate: nextDate.toISOString().split('T')[0],
                      date: new Date().toISOString().split('T')[0],
                      
                      userId: safeUserId, 
                      assignedTo: safeUserId,
                      senderId: safeUserId,
                      senderName: user?.name || 'Unknown',
                      role: user?.role || 'Employee',
                      
                      timestamp: Date.now(),
                      createdAt: new Date().toISOString(),
                      
                      discussion: `Auto-generated from New Visit.\nStatus: ${outcome}\nNote: ${discussion}`,
                      history: [{
                          date: new Date().toLocaleString(),
                          msg: `Lead Created from Visit. Stage: ${leadStage}`,
                          type: 'System',
                          by: 'System'
                      }]
                  };

                  await addDoc(collection(db, "leads"), newLeadData);
                  
                  // Notification for Lead
                  await addDoc(collection(db, "notifications"), {
                      title: "New Lead from Visit ⚡",
                      message: `${user?.name} created a lead for ${hospital}.`,
                      to: "Admin",
                      screen: "/leads", 
                      type: "info",
                      createdAt: new Date().toISOString()
                  });
              }
          } catch(e) {
              console.log("Error handling lead logic:", e);
          }
      }

      // Notification for Sales Visit
      try {
          await addDoc(collection(db, "notifications"), {
              title: "New Sales Visit 📍",
              message: `${user?.name} visited ${hospital} (${outcome}).`,
              to: "Admin",
              screen: "/sales", 
              read: false,
              createdAt: new Date().toISOString(),
              type: "info"
          });
      } catch (e) {}

      Alert.alert("Success", "Visit Report Submitted & Lead Updated!");
      setIsSubmitting(false); // 🔥 Stop Loading
      router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Visit (DSR)</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
        <ScrollView style={styles.contentContainer} contentContainerStyle={{paddingBottom: 100}}>
            
            <Text style={styles.label}>Hospital / Client *</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Hospital', orgList)}>
                <Text style={{color: hospital ? '#333' : 'gray', flex:1}}>{hospital || "Search Hospital..."}</Text>
                <Ionicons name="search" size={20} color="gray" />
            </TouchableOpacity>

            {hospital ? (
                <View style={styles.autoFillBox}>
                    <Text style={styles.autoFillHeader}>AUTO-FILLED DETAILS</Text>
                    <View style={styles.row}>
                        <View style={styles.col}>
                            <Text style={styles.label}>Contact Person</Text>
                            <TextInput style={styles.inputGray} value={person} onChangeText={setPerson} />
                        </View>
                        <View style={styles.col}>
                            <Text style={styles.label}>City</Text>
                            <TextInput style={styles.inputGray} value={city} onChangeText={setCity} />
                        </View>
                    </View>
                    <Text style={styles.label}>Mobile</Text>
                    <TextInput style={styles.inputGray} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
                </View>
            ) : null}

            <Text style={styles.label}>Product Discussed</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Product', getProductOptions())}>
                <Text style={{color: product ? '#333' : 'gray', flex:1}}>{product || "Select Product..."}</Text>
                <Ionicons name="cube-outline" size={20} color="gray" />
            </TouchableOpacity>
            
            {product === 'Other' && (
                <TextInput 
                    style={[styles.inputGray, {marginBottom:15, borderColor:'#3b5998'}]} 
                    placeholder="Type Product Name..." 
                    onChangeText={setProduct} 
                />
            )}

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Outcome</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Outcome', outcomeOptions)}>
                        <Text style={{color:'#333'}}>{outcome}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Next Follow Up</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                        <Text style={{color:'#333'}}>{formatDate(nextDate)}</Text>
                        <Ionicons name="calendar" size={16} color="#3b5998" />
                    </TouchableOpacity>
                    {showDatePicker && <DateTimePicker value={nextDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setNextDate(d); }} />}
                </View>
            </View>

            <Text style={styles.label}>Discussion Summary *</Text>
            <TextInput 
                style={[styles.inputGray, {height: 100, textAlignVertical:'top', backgroundColor:'#fff'}]} 
                multiline 
                placeholder="What happened in the meeting?"
                value={discussion}
                onChangeText={setDiscussion}
            />

            {/* 🔥 UPDATED BUTTON WITH LOADING */}
            <TouchableOpacity 
                style={[styles.saveButton, isSubmitting && {backgroundColor:'#9fa8da'}]} 
                onPress={handleSave} 
                disabled={isSubmitting}
            >
                {isSubmitting ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text style={styles.saveBtnText}>Submit Report</Text>
                )}
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
        </ScrollView>
      </KeyboardAvoidingView>

      {/* SEARCH MODAL */}
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
                                <Text style={styles.modalText}>{typeof item === 'string' ? item : (item.orgName || item.name)}</Text>
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No Data Found</Text>}
                />
                
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
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  contentContainer: { padding: 20 },
  
  label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13, marginTop:10 },
  autoFillBox: { backgroundColor: '#f0f8ff', padding: 10, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#d0eaff' },
  autoFillHeader: { fontSize:11, color:'#3b5998', fontWeight:'bold', marginBottom:8 },

  dropdown: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, flexDirection:'row', justifyContent:'space-between', alignItems:'center', height:50 },
  inputGray: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, fontSize:16 },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  col: { width: '48%' },
  
  saveButton: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { width:'95%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginBottom:10 },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalText: { fontSize: 16, color: '#333' },
  closeBtn: { marginTop: 15, alignItems:'center', padding: 12 },

  iconBox: { width: 35, height: 35, borderRadius: 8, justifyContent:'center', alignItems:'center', backgroundColor:'#e3f2fd' },
  modalMainText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  modalSubText: { fontSize: 12, color: 'gray' }
});