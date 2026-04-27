import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

// 🔥 SAAS IMPORTS (Direct Firebase DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function AddOrderScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se Sirf User & Notification
  const { currentUser, companyProfile, addNotification } = useData();

  // 🔥 2. Naya SaaS Engine
  const { fetchSaaSData, addSaaSData, updateSaaSData, isDbLoading } = useSaaSDB();

  const { mode, leadId, leadOrg, leadOrgId, leadPerson, leadMobile, leadEmail, leadCity, leadAddress, leadProduct } = useLocalSearchParams(); 

  // 🔥 3. Lazy Loaded Lists
  const [orgList, setOrgList] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [orderList, setOrderList] = useState<any[]>([]); // For ID counting

  const [hospitalName, setHospitalName] = useState('');
  const [orgId, setOrgId] = useState(''); 
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

  const [poDate, setPoDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [selectedFile, setSelectedFile] = useState<any>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [currentModalType, setCurrentModalType] = useState('');

  const [selectedSalesPerson, setSelectedSalesPerson] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  const canSelectSalesPerson = ['Admin', 'Manager', 'Account', 'Accountant', 'SuperAdmin'].includes(currentUser?.role || '');

  // 🔥 4. LOAD DATA ON MOUNT
  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              const [orgs, prods, usrs, orders] = await Promise.all([
                  fetchSaaSData("organizations"),
                  fetchSaaSData("products"),
                  fetchSaaSData("users"),
                  fetchSaaSData("orders")
              ]);
              setOrgList(orgs);
              setProductList(prods);
              
              // Only load users if user is Admin/Manager to save bandwidth
              if (canSelectSalesPerson) setUsers(usrs);
              setOrderList(orders);
          }
      };
      loadData();
  }, [currentUser]);

  useEffect(() => {
      if (mode === 'from_lead') {
          setHospitalName(leadOrg as string || '');
          setOrgId(leadOrgId as string || '');
          setContactPerson(leadPerson as string || '');
          setMobile(leadMobile as string || '');
          setEmail(leadEmail as string || '');
          setCity(leadCity as string || '');
          setAddress(leadAddress as string || '');
          setProductDetails(leadProduct as string || '');
      }
  }, [mode]);

  const getProductOptions = () => {
      const dbProducts = productList.map((p: any) => p.model ? `${p.name} - ${p.model}` : p.name);
      return [...dbProducts, "Other"];
  };

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // 🔥 PDF GENERATOR
  const generateOrderPDF = async (orderData: any) => {
    try {
        const logoHTML = companyProfile?.logoUrl 
            ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` 
            : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = companyProfile?.signatureUrl 
            ? `<img src="${companyProfile.signatureUrl}" style="height: 50px; margin-top: 10px;" />` 
            : `<div style="font-weight: bold; margin-top: 30px;">Authorized Signatory</div>`;

        const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 30px; border: 2px solid #333; }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
              .title { font-size: 22px; font-weight: bold; color: #1a237e; text-transform: uppercase; }
              .sub-title { font-size: 12px; margin-top: 2px; color: #333; line-height: 1.4; }
              .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
              .label { font-weight: bold; color: #444; }
              .box { border: 1px solid #000; padding: 15px; margin-top: 10px; background-color: #fcfcfc; }
              .amount-box { display: inline-block; border: 2px solid #000; padding: 8px 25px; font-weight: bold; font-size: 18px; margin-top: 10px; }
              .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
              .sign-box { text-align: center; }
            </style>
          </head>
          <body>
            <div class="header">
              ${logoHTML}
              ${companyProfile?.logoUrl ? `<div class="title">${companyProfile.companyName}</div>` : ''}
              <div class="sub-title">${companyProfile?.address || ''}</div>
              <div class="sub-title">Phone: ${companyProfile?.contactPhone || companyProfile?.phone || '-'} | Email: ${companyProfile?.contactEmail || companyProfile?.email || '-'}</div>
              <div class="sub-title">${companyProfile?.gstNumber ? `GSTIN: ${companyProfile.gstNumber}` : ''}</div>
            </div>

            <h3 style="text-align: center; text-decoration: underline;">ORDER ACKNOWLEDGEMENT</h3>

            <div class="row">
              <div><span class="label">Order ID:</span> <b>${orderData.orderId}</b></div>
              <div><span class="label">Date:</span> ${new Date(orderData.date).toLocaleDateString('en-GB')}</div>
            </div>

            <div class="box">
              <div class="label" style="text-decoration: underline; margin-bottom: 5px;">Client Details:</div>
              <div style="font-size: 16px; font-weight: bold;">${orderData.hospitalName}</div>
              <div>${orderData.address}, ${orderData.city}</div>
              <div style="margin-top: 5px;">Contact: ${orderData.contactPerson} (${orderData.mobile})</div>
            </div>

            <div class="box">
              <div class="label" style="text-decoration: underline; margin-bottom: 5px;">Order Details:</div>
              <div><span class="label">PO Number:</span> ${orderData.poNumber}</div>
              <div style="margin-top: 5px;"><span class="label">Product Config:</span><br>${orderData.productDetails.replace(/\n/g, '<br>')}</div>
            </div>

            <div class="box">
              <div><span class="label">Payment Terms:</span> ${orderData.paymentTerms || 'Standard'}</div>
              <div><span class="label">Delivery Terms:</span> ${orderData.deliveryTerms || 'Standard'}</div>
              ${orderData.notes ? `<div style="margin-top:5px;"><span class="label">Notes:</span> ${orderData.notes}</div>` : ''}
            </div>

            <div style="text-align: right; margin-top: 20px;">
              <div style="font-weight: bold;">Total Order Value</div>
              <div class="amount-box">₹ ${Number(orderData.amount).toLocaleString('en-IN')}/-</div>
            </div>

            <div class="footer">
              <div>
                * This is a computer generated document.<br>
                * Subject to Jurisdiction.
              </div>
              <div class="sign-box">
                <div style="margin-bottom: 5px;">Booked By: <b>${orderData.senderName}</b></div>
                ${signatureHTML}
              </div>
            </div>
          </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `Order_${orderData.orderId}.pdf`;
        const newPath = `${(FileSystem as any).cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Order PDF` });
        } catch (error) {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
    } catch (error) {
        Alert.alert("Error", "Could not generate PDF");
    }
  };

  const getCurrentLocation = async () => {
      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return null;
          let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          return { lat: location.coords.latitude, lng: location.coords.longitude, timestamp: new Date().toISOString() };
      } catch (error) { return null; }
  };

  // 🔥 5. SMART SAAS FY ORDER ID GENERATOR
  const generateOrderId = () => {
      const targetMonth = poDate.getMonth(); 
      const targetYear = poDate.getFullYear();
      const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
      const fyString = `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

      const fyStartDateStr = `${fyStartYear}-04-01`;
      const fyEndDateStr = `${fyStartYear + 1}-03-31`;

      const count = orderList ? orderList.filter((c: any) => {
          const dDate = c.dateIso || c.date; 
          if (!dDate) return false;
          return dDate >= fyStartDateStr && dDate <= fyEndDateStr;
      }).length + 1 : 1;

      const prefix = companyProfile?.shortName ? companyProfile.shortName.toUpperCase() : 'ORD';
      return `${prefix}-${fyString}-${String(count).padStart(3, '0')}`;
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
      else if(currentModalType === 'Product') sourceData = getProductOptions();

      if (text) {
          const newData = sourceData.filter(item => {
              if (typeof item === 'string') return item.toLowerCase().includes(text.toLowerCase());
              return (item.orgName || item.name || '').toLowerCase().includes(text.toLowerCase()) || 
                     (item.city || '').toLowerCase().includes(text.toLowerCase());
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
              setOrgId(item.id || ''); 
              setCity(item.city || '');
              setAddress(item.address || '');
              setContactPerson(item.contactPerson || '');
              setMobile(item.mobile || '');
              setEmail(item.email || '');
          } else {
              setHospitalName(item);
              setOrgId('');
          }
      }
      else if (currentModalType === 'Product') {
          if (item !== 'Other') setProductDetails(prev => prev ? `${prev}, ${item}` : item);
      }
      setModalVisible(false);
  };

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
          const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
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

  // 🔥 6. SAAS SAVE LOGIC
  const handleSave = async () => {
      if (!hospitalName || !poNumber || !amount || !productDetails) {
          Alert.alert("Missing Fields", "Please fill Hospital, PO No, Amount, Products.");
          return;
      }

      setIsSaving(true); 

      const locationData = await getCurrentLocation();
      const newOrderId = generateOrderId();
      const cleanAmount = parseFloat(amount.toString().replace(/[^0-9.]/g, '')) || 0;

      let finalSenderId = currentUser?.id || 'guest';
      let finalSenderName = currentUser?.name || 'Unknown';
      let finalRole = currentUser?.role || 'Employee';

      // Override if Admin selected a different Sales Person
      if (canSelectSalesPerson && selectedSalesPerson) {
          finalSenderId = selectedSalesPerson.id;
          finalSenderName = selectedSalesPerson.name;
          finalRole = selectedSalesPerson.role || 'Sales Executive';
      }

      // Payload
      const newOrder = {
          orderId: newOrderId, 
          orgId: orgId,
          date: poDate.toISOString().split('T')[0], 
          dateIso: poDate.toISOString().split('T')[0], 
          hospitalName, address, city, contactPerson, mobile, email,
          poNumber, amount: cleanAmount, productDetails, 
          paymentTerms, deliveryTerms, notes,
          status: 'Pending', 
          poFileName: selectedFile?.name || '',
          poFileUri: selectedFile?.uri || '',
          poFileType: selectedFile?.type || '',
          bookedBy: currentUser?.name,        
          location: locationData || null
      };

      try {
          const res = await addSaaSData("orders", { ...newOrder, senderId: finalSenderId, senderName: finalSenderName, role: finalRole });

          if (res.success) {
              // 🔥 MAGIC: AUTO-CLOSE LEAD IF ORDER IS BOOKED FROM LEAD PAGE
              if (leadId) {
                  await updateSaaSData("leads", leadId as string, {
                      status: 'Converted', 
                      stage: 'Order Closed',
                      isHot: false,
                      type: 'Won',
                      discussion: `🎉 Order Booked! (Order ID: ${newOrderId})\nValue: ₹${cleanAmount.toLocaleString('en-IN')}\n\n` 
                  });
              }

              // PUSH NOTIFICATION
              if (addNotification) {
                  await addNotification({
                      title: "New Order Received 📦",
                      message: `Order ${newOrderId} added by ${finalSenderName} for ${hospitalName}.`,
                      to: "Admin", 
                      type: "info",
                      route: "/orders"
                  });
              }

              setIsSaving(false);

              // 🔥 2-STEP MAGIC HANDOFF LOGIC
              Alert.alert(
                  "Order Booked! 🎉", 
                  `Order ${newOrderId} has been saved successfully.\n\nDo you want to share the Order PDF now?`,
                  [
                      { 
                          text: "No", 
                          style: 'cancel',
                          onPress: () => askNextSteps() 
                      },
                      { 
                          text: "Yes, Share PDF", 
                          onPress: async () => { 
                              // Use the correct ID for the PDF logic
                              await generateOrderPDF({ ...newOrder, id: res.id, senderName: finalSenderName }); 
                              askNextSteps(); 
                          }
                      }
                  ]
              );

              // 🛠️ Step 2: Next Action Function
              const askNextSteps = () => {
                  Alert.alert(
                      "What's Next? 🚀",
                      "Do you want to take advance payment or assign installation?",
                      [
                          { 
                              text: "Just Close", 
                              style: 'cancel',
                              onPress: () => {
                                  router.back(); 
                                  if(mode === 'from_lead') router.back();
                              }
                          },
                          { 
                              text: "Assign Install 🛠️", 
                              onPress: () => { 
                                  router.replace({
                                      pathname: '/add_installation',
                                      params: {
                                          hospital: hospitalName,
                                          orgId: orgId,
                                          city: city,
                                          contactPerson: contactPerson,
                                          mobile: mobile,
                                          address: address,
                                          product: productDetails.split(',')[0]
                                      }
                                  } as any);
                              }
                          },
                          { 
                              text: "Add Advance 💸", 
                              onPress: () => { 
                                  router.replace({
                                      pathname: '/add_payment',
                                      params: { 
                                          orgName: hospitalName, 
                                          amount: cleanAmount, 
                                          linkedId: res.id, 
                                          billNo: newOrderId, 
                                          source: 'orders' 
                                      }
                                  } as any);
                              }
                          }
                      ]
                  );
              };

          } else {
              Alert.alert("Error", "Could not save order.");
          }

      } catch (err) {
          setIsSaving(false);
          Alert.alert("Error", "Could not save order.");
      }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{mode === 'from_lead' ? 'Book Order from Lead' : 'New Order Booking'}</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.content}>
            
            {mode === 'from_lead' && (
                <View style={{backgroundColor: '#e8f5e9', padding: 10, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#a5d6a7'}}>
                    <Text style={{color: '#2e7d32', fontWeight: 'bold', fontSize: 12}}>🎉 Lead Data Auto-Filled. Book your order!</Text>
                </View>
            )}

            {canSelectSalesPerson && (
                <View style={{marginBottom: 20}}>
                    <Text style={[styles.label, {color:'#d32f2f'}]}>Book Order For</Text>
                    <TouchableOpacity style={styles.dropdownBtn} onPress={() => setShowUserModal(true)}>
                        <Text style={{color: '#333', fontSize:16, fontWeight: 'bold'}}>
                            {selectedSalesPerson ? `👤 ${selectedSalesPerson.name}` : `👤 ${currentUser?.name} (Me)`}
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
                {isDbLoading ? <ActivityIndicator size="small" color="#3b5998"/> : <Ionicons name="search" size={20} color="gray" />}
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
                <Text style={styles.saveText}>{isSaving ? 'Processing...' : 'Submit Order & Close Lead'}</Text>
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
                                    <View style={[styles.iconBox, {backgroundColor:'#f3e5f5'}]}><Ionicons name={currentModalType === 'Product' ? "cube" : "radio-button-on"} size={20} color="#8e44ad" /></View>
                                    <View style={{flex:1, marginLeft: 10}}><Text style={styles.modalText}>{typeof item === 'string' ? item : item.name}</Text></View>
                                    <Ionicons name="add-circle-outline" size={24} color="#3b5998" />
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No matches found</Text>}
                />
                
                <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                    <Text style={{color:'gray'}}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

      {/* USER MODAL */}
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
                      <Text style={{color:'#d32f2f', fontWeight:'bold'}}>Reset to Me ({currentUser?.name})</Text>
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
  saveBtn: { backgroundColor: '#4caf50', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, elevation: 2 },
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