import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
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

// 🔥 SAAS IMPORTS
import * as Location from 'expo-location';
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function AddServiceCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // 🔥 1. Context se sirf user aur notification nikala
  const { currentUser, updateActivityStatus, companyProfile, addNotification } = useData();
  
  // 🔥 2. Naya SaaS Engine
  const { fetchSaaSData, addSaaSData, isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded Lists
  const [orgList, setOrgList] = useState<any[]>([]);
  const [installList, setInstallList] = useState<any[]>([]);
  const [sparePartsList, setSparePartsList] = useState<any[]>([]);
  const [serviceCallList, setServiceCallList] = useState<any[]>([]);

  // --- FORM STATES ---
  const [org, setOrg] = useState('');
  const [orgId, setOrgId] = useState('');

  const [serialNo, setSerialNo] = useState('');
  const [machineName, setMachineName] = useState('');
  const [modelName, setModelName] = useState('');

  const [department, setDepartment] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  const [installDate, setInstallDate] = useState('');

  const [remark, setRemark] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [callDate, setCallDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [serviceType, setServiceType] = useState('Free'); 
  const [status, setStatus] = useState<'Open' | 'Closed'>('Open');
  const [resolutionNote, setResolutionNote] = useState('');
  const [usedParts, setUsedParts] = useState<any[]>([]);
  
  // --- MODALS ---
  const [partsModalVisible, setPartsModalVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newMachineModalVisible, setNewMachineModalVisible] = useState(false);
  const [tempSerial, setTempSerial] = useState('');

  // Search Logic
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]); 
  const [currentSelection, setCurrentSelection] = useState(''); 
  const [errors, setErrors] = useState({ org: false, serial: false, remark: false });
  const [isSaving, setIsSaving] = useState(false); 

  const serviceOptions = ['Free', 'Paid', 'AMC', 'CMC', 'Under Warranty', 'Others'];

  // 🔥 4. LOAD DATA ON MOUNT
  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              const [orgs, installs, parts, calls] = await Promise.all([
                  fetchSaaSData("organizations"),
                  fetchSaaSData("installations"),
                  fetchSaaSData("spare_parts"),
                  fetchSaaSData("service_calls")
              ]);
              setOrgList(orgs);
              setInstallList(installs);
              setSparePartsList(parts);
              setServiceCallList(calls);
          }
      };
      loadData();
  }, [currentUser]);

  // AUTO FILL ORG (From Param)
  useEffect(() => {
      if (params.org && org !== params.org) {
          setOrg(params.org as string);
          if(orgList.length > 0) {
              const foundOrg = orgList.find((o:any) => (o.orgName === params.org || o.name === params.org));
              if(foundOrg) selectOrganization(foundOrg);
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
                  setInstallDate(machine.date || '');
                  if(machine.orgId) setOrgId(machine.orgId);
              }
          }
      }
  }, [params, orgList, installList]);

  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

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

  // 🔥 5. SMART FY TICKET ID GENERATOR
  const generateSequentialTicketId = () => {
      const targetMonth = callDate.getMonth(); 
      const targetYear = callDate.getFullYear();
      
      const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
      const fyString = `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`; 
      const fyStartDateStr = `${fyStartYear}-04-01`;
      const fyEndDateStr = `${fyStartYear + 1}-03-31`;

      const count = serviceCallList ? serviceCallList.filter((c: any) => {
          const dDate = c.dateIso || c.date; 
          if (!dDate) return false;
          return dDate >= fyStartDateStr && dDate <= fyEndDateStr;
      }).length + 1 : 1;

      const prefix = companyProfile?.shortName ? companyProfile.shortName.toUpperCase() : 'LMS';
      return `${prefix}-SER-${fyString}-${String(count).padStart(3, '0')}`;
  };

  const generateServicePDF = async (ticketData: any) => {
    try {
        const logoHTML = companyProfile?.logoUrl 
            ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` 
            : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = companyProfile?.signatureUrl 
            ? `<img src="${companyProfile.signatureUrl}" style="height: 40px; margin-top: 5px; margin-bottom: 2px;" />` 
            : `<div style="height: 40px;"></div>`;

        let partsHTML = '';
        if (ticketData.partsUsed && ticketData.partsUsed.length > 0) {
            const rows = ticketData.partsUsed.map((p: any, i: number) => `
                <tr>
                    <td style="padding:5px; border:1px solid #ddd; text-align:center;">${i + 1}</td>
                    <td style="padding:5px; border:1px solid #ddd;">${p.partName} (${p.partNo || '-'})</td>
                    <td style="padding:5px; border:1px solid #ddd; text-align:center;">${p.usedQty}</td>
                </tr>
            `).join('');

            partsHTML = `
                <div style="margin-top: 15px;">
                    <div style="font-weight:bold; margin-bottom:5px;">Spare Parts Consumed:</div>
                    <table style="width:100%; border-collapse:collapse;">
                        <tr style="background:#eee;">
                            <th style="padding:5px; border:1px solid #000; width:10%;">#</th>
                            <th style="padding:5px; border:1px solid #000; width:70%;">Part Name</th>
                            <th style="padding:5px; border:1px solid #000; width:20%;">Qty</th>
                        </tr>
                        ${rows}
                    </table>
                </div>
            `;
        } else {
            partsHTML = `<div style="margin-top: 15px; font-style:italic; color:#555;">No spare parts used.</div>`;
        }

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

            <h3 style="text-align: center; text-decoration: underline;">SERVICE REPORT</h3>

            <div class="box">
                <div class="row">
                    <div><span class="label">Ticket No:</span> <b>${ticketData.scrId}</b></div>
                    <div><span class="label">Date:</span> ${new Date(ticketData.date).toLocaleDateString('en-GB')}</div>
                </div>
                <div class="row">
                    <div><span class="label">Status:</span> <b>${ticketData.status}</b></div>
                    <div><span class="label">Type:</span> ${ticketData.serviceType}</div>
                </div>
            </div>

            <div class="box">
                <div style="font-size:14px; margin-bottom:5px;"><b>Client:</b> ${ticketData.hospitalName}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Address:</b> ${ticketData.address}, ${ticketData.city}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Department:</b> ${ticketData.department || '-'}</div>
            </div>

            <div class="box">
                <div class="row"><div><span class="label">Machine:</span> ${ticketData.machine}</div></div>
                <div class="row"><div><span class="label">Model:</span> ${ticketData.model}</div></div>
                <div class="row"><div><span class="label">Serial No:</span> <b>${ticketData.serialNo}</b></div></div>
                <div class="row"><div><span class="label">Installed On:</span> ${ticketData.installationDate || '-'}</div></div>
            </div>

            <div class="box">
                <div style="font-weight:bold; text-decoration:underline;">Problem Reported:</div>
                <div style="margin-top:5px; margin-bottom:15px;">${ticketData.remark}</div>

                <div style="font-weight:bold; text-decoration:underline;">Action Taken / Resolution:</div>
                <div style="margin-top:5px;">${ticketData.resolutionNote || 'Work in progress / Pending for parts.'}</div>
            </div>

            ${partsHTML}

            <div class="footer">
              <div class="sign-box">
                <div style="height: 60px;"></div> 
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Customer Sign & Stamp</div>
              </div>

              <div class="sign-box">
                <div style="font-weight: bold; font-size: 12px;">Engineer: ${ticketData.senderName}</div>
                ${signatureHTML}
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Engineer Signature</div>
              </div>
            </div>
          </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `Service_${ticketData.scrId}.pdf`;
        // @ts-ignore
        const newPath = `${FileSystem.cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Report` });
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
    else if (type === 'Service Type') data = serviceOptions;

    setFilteredData(data);
    setModalVisible(true);
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    let sourceList: any[] = [];
    if (currentSelection === 'Org') sourceList = orgList;
    else if (currentSelection === 'Serial') sourceList = getMachinesForOrg();
    else if (currentSelection === 'Service Type') sourceList = serviceOptions;

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

  const selectOrganization = (item: any) => {
      setOrg(item.orgName || item.name);
      setOrgId(item.id || ''); 
      setCity(item.city || item.City || item.district || ''); 
      setAddress(item.address || item.address1 || item.location || '');
      setErrors(prev => ({...prev, org: false})); 
      setSerialNo(''); setMachineName(''); setModelName(''); setDepartment(''); setInstallDate('');
  };

  const handleSelect = (item: any) => {
    if (currentSelection === 'Org') { 
        selectOrganization(item);
    } 
    else if (currentSelection === 'Serial') { 
        setSerialNo(item.serialNo);
        setMachineName(item.productName || item.machineName || item.product || '');
        setModelName(item.model || '');
        setDepartment(item.department || '');
        setInstallDate(item.date || '');
        setErrors(prev => ({...prev, serial: false}));
    }
    else if (currentSelection === 'Service Type') { setServiceType(item); }
    setModalVisible(false);
  };

  const handleAddNewSerial = (newSerial: string) => {
      setTempSerial(newSerial);
      setModalVisible(false); 
      setTimeout(() => setNewMachineModalVisible(true), 500); 
  };

  const saveNewMachineDetails = () => {
      if(!machineName) { Alert.alert("Required", "Please enter Machine Name"); return; }
      setSerialNo(tempSerial);
      setNewMachineModalVisible(false);
  };

  // 🔥 6. SAAS SAVE LOGIC
  const handleSave = async () => {
      if (!org || !serialNo || !remark) {
          Alert.alert("Error", "Organization, Serial No, and Problem are required.");
          return;
      }
      
      setIsSaving(true); 

      const locationData = await getCurrentLocation();
      if (!locationData) {
          setIsSaving(false);
          return; 
      }

      const newTicketId = generateSequentialTicketId();
      const partsSummary = usedParts.map(p => `${p.partName} (${p.usedQty})`).join(', ');

      const newCall = {
          scrId: newTicketId, 
          date: callDate.toISOString().split('T')[0],
          dateIso: callDate.toISOString().split('T')[0],
          hospitalName: org,
          orgId: orgId,
          city: city, 
          address: address,
          machine: machineName || 'Unknown',
          model: modelName || 'Unknown', 
          serialNo: serialNo,
          department: department,
          installationDate: installDate,
          serviceType: serviceType, 
          status: status === 'Closed' ? 'Resolved' : 'Open',
          resolutionNote: status === 'Closed' ? resolutionNote : '',
          warrantyStatus: serviceType,
          remark: remark,
          imageUri: image,
          partsUsed: usedParts, 
          partsText: partsSummary,
          location: locationData
      };

      try {
          const res = await addSaaSData("service_calls", newCall);
          
          if (res.success) {
              if (addNotification) {
                  await addNotification({
                      title: `Service Ticket #${newTicketId} 🛠️`,
                      message: `${currentUser?.name} created a service call for ${org} (${status}).`,
                      to: "Admin",
                      route: "/service_call",
                      type: "alert"
                  });
              }

              if (params.activityId && updateActivityStatus) {
                  await updateActivityStatus(params.activityId as string, 'Completed');
              }
              
              setIsSaving(false);
              
              Alert.alert(
                  "Success ✅", 
                  `Ticket #${newTicketId} Created!\nShare PDF?`,
                  [
                      { text: "No", onPress: () => router.back(), style: 'cancel' },
                      { text: "Yes, Share PDF", onPress: async () => { 
                          await generateServicePDF({...newCall, senderName: currentUser?.name});
                          router.back(); 
                      }}
                  ]
              );
          } else {
              Alert.alert("Error", "Could not save service ticket.");
              setIsSaving(false);
          }
      } catch (err) {
          Alert.alert("Error", "Something went wrong.");
          setIsSaving(false);
      }
  };

  const handleAddPart = (part: any) => {
      if (usedParts.find(p => p.id === part.id)) return Alert.alert("Already Added");
      setUsedParts([...usedParts, { ...part, usedQty: '1' }]);
      setPartsModalVisible(false);
  };
  const updatePartQty = (id: string, qty: string) => setUsedParts(usedParts.map(p => p.id === id ? { ...p, usedQty: qty } : p));
  const removePart = (id: string) => setUsedParts(usedParts.filter(p => p.id !== id));
  
  const pickImage = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Permission Denied");
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.5 });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
          <Text style={styles.headerTitle}>New Service Call</Text>
          <View style={{width:24}} /> 
        </View>

        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}} keyboardShouldPersistTaps="handled">
            
            <View style={styles.statusToggleContainer}>
                <Text style={styles.label}>Ticket Status:</Text>
                <View style={styles.toggleWrapper}>
                    <TouchableOpacity style={[styles.toggleBtn, status === 'Open' && styles.activeOpen]} onPress={() => setStatus('Open')}><Text style={[styles.toggleText, status === 'Open' && {color:'white'}]}>Open</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.toggleBtn, status === 'Closed' && styles.activeClosed]} onPress={() => setStatus('Closed')}><Text style={[styles.toggleText, status === 'Closed' && {color:'white'}]}>Close Now</Text></TouchableOpacity>
                </View>
            </View>

            <Text style={styles.label}>Call Date</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                <Text style={{color: '#333'}}>{formatDate(callDate)}</Text>
                <Ionicons name="calendar-outline" size={18} color="gray" />
            </TouchableOpacity>
            {showDatePicker && <DateTimePicker value={callDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setCallDate(d); }} />}

            <Text style={styles.label}>Organization *</Text>
            <TouchableOpacity style={[styles.dropdown, errors.org && styles.errorBorder]} onPress={() => openModal('Org')}>
                <Text style={{color: org ? 'black' : 'gray'}}>{org || 'Select Organization'}</Text>
                {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={18} color="gray" />}
            </TouchableOpacity>

            <Text style={styles.label}>Machine Serial No *</Text>
            <TouchableOpacity style={[styles.dropdown, errors.serial && styles.errorBorder]} onPress={() => {
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

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Machine Name</Text>
                    <TextInput style={styles.inputGray} placeholder="Ex: Ventilator" value={machineName} onChangeText={setMachineName} />
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Model Name</Text>
                    <TextInput style={styles.inputGray} placeholder="Ex: CV-200" value={modelName} onChangeText={setModelName} />
                </View>
            </View>

            <View style={{backgroundColor:'#f0f4f8', padding:10, borderRadius:8, marginBottom:10, borderWidth:1, borderColor:'#dbeafe'}}>
                <Text style={{fontWeight:'bold', color:'#3b5998', fontSize:12, marginBottom:5}}>ADDITIONAL INFO (Auto-Filled)</Text>
                <View style={styles.row}>
                    <View style={styles.col}>
                        <Text style={{fontSize:11, color:'gray'}}>Department</Text>
                        <Text style={{fontWeight:'bold', color:'#333'}}>{department || '-'}</Text>
                    </View>
                    <View style={styles.col}>
                        <Text style={{fontSize:11, color:'gray'}}>City</Text>
                        <Text style={{fontWeight:'bold', color:'#333'}}>{city || '-'}</Text>
                    </View>
                </View>
                <View style={{marginTop:5}}>
                      <Text style={{fontSize:11, color:'gray'}}>Address</Text>
                      <Text style={{fontWeight:'bold', color:'#333'}} numberOfLines={1}>{address || '-'}</Text>
                </View>
                <View style={{marginTop:5}}>
                      <Text style={{fontSize:11, color:'gray'}}>Installation Date</Text>
                      <Text style={{fontWeight:'bold', color:'#333'}}>{installDate || '-'}</Text>
                </View>
            </View>

            <Text style={styles.label}>Service Type / Contract</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Service Type')}>
                <Text style={{color: 'black'}}>{serviceType}</Text>
                <Ionicons name="caret-down" size={18} color="gray" />
            </TouchableOpacity>

            <Text style={styles.label}>Upload Photo</Text>
            <View style={styles.cameraContainer}>
                <TouchableOpacity style={styles.cameraBtn} onPress={pickImage}>
                    <Ionicons name="camera" size={24} color="#3b5998" />
                    <Text style={{color:'#3b5998', marginLeft:10}}>Take Photo</Text>
                </TouchableOpacity>
                {image && <Image source={{ uri: image }} style={styles.previewImage} />}
            </View>

            <Text style={styles.label}>Problem Reported *</Text>
            <TextInput style={[styles.inputGray, {height: 60}, errors.remark && styles.errorBorder]} multiline placeholder="Describe issue..." value={remark} onChangeText={setRemark} />

            <Text style={styles.sectionHeader}>Spare Parts</Text>
            <View style={styles.partsContainer}>
                {usedParts.map((part, index) => (
                    <View key={index} style={styles.partRow}>
                        <Text style={{flex:1, fontWeight:'bold'}}>{part.partName}</Text>
                        <TextInput style={styles.qtyInput} value={part.usedQty} keyboardType="numeric" onChangeText={(t) => updatePartQty(part.id, t)} />
                        <TouchableOpacity onPress={() => removePart(part.id)}><Ionicons name="trash-outline" size={20} color="red" /></TouchableOpacity>
                    </View>
                ))}
                <TouchableOpacity style={styles.addPartBtn} onPress={() => setPartsModalVisible(true)}>
                    <Ionicons name="add-circle-outline" size={20} color="#3b5998" />
                    <Text style={{color:'#3b5998', fontWeight:'bold', marginLeft:5}}>+ Add Spare Part</Text>
                </TouchableOpacity>
            </View>

            {status === 'Closed' && (
                <View style={{marginTop: 20}}>
                    <Text style={[styles.label, {color:'green'}]}>Resolution / Action Taken *</Text>
                    <TextInput style={[styles.inputGray, {height: 80, borderColor:'green'}]} multiline placeholder="Repair details..." value={resolutionNote} onChangeText={setResolutionNote} />
                </View>
            )}

            <TouchableOpacity style={[styles.saveButton, isSaving && {backgroundColor:'#ccc'}]} onPress={handleSave} disabled={isSaving}>
                <Text style={styles.saveBtnText}>{isSaving ? 'Generating ID...' : 'Save Ticket'}</Text>
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
        </ScrollView>

        {/* --- MODALS --- */}
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

                  {currentSelection === 'Serial' && searchText.length > 0 && filteredData.length === 0 && (
                      <TouchableOpacity style={styles.addNewItem} onPress={() => handleAddNewSerial(searchText)}>
                          <Ionicons name="add-circle" size={24} color="green" />
                          <Text style={{marginLeft:10, fontWeight:'bold', color:'green'}}>Add New Serial: "{searchText}"</Text>
                      </TouchableOpacity>
                  )}

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
                                  typeof item === 'string' ? (
                                      <View style={{flexDirection:'row', alignItems:'center'}}>
                                          <Ionicons name="radio-button-on" size={18} color="#666" style={{marginRight:10}}/>
                                          <Text style={styles.modalText}>{item}</Text>
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
                                  )
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

        <Modal visible={newMachineModalVisible} transparent={true} animationType="slide">
           <View style={styles.modalOverlay}>
               <View style={styles.modalContent}>
                   <Text style={styles.modalTitle}>New Machine Details</Text>
                   <Text style={{color:'gray', marginBottom:15}}>Serial No: {tempSerial}</Text>
                   <Text style={styles.label}>Machine Name *</Text>
                   <TextInput style={styles.inputGray} placeholder="e.g. Ventilator" value={machineName} onChangeText={setMachineName} />
                   <Text style={styles.label}>Model Name</Text>
                   <TextInput style={styles.inputGray} placeholder="e.g. Model X-200" value={modelName} onChangeText={setModelName} />
                   <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:20}}>
                       <TouchableOpacity style={[styles.saveButton, {backgroundColor:'#ddd', marginTop:0, width:'45%'}]} onPress={() => setNewMachineModalVisible(false)}><Text style={{color:'#333', fontWeight:'bold'}}>Cancel</Text></TouchableOpacity>
                       <TouchableOpacity style={[styles.saveButton, {marginTop:0, width:'45%'}]} onPress={saveNewMachineDetails}><Text style={styles.saveBtnText}>Confirm</Text></TouchableOpacity>
                   </View>
               </View>
           </View>
        </Modal>

        <Modal visible={partsModalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select Spare Part</Text>
                  <FlatList 
                      data={sparePartsList}
                      keyExtractor={item => item.id}
                      renderItem={({item}) => (
                          <TouchableOpacity style={styles.partItem} onPress={() => handleAddPart(item)}>
                              <View><Text style={{fontWeight:'bold'}}>{item.partName}</Text><Text style={{fontSize:12, color:'gray'}}>PN: {item.partNo}</Text></View>
                              <View style={{backgroundColor:'#e8f5e9', padding:5, borderRadius:4}}><Text style={{fontSize:11, color:'green'}}>Avail: {item.myStock || 0}</Text></View>
                          </TouchableOpacity>
                      )}
                  />
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setPartsModalVisible(false)}><Text style={{color:'red'}}>Close</Text></TouchableOpacity>
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
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#3b5998', marginTop: 25, marginBottom: 5 },
  statusToggleContainer: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:20 },
  toggleWrapper: { flexDirection:'row', backgroundColor:'#eee', borderRadius:8, padding:2 },
  toggleBtn: { paddingVertical:8, paddingHorizontal:20, borderRadius:6 },
  activeOpen: { backgroundColor:'#e57373' }, activeClosed: { backgroundColor:'#4caf50' }, toggleText: { fontWeight:'bold', color:'#555' },
  dropdown: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 15, marginBottom: 5, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  inputGray: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, marginBottom: 5, fontSize:16 },
  row: { flexDirection:'row', justifyContent:'space-between' }, col: { width:'48%' },
  errorBorder: { borderColor: 'red', borderWidth: 1, backgroundColor: '#fff0f0' },
  cameraContainer: { marginBottom: 10 },
  cameraBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', padding: 12, borderWidth:1, borderColor:'#3b5998', borderRadius:8, borderStyle:'dashed' },
  previewImage: { width: '100%', height: 200, borderRadius: 8, marginTop: 10, resizeMode:'cover' },
  partsContainer: { backgroundColor:'#f0f4f8', padding:10, borderRadius:8 },
  partRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'white', padding:10, borderRadius:6, marginBottom:8 },
  qtyInput: { borderWidth:1, borderColor:'#ccc', borderRadius:4, width:40, textAlign:'center', padding:2, height:30, marginRight:10 },
  addPartBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', padding:10 },
  saveButton: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalText: { fontSize: 16, color: '#333' },
  addNewItem: { flexDirection:'row', alignItems:'center', padding:15, backgroundColor:'#e8f5e9', borderRadius:8, marginBottom:10 },
  partItem: { flexDirection:'row', justifyContent:'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems:'center' },
  closeBtn: { marginTop: 15, alignItems: 'center', padding: 10 },
  iconBox: { width: 35, height: 35, borderRadius: 8, justifyContent:'center', alignItems:'center', backgroundColor:'#e3f2fd' },
  modalMainText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  modalSubText: { fontSize: 12, color: 'gray' }
});