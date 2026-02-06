import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
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
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

export default function AddOrderScreen() {
  const router = useRouter();
  
  const { addOrder, orgList, user, productList = [] } = useData();
  const getColor = (char: string) => {
      const colors = ['#e57373', '#ba68c8', '#64b5f6', '#4db6ac', '#81c784', '#ffb74d', '#a1887f', '#90a4ae'];
      const index = char.charCodeAt(0) % colors.length;
      return colors[index];
  };

  // STATES
  const [hospitalName, setHospitalName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  const [poNumber, setPoNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [productDetails, setProductDetails] = useState(''); 
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [notes, setNotes] = useState('');
  
  const [isSaving, setIsSaving] = useState(false); 

  // DATES
  const [poDate, setPoDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // FILE
  const [selectedFile, setSelectedFile] = useState<any>(null);

  // MODAL
  const [modalVisible, setModalVisible] = useState(false);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [currentModalType, setCurrentModalType] = useState('');

  // 🔥 SALES PERSON SELECTION
  const [users, setUsers] = useState<any[]>([]);
  const [selectedSalesPerson, setSelectedSalesPerson] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  const canSelectSalesPerson = ['Admin', 'Manager', 'Account', 'Accountant'].includes(user?.role || '');

  // PRODUCT OPTIONS
  const getProductOptions = () => {
      const dbProducts = productList.map((p: any) => {
          return p.model ? `${p.name} - ${p.model}` : p.name;
      });
      return [...dbProducts, "Other"];
  };

  // FETCH USERS
  useEffect(() => {
      if (canSelectSalesPerson) {
          const fetchUsers = async () => {
              const q = query(collection(db, "users"));
              const snap = await getDocs(q);
              const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              setUsers(list);
          };
          fetchUsers();
      }
  }, [user]);

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // LOCATION LOGIC
  const getCurrentLocation = async () => {
      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Location access is required to submit order.');
              return null;
          }
          let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          return {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
              timestamp: new Date().toISOString()
          };
      } catch (error) {
          Alert.alert("GPS Required", "Please turn on GPS to submit.");
          return null;
      }
  };

  const generateOrderId = async () => {
      try {
          const currentYear = new Date().getFullYear();
          const counterRef = doc(db, 'settings', 'order_counter'); 
          
          const docSnap = await getDoc(counterRef);
          let newCount = 1;

          if (docSnap.exists()) {
              const data = docSnap.data();
              if (data.year === currentYear) {
                  newCount = (data.count || 0) + 1;
              } else {
                  newCount = 1;
              }
          }

          await setDoc(counterRef, { count: newCount, year: currentYear }, { merge: true });
          return `ORD-${currentYear}-${String(newCount).padStart(2, '0')}`;
      } catch (error) {
          return `ORD-${Date.now()}`; 
      }
  };

  // MODAL LOGIC
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
              setHospitalName(item.orgName || item.name); 
              setCity(item.city || '');
              setAddress(item.address || '');
              setContactPerson(item.contactPerson || '');
              setMobile(item.mobile || '');
              setEmail(item.email || '');
          } else {
              setHospitalName(item);
          }
      }
      else if (currentModalType === 'Product') {
          if (item !== 'Other') {
              setProductDetails(prev => prev ? `${prev}, ${item}` : item);
          }
      }
      setModalVisible(false);
  };

  // UPLOAD LOGIC
  const handleUploadOptions = () => {
      Alert.alert("Upload PO", "Select file type", [
          { text: "Cancel", style: "cancel" },
          { text: "PDF Document 📄", onPress: pickDocument },
          { text: "Image (Camera/Gallery) 📸", onPress: showImageOptions },
      ]);
  };

  const showImageOptions = () => {
      Alert.alert("Select Image", "Choose source", [
          { text: "Camera", onPress: openCamera },
          { text: "Gallery", onPress: openGallery },
          { text: "Back", style: "cancel" },
      ]);
  };

  const pickDocument = async () => {
      try {
          const result = await DocumentPicker.getDocumentAsync({
              type: 'application/pdf',
              copyToCacheDirectory: true
          });
          if (!result.canceled && result.assets && result.assets.length > 0) {
              const file = result.assets[0];
              setSelectedFile({ type: 'pdf', uri: file.uri, name: file.name });
          }
      } catch (err) {}
  };

  const openCamera = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return Alert.alert("Permission Denied");
      let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5 });
      if (!result.canceled) setSelectedFile({ type: 'image', uri: result.assets[0].uri, name: "camera_img.jpg" });
  };

  const openGallery = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return Alert.alert("Permission Denied");
      let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5 });
      if (!result.canceled) setSelectedFile({ type: 'image', uri: result.assets[0].uri, name: "gallery_img.jpg" });
  };

  // --- SAVE LOGIC (🔥 FIXED HERE) ---
  const handleSave = async () => {
      if (!hospitalName || !poNumber || !amount || !productDetails) {
          Alert.alert("Missing Fields", "Please fill Hospital, PO No, Amount, Products.");
          return;
      }

      setIsSaving(true); 

      const locationData = await getCurrentLocation();
      if (!locationData) { 
          setIsSaving(false); 
          return; 
      }

      const newOrderId = await generateOrderId();
      const cleanAmount = parseFloat(amount.toString().replace(/[^0-9.]/g, '')) || 0;

      // 🔥 FIXED: Robust Name Selection Logic
      let finalSenderId = user?.uid || user?.id || 'guest';
      let finalSenderName = user?.name || 'Unknown';
      let finalRole = user?.role || 'Employee';

      // Check if Admin selected someone else
      // Only if canSelectSalesPerson is TRUE AND selectedSalesPerson is NOT NULL
      if (canSelectSalesPerson && selectedSalesPerson) {
          console.log("Saving for Selected Person:", selectedSalesPerson.name);
          finalSenderId = selectedSalesPerson.id;
          finalSenderName = selectedSalesPerson.name; // This sets the name to 'Satish' or 'Preeti'
          finalRole = selectedSalesPerson.role || 'Sales Executive';
      } else {
          console.log("Saving for SELF (Admin/User):", user?.name);
      }

      const newOrder = {
          id: Date.now().toString(),
          orderId: newOrderId, 
          date: poDate.toISOString().split('T')[0], 
          
          hospitalName, address, city, contactPerson, mobile, email,
          
          poNumber, 
          amount: cleanAmount,
          productDetails, 
          paymentTerms, deliveryTerms, notes,
          
          status: 'Pending', 
          
          poFileName: selectedFile?.name || '',
          poFileUri: selectedFile?.uri || '',
          poFileType: selectedFile?.type || '',

          // ✅ Correct Data Saving
          senderId: finalSenderId,      
          senderName: finalSenderName,  
          userName: finalSenderName,    
          role: finalRole,
          
          bookedBy: user?.name,        
          
          timestamp: Date.now(),
          location: locationData
      };

      console.log("FINAL ORDER OBJECT:", newOrder); // Check logs for verification

      await addOrder(newOrder);

      // Notification
      try {
          await addDoc(collection(db, "notifications"), {
              title: `New Order: ${newOrderId} 🎉`,
              message: `${finalSenderName} booked order from ${hospitalName} (Value: ₹${cleanAmount}).`,
              to: "Admin",
              route: "/orders",
              read: false,
              createdAt: new Date().toISOString(),
              type: "success"
          });
      } catch (e) {}

      setIsSaving(false);
      Alert.alert("Success", `Order ${newOrderId} Booked for ${finalSenderName}!`);
      router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Order Booking</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.content}>
            
            {/* SALES PERSON SELECTOR (Removed Self Option) */}
            {canSelectSalesPerson && (
                <View style={{marginBottom: 20}}>
                    <Text style={[styles.label, {color:'#d32f2f'}]}>Book Order For</Text>
                    <TouchableOpacity style={styles.dropdownBtn} onPress={() => setShowUserModal(true)}>
                        <Text style={{color: '#333', fontSize:16, fontWeight: 'bold'}}>
                            {/* 🔥 Default 'Me' dikhayega agar koi select nahi hai */}
                            {selectedSalesPerson ? `👤 ${selectedSalesPerson.name}` : `👤 ${user?.name} (Me)`}
                        </Text>
                        <Ionicons name="caret-down" size={20} color="gray" />
                    </TouchableOpacity>
                </View>
            )}

            <Text style={styles.label}>PO Date</Text>
            <TouchableOpacity style={styles.dropdownBtn} onPress={() => setShowDatePicker(true)}>
                <Text style={{color: '#333', fontSize:16}}>{formatDate(poDate)}</Text>
                <Ionicons name="calendar-outline" size={20} color="gray" />
            </TouchableOpacity>
            {showDatePicker && <DateTimePicker value={poDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setPoDate(d); }} />}

            <Text style={styles.label}>Select Client / Hospital *</Text>
            <TouchableOpacity style={styles.dropdownBtn} onPress={() => openModal('Hospital', orgList)}>
                <Text style={{color: hospitalName ? '#333' : 'gray', fontSize:16}}>
                    {hospitalName || "Select from Organization List"}
                </Text>
                <Ionicons name="search" size={20} color="gray" />
            </TouchableOpacity>

            <View style={styles.row}>
                 <View style={styles.col}><Text style={styles.label}>City</Text><TextInput style={styles.inputDisabled} value={city} editable={false} placeholder="Auto" /></View>
                 <View style={styles.col}><Text style={styles.label}>Contact Person</Text><TextInput style={styles.inputDisabled} value={contactPerson} editable={false} placeholder="Auto" /></View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>Client's PO Number *</Text>
            <TextInput style={styles.input} placeholder="e.g. PO-2025-XXX" value={poNumber} onChangeText={setPoNumber} />

            <Text style={styles.label}>Total Order Value (₹) *</Text>
            <TextInput style={styles.input} placeholder="e.g. 500000" value={amount} onChangeText={setAmount} keyboardType="numeric" />

            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                <Text style={styles.label}>Product Configuration *</Text>
                <TouchableOpacity onPress={() => openModal('Product', getProductOptions())}>
                    <Text style={{color:'#3b5998', fontWeight:'bold', fontSize:12}}>+ Add Product</Text>
                </TouchableOpacity>
            </View>
            <TextInput 
                style={[styles.input, {height: 80, textAlignVertical:'top'}]} 
                multiline placeholder="e.g. 2x Ventilator with UPS..." 
                value={productDetails} onChangeText={setProductDetails} 
            />

            <View style={styles.row}>
                 <View style={styles.col}><Text style={styles.label}>Payment Terms</Text><TextInput style={styles.input} placeholder="e.g. 100% Advance" value={paymentTerms} onChangeText={setPaymentTerms} /></View>
                 <View style={styles.col}><Text style={styles.label}>Delivery Terms</Text><TextInput style={styles.input} placeholder="e.g. 4-6 Weeks" value={deliveryTerms} onChangeText={setDeliveryTerms} /></View>
            </View>

            <Text style={styles.label}>Upload Purchase Order</Text>
            <View style={styles.uploadBox}>
                {selectedFile ? (
                    <View style={styles.filePreviewCard}>
                        {selectedFile.type === 'image' ? (
                            <Image source={{ uri: selectedFile.uri }} style={styles.previewImage} />
                        ) : (
                            <View style={styles.pdfIconBox}><Ionicons name="document-text" size={40} color="#e53935" /></View>
                        )}
                        <View style={{flex:1, marginLeft:10}}>
                            <Text style={{fontWeight:'bold', color:'#333'}} numberOfLines={1}>{selectedFile.name}</Text>
                            <Text style={{fontSize:12, color: 'gray'}}>{selectedFile.type === 'pdf' ? 'PDF Document' : 'Image File'}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSelectedFile(null)} style={{padding:5}}><Ionicons name="trash" size={22} color="gray" /></TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.uploadBtn} onPress={handleUploadOptions}>
                        <Ionicons name="cloud-upload-outline" size={28} color="#3b5998" />
                        <Text style={{color:'#3b5998', fontWeight:'bold', marginTop:5}}>Tap to Upload PO</Text>
                    </TouchableOpacity>
                )}
            </View>

            <Text style={styles.label}>Remarks / Notes</Text>
            <TextInput style={[styles.input, {height: 60, textAlignVertical:'top'}]} multiline placeholder="Any special instructions..." value={notes} onChangeText={setNotes} />

            <TouchableOpacity style={[styles.saveBtn, isSaving && {backgroundColor:'#ccc'}]} onPress={handleSave} disabled={isSaving}>
                <Text style={styles.saveText}>{isSaving ? 'Processing...' : 'Submit Order'}</Text>
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
            <View style={{height: 100}} />

        </ScrollView>
      </KeyboardAvoidingView>

      {/* SEARCH MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
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
        {/* Colorful Icon Box */}
        <View style={{
            width: 40, 
            height: 40, 
            borderRadius: 20, 
            backgroundColor: getColor((typeof item === 'string' ? item : item.name).charAt(0)), 
            justifyContent: 'center', 
            alignItems: 'center',
            marginRight: 12
        }}>
            <Text style={{color: 'white', fontWeight: 'bold', fontSize: 18}}>
                {(typeof item === 'string' ? item : item.name).charAt(0).toUpperCase()}
            </Text>
        </View>

        {/* Product Name */}
        <View style={{flex:1}}>
            <Text style={{fontSize: 16, color: '#333', fontWeight: '500'}}>
                {typeof item === 'string' ? item : item.name}
            </Text>
            {/* Agar "Other" nahi hai to "Product" likha hua dikhao */}
            {item !== 'Other' && <Text style={{fontSize: 10, color: 'gray'}}>PRODUCT ITEM</Text>}
        </View>

        {/* Arrow Icon */}
        <Ionicons name="add-circle-outline" size={24} color="#3b5998" />
    </View>
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No Matches Found</Text>}
                />
                <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                    <Text style={{color:'red'}}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

      {/* USER MODAL (Removed Self Button) */}
      <Modal visible={showUserModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Sales Person</Text>
                
                <FlatList 
                    data={users}
                    keyExtractor={(item) => item.id}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => { setSelectedSalesPerson(item); setShowUserModal(false); }}>
                            <Ionicons name="person-circle" size={24} color="#3b5998" />
                            <Text style={[styles.modalText, {marginLeft:10}]}>{item.name}</Text>
                        </TouchableOpacity>
                    )}
                />
                
                <TouchableOpacity style={{padding:15, alignItems:'center', borderTopWidth:1, borderColor:'#eee'}} onPress={() => { setSelectedSalesPerson(null); setShowUserModal(false); }}>
                     <Text style={{color:'#d32f2f', fontWeight:'bold'}}>Reset to Me ({user?.name})</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.closeBtn} onPress={() => setShowUserModal(false)}>
                    <Text style={{color:'gray'}}>Close</Text>
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
  content: { padding: 20, paddingBottom: 50 },
  label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13 },
  input: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, marginBottom: 15, fontSize:16 },
  inputDisabled: { backgroundColor: '#f0f0f0', borderRadius: 8, padding: 12, marginBottom: 15, color:'#555' },
  dropdownBtn: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor: 'white', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
  divider: { height:1, backgroundColor:'#eee', marginVertical:10 },
  uploadBox: { marginBottom: 20 },
  uploadBtn: { borderStyle:'dashed', borderWidth:1.5, borderColor:'#3b5998', borderRadius:10, padding:20, alignItems:'center', backgroundColor:'#f0f4ff' },
  filePreviewCard: { flexDirection:'row', alignItems:'center', padding:10, backgroundColor:'white', borderRadius:10, borderWidth:1, borderColor:'#ddd', elevation:2 },
  previewImage: { width: 50, height: 50, borderRadius: 5, resizeMode:'cover', backgroundColor:'#eee' },
  pdfIconBox: { width: 50, height: 50, justifyContent:'center', alignItems:'center', backgroundColor:'#ffebee', borderRadius:5 },
  saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  saveText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding:20 },
  modalContent: { width: '100%', backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign:'center', color:'#3b5998' },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { flexDirection:'row', alignItems:'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalText: { fontSize: 16, color: '#333' },
  modalMainText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  modalSubText: { fontSize: 12, color: 'gray' },
  iconBox: { width: 35, height: 35, borderRadius: 8, justifyContent:'center', alignItems:'center', backgroundColor:'#e3f2fd' },
  closeBtn: { marginTop: 15, alignItems: 'center', padding: 10 }
});