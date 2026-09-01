import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

// 🔥 SAAS IMPORTS (organizations/users still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 4: installations & products now via new backend API
import { createInstallationBatch } from '../services/api/installations';
import { listProducts } from '../services/api/products';
import { completeActivityPlan } from '../services/api/activityPlans';

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// 🔥 OCR & CAMERA IMPORT
import * as ImagePicker from 'expo-image-picker';

export default function AddInstallationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  
  const { currentUser, companyProfile, addNotification } = useData();
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  const [orgList, setOrgList] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [userList, setUserList] = useState<any[]>([]);

  const [hospital, setHospital] = useState('');
  const [orgId, setOrgId] = useState('');

  const [department, setDepartment] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  
  const [installDate, setInstallDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [engineer, setEngineer] = useState(currentUser?.name || '');

  const [product, setProduct] = useState('');
  const [model, setModel] = useState('');
  const [customProduct, setCustomProduct] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [warrantyYears, setWarrantyYears] = useState('1 Year');
  const [notes, setNotes] = useState('');

  const [customWarranty, setCustomWarranty] = useState('');
  const [manualExpiry, setManualExpiry] = useState(new Date());
  const [showManualExpiryPicker, setShowManualExpiryPicker] = useState(false);

  const [addedMachines, setAddedMachines] = useState<any[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [currentModalType, setCurrentModalType] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]); 
  const [searchText, setSearchText] = useState(''); 
  const [isSaving, setIsSaving] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  
  const warrantyOptions = ['6 Months', '1 Year', '2 Years', '3 Years', '5 Years', 'Other'];

  // 🔥 LOAD DATA — products via new API; organizations/users via Firestore
  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              const [orgs, prods, users] = await Promise.all([
                  fetchSaaSData("organizations"),
                  listProducts(), // was: fetchSaaSData("products")
                  fetchSaaSData("users"),
              ]);
              setOrgList(orgs);
              setProductList(prods);
              setUserList(users);
          }
      };
      loadData();
  }, [currentUser]);

  const getEngineerOptions = () => {
    const engineers = userList.map((u: any) => u.name);
    return [...engineers, 'Other'];
  };

  const getUniqueProductNames = () => {
      const names = productList.map((p: any) => p.name);
      return [...new Set(names), 'Other'];
  };

  const getModelOptions = () => {
      if (!product || product === 'Other') return ['Other'];
      const models = productList.filter((p: any) => p.name === product && p.model).map((p: any) => p.model);
      return [...new Set(models), 'Other'];
  };

  useEffect(() => {
      if (params.hospital && orgList.length > 0) {
          setHospital(params.hospital as string);
          setOrgId(params.orgId as string || '');
          setCity(params.city as string || '');
          setContactPerson(params.contactPerson as string || '');
          setMobile(params.mobile as string || '');
          setAddress(params.address as string || '');

          const found = orgList.find((o:any) => (o.orgName === params.hospital || o.name === params.hospital));
          if(found) selectOrganization(found);
      }
      if (params.product) {
          setProduct(params.product as string);
      }
  }, [params, orgList]);

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getWarrantyExpiry = (dateObj: Date, yearsStr: string) => {
      if (!yearsStr || yearsStr === 'Other') return '';
      const expiryDate = new Date(dateObj);
      const num = parseInt(yearsStr.split(' ')[0]) || 0;

      if (yearsStr.includes('Month')) {
          expiryDate.setMonth(expiryDate.getMonth() + num);
      } else {
          expiryDate.setFullYear(expiryDate.getFullYear() + num);
      }
      
      expiryDate.setDate(expiryDate.getDate() - 1);
      return expiryDate.toISOString().split('T')[0];
  };

  const handleCustomWarrantyChange = (text: string) => {
      setCustomWarranty(text);
      const num = parseInt(text.replace(/[^0-9]/g, '')); 
      
      if (!isNaN(num) && num > 0) {
          const newExpiry = new Date(installDate); 
          const lowerText = text.toLowerCase();
          
          if (lowerText.includes('day')) {
              newExpiry.setDate(newExpiry.getDate() + num);
          } else if (lowerText.includes('month')) {
              newExpiry.setMonth(newExpiry.getMonth() + num);
          } else if (lowerText.includes('year')) {
              newExpiry.setFullYear(newExpiry.getFullYear() + num);
          }
          
          newExpiry.setDate(newExpiry.getDate() - 1); 
          setManualExpiry(newExpiry); 
      }
  };

  const handleScanMachineLabel = async () => {
      try {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
              Alert.alert('Permission Required', 'We need camera permission to scan the label.');
              return;
          }

          const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.2, 
              base64: true,
          });

          if (!result.canceled && result.assets[0].base64) {
              setIsScanning(true);
              const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;

              const formData = new FormData();
              formData.append('base64Image', base64Image);
              formData.append('language', 'eng');
              formData.append('isOverlayRequired', 'false');

              const response = await fetch('https://api.ocr.space/parse/image', {
                  method: 'POST',
                  headers: { 'apikey': 'helloworld' },
                  body: formData,
              });

              const data = await response.json();

              if (data.IsErroredOnProcessing) {
                  Alert.alert('API Error', data.ErrorMessage?.[0] || 'Image size might be too large.');
                  return;
              }

              if (data.ParsedResults && data.ParsedResults.length > 0) {
                  const extractedText = data.ParsedResults[0].ParsedText;
                  processMachineOCR(extractedText);
              } else {
                  Alert.alert('Scan Failed', 'Could not read label clearly. Please hold steady and try again.');
              }
          }
      } catch (error) {
          Alert.alert('Error', 'Failed to scan the label. Check your internet.');
      } finally {
          setIsScanning(false);
      }
  };

  const processMachineOCR = (text: string) => {
      let foundSomething = false;
      const fullTextLower = text.toLowerCase();

      const snMatch = text.match(/(?:SN|S\/N|Serial No\.?|Serial Number|S\.N\.|Ser\.No)\s*[:\-]?\s*([A-Za-z0-9\-]{5,20})/i);
      if (snMatch && snMatch[1]) {
          setSerialNo(snMatch[1].toUpperCase());
          foundSomething = true;
      } else {
          const fallbackSN = text.match(/\b[A-Z0-9]{8,20}\b/i);
          if (fallbackSN) {
              setSerialNo(fallbackSN[0].toUpperCase());
              foundSomething = true;
          }
      }

      const modelMatch = text.match(/(?:Model|REF|M\/N|PN|P\/N|Part No\.?)\s*[:\-]?\s*([A-Za-z0-9\-]{3,15})/i);
      if (modelMatch && modelMatch[1]) {
          setModel(modelMatch[1].toUpperCase());
          foundSomething = true;
      }

      const allProducts = getUniqueProductNames() as string[]; 
      for (let prod of allProducts) {
          if (prod && prod !== 'Other' && typeof prod === 'string' && fullTextLower.includes(prod.toLowerCase())) {
              setProduct(prod);
              foundSomething = true;
              break;
          }
      }

      if (foundSomething) {
          Alert.alert("Auto-Fill Magic ✨", "Machine details extracted! Please verify the Serial Number.");
      } else {
          Alert.alert("No Details Found", "Could not confidently extract Serial No. or Model. Please fill manually.");
      }
  };

  const generateInstallationPDF = async (installId: string) => {
    try {
        const logoHTML = companyProfile?.logoUrl ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;
        const signatureHTML = companyProfile?.signatureUrl ? `<img src="${companyProfile.signatureUrl}" style="height: 40px; margin-top: 5px; margin-bottom: 2px;" />` : `<div style="height: 40px;"></div>`;

        const machineRows = addedMachines.map((m, index) => `
            <tr>
                <td style="padding:8px; border:1px solid #ddd; text-align: center;">${index + 1}</td>
                <td style="padding:8px; border:1px solid #ddd;"><b>${m.product}</b><br><span style="font-size:12px; color:#555;">Model: ${m.model || '-'}</span></td>
                <td style="padding:8px; border:1px solid #ddd;"><b>${m.serialNo}</b></td>
                <td style="padding:8px; border:1px solid #ddd; text-align: center;">${m.warrantyYears}</td>
                <td style="padding:8px; border:1px solid #ddd; text-align: center;">${m.warrantyExpiry}</td>
            </tr>
        `).join('');

        const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 30px; border: 2px solid #333; }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
              .title { font-size: 22px; font-weight: bold; color: #1a237e; text-transform: uppercase; }
              .sub-title { font-size: 12px; margin-top: 2px; color: #333; line-height: 1.4; }
              .box { border: 1px solid #000; padding: 15px; margin-top: 10px; background-color: #fcfcfc; }
              .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
              .label { font-weight: bold; color: #444; }
              .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              .table th { background-color: #eee; padding: 10px; border: 1px solid #000; text-align: left; font-size: 12px; }
              .table td { border: 1px solid #000; padding: 8px; text-align: center; vertical-align: top; }
              .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
              .sign-box { text-align: center; width: 45%; }
              .sign-line { border-top: 1px solid #000; width: 100%; margin-top: 5px; margin-bottom: 5px; }
            </style>
          </head>
          <body>
            <div class="header">
              ${logoHTML}
              ${companyProfile?.logoUrl ? `<div class="title">${companyProfile.companyName}</div>` : ''}
              <div class="sub-title">${companyProfile?.address || ''}</div>
              <div class="sub-title">Phone: ${companyProfile?.contactPhone || companyProfile?.phone || '-'} | Email: ${companyProfile?.contactEmail || companyProfile?.email || '-'}</div>
            </div>
            <h3 style="text-align: center; text-decoration: underline; margin-bottom: 20px;">INSTALLATION REPORT</h3>
            <div class="row">
              <div><span class="label">Report No:</span> <b>${installId}</b></div>
              <div><span class="label">Date:</span> ${formatDate(installDate)}</div>
            </div>
            <div class="box">
              <div style="font-size: 14px;"><b>Client Name:</b> ${hospital}</div>
              <div style="font-size: 14px; margin-top:5px;"><b>Address:</b> ${address}, ${city}</div>
              <div style="font-size: 14px; margin-top:5px;"><b>Contact:</b> ${contactPerson} (${mobile})</div>
              <div style="font-size: 14px; margin-top:5px;"><b>Department:</b> ${department || '-'}</div>
            </div>
            <table class="table">
                <thead>
                    <tr>
                        <th style="width: 5%;">#</th>
                        <th style="width: 40%;">Product / Model</th>
                        <th style="width: 25%;">Serial No.</th>
                        <th style="width: 15%;">Warranty</th>
                        <th style="width: 15%;">Expiry</th>
                    </tr>
                </thead>
                <tbody>${machineRows}</tbody>
            </table>
            <div style="margin-top: 20px; font-size: 12px; color: #555;">
                <b>Engineer Remarks:</b> ${notes || 'Installation completed successfully.'}
            </div>
            <div class="footer">
              <div class="sign-box">
                <div style="height: 60px;"></div> <div class="sign-line"></div>
                <div style="font-weight: bold;">Client Signature & Stamp</div>
              </div>
              <div class="sign-box">
                <div style="font-weight: bold; font-size: 12px;">Installed By: ${engineer}</div>
                ${signatureHTML} <div class="sign-line"></div>
                <div style="font-weight: bold;">Engineer Signature</div>
              </div>
            </div>
          </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `${installId}_${hospital.replace(/ /g, '_')}.pdf`;
        const newPath = `${(FileSystem as any).cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Report` });
        } catch (error) {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
    } catch (error) { Alert.alert("Error", "Could not generate PDF"); }
  };

  const getCurrentLocation = async () => {
      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission Denied'); return null; }
          let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          return { lat: location.coords.latitude, lng: location.coords.longitude, timestamp: new Date().toISOString() };
      } catch (error) { Alert.alert("GPS Required", "Please turn on GPS."); return null; }
  };

  const openModal = (type: string) => {
      setCurrentModalType(type); setSearchText('');
      let data: any[] = [];
      if (type === 'Hospital') data = orgList; 
      else if (type === 'Warranty') data = warrantyOptions; 
      else if (type === 'Engineer') data = getEngineerOptions(); 
      else if (type === 'Product') data = getUniqueProductNames();
      else if (type === 'Model') data = getModelOptions();
      
      setFilteredData(data); setModalVisible(true);
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
      } else { setFilteredData(sourceList); }
  };

  const selectOrganization = (orgItem: any) => {
      setHospital(orgItem.orgName || orgItem.name);
      setOrgId(orgItem.id || ''); 
      setCity(orgItem.city || orgItem.City || '');
      setAddress(orgItem.address || orgItem.address1 || orgItem.location || '');
      setContactPerson(orgItem.contactPerson || '');
      setMobile(orgItem.mobile || orgItem.phone || '');
      setModalVisible(false);
  };

  const handleSelect = (item: any) => {
      if (currentModalType === 'Hospital') {
          if (typeof item === 'string') { setHospital(item); setOrgId(''); } 
          else { selectOrganization(item); }
      }
      else if (currentModalType === 'Warranty') { setWarrantyYears(item); }
      else if (currentModalType === 'Engineer') { setEngineer(item); }
      else if (currentModalType === 'Product') { setProduct(item); setModel(''); } 
      else if (currentModalType === 'Model') { setModel(item); }
      setModalVisible(false);
  };

  const handleAddMachine = () => {
      const finalWarrantyText = warrantyYears === 'Other' ? customWarranty : warrantyYears;
      const finalExpiryDate = warrantyYears === 'Other' ? manualExpiry.toISOString().split('T')[0] : getWarrantyExpiry(installDate, warrantyYears);

      const finalProduct = product === 'Other' ? customProduct : product;
      const finalModel = model === 'Other' ? customModel : model;

      if (!finalProduct || !serialNo || !finalWarrantyText) {
          Alert.alert("Missing Info", "Product Name, Serial No, and Warranty are required.");
          return;
      }

      const machineEntry = {
          id: Date.now().toString(),
          product: finalProduct, 
          model: finalModel, 
          serialNo,
          warrantyYears: finalWarrantyText,
          warrantyExpiry: finalExpiryDate,
          note: notes
      };

      setAddedMachines([...addedMachines, machineEntry]);
      setProduct(''); setModel(''); setSerialNo(''); setNotes(''); setCustomWarranty('');
      setCustomProduct(''); setCustomModel(''); 
  };

  const removeMachine = (index: number) => {
      const newList = [...addedMachines];
      newList.splice(index, 1);
      setAddedMachines(newList);
  };

  // 🔥 SAVE LOGIC — one batch API call for all machines (server auto-generates installId)
  const handleFinalSubmit = async () => {
      if (!hospital || !department) return Alert.alert("Missing", "Select Hospital and enter Department.");
      if (addedMachines.length === 0) return Alert.alert("Empty", "Add at least one machine.");

      setIsSaving(true); 
      const locationData = await getCurrentLocation();

      try {
        const { installId } = await createInstallationBatch({
            orgId: orgId || undefined,
            orgName: hospital,
            city, address, contactPerson, mobile, department, engineer,
            date: installDate.toISOString().split('T')[0],
            location: locationData ? { latitude: locationData.lat, longitude: locationData.lng } : null,
            machines: addedMachines.map(m => ({
                product: m.product,
                model: m.model,
                serialNo: m.serialNo,
                warrantyExpiry: m.warrantyExpiry || undefined,
                note: m.note,
            })),
        });

        if (addNotification) {
            await addNotification({
                title: "Installation Completed 🛠️",
                message: `${currentUser?.name} installed ${addedMachines.length} machine(s) at ${hospital}.`,
                to: "Admin",
                route: "/installations",
                type: "success"
            });
        }

        if (params.activityId) {
            await completeActivityPlan(params.activityId as string);
        }

        Alert.alert(
            "Success ✅", 
            `Installation Report ${installId} Saved!\nDo you want to share PDF?`,
            [
                { text: "No", onPress: () => router.back(), style: 'cancel' },
                { text: "Yes, Share PDF", onPress: async () => { await generateInstallationPDF(installId); router.back(); }}
            ]
        );
      } catch (err: any) {
        Alert.alert("Error", err?.message || "Could not save installation.");
      } finally {
        setIsSaving(false);
      }
  };

  const isSubmitDisabled = !hospital || !department || addedMachines.length === 0 || isSaving;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
          <Text style={styles.headerTitle}>New Installation</Text>
          <View style={{width:24}} /> 
        </View>

        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}} keyboardShouldPersistTaps="handled">
            
            <Text style={styles.sectionHeader}>1. Client & Site Details</Text>
            <Text style={styles.label}>Hospital / Client *</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Hospital')}>
                <Text style={{color: hospital ? 'black' : 'gray'}}>{hospital || 'Select from List'}</Text>
                {isDbLoading ? <ActivityIndicator size="small" color="#3b5998"/> : <Ionicons name="search" size={18} color="gray" />}
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
                    <Text style={styles.label}>Department *</Text>
                    <TextInput style={styles.input} placeholder="e.g. ICU/OT" value={department} onChangeText={setDepartment} />
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Install Date *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                        <Text style={{color: '#333'}}>{formatDate(installDate)}</Text>
                        <Ionicons name="calendar-outline" size={18} color="gray" />
                    </TouchableOpacity>
                    {showDatePicker && <DateTimePicker value={installDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setInstallDate(d); }} />}
                </View>
            </View>

            <Text style={styles.label}>Installation Engineer</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Engineer')}>
                <Text>{engineer || currentUser?.name || 'Select Engineer'}</Text>
                <Ionicons name="caret-down" size={14} color="gray" />
            </TouchableOpacity>

            <View style={styles.divider} />
            <Text style={styles.sectionHeader}>2. Add Machine Details</Text>

            <TouchableOpacity style={[styles.scannerBtn, isScanning && {opacity: 0.6}]} onPress={handleScanMachineLabel} disabled={isScanning}>
                {isScanning ? <ActivityIndicator color="white" /> : <><Ionicons name="barcode-outline" size={22} color="white" /><Text style={styles.scannerBtnText}>Scan Machine Label (S/N)</Text></>}
            </TouchableOpacity>

            <Text style={styles.label}>Product Name *</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Product')}>
                <Text style={{color: product ? 'black' : 'gray'}}>{product || 'Select Product'}</Text>
                <Ionicons name="cube-outline" size={18} color="gray" />
            </TouchableOpacity>
            {product === 'Other' && <TextInput value={customProduct} style={[styles.input, {marginTop:5, borderColor:'#3b5998'}]} placeholder="Type Product Name..." onChangeText={setCustomProduct} />}

            <Text style={styles.label}>Model Name</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => { if(!product) Alert.alert("Wait", "Select Product first."); else openModal('Model'); }}>
                <Text style={{color: model ? 'black' : 'gray'}}>{model || 'Select Model'}</Text>
                <Ionicons name="layers-outline" size={18} color="gray" />
            </TouchableOpacity>
            {model === 'Other' && <TextInput value={customModel} style={[styles.input, {marginTop:5}]} placeholder="Type Model Name..." onChangeText={setCustomModel} />}

            <Text style={styles.label}>Serial Number *</Text>
            <TextInput style={styles.input} placeholder="e.g. AN-2025-XX" value={serialNo} onChangeText={setSerialNo} />

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Warranty *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Warranty')}>
                        <Text>{warrantyYears}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                {warrantyYears !== 'Other' && (
                    <View style={styles.col}>
                        <Text style={styles.label}>Expiry (Preview)</Text>
                        <TextInput style={[styles.input, {backgroundColor:'#eee'}]} editable={false} value={getWarrantyExpiry(installDate, warrantyYears)} />
                    </View>
                )}
            </View>

            {warrantyYears === 'Other' && (
                <View style={[styles.autoFillBox, {borderColor: '#ffb74d', backgroundColor: '#fff8e1'}]}>
                    <Text style={{fontSize:11, color:'#f57c00', fontWeight:'bold', marginBottom:8}}>CUSTOM WARRANTY DETAILS</Text>
                    <View style={styles.row}>
                        <View style={styles.col}>
                            <Text style={styles.label}>Warranty Text</Text>
                            <TextInput style={styles.inputGray} placeholder="e.g. 45 Days" value={customWarranty} onChangeText={handleCustomWarrantyChange} />
                        </View>
                        <View style={styles.col}>
                            <Text style={styles.label}>Expiry Date</Text>
                            <TouchableOpacity style={styles.inputGray} onPress={() => setShowManualExpiryPicker(true)}><Text style={{color: '#333', marginTop: 4}}>{formatDate(manualExpiry)}</Text></TouchableOpacity>
                            {showManualExpiryPicker && <DateTimePicker value={manualExpiry} mode="date" onChange={(e, d) => { setShowManualExpiryPicker(false); if(d) setManualExpiry(d); }} />}
                        </View>
                    </View>
                </View>
            )}

            <Text style={styles.label}>Accessories / Notes</Text>
            <TextInput style={[styles.input, {height: 60}]} placeholder="UPS, Stand etc." value={notes} onChangeText={setNotes} />

            <TouchableOpacity style={styles.addMachineBtn} onPress={handleAddMachine}>
                <Ionicons name="add-circle" size={20} color="white" />
                <Text style={styles.addMachineText}>Add This Machine</Text>
            </TouchableOpacity>

            {addedMachines.length > 0 && (
                <View style={styles.addedListContainer}>
                    <Text style={styles.listTitle}>Machines to be Added ({addedMachines.length})</Text>
                    {addedMachines.map((m, index) => (
                        <View key={index} style={styles.addedItem}>
                            <View style={{flex:1}}>
                                <Text style={{fontWeight:'bold'}}>{m.product} ({m.model})</Text>
                                <Text style={{fontSize:12, color:'#333'}}>SN: {m.serialNo} • Expiry: {m.warrantyExpiry}</Text>
                            </View>
                            <TouchableOpacity onPress={() => removeMachine(index)}><Ionicons name="trash-outline" size={20} color="red" /></TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}

            <TouchableOpacity 
                style={[styles.saveBtn, { backgroundColor: isSubmitDisabled ? '#ccc' : '#3b5998' }]} 
                onPress={handleFinalSubmit} 
                disabled={isSubmitDisabled}
            >
                {isSaving ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text style={styles.saveBtnText}>Submit All ({addedMachines.length})</Text>
                )}
            </TouchableOpacity>
            
        </ScrollView>

        <Modal visible={modalVisible} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select {currentModalType}</Text>
                  <View style={styles.modalSearchBox}><Ionicons name="search" size={20} color="gray" /><TextInput style={{flex:1, marginLeft:10}} placeholder="Search..." value={searchText} onChangeText={handleSearch} /></View>
                  <FlatList 
                      data={filteredData}
                      keyExtractor={(item, index) => index.toString()}
                      style={{maxHeight: 300}}
                      renderItem={({item}) => (
                          <TouchableOpacity style={styles.modalItem} onPress={() => handleSelect(item)}>
                              {currentModalType === 'Hospital' && typeof item !== 'string' ? (
                                  <View style={{flexDirection:'row', alignItems:'center'}}><View style={styles.iconBox}><Ionicons name="business" size={20} color="#3b5998" /></View><View style={{marginLeft:10}}><Text style={styles.modalMainText}>{item.orgName || item.name}</Text><Text style={styles.modalSubText}>{item.city || 'No City'}</Text></View></View>
                              ) : (
                                  <View style={{flexDirection:'row', alignItems:'center'}}><View style={[styles.iconBox, {backgroundColor:'#f3e5f5'}]}><Ionicons name={currentModalType === 'Product' ? "cube" : "radio-button-on"} size={20} color="#8e44ad" /></View><View style={{flex:1, marginLeft: 10}}><Text style={styles.modalText}>{typeof item === 'string' ? item : (item.orgName || item.name)}</Text></View><Ionicons name="add-circle-outline" size={24} color="#3b5998" /></View>
                              )}
                          </TouchableOpacity>
                      )}
                      ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No matches found</Text>}
                  />
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}><Text style={{color:'red', fontWeight:'bold'}}>Close</Text></TouchableOpacity>
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
  scannerBtn: { flexDirection: 'row', backgroundColor: '#388e3c', padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 15, elevation: 2 },
  scannerBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15, marginLeft: 8 },
  autoFillBox: { backgroundColor: '#f0f8ff', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#d0eaff' },
  inputGray: { backgroundColor: '#ffffff', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 10, fontSize: 15, color:'#333' },
  dropdown: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, flexDirection:'row', justifyContent:'space-between', alignItems:'center', height:50 },
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
