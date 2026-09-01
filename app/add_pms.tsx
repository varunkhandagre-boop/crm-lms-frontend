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

// 🔥 SAAS IMPORTS (organizations still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 4: PMS reports & installations now via new backend API
import { createPmsReport } from '../services/api/pmsReports';
import { listInstallations } from '../services/api/installations';
import { completeActivityPlan } from '../services/api/activityPlans';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function AddPMSScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const { currentUser, companyProfile, addNotification } = useData();
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  const [orgList, setOrgList] = useState<any[]>([]);
  const [installList, setInstallList] = useState<any[]>([]);

  const [org, setOrg] = useState('');
  const [orgId, setOrgId] = useState('');

  const [serialNo, setSerialNo] = useState('');
  const [machineName, setMachineName] = useState('');
  const [modelName, setModelName] = useState('');
  
  const [department, setDepartment] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  const [pmsDate, setPmsDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(new Date()); 
  
  const [showPmsDatePicker, setShowPmsDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false); 

  const [remarks, setRemarks] = useState('');
  const [pmsType, setPmsType] = useState('Preventive'); 

  const [modalVisible, setModalVisible] = useState(false);
  const [currentSelection, setCurrentSelection] = useState(''); 
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // 🔥 LOAD DATA — installations via new API; organizations via Firestore
  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              const [orgs, installs] = await Promise.all([
                  fetchSaaSData("organizations"),
                  listInstallations(), // was: fetchSaaSData("installations")
              ]);
              setOrgList(orgs);
              setInstallList(installs);
          }
      };
      loadData();
  }, [currentUser]);

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  useEffect(() => {
      const nextDate = new Date(pmsDate);
      nextDate.setMonth(nextDate.getMonth() + 3); 
      setDueDate(nextDate);
  }, [pmsDate]);

  useEffect(() => {
      if (params.org && org !== params.org) {
          setOrg(params.org as string);
          if(orgList.length > 0) {
             const found = orgList.find((o:any) => o.orgName === params.org);
             if(found) { 
                 setCity(found.city || ''); 
                 setAddress(found.address || found.address1 || ''); 
                 setOrgId(found.id || ''); 
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
                  if(machine.orgId) setOrgId(machine.orgId); 
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

  const generatePMSPDF = async (pmsData: any) => {
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
              .label { font-weight: bold; color: #444; width: 120px; display: inline-block; }
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

            <h3 style="text-align: center; text-decoration: underline; margin-bottom: 20px;">PREVENTIVE MAINTENANCE REPORT</h3>

            <div class="row">
                <div><span class="label">Report No:</span> <b style="font-size:16px;">${pmsData.pmsId}</b></div>
                <div><span class="label">Date:</span> ${new Date(pmsData.date).toLocaleDateString('en-GB')}</div>
            </div>

            <div class="box">
                <div class="row">
                    <div><span class="label">PMS Type:</span> <b>${pmsData.type}</b></div>
                </div>
            </div>

            <div class="box">
                <div style="font-size:14px; margin-bottom:5px;"><b>Client:</b> ${pmsData.hospitalName}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Address:</b> ${pmsData.address}, ${pmsData.city}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Department:</b> ${pmsData.department || '-'}</div>
            </div>

            <div class="box">
                <div class="row"><div><span class="label">Machine:</span> ${pmsData.machine}</div></div>
                <div class="row"><div><span class="label">Model:</span> ${pmsData.model}</div></div>
                <div class="row"><div><span class="label">Serial No:</span> <b>${pmsData.serialNo}</b></div></div>
            </div>

            <div class="box" style="background-color: #e8f5e9;">
                <div class="row">
                    <div><span class="label">Next Due Date:</span> <b style="color:#d32f2f; font-size:16px;">${new Date(pmsData.dueDate).toLocaleDateString('en-GB')}</b></div>
                </div>
            </div>

            <div class="box">
                <div style="font-weight:bold; text-decoration:underline;">Engineer Checklist / Remarks:</div>
                <div style="margin-top:10px; min-height: 60px;">${pmsData.remarks || 'Routine checkup done. Machine working fine.'}</div>
            </div>

            <div class="footer">
              <div class="sign-box">
                <div style="height: 60px;"></div> 
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Client Signature & Stamp</div>
              </div>

              <div class="sign-box">
                <div style="font-weight: bold; font-size: 12px;">Engineer: ${pmsData.senderName}</div>
                ${signatureHTML}
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Engineer Signature</div>
              </div>
            </div>
          </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `${pmsData.pmsId}_${(pmsData.hospitalName || 'Client').replace(/ /g, '_')}.pdf`;
        // @ts-ignore
        const newPath = `${FileSystem.cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share PMS Report` });
        } catch (error) {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
    } catch (error) {
        Alert.alert("Error", "Could not generate PDF");
    }
  };

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
            if (currentSelection === 'Serial') return (item.serialNo || '').toLowerCase().includes(text.toLowerCase()) || (item.productName || '').toLowerCase().includes(text.toLowerCase());
            return false;
        });
        setFilteredData(newData);
    } else {
        setFilteredData(sourceList);
    }
  };

  const handleSelect = (item: any) => {
    if (currentSelection === 'Org') { 
        setOrg(item.orgName || item.name);
        setOrgId(item.id || ''); 
        setCity(item.city || item.City || '');       
        setAddress(item.address || item.address1 || item.location || ''); 
        
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

  // 🔥 SAVE LOGIC — via new backend API (server auto-generates PMS ID)
  const handleSave = async () => {
      if (!org || !serialNo) {
          Alert.alert("Error", "Organization and Serial No are required.");
          return;
      }

      setIsSaving(true); 

      const locationData = await getCurrentLocation();
      if (!locationData) {
          setIsSaving(false);
          return; 
      }

      try {
          const saved = await createPmsReport({
              orgId: orgId || undefined,
              orgName: org,
              city, address,
              machine: machineName || 'Unknown',
              model: modelName || 'Unknown', 
              serialNo,
              department, 
              type: pmsType as any,
              remarks,
              date: pmsDate.toISOString().split('T')[0],
              dueDate: dueDate.toISOString().split('T')[0],
              location: locationData ? { latitude: locationData.lat, longitude: locationData.lng } : null,
          });

          if (addNotification) {
              await addNotification({
                  title: "PMS Report Submitted ⚙️",
                  message: `${currentUser?.name} submitted ${pmsType} report (${saved.pmsId}) for ${machineName} at ${org}.`,
                  to: "Admin",
                  route: "/pms_schedule",
                  type: "info"
              });
          }

          if (params.activityId) {
              await completeActivityPlan(params.activityId as string);
          } 
          
          setIsSaving(false);
          
          Alert.alert(
              "Success ✅", 
              `PMS Report ${saved.pmsId} Saved Successfully!\nDo you want to share PDF?`,
              [
                  { text: "No", onPress: () => router.back(), style: 'cancel' },
                  { text: "Yes, Share PDF", onPress: async () => { 
                      await generatePMSPDF({ ...saved, senderName: currentUser?.name });
                      router.back(); 
                  }}
              ]
          );
      } catch (err: any) {
          Alert.alert("Error", err?.message || "Something went wrong.");
          setIsSaving(false);
      }
  };

  return (
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

        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}} keyboardShouldPersistTaps="handled">
            
            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Done Date</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowPmsDatePicker(true)}>
                        <Text style={{color: '#333', fontSize:13}}>{formatDate(pmsDate)}</Text>
                        <Ionicons name="calendar-outline" size={16} color="gray" />
                    </TouchableOpacity>
                    {showPmsDatePicker && <DateTimePicker value={pmsDate} mode="date" onChange={(e, d) => { setShowPmsDatePicker(false); if(d) setPmsDate(d); }} />}
                </View>

                <View style={styles.col}>
                    <Text style={styles.label}>Next Due *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowDueDatePicker(true)}>
                        <Text style={{color: '#d32f2f', fontWeight:'bold', fontSize:13}}>{formatDate(dueDate)}</Text>
                        <Ionicons name="calendar" size={16} color="#d32f2f" />
                    </TouchableOpacity>
                    {showDueDatePicker && <DateTimePicker value={dueDate} mode="date" onChange={(e, d) => { setShowDueDatePicker(false); if(d) setDueDate(d); }} />}
                </View>
            </View>

            <Text style={styles.label}>Organization / Hospital *</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Org')}>
                <Text style={{color: org ? 'black' : 'gray'}}>{org || 'Select Organization'}</Text>
                {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={18} color="gray" />}
            </TouchableOpacity>

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

            <Text style={styles.label}>PMS Type</Text>
            <View style={styles.typeContainer}>
                {['Preventive', 'Breakdown', 'Installation'].map(t => (
                    <TouchableOpacity key={t} style={[styles.typeBtn, pmsType === t && styles.activeTypeBtn]} onPress={() => setPmsType(t)}>
                        <Text style={[styles.typeText, pmsType === t && {color:'white'}]}>{t}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.label}>Checklist / Remarks</Text>
            <TextInput 
                style={[styles.inputGray, {height: 100, textAlignVertical: 'top'}]} 
                multiline 
                placeholder="Enter PMS details, parts checked, etc..." 
                value={remarks} 
                onChangeText={setRemarks} 
            />

            <TouchableOpacity style={[styles.saveButton, isSaving && {backgroundColor:'#ccc'}]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save PMS Report</Text>}
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
        </ScrollView>

        <Modal visible={modalVisible} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={styles.modalTitle}>Select {currentSelection}</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color="black" /></TouchableOpacity>
                  </View>
                  
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

  iconBox: { width: 35, height: 35, borderRadius: 8, justifyContent:'center', alignItems:'center', backgroundColor:'#e3f2fd' },
  modalMainText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  modalSubText: { fontSize: 12, color: 'gray' }
});
