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
import { urlToBase64Image } from '../utils/pdfImageHelper';

// 🔥 SAAS IMPORTS (organizations/products still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 2: demos now go through the new backend API
import { completeActivityPlan } from '../services/api/activityPlans';
import { createDemo, listDemos, updateDemo } from '../services/api/demos';
import { recordLocationLog } from '../services/api/locationLogs';
import { fetchOrganizations } from '../services/api/organizations';
import { listProducts } from '../services/api/products';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function AddDemoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  // 🔥 Edit mode: demo.tsx passes editId + the existing field values via
  // router params when the user taps "Edit" on a past demo record.
  const editId = params.editId as string | undefined;
  const isEditMode = !!editId;

  const { currentUser, companyProfile, addNotification } = useData();

  // 🔥 SaaS Engine kept for organizations/products
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  const [orgList, setOrgList] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [demoList, setDemoList] = useState<any[]>([]);
  
  const [customProduct, setCustomProduct] = useState(''); 
  const [customModel, setCustomModel] = useState('');

  const [hospital, setHospital] = useState('');
  const [orgId, setOrgId] = useState('');
  const [department, setDepartment] = useState('');
  
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  const [demoDate, setDemoDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  const [modalVisible, setModalVisible] = useState(false);
  const [currentModalType, setCurrentModalType] = useState('');
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]);

  // 🔥 LOAD DATA — demos via new API; orgs via Firestore; products via new API
  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              const [orgs, prods, demos] = await Promise.all([
                  fetchOrganizations({ limit: 200 }),
                  listProducts(), // was: fetchSaaSData("products")
                  listDemos() // was: fetchSaaSData("demos")
              ]);
              setOrgList(orgs);
              setProductList(prods);
              setDemoList(demos);
          }
      };
      loadData();
  }, [currentUser]);

  const getUniqueProductNames = () => {
      const names = productList.map((p: any) => p.name);
      return [...new Set(names), 'Other'];
  };

  const getModelOptions = () => {
      if (!product || product === 'Other') return ['Other'];
      const models = productList
          .filter((p: any) => p.name === product && p.model)
          .map((p: any) => p.model);
      return [...new Set(models), 'Other'];
  };

  // 🔥 Edit mode: pre-fill every field from the params passed by demo.tsx.
  // Runs once, on mount — editId won't change mid-screen.
  useEffect(() => {
      if (isEditMode) {
          setHospital((params.hospital as string) || '');
          setOrgId((params.orgId as string) || '');
          setAddress((params.address as string) || '');
          setCity((params.city as string) || '');
          setDepartment((params.department as string) || '');
          setProduct((params.product as string) || '');
          setModel((params.model as string) || '');
          setSerialNo((params.serialNo as string) || '');
          setContactPerson((params.contactPerson as string) || '');
          setDesignation((params.designation as string) || '');
          setContactNumber((params.contactNumber as string) || '');
          setEmail((params.email as string) || '');
          setDuration((params.duration as string) || '');
          setResult((params.result as string) || '');
          setNotes((params.notes as string) || '');
          if (params.date) {
              const parsed = new Date(params.date as string);
              if (!isNaN(parsed.getTime())) setDemoDate(parsed);
          }
      }
  }, []);

  useEffect(() => {
      if (!isEditMode && params.hospital && orgList.length > 0) {
          setHospital(params.hospital as string);
          const found = orgList.find((o:any) => (o.orgName === params.hospital || o.name === params.hospital));
          if(found) selectOrganization(found);
      }
  }, [params, orgList]);

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // 🔥 SMART FY DEMO ID GENERATOR (still client-side, cosmetic reference number)
  const generateDemoId = () => {
      const targetMonth = demoDate.getMonth(); 
      const targetYear = demoDate.getFullYear();
      
      const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
      const fyString = `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;
      const fyStartDateStr = `${fyStartYear}-04-01`;
      const fyEndDateStr = `${fyStartYear + 1}-03-31`;

      const count = demoList ? demoList.filter((d: any) => {
          const dDate = d.dateIso || d.date;
          if (!dDate) return false;
          return dDate >= fyStartDateStr && dDate <= fyEndDateStr;
      }).length + 1 : 1;

      const prefix = companyProfile?.shortName ? companyProfile.shortName.toUpperCase() : 'LMS';
      return `${prefix}-DEMO-${fyString}-${String(count).padStart(3, '0')}`;
  };

    const generateDemoPDF = async (demoData: any) => {
    try {
        const logoBase64 = await urlToBase64Image(companyProfile?.logoUrl);
        const signatureBase64 = await urlToBase64Image(companyProfile?.signatureUrl);

        const logoHTML = logoBase64 
            ? `<img src="${logoBase64}" style="height: 62px; object-fit: contain;" />` 
            : `<div style="font-size:24px; font-weight:800; color:#0f2557; letter-spacing:0.5px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = signatureBase64 
            ? `<img src="${signatureBase64}" style="height: 50px; object-fit: contain; margin-bottom: 6px;" />` 
            : `<div style="height: 50px;"></div>`;

        const genDate = new Date().toLocaleDateString('en-GB');

        const htmlContent = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              * { box-sizing: border-box; }
              body {
                font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
                color: #1a1a2e;
                margin: 0;
                padding: 0;
              }
              .sheet { padding: 0 40px 40px; }

              .topbar {
                display: flex; justify-content: space-between; align-items: center;
                padding: 28px 40px; background: #0f2557; color: #ffffff;
              }
              .topbar .company-meta { text-align: right; font-size: 12px; line-height: 1.7; opacity: 0.92; }

              .doc-band {
                display: flex; justify-content: space-between; align-items: center;
                background: #eef2fb; border-bottom: 4px solid #0f2557;
                padding: 18px 40px; margin-bottom: 28px;
              }
              .doc-title { font-size: 19px; font-weight: 800; letter-spacing: 1.4px; color: #0f2557; }
              .doc-meta { text-align: right; font-size: 12.5px; color: #4a4a68; line-height: 1.7; }
              .doc-meta b { color: #0f2557; }

              .status-pill {
                display: inline-block; background: #7c3aed; color: white;
                font-size: 11.5px; font-weight: 700; letter-spacing: 0.6px;
                padding: 5px 14px; border-radius: 20px; margin-top: 6px;
              }

              .grid { display: flex; gap: 20px; margin-bottom: 24px; }
              .card {
                flex: 1; background: #fafbfe; border: 1px solid #e2e6f0; border-radius: 12px;
                padding: 20px 22px;
              }
              .card-label { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: 1px; margin-bottom: 14px; }
              .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
              .row .k { color: #6b7280; }
              .row .v { font-weight: 600; color: #1a1a2e; text-align: right; }

              .table { width: 100%; border-collapse: collapse; margin-bottom: 26px; border-radius: 12px; overflow: hidden; }
              .table th {
                background: #0f2557; color: white; font-size: 12.5px; letter-spacing: 0.5px;
                text-align: left; padding: 15px 18px; font-weight: 600;
              }
              .table td {
                padding: 16px 18px; font-size: 14px; border-bottom: 1px solid #e9ecf5; background: #ffffff;
              }
              .table .model-sub { color: #6b7280; font-size: 12px; margin-top: 4px; }

              .remarks {
                background: #f5f3ff; border-left: 4px solid #7c3aed; border-radius: 8px;
                padding: 16px 20px; font-size: 13.5px; color: #4a4a68; margin-bottom: 20px; line-height: 1.6;
              }
              .remarks b { color: #5b21b6; }

              .note {
                font-size: 11.5px; color: #6b7280; font-style: italic; margin-bottom: 34px; padding: 0 4px;
              }

              .footer { display: flex; justify-content: space-between; margin-top: 20px; }
              .sign-box { width: 46%; text-align: center; }
              .sign-space { height: 56px; }
              .sign-line { border-top: 1.5px solid #1a1a2e; margin-bottom: 8px; }
              .sign-label { font-size: 13px; font-weight: 700; color: #1a1a2e; }
              .sign-sub { font-size: 11.5px; color: #6b7280; margin-top: 3px; }

              .doc-footer {
                margin-top: 40px; padding-top: 16px; border-top: 1px solid #e9ecf5;
                font-size: 10.5px; color: #9ca3af; text-align: center;
              }
            </style>
          </head>
          <body>
            <div class="topbar">
              ${logoHTML}
              <div class="company-meta">
                <div style="font-weight:700; font-size:14px; margin-bottom:3px;">${companyProfile?.companyName || ''}</div>
                <div>${companyProfile?.address || ''}</div>
                <div>${companyProfile?.contactPhone || companyProfile?.phone || '-'} &nbsp;•&nbsp; ${companyProfile?.contactEmail || companyProfile?.email || '-'}</div>
              </div>
            </div>

            <div class="doc-band">
              <div>
                <div class="doc-title">PRODUCT DEMO REPORT</div>
                <div class="status-pill">✓ DEMO COMPLETED</div>
              </div>
              <div class="doc-meta">
                <div>Report No: <b>${demoData.demoId}</b></div>
                <div>Date: <b>${demoData.displayDate}</b> &nbsp;•&nbsp; Duration: <b>${demoData.duration || '1'} Day${(demoData.duration || 1) > 1 ? 's' : ''}</b></div>
              </div>
            </div>

            <div class="sheet">
              <div class="grid">
                <div class="card">
                  <div class="card-label">CLIENT DETAILS</div>
                  <div class="row"><span class="k">Hospital / Client</span><span class="v">${demoData.hospital}</span></div>
                  <div class="row"><span class="k">Address</span><span class="v">${demoData.address || '-'}${demoData.city ? ', ' + demoData.city : ''}</span></div>
                  <div class="row"><span class="k">Department</span><span class="v">${demoData.department || '-'}</span></div>
                </div>
                <div class="card">
                  <div class="card-label">CONTACT PERSON</div>
                  <div class="row"><span class="k">Name</span><span class="v">${demoData.contactPerson}</span></div>
                  <div class="row"><span class="k">Designation</span><span class="v">${demoData.designation || '-'}</span></div>
                  <div class="row"><span class="k">Mobile</span><span class="v">${demoData.contactNumber || '-'}</span></div>
                </div>
              </div>

              <table class="table">
                <thead>
                  <tr>
                    <th style="width: 55%;">Product</th>
                    <th style="width: 45%;">Serial No.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <b>${demoData.product}</b>
                      <div class="model-sub">Model: ${demoData.model}</div>
                    </td>
                    <td><b>${demoData.serialNo || 'N/A'}</b></td>
                  </tr>
                </tbody>
              </table>

              <div class="remarks">
                <b>Demo Outcome / Remarks:</b> ${demoData.result || 'Demo completed successfully.'}
              </div>

              ${demoData.notes ? `<div class="note">Internal Note: ${demoData.notes}</div>` : ''}

              <div class="footer">
                <div class="sign-box">
                  <div class="sign-space"></div>
                  <div class="sign-line"></div>
                  <div class="sign-label">Client Signature & Stamp</div>
                </div>
                <div class="sign-box">
                  <div class="sign-sub" style="margin-bottom:6px;">${demoData.senderName || ''}</div>
                  ${signatureHTML}
                  <div class="sign-line"></div>
                  <div class="sign-label">Engineer Signature</div>
                </div>
              </div>

              <div class="doc-footer">
                This is a system-generated report from ${companyProfile?.companyName || 'our company'} • Generated on ${genDate}
              </div>
            </div>
          </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `${demoData.demoId}_${demoData.hospital.replace(/ /g, '_')}.pdf`;
        // @ts-ignore
        const newPath = `${FileSystem.cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Demo Report` });
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
      setOrgId(orgItem.id || ''); 
      setAddress(orgItem.address || orgItem.address1 || orgItem.location || ''); 
      setCity(orgItem.city || '');
      setContactPerson(orgItem.contactPerson || '');
      setDesignation(orgItem.designation || ''); 
      setContactNumber(orgItem.mobile || orgItem.phone || ''); 
      setEmail(orgItem.email || '');
      setModalVisible(false);
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
          else {
              setHospital(item);
              setOrgId(''); 
          }
      } 
      else if (currentModalType === 'Product') {
          setProduct(item);
          setModel(''); 
      }
      else if (currentModalType === 'Model') {
          setModel(item);
      }
      setModalVisible(false);
  };

  // 🔥 SAVE LOGIC — via new backend API. Create flow unchanged; edit flow
  // calls updateDemo() instead, skips the location-log/PDF/notification
  // steps that only make sense for a brand-new demo visit.
  const handleSubmit = async () => {
    if (!hospital || !product || !contactPerson) {
      Alert.alert("Missing Fields", "Hospital, Product Name and Contact Person are required.");
      return;
    }

    setLoading(true);

    const finalProduct = product === 'Other' ? customProduct : product;
    const finalModel = model === 'Other' ? customModel : model;

    if (isEditMode) {
      try {
        await updateDemo(editId!, {
            orgId: orgId || undefined,
            orgName: hospital,
            address: address,
            city: city,
            department: department,
            product: finalProduct,
            model: finalModel,
            serialNo: serialNo,
            contactPerson: contactPerson,
            designation: designation,
            contactNumber: contactNumber,
            date: demoDate.toISOString().split('T')[0],
            duration: Number(duration) || 1,
            outcome: result,
            notes: notes,
        });
        Alert.alert("Success ✅", "Demo Report Updated!");
        router.back();
      } catch (error: any) {
        Alert.alert("Error", error?.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const locationData = await getCurrentLocation();
      if (!locationData) { 
          setLoading(false); 
          return; 
      }
      recordLocationLog({
          latitude: locationData.lat,
          longitude: locationData.lng,
          type: 'Demo',
      }).catch(() => {});

      const newDemoId = generateDemoId();

      const createdDemo = await createDemo({
          demoRef: newDemoId,
          orgId: orgId || undefined,
          orgName: hospital,
          address: address,
          city: city,
          department: department,
          product: finalProduct,
          model: finalModel,
          serialNo: serialNo,
          contactPerson: contactPerson,
          designation: designation,
          contactNumber: contactNumber,
          date: demoDate.toISOString().split('T')[0],
          duration: Number(duration) || 1,
          outcome: result,
          notes: notes,
      });

      if (addNotification) {
          await addNotification({
              title: "New Demo Report 📋",
              message: `${currentUser?.name} submitted a demo report (${newDemoId}) for ${finalProduct} at ${hospital}.`,
              to: "Admin",
              route: "/demo",
              type: "info"
          });
      }
      
      if (params.activityId) {
          await completeActivityPlan(params.activityId as string);
      }

      Alert.alert(
          "Success ✅", 
          `Demo Report ${newDemoId} Saved!\nDo you want to share PDF?`, 
          [
            { text: "No", onPress: () => router.back(), style: 'cancel' },
            { text: "Yes, Share PDF", onPress: async () => { 
                await generateDemoPDF({
                    demoId: newDemoId,
                    hospital,
                    address,
                    city,
                    department,
                    product: finalProduct,
                    model: finalModel,
                    serialNo,
                    contactPerson,
                    designation,
                    contactNumber,
                    duration,
                    result,
                    notes,
                    displayDate: formatDate(demoDate),
                    senderName: currentUser?.name,
                });
                router.back();
            }}
          ]
      );

    } catch (error: any) {
      Alert.alert("Error", error?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{isEditMode ? 'Edit Demo Entry' : 'New Demo Entry'}</Text>
            <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            
            <Text style={styles.sectionHeader}>🏥 Customer Details</Text>
            <View style={styles.card}>
                <Text style={styles.label}>Organization / Hospital *</Text>
                <TouchableOpacity style={styles.selector} onPress={() => openModal('Hospital', orgList)}>
                    <Text style={{color: hospital ? '#333' : '#999', flex:1}}>{hospital || 'Select Organization'}</Text>
                    {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
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

            <Text style={styles.sectionHeader}>📦 Product Details</Text>
            <View style={styles.card}>
                <Text style={styles.label}>Product Name *</Text>
                <TouchableOpacity style={styles.selector} onPress={() => openModal('Product', getUniqueProductNames())}>
                    <Text style={{color: product ? '#333' : '#999', flex:1}}>{product || 'Select Product'}</Text>
                    {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="cube-outline" size={20} color="gray" />}
                </TouchableOpacity>

                {product === 'Other' && <TextInput key="stable-demo-product" style={[styles.input, {marginTop:5, borderColor:'#3b5998'}]} placeholder="Type Product Name..." value={customProduct} onChangeText={setCustomProduct} />}

                <View style={styles.row}>
                    <View style={{flex:1, marginRight:10}}>
                        <Text style={styles.label}>Model Name</Text>
                        <TouchableOpacity style={styles.selector} onPress={() => {
                            if(!product) Alert.alert("Wait", "Select Product First");
                            else openModal('Model', getModelOptions());
                        }}>
                            <Text style={{color: model ? '#333' : '#999', flex:1}} numberOfLines={1}>{model || 'Select Model'}</Text>
                            <Ionicons name="caret-down" size={16} color="gray" />
                        </TouchableOpacity>
                        
                        {model === 'Other' && <TextInput key="stable-demo-model" style={[styles.input, {marginTop:5}]} placeholder="Type Model Name..." value={customModel} onChangeText={setCustomModel} />}
                    </View>
                    <View style={{flex:1}}>
                        <Text style={styles.label}>Serial No</Text>
                        <TextInput style={styles.input} placeholder="SN-123" value={serialNo} onChangeText={setSerialNo} />
                    </View>
                </View>
                    
                <Text style={styles.label}>Demo Duration (Days)</Text>
                <TextInput style={styles.input} placeholder="e.g. 5" keyboardType="numeric" value={duration} onChangeText={setDuration} />
            </View>

            <Text style={styles.sectionHeader}>📝 Feedback & Notes</Text>
            <View style={styles.card}>
                <Text style={styles.label}>Outcome / Feedback</Text>
                <TextInput style={[styles.input, {height:60, textAlignVertical:'top'}]} placeholder="Doctor's response..." multiline value={result} onChangeText={setResult} />

                <Text style={styles.label}>Private Notes</Text>
                <TextInput style={[styles.input, {height:60, textAlignVertical:'top'}]} placeholder="Internal team notes..." multiline value={notes} onChangeText={setNotes} />
            </View>

            <TouchableOpacity 
                style={[styles.btn, loading && { opacity: 0.6 }]} 
                onPress={handleSubmit} 
                disabled={loading}
            >
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>{isEditMode ? 'UPDATE DEMO' : 'SAVE DEMO'}</Text>}
            </TouchableOpacity>
            
            {!isEditMode && (
                <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                    📍 Location will be captured automatically.
                </Text>
            )}
            
            <View style={{height: 100}} />

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
