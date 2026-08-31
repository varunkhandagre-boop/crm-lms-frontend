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

// 🔥 SAAS IMPORTS (organizations/products still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 2: demos now go through the new backend API
import { createDemo, listDemos } from '../services/api/demos';
import { listProducts } from '../services/api/products';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function AddDemoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  
  const { currentUser, updateActivityStatus, companyProfile, addNotification } = useData();

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
                  fetchSaaSData("organizations"),
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

  useEffect(() => {
      if (params.hospital && orgList.length > 0) {
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
        const logoHTML = companyProfile?.logoUrl 
            ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` 
            : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = companyProfile?.signatureUrl 
            ? `<img src="${companyProfile.signatureUrl}" style="height: 40px; margin-top: 5px; margin-bottom: 2px;" />` 
            : `<div style="height: 40px;"></div>`;

        const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 30px; border: 2px solid #333; }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
              .title { font-size: 22px; font-weight: bold; color: #1a237e; text-transform: uppercase; }
              .sub-title { font-size: 12px; margin-top: 2px; color: #333; line-height: 1.4; }
              .box { border: 1px solid #000; padding: 15px; margin-top: 10px; background-color: #fcfcfc; }
              .row { display: flex; justify-content: space-between; margin-bottom: 5px; }
              .label { font-weight: bold; color: #444; width: 130px; display: inline-block; }
              .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
              .sign-box { text-align: center; width: 45%; }
              .sign-line { border-top: 1px solid #000; width: 100%; margin-top: 5px; margin-bottom: 5px; }
            </style>
          </head>
          <body>
            <div class="header">
              ${logoHTML}
              ${companyProfile?.logoUrl ? `<div class="title">${companyProfile.companyName}</div>` : ''}
              <div class="sub-title">${companyProfile?.address || ''}</div>
              <div class="sub-title">
                Phone: ${companyProfile?.contactPhone || companyProfile?.phone || '-'} | 
                Email: ${companyProfile?.contactEmail || companyProfile?.email || '-'}
              </div>
            </div>

            <h3 style="text-align: center; text-decoration: underline; margin-bottom: 20px;">PRODUCT DEMO REPORT</h3>

            <div class="box">
                <div class="row">
                    <div><span class="label">Report No:</span> <b style="font-size:16px;">${demoData.demoId}</b></div>
                    <div><span class="label">Date:</span> ${demoData.displayDate}</div>
                </div>
                <div class="row" style="margin-top: 5px;">
                    <div><span class="label">Duration:</span> ${demoData.duration || '1'} Days</div>
                </div>
            </div>

            <div class="box">
                <div style="font-size:14px; margin-bottom:5px;"><b>Client:</b> ${demoData.hospital}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Address:</b> ${demoData.address}, ${demoData.city}</div>
                <div style="font-size:14px;"><b>Department:</b> ${demoData.department || '-'}</div>
            </div>

            <div class="box">
                <div class="row"><div><span class="label">Contact Person:</span> <b>${demoData.contactPerson}</b></div></div>
                <div class="row"><div><span class="label">Designation:</span> ${demoData.designation || '-'}</div></div>
                <div class="row"><div><span class="label">Mobile:</span> ${demoData.contactNumber || '-'}</div></div>
            </div>

            <div class="box">
                <div style="font-weight:bold; margin-bottom:10px; text-decoration:underline;">Product Details</div>
                <div class="row"><div><span class="label">Product Name:</span> <b>${demoData.product}</b></div></div>
                <div class="row"><div><span class="label">Model:</span> ${demoData.model}</div></div>
                <div class="row"><div><span class="label">Serial No:</span> ${demoData.serialNo || 'N/A'}</div></div>
            </div>

            <div class="box">
                <div style="font-weight:bold; margin-bottom:5px; text-decoration:underline;">Demo Outcome / Remarks:</div>
                <div style="margin-top:5px; min-height: 50px;">${demoData.result || 'Demo completed successfully.'}</div>
                ${demoData.notes ? `<div style="margin-top:10px; font-style:italic; font-size:12px;">Internal Note: ${demoData.notes}</div>` : ''}
            </div>

            <div class="footer">
              <div class="sign-box">
                <div style="height: 60px;"></div> 
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Client Signature & Stamp</div>
              </div>

              <div class="sign-box">
                <div style="font-weight: bold; font-size: 12px;">Given By: ${demoData.senderName}</div>
                ${signatureHTML}
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Engineer Signature</div>
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

  // 🔥 SAVE LOGIC — via new backend API
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

      const newDemoId = generateDemoId();

      const finalProduct = product === 'Other' ? customProduct : product;
      const finalModel = model === 'Other' ? customModel : model;

      const createdDemo = await createDemo({
          demoRef: newDemoId,
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
      
      if (params.activityId && updateActivityStatus) {
          await updateActivityStatus(params.activityId as string, 'Completed');
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
            <Text style={styles.headerTitle}>New Demo Entry</Text>
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
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>SAVE DEMO</Text>}
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
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
