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

// 🔥 SAAS IMPORTS (organizations/users still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 3: orders & products now go through the new backend API
import { createOrder } from '../services/api/orders';
import { listProducts } from '../services/api/products';

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { recordLocationLog } from '../services/api/locationLogs';
import { fetchOrganizations } from '../services/api/organizations';
import { fetchTeamMembers } from '../services/api/users';
import { urlToBase64Image } from '../utils/pdfImageHelper';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

export default function AddOrderScreen() {
  const router = useRouter();

  const { currentUser, addNotification, companyProfile } = useData();

  // 🔥 SaaS Engine kept for organizations/users + payment_collections (advance record)
  const { fetchSaaSData, addSaaSData, isDbLoading } = useSaaSDB();

  const { mode, leadId, leadOrg, leadOrgId, leadPerson, leadMobile, leadEmail, leadCity, leadAddress, leadProduct } = useLocalSearchParams(); 

  const [orgList, setOrgList] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  // users now comes from useCachedList below (cache-first, shared 'team_members' key)

  const [hospitalName, setHospitalName] = useState('');
  const [orgId, setOrgId] = useState(''); 
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  const [saleType, setSaleType] = useState('Credit'); 

  const [poNumber, setPoNumber] = useState('');
  const [amount, setAmount] = useState('');
  
  const [advanceAmount, setAdvanceAmount] = useState(''); 
  const [advanceMode, setAdvanceMode] = useState('Cash'); 
  const [advanceRef, setAdvanceRef] = useState(''); 
  const [advanceBankName, setAdvanceBankName] = useState('');
  const [advancePdcDate, setAdvancePdcDate] = useState(new Date());
  const [showAdvancePdcPicker, setShowAdvancePdcPicker] = useState(false);

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [otherProductText, setOtherProductText] = useState('');
  
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

  // 🔥 Team members — cache-first, shares the SAME 'team_members' cache key
  // as manage_team.tsx/employee_timeline.tsx.
  const { data: users } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId && canSelectSalesPerson,
      fetcher: fetchTeamMembers,
  });

  // 🔥 Organizations/products — unchanged plain fetch-on-mount (out of
  // scope for this pass).
  useEffect(() => {
      const loadRest = async () => {
          if (currentUser?.companyId) {
              const [orgs, prods] = await Promise.all([
                  fetchOrganizations({ limit: 200 }),
                  listProducts(), // was: fetchSaaSData("products")
              ]);
              setOrgList(orgs);
              setProductList(prods);
          }
      };
      loadRest();
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
          
          if (leadProduct) {
              const prodArray = (leadProduct as string).split(',').map(p => p.trim()).filter(Boolean);
              setSelectedProducts(prodArray.length > 0 ? prodArray : [(leadProduct as string)]);
          }
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
                const logoBase64 = await urlToBase64Image(companyProfile?.logoUrl);
        const signatureBase64 = await urlToBase64Image(companyProfile?.signatureUrl);

        const logoHTML = logoBase64 
            ? `<img src="${logoBase64}" style="height: 60px; margin-bottom: 10px;" />` 
            : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = signatureBase64 
            ? `<img src="${signatureBase64}" style="height: 50px; margin-top: 10px;" />` 
            : `<div style="font-weight: bold; margin-top: 30px;">Authorized Signatory</div>`;

        const companyBankHTML = companyProfile?.bankDetails1?.accountNo 
            ? `<div style="margin-top: 20px; font-size: 10px; border: 1px dashed #ccc; padding: 10px; background:#f5f5f5;">
                <b>Our Bank Details:</b> ${companyProfile.bankDetails1.bankName} | 
                A/C: ${companyProfile.bankDetails1.accountNo} | 
                IFSC: ${companyProfile.bankDetails1.ifsc}
               </div>` 
            : '';

        const formattedProducts = orderData.productDetails ? orderData.productDetails.replace(/,|\n/g, '<br>• ') : '';

        const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #333; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #3b5998; padding-bottom: 10px; }
                .company-name { font-size: 24px; font-weight: bold; color: #3b5998; text-transform: uppercase; }
                .details-container { display: flex; justify-content: space-between; margin-bottom: 20px; }
                .box { width: 48%; padding: 10px; border: 1px solid #eee; border-radius: 5px; background: #f9f9f9; }
                .box-title { font-size: 12px; color: #888; margin-bottom: 5px; text-transform: uppercase; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th { background-color: #e3f2fd; color: #1565c0; font-weight: bold; padding: 10px; text-align: left; font-size: 12px; border: 1px solid #bbdefb; }
                td { padding: 10px; border: 1px solid #ddd; font-size: 13px; vertical-align: top; }
                .summary { border: 1px solid #ddd; border-radius: 5px; width: 40%; float: right; margin-bottom: 20px;}
                .summary-row { display: flex; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
                .summary-row.total { background-color: #e3f2fd; font-weight: bold; font-size: 16px; border-bottom: none; color: #1565c0; }
            </style>
        </head>
        <body>
            <div class="header">
                <div style="flex: 1;">
                    <div class="company-name" style="margin-top: 0;">${companyProfile?.companyName || 'Our Company'}</div>
                    <div style="font-size: 12px; margin-top: 5px; max-width: 280px; line-height: 1.5;">${companyProfile?.address || companyProfile?.addressLine || ''}</div>
                    <div style="font-size: 12px; margin-top: 4px;">Phone: ${companyProfile?.contactPhone || companyProfile?.phone || '-'} | Email: ${companyProfile?.contactEmail || companyProfile?.email || '-'}</div>
                                        ${companyProfile?.gstNumber ? `<div style="font-size: 12px; font-weight: bold; margin-top: 5px;">GSTIN: ${companyProfile.gstNumber}</div>` : ''}
                </div>
                <div style="width: 250px; text-align: right; margin-top: 0; padding-top: 0;">
                    ${logoBase64 ? `<img src="${logoBase64}" style="max-height: 120px; max-width: 240px; object-fit: contain; object-position: top; display: block; margin-left: auto;" />` : ''}
                </div>
            </div>

            <div style="text-align: center; margin: 15px 0;">
                <h2 style="margin:0; font-size: 22px; color: #1565c0; text-decoration: underline;">SALES ORDER</h2>
            </div>

            <div class="details-container">
                <div class="box">
                    <div class="box-title">Client Details</div>
                    <div style="font-weight: bold; font-size: 16px; color: #1565c0;">${orderData.hospitalName}</div>
                    <div style="font-size: 12px; margin-top: 5px;">${orderData.address || ''}, ${orderData.city || ''}</div>
                    <div style="font-size: 12px;">Contact: ${orderData.contactPerson || ''} (${orderData.mobile || ''})</div>
                </div>
                <div style="text-align: right; font-size: 13px; line-height: 1.8;">
                    <div><strong>Order ID:</strong> ${orderData.orderId}</div>
                    <div><strong>Date:</strong> ${new Date(orderData.date).toLocaleDateString('en-GB')}</div>
                    <div><strong>PO Number:</strong> ${orderData.poNumber}</div>
                    <div style="margin-top: 5px; display: inline-block; padding: 4px 8px; background-color: ${(orderData.status === 'Completed' || orderData.status === 'Billed') ? '#e8f5e9' : orderData.status === 'Dispatched' ? '#e3f2fd' : '#fff3e0'}; border-radius: 4px; color: ${(orderData.status === 'Completed' || orderData.status === 'Billed') ? '#2e7d32' : orderData.status === 'Dispatched' ? '#1565c0' : '#e65100'}; font-weight: bold;">Status: ${orderData.status}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th width="70%">Product Configuration</th>
                        <th width="30%" style="text-align:right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <strong>As per PO Details:</strong><br>
                            <span style="font-size: 11px; color: #555; white-space: pre-wrap; line-height: 1.6;">• ${formattedProducts}</span>
                        </td>
                        <td style="text-align:right; font-weight:bold; vertical-align: middle; font-size: 16px;">
                            ₹${Number(orderData.amount).toLocaleString('en-IN')}
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="summary">
                <div class="summary-row"><span>Total Order Value</span> <span>₹${Number(orderData.amount).toLocaleString('en-IN')}</span></div>
                ${orderData.advanceAmount && Number(orderData.advanceAmount) > 0 ? `<div class="summary-row" style="color: green;"><span>Advance Received</span> <span>- ₹${Number(orderData.advanceAmount).toLocaleString('en-IN')}</span></div>` : ''}
                <div class="summary-row total"><span>Balance Due</span> <span>₹${(Number(orderData.amount) - (Number(orderData.advanceAmount) || 0)).toLocaleString('en-IN')}</span></div>
            </div>

            <div style="clear: both;"></div>

            <div style="margin-top: 10px;">
                <div class="tc-title" style="color:#1565c0; font-size: 12px; font-weight: bold;">Order Terms:</div>
                <div style="margin-top: 5px; font-size: 11px;"><strong>Payment Terms:</strong> ${orderData.paymentTerms || 'As agreed'}</div>
                <div style="font-size: 11px;"><strong>Delivery Terms:</strong> ${orderData.deliveryTerms || 'As agreed'}</div>
                ${orderData.notes ? `<div style="font-size: 11px; margin-top: 5px;"><strong>Notes:</strong> ${orderData.notes}</div>` : ''}
            </div>

            ${companyBankHTML}

            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px;">
                <div style="font-size:10px; max-width:250px; color:#333;">
                    *This is a computer generated document.<br>
                    *Subject to Jurisdiction.
                </div>
                <div class="signature-box" style="text-align: center;">
                    <div style="font-weight:bold; margin-bottom: 5px; font-size: 12px;">For: ${companyProfile?.companyName || 'Our Company'}</div>
                    <div style="height: 60px; display:flex; align-items:center; justify-content:center;">
                        ${signatureHTML}
                    </div>
                    <div style="border-top: 1px solid #333; margin-top: 5px; padding-top: 5px; font-size: 11px; width: 150px;">Authorized Signatory<br><span style="font-size: 9px; color: gray;">(Booked By: ${orderData.senderName})</span></div>
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

  const toggleProductSelection = (item: string) => {
      setSelectedProducts(prev => {
          if (prev.includes(item)) {
              if (item === 'Other') setOtherProductText('');
              return prev.filter(p => p !== item);
          } else {
              return [...prev, item];
          }
      });
  };

  const getSelectedProductsText = () => {
      if (selectedProducts.length === 0) return '';
      let displayText = selectedProducts.filter(p => p !== 'Other').join(', ');
      if (selectedProducts.includes('Other') && otherProductText) {
           displayText += displayText ? `, ${otherProductText}` : otherProductText;
      } else if (selectedProducts.includes('Other')) {
           displayText += displayText ? `, Other` : 'Other';
      }
      return displayText;
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
          setModalVisible(false);
      }
      else if (currentModalType === 'Product') {
          toggleProductSelection(item);
      }
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
      try {
          if (Platform.OS === 'ios') {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') return Alert.alert("Permission Denied", "Please allow gallery access in Settings.");
          }
          let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5 });
          if (!result.canceled) setSelectedFile({ type: 'image', uri: result.assets[0].uri, name: "gallery_img.jpg" });
      } catch (error) { Alert.alert("Error", "Could not open gallery."); }
  };

  // 🔥 SAVE LOGIC — order via new backend API (auto-generates order ID,
  // auto-closes the lead if leadId given). Advance payment record still
  // goes to Firestore payment_collections until Phase 6.
  // NOTE: PO file upload is not yet wired to the new backend (needs
  // Supabase Storage) — the selected file is not persisted anywhere;
  // flagged here rather than silently dropped.
  const handleSave = async () => {
      const finalProductString = getSelectedProductsText();
      
      if (!hospitalName || !poNumber || !amount || !finalProductString) {
          Alert.alert("Missing Fields", "Please fill Hospital, PO No, Amount, Products.");
          return;
      }

      setIsSaving(true); 

      const locationData = await getCurrentLocation();

// Fire-and-forget: tag this location as an "Order" activity so it shows up
// as an orange marker on the Tracking tab's map, distinct from the plain
// background-tracker path. Never blocks/fails order-saving if this errors.
if (locationData) {
    recordLocationLog({
        latitude: locationData.lat,
        longitude: locationData.lng,
        type: 'Order',
    }).catch(() => {});
}
      
      const cleanAmount = parseFloat(amount.toString().replace(/[^0-9.]/g, '')) || 0;
      const cleanAdvance = parseFloat(advanceAmount.toString().replace(/[^0-9.]/g, '')) || 0; 

      const assignedToId = (canSelectSalesPerson && selectedSalesPerson) ? selectedSalesPerson.id : undefined;
      const finalSenderName = (canSelectSalesPerson && selectedSalesPerson) ? selectedSalesPerson.name : (currentUser?.name || 'Unknown');

      try {
          const savedOrder = await createOrder({
              orgId: orgId || undefined,
              orgName: hospitalName,
              address, city, contactPerson, mobile, email: email || undefined,
              poNumber,
              amount: cleanAmount,
              advanceAmount: cleanAdvance,
              saleType: saleType as 'Cash' | 'Credit',
              productDetails: finalProductString,
              paymentTerms, deliveryTerms, notes,
              date: poDate.toISOString().split('T')[0],
              location: locationData ? { latitude: locationData.lat, longitude: locationData.lng } : null,
              leadId: (leadId as string) || undefined,
              assignedToId,
          });

          // Record Advance Payment (still Firestore until Phase 6)
          if (cleanAdvance > 0) {
              await addSaaSData("payment_collections", {
                  orgId: orgId,
                  orgName: hospitalName,
                  amount: cleanAdvance,
                  paymentType: 'Advance',
                  mode: advanceMode,            
                  refNumber: advanceMode !== 'Cash' ? advanceRef : '',        
                  bankName: advanceMode !== 'Cash' ? advanceBankName : '',
                  pdcDate: advanceMode !== 'Cash' ? formatDate(advancePdcDate) : '',
                  date: new Date().toISOString().split('T')[0],
                  dateIso: new Date().toISOString().split('T')[0],
                  orderId: savedOrder.orderId,
                  orderRef: savedOrder.id,
                  addedBy: currentUser?.name || 'Unknown',
                  userName: finalSenderName,
                  senderId: assignedToId || currentUser?.id,
                  timestamp: Date.now(),
                  note: 'Advance received at the time of Order Booking'
              });
          }

          if (addNotification) {
              await addNotification({
                  title: "New Order Received 📦",
                  message: `Order ${savedOrder.orderId} added by ${finalSenderName} for ${hospitalName}.`,
                  to: "Admin", 
                  type: "info",
                  route: "/orders"
              });
          }

          setIsSaving(false);

          Alert.alert(
              "Order Booked! 🎉", 
              `Order ${savedOrder.orderId} has been saved successfully.\n\nDo you want to share the Order PDF now?`,
              [
                  { 
                      text: "No", 
                      style: 'cancel',
                      onPress: () => askNextSteps() 
                  },
                  { 
                      text: "Yes, Share PDF", 
                      onPress: async () => { 
                          await generateOrderPDF({ ...savedOrder, senderName: finalSenderName }); 
                          askNextSteps(); 
                      }
                  }
              ]
          );

          const askNextSteps = () => {
              Alert.alert(
                  "What's Next? 🚀",
                  "Do you want to assign installation?",
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
                                      product: finalProductString.split(',')[0]
                                  }
                              } as any);
                          }
                      }
                  ]
              );
          };

      } catch (err: any) {
          setIsSaving(false);
          Alert.alert("Error", err?.message || "Could not save order.");
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            
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

            <Text style={styles.label}>Order Type (Cash / Billed) *</Text>
            <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                <TouchableOpacity 
                    style={[styles.modeBtn, saleType === 'Cash' && styles.activeMode]} 
                    onPress={() => setSaleType('Cash')}
                >
                    <Text style={{fontSize: 13, fontWeight: 'bold', color: saleType === 'Cash' ? 'white' : '#555'}}>💵 Cash Sale</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.modeBtn, saleType === 'Credit' && styles.activeMode]} 
                    onPress={() => setSaleType('Credit')}
                >
                    <Text style={{fontSize: 13, fontWeight: 'bold', color: saleType === 'Credit' ? 'white' : '#555'}}>📄 Billed (Credit)</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>Client's PO Number *</Text>
            <TextInput style={styles.input} placeholder="e.g. PO-2025-XXX" value={poNumber} onChangeText={setPoNumber} />

            <View style={styles.row}>
                 <View style={styles.col}>
                     <Text style={styles.label}>Total Value (₹) *</Text>
                     <TextInput style={styles.input} placeholder="e.g. 500000" value={amount} onChangeText={setAmount} keyboardType="numeric" />
                 </View>
                 <View style={styles.col}>
                     <Text style={[styles.label, {color: '#2e7d32'}]}>Advance Rcvd. (₹)</Text>
                     <TextInput style={[styles.input, {borderColor: '#a5d6a7', backgroundColor: '#e8f5e9'}]} placeholder="e.g. 50000" value={advanceAmount} onChangeText={setAdvanceAmount} keyboardType="numeric" />
                 </View>
            </View>

            {parseFloat(advanceAmount || '0') > 0 && (
                <View style={{backgroundColor: '#e8f5e9', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#a5d6a7'}}>
                    <Text style={{fontWeight:'bold', color:'#2e7d32', marginBottom: 10}}>Advance Payment Details</Text>
                    
                    <Text style={{fontSize: 12, color: 'gray', marginBottom: 5}}>Payment Mode</Text>
                    <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
                        {['Cash', 'UPI', 'NEFT', 'Cheque'].map((m) => (
                            <TouchableOpacity key={m} style={[styles.modeBtn, advanceMode === m && styles.activeMode]} onPress={() => setAdvanceMode(m)}>
                                <Text style={{fontSize: 12, fontWeight: 'bold', color: advanceMode === m ? 'white' : '#555'}}>{m}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {advanceMode !== 'Cash' && (
                        <View style={{marginTop: 10}}>
                            <Text style={{fontSize: 12, color: 'gray', marginBottom: 5}}>Bank Name</Text>
                            <TextInput 
                                style={[styles.input, {backgroundColor: 'white', marginBottom: 10, paddingVertical: 8, fontSize: 13}]} 
                                placeholder="Enter Bank Name" 
                                value={advanceBankName} 
                                onChangeText={setAdvanceBankName} 
                            />

                            <Text style={{fontSize: 12, color: 'gray', marginBottom: 5}}>Reference / Cheque No.</Text>
                            <TextInput 
                                style={[styles.input, {backgroundColor: 'white', marginBottom: 10, paddingVertical: 8, fontSize: 13}]} 
                                placeholder="Txn ID / Cheque No" 
                                value={advanceRef} 
                                onChangeText={setAdvanceRef} 
                            />

                            <Text style={{fontSize: 12, color: 'gray', marginBottom: 5}}>Instrument / PDC Date</Text>
                            <TouchableOpacity 
                                style={[styles.input, {backgroundColor: 'white', marginBottom: 5, paddingVertical: 10, justifyContent: 'center'}]}
                                onPress={() => setShowAdvancePdcPicker(true)}
                            >
                                <Text style={{color: '#333', fontSize: 13}}>{formatDate(advancePdcDate)}</Text>
                            </TouchableOpacity>
                            {showAdvancePdcPicker && (
                                <DateTimePicker value={advancePdcDate} mode="date" onChange={(e, d) => { setShowAdvancePdcPicker(false); if(d) setAdvancePdcDate(d); }} />
                            )}
                        </View>
                    )}
                </View>
            )}

            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                <Text style={styles.label}>Product Configuration *</Text>
                <TouchableOpacity onPress={() => openModal('Product', getProductOptions())}>
                    <Text style={{color:'#3b5998', fontWeight:'bold', fontSize:12}}>+ Add Product</Text>
                </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
                style={[styles.dropdownBtn, { minHeight: 50, height: 'auto', alignItems: 'flex-start' }]} 
                onPress={() => openModal('Product', getProductOptions())}
            >
                <Text style={{color: selectedProducts.length > 0 ? '#333' : 'gray', flex:1, lineHeight: 22}}>
                    {getSelectedProductsText() || "Select Product(s)..."}
                </Text>
                <Ionicons name="cube-outline" size={20} color="gray" style={{marginTop: 2}} />
            </TouchableOpacity>
            
            {selectedProducts.includes('Other') && (
                <TextInput 
                    style={[styles.input, {marginBottom:15, borderColor:'#3b5998', height: 80, textAlignVertical: 'top'}]} 
                    multiline={true}
                    placeholder="Type Other Product Name(s) here..." 
                    value={otherProductText}
                    onChangeText={setOtherProductText} 
                />
            )}

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
            {selectedFile && (
                <Text style={{fontSize: 10, color: '#e65100', marginTop: -10, marginBottom: 15}}>
                    ⚠️ Attachment upload isn't wired to the server yet — this file won't be saved with the order.
                </Text>
            )}

            <Text style={styles.label}>Remarks / Notes</Text>
            <TextInput style={[styles.input, {height: 60, textAlignVertical:'top'}]} multiline placeholder="Any special instructions..." value={notes} onChangeText={setNotes} />

            <TouchableOpacity style={[styles.saveBtn, isSaving && {backgroundColor:'#ccc'}]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Submit Order</Text>}
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
            <View style={{height: 100}} />

        </ScrollView>
      </KeyboardAvoidingView>

      {/* SEARCH MODAL */}
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
                    renderItem={({item}) => {
                        const isSelected = currentModalType === 'Product' && selectedProducts.includes(item);
                        return(
                        <TouchableOpacity 
                            style={[styles.modalItem, isSelected && {backgroundColor: '#e3f2fd'}]} 
                            onPress={() => handleSelect(item)}
                        >
                            {currentModalType === 'Hospital' && typeof item !== 'string' ? (
                                <View style={{flexDirection:'row', alignItems:'center'}}>
                                    <View style={styles.iconBox}><Ionicons name="business" size={20} color="#3b5998" /></View>
                                    <View style={{marginLeft:10}}>
                                        <Text style={styles.modalMainText}>{item.orgName || item.name}</Text>
                                        <Text style={styles.modalSubText}>{item.city || 'No City'}</Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                                    <Text style={[styles.modalText, isSelected && {color: '#1976d2', fontWeight: 'bold'}]}>
                                        {typeof item === 'string' ? item : (item.name)}
                                    </Text>
                                    {currentModalType === 'Product' && (
                                        <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={24} color={isSelected ? "#1976d2" : "gray"} />
                                    )}
                                </View>
                            )}
                        </TouchableOpacity>
                    )}}
                    ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No matches found</Text>}
                />
                
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 15}}>
                    <TouchableOpacity style={[styles.closeBtn, {flex: 1, marginRight: 5}]} onPress={() => setModalVisible(false)}>
                        <Text style={{color:'red', fontWeight:'bold'}}>{currentModalType === 'Product' ? 'Close' : 'Cancel'}</Text>
                    </TouchableOpacity>
                    {currentModalType === 'Product' && (
                        <TouchableOpacity style={[styles.closeBtn, {flex: 1, marginLeft: 5, backgroundColor: '#3b5998', borderRadius: 8}]} onPress={() => setModalVisible(false)}>
                            <Text style={{color:'white', fontWeight:'bold'}}>Done</Text>
                        </TouchableOpacity>
                    )}
                </View>
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
  uploadBox: { marginBottom: 5 },
  uploadBtn: { borderStyle:'dashed', borderWidth:1.5, borderColor:'#3b5998', borderRadius:10, padding:20, alignItems:'center', backgroundColor:'#f0f4ff' },
  filePreviewCard: { flexDirection:'row', alignItems:'center', padding:10, backgroundColor:'white', borderRadius:10, borderWidth:1, borderColor:'#ddd', elevation:2 },
  previewImage: { width: 50, height: 50, borderRadius: 5, resizeMode:'cover', backgroundColor:'#eee' },
  pdfIconBox: { width: 50, height: 50, justifyContent:'center', alignItems:'center', backgroundColor:'#ffebee', borderRadius:5 },
  saveBtn: { backgroundColor: '#4caf50', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, elevation: 2 },
  saveText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  modeBtn: { flex:1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems:'center' },
  activeMode: { backgroundColor: '#3b5998' },
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
