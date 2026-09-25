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
import { completeActivityPlan } from '../services/api/activityPlans';
import { listInstallations } from '../services/api/installations';
import { recordLocationLog } from '../services/api/locationLogs';
import { fetchOrganizations } from '../services/api/organizations';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { createPmsReport } from '../services/api/pmsReports';
import { buildCacheKey } from '../utils/listCache';
import { urlToBase64Image } from '../utils/pdfImageHelper';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function AddPMSScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const { currentUser, companyProfile, addNotification } = useData();
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  // orgList/installList now come from useCachedList below (cache-first, shared keys)

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

  // 🔥 Organizations + Installations — cache-first, sharing the SAME cache
  // keys as organization.tsx ('organizations') and installation.tsx
  // ('installations').
  const { data: orgList } = useCachedList({
      cacheKey: buildCacheKey('organizations', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: () => fetchOrganizations({ limit: 500 }),
  });
  const { data: installList } = useCachedList({
      cacheKey: buildCacheKey('installations', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: listInstallations, // was: fetchSaaSData("installations")
  });

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
        const logoBase64 = await urlToBase64Image(companyProfile?.logoUrl);
        const signatureBase64 = await urlToBase64Image(companyProfile?.signatureUrl);

        const logoHTML = logoBase64 
            ? `<img src="${logoBase64}" style="height: 62px; object-fit: contain;" />` 
            : `<div style="font-size:24px; font-weight:800; color:#0f2557; letter-spacing:0.5px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = signatureBase64 
            ? `<img src="${signatureBase64}" style="height: 50px; object-fit: contain; margin-bottom: 6px;" />` 
            : `<div style="height: 50px;"></div>`;

        const genDate = new Date().toLocaleDateString('en-GB');
        const serviceDate = new Date(pmsData.date).toLocaleDateString('en-GB');
        const nextDueDate = new Date(pmsData.dueDate).toLocaleDateString('en-GB');

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
                display: inline-block; background: #0891b2; color: white;
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

              .due-banner {
                display: flex; justify-content: space-between; align-items: center;
                background: #fef2f2; border: 2px solid #dc2626; border-radius: 12px;
                padding: 18px 24px; margin-bottom: 26px;
              }
              .due-banner .label { font-size: 12px; font-weight: 700; color: #991b1b; letter-spacing: 0.6px; }
              .due-banner .date { font-size: 22px; font-weight: 800; color: #dc2626; margin-top: 2px; }

              .remarks {
                background: #ecfeff; border-left: 4px solid #0891b2; border-radius: 8px;
                padding: 16px 20px; font-size: 13.5px; color: #4a4a68; margin-bottom: 34px; line-height: 1.6;
              }
              .remarks b { color: #155e75; }

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
                <div class="doc-title">PREVENTIVE MAINTENANCE REPORT</div>
                <div class="status-pill">${pmsData.type || 'Preventive'}</div>
              </div>
              <div class="doc-meta">
                <div>Report No: <b>${pmsData.pmsId}</b></div>
                <div>Service Date: <b>${serviceDate}</b></div>
              </div>
            </div>

            <div class="sheet">
              <div class="grid">
                <div class="card">
                  <div class="card-label">CLIENT DETAILS</div>
                  <div class="row"><span class="k">Hospital / Client</span><span class="v">${pmsData.hospitalName}</span></div>
                  <div class="row"><span class="k">Address</span><span class="v">${pmsData.address || '-'}${pmsData.city ? ', ' + pmsData.city : ''}</span></div>
                  <div class="row"><span class="k">Department</span><span class="v">${pmsData.department || '-'}</span></div>
                </div>
                <div class="card">
                  <div class="card-label">MACHINE DETAILS</div>
                  <div class="row"><span class="k">Machine</span><span class="v">${pmsData.machine}</span></div>
                  <div class="row"><span class="k">Model</span><span class="v">${pmsData.model}</span></div>
                  <div class="row"><span class="k">Serial No</span><span class="v">${pmsData.serialNo}</span></div>
                </div>
              </div>

              <div class="due-banner">
                <div>
                  <div class="label">⏰ NEXT SERVICE DUE</div>
                  <div class="date">${nextDueDate}</div>
                </div>
              </div>

              <div class="remarks">
                <b>Engineer Checklist / Remarks:</b> ${pmsData.remarks || 'Routine checkup done. Machine working fine.'}
              </div>

              <div class="footer">
                <div class="sign-box">
                  <div class="sign-space"></div>
                  <div class="sign-line"></div>
                  <div class="sign-label">Client Signature & Stamp</div>
                </div>
                <div class="sign-box">
                  <div class="sign-sub" style="margin-bottom:6px;">${pmsData.senderName || ''}</div>
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
recordLocationLog({
    latitude: locationData.lat,
    longitude: locationData.lng,
    type: 'PMS',
}).catch(() => {});

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
