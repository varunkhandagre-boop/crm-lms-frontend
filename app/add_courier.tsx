import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
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

import { useData } from './context/DataContext';

import { createCourier } from '../services/api/couriers';
import { fetchOrganizations } from '../services/api/organizations';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';
import { listProducts } from '../services/api/products';

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function AddCourierScreen() {
  const router = useRouter();
  const { currentUser, companyProfile, addNotification } = useData();

  // orgList now comes from useCachedList below (cache-first, shared 'organizations' key)
  const [productList, setProductList] = useState<any[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(false);

  const [date, setDate] = useState(new Date()); 
  const [courierDate, setCourierDate] = useState(new Date()); 
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCourierDatePicker, setShowCourierDatePicker] = useState(false);

  const [type, setType] = useState<'Inward' | 'Outward'>('Outward');
  const [docketNo, setDocketNo] = useState('');
  const [courierName, setCourierName] = useState('');
  
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [searchOrg, setSearchOrg] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [isManualEntry, setIsManualEntry] = useState(false); 
  const [orgId, setOrgId] = useState('');

  const [fromName, setFromName] = useState(''); 
  const [fromCity, setFromCity] = useState(''); 
  const [toName, setToName] = useState('');     
  const [toCity, setToCity] = useState('');     

  const [items, setItems] = useState([{ description: '', qty: '' }]);
  const [loading, setLoading] = useState(false);

  const [showProductModal, setShowProductModal] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(-1);
  const [searchProduct, setSearchProduct] = useState('');

  // 🔥 Organizations — cache-first, shares the SAME 'organizations' cache
  // key as organization.tsx/messaging_center.tsx.
  const { data: orgList } = useCachedList({
      cacheKey: buildCacheKey('organizations', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: () => fetchOrganizations({ limit: 200 }),
  });

  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              setIsDbLoading(true);
              try {
                  const prods = await listProducts({ limit: 100 } as any);
                  setProductList(prods);
              } catch (e) {
                  console.log('Error loading products:', e);
              } finally {
                  setIsDbLoading(false);
              }
          }
      };
      loadData();
  }, [currentUser]);

  useEffect(() => {
      const myCompName = companyProfile?.companyName;
      const myCity = (companyProfile as any)?.fullAddress?.city || (companyProfile as any)?.address || '';
      if (!myCompName || myCompName === 'Loading...') return;

      if (type === 'Outward') {
          setFromName(myCompName);
          setFromCity(myCity);
          setToName(''); setToCity('');
          setSelectedOrg(null); setIsManualEntry(false);
          setOrgId(''); 
      } else {
          setFromName(''); setFromCity('');
          setSelectedOrg(null); setIsManualEntry(false);
          setOrgId(''); 

          const myRole = currentUser?.role || '';
          const isOfficeRole = ['Admin', 'Manager', 'Account', 'Accountant', 'Store', 'Store Keeper', 'Hr', 'SuperAdmin'].includes(myRole);

          if (isOfficeRole) {
              setToName(myCompName);
              setToCity(myCity);
          } else {
              setToName(currentUser?.name || 'Office'); 
              setToCity('Nagpur');
          }
      }
  }, [type, currentUser, companyProfile]);

  const formatDate = (rawDate: Date) => {
      let day = rawDate.getDate().toString().padStart(2, '0');
      let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
      let year = rawDate.getFullYear();
      return `${day}/${month}/${year}`;
  };

  const handleAddItem = () => {
      setItems([...items, { description: '', qty: '' }]);
  };

  const handleRemoveItem = (index: number) => {
      const newList = [...items];
      newList.splice(index, 1);
      setItems(newList);
  };

  const handleItemChange = (text: string, index: number, field: 'description' | 'qty') => {
      const newList = [...items];
      // @ts-ignore
      newList[index][field] = text;
      setItems(newList);
  };

  const openProductModal = (index: number) => {
      setActiveRowIndex(index);
      setSearchProduct('');
      setShowProductModal(true);
  };

  const handleSelectProduct = (product: any) => {
      const newList = [...items];
      const prodName = product.model ? `${product.name} - ${product.model}` : product.name;
      
      newList[activeRowIndex].description = prodName;
      setItems(newList);
      setShowProductModal(false);
  };

    const generateChallan = async (data: any) => {
      try {
          let tableRows = '';
          let totalQty = 0; 
          
          if (data.items && data.items.length > 0) {
              data.items.forEach((item: any, index: number) => {
                  const q = parseFloat(item.qty) || 0; 
                  totalQty += q;

                  tableRows += `
                    <tr>
                      <td style="text-align: center; color:#6b7280;">${index + 1}</td>
                      <td>${item.description.replace(/\n/g, '<br>')}</td>
                      <td style="text-align: center; font-weight:600;">${item.qty}</td>
                    </tr>
                  `;
              });
          } else {
              tableRows = `<tr><td colspan="3" style="text-align:center; color:#9ca3af;">No Items</td></tr>`;
          }

          const logoBase64 = await urlToBase64Image(companyProfile?.logoUrl);
          const signatureBase64 = await urlToBase64Image(companyProfile?.signatureUrl);

          const logoHTML = logoBase64 
                ? `<img src="${logoBase64}" style="height: 62px; object-fit: contain;" />` 
                : `<div style="font-size:24px; font-weight:800; color:#0f2557; letter-spacing:0.5px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

          const signatureHTML = signatureBase64 
                ? `<img src="${signatureBase64}" style="height: 50px; object-fit: contain; margin-bottom: 6px;" />` 
                : `<div style="height: 50px;"></div>`;

          const receiverName = type === 'Outward' ? data.receiver.split(',')[0] : data.receiver;
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
                  display: flex; align-items: flex-start; justify-content: center; position: relative;
                  padding: 28px 40px; background: #0f2557; color: #ffffff;
                }
                .topbar .logo-corner { position: absolute; left: 40px; top: 28px; }
                .topbar .company-meta { text-align: center; font-size: 12px; line-height: 1.7; opacity: 0.92; }

                .doc-band {
                  display: flex; flex-direction: column; align-items: center; text-align: center;
                  background: #eef2fb; border-bottom: 4px solid #0f2557;
                  padding: 18px 40px; margin-bottom: 28px;
                }
                .doc-title { font-size: 19px; font-weight: 800; letter-spacing: 1.4px; color: #0f2557; }

                .grid { display: flex; gap: 20px; margin-bottom: 24px; }
                .card {
                  flex: 1; background: #fafbfe; border: 1px solid #e2e6f0; border-radius: 12px;
                  padding: 20px 22px;
                }
                .card-label { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: 1px; margin-bottom: 12px; }
                .consignee-name { font-size: 18px; font-weight: 800; color: #0f2557; text-transform: uppercase; }
                .consignee-addr { font-size: 13px; color: #4a4a68; margin-top: 6px; line-height: 1.5; }

                .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
                .row .k { color: #6b7280; }
                .row .v { font-weight: 600; color: #1a1a2e; text-align: right; }

                .table { width: 100%; border-collapse: collapse; margin-bottom: 34px; border-radius: 12px; overflow: hidden; }
                .table th {
                  background: #0f2557; color: white; font-size: 12.5px; letter-spacing: 0.5px;
                  text-align: left; padding: 15px 18px; font-weight: 600;
                }
                .table td {
                  padding: 14px 18px; font-size: 14px; border-bottom: 1px solid #e9ecf5; background: #ffffff;
                }
                .table .total-row td {
                  background: #eef2fb; font-weight: 800; color: #0f2557; border-bottom: none;
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
                <div class="logo-corner">${logoHTML}</div>
                <div class="company-meta">
                  <div style="font-weight:700; font-size:14px; margin-bottom:3px;">${companyProfile?.companyName || ''}</div>
                  <div>${companyProfile?.address || ''}</div>
                  <div>${companyProfile?.contactPhone || companyProfile?.phone || '-'} &nbsp;•&nbsp; ${companyProfile?.contactEmail || companyProfile?.email || '-'}</div>
                  ${companyProfile?.gstNumber ? `<div>GSTIN: ${companyProfile.gstNumber}</div>` : ''}
                </div>
              </div>

              <div class="doc-band" style="flex-direction: row; justify-content: space-between; text-align: left;">
                <div class="doc-title">DELIVERY CHALLAN</div>
                <div style="text-align: right; font-size: 12.5px; color: #4a4a68; line-height: 1.7;">
                  <div>DC No: <b style="color:#0f2557;">${data.dcNo}</b></div>
                  <div>Date: <b style="color:#0f2557;">${data.date}</b></div>
                </div>
              </div>

              <div class="sheet">
                <div class="grid">
                  <div class="card" style="flex: 1.3;">
                    <div class="card-label">CONSIGNEE / RECEIVER</div>
                    <div class="consignee-name">${receiverName}</div>
                    <div class="consignee-addr">${data.toCity || '-'}</div>
                  </div>
                  <div class="card">
                    <div class="card-label">DISPATCH DETAILS</div>
                    <div class="row"><span class="k">Courier</span><span class="v">${data.courierName || '-'}</span></div>
                    <div class="row"><span class="k">Docket No</span><span class="v">${data.docketNo || '-'}</span></div>
                    <div class="row"><span class="k">Booking Date</span><span class="v">${data.courierDate || '-'}</span></div>
                  </div>
                </div>

                <table class="table">
                  <thead>
                    <tr>
                      <th style="width: 10%; text-align:center;">Sr.</th>
                      <th style="width: 65%;">Description of Material</th>
                      <th style="width: 25%; text-align:center;">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRows}
                    <tr class="total-row">
                      <td colspan="2" style="text-align: right;">TOTAL QUANTITY</td>
                      <td style="text-align: center;">${totalQty}</td>
                    </tr>
                  </tbody>
                </table>

                <div class="footer">
                  <div class="sign-box">
                    <div class="sign-space"></div>
                    <div class="sign-line"></div>
                    <div class="sign-label">Receiver's Signature</div>
                  </div>
                  <div class="sign-box">
                    <div class="sign-sub" style="margin-bottom:6px;">For, ${companyProfile?.companyName || 'Us'}</div>
                    ${signatureHTML}
                    <div class="sign-line"></div>
                    <div class="sign-label">Authorised Signatory</div>
                  </div>
                </div>

                <div class="doc-footer">
                  This is a system-generated delivery challan from ${companyProfile?.companyName || 'our company'} • Generated on ${genDate}
                </div>
              </div>
            </body>
          </html>`;

          const { uri } = await Print.printToFileAsync({ html: htmlContent });
          
          const cleanName = `${data.dcNo}_${data.receiver.split(',')[0].replace(/[^a-zA-Z0-9]/g, '_')}`;
          const newFileName = `${cleanName}.pdf`;
          // @ts-ignore
          const newPath = `${FileSystem.cacheDirectory}${newFileName}`;

          try {
              await FileSystem.copyAsync({ from: uri, to: newPath });
              await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Challan` });
          } catch (renameError) {
              await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
          }

      } catch (error) { 
          Alert.alert("Error", "Could not generate challan."); 
      }
  };

  const handleOrgSelect = (item: any) => {
      const name = item.name || item.orgName;
      let fullAddress = item.address && item.city ? `${item.address}, ${item.city}` : (item.address || item.city || '');

      if (type === 'Outward') {
          setToName(name);
          setToCity(fullAddress); 
      } else {
          setFromName(name);
          setFromCity(fullAddress);
      }
      
      setOrgId(item.id || ''); 
      setSelectedOrg(item);
      setIsManualEntry(false); 
      setShowOrgModal(false);
  };

  const handleManualEntry = () => {
      setIsManualEntry(true); 
      setSelectedOrg(null);
      setOrgId(''); 
      
      if(type === 'Outward') { setToName(''); setToCity(''); }
      else { setFromName(''); setFromCity(''); }
      setShowOrgModal(false);
  };

  const handleSave = async () => {
      if (!docketNo || !courierName || !fromName || !toName) {
          Alert.alert("Missing Fields", "Please fill Sender/Receiver and Courier details.");
          return;
      }
      if (items.length === 0 || !items[0].description) {
          Alert.alert("Missing Material", "Please add at least one item description.");
          return;
      }

      setLoading(true); 
      try {
          const finalSender = `${fromName}${fromCity ? ', ' + fromCity : ''}`;
          const finalReceiver = `${toName}${toCity ? ', ' + toCity : ''}`;
          const prefix = companyProfile?.shortName ? companyProfile.shortName.toUpperCase() : 'LMS';

          const res = await createCourier({
              type,
              docketNo,
              courierName,
              date: date.toISOString().split('T')[0],
              courierDate: courierDate.toISOString().split('T')[0],
              orgId: orgId || undefined,
              sender: finalSender,
              receiver: finalReceiver,
              toCity,
              items,
              dcPrefix: prefix,
          });
          
          if (res.success) {
              const dcNumber = res.record.dcNo;

              if (addNotification) {
                  let notifTitle = type === 'Inward' ? "New Courier Received 📦" : "Courier Dispatched 🚀";
                  let notifMsg = type === 'Inward' ? `Courier from ${fromName}` : `Outward to ${toName}. DC: ${dcNumber}`;
                  await addNotification({
                      title: notifTitle, 
                      message: notifMsg, 
                      to: "Admin", 
                      route: "/courier", 
                      type: "info"
                  });
              }

              if (type === 'Outward') {
                  Alert.alert("Success ✅", "Saved! Share Delivery Challan?", [
                      { text: "No", onPress: () => router.back(), style: 'cancel' },
                      { text: "Yes, Share PDF", onPress: async () => { await generateChallan(res.record); router.back(); }}
                  ]);
              } else {
                  Alert.alert("Success", "Entry Saved!");
                  router.back();
              }
          } else {
              Alert.alert("Error", "Could not save entry.");
          }
      } catch (e) { Alert.alert("Error", "Could not save entry."); } 
      finally { setLoading(false); }
  };

  const filteredOrgs = orgList.filter((o:any) => (o.name || '').toLowerCase().includes(searchOrg.toLowerCase()) || (o.orgName || '').toLowerCase().includes(searchOrg.toLowerCase()));
  const filteredProducts = productList.filter((p:any) => (p.name || '').toLowerCase().includes(searchProduct.toLowerCase()));

  return (
    <View style={styles.container}>
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Log New Courier</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            
            <View style={styles.topRow}>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                    <Text style={{fontSize:10, color:'gray'}}>Entry Date</Text>
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Ionicons name="calendar-outline" size={16} color="#3b5998" />
                        <Text style={{marginLeft:5, fontWeight:'bold', color:'#333'}}>{formatDate(date)}</Text>
                    </View>
                </TouchableOpacity>
                {showDatePicker && <DateTimePicker value={date} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setDate(d); }} />}

                <View style={styles.toggleBox}>
                    <TouchableOpacity style={[styles.toggleBtn, type==='Outward' && styles.activeOutward]} onPress={() => setType('Outward')}>
                        <Text style={[styles.toggleText, type==='Outward' && {color:'white'}]}>Outward</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.toggleBtn, type==='Inward' && styles.activeInward]} onPress={() => setType('Inward')}>
                        <Text style={[styles.toggleText, type==='Inward' && {color:'white'}]}>Inward</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="log-out-outline" size={20} color="#e65100" />
                    <View style={{flexDirection:'row', justifyContent:'space-between', flex:1, alignItems:'center'}}>
                        <Text style={styles.sectionTitle}>FROM ({type === 'Inward' ? 'Outside Party' : 'Our Office'})</Text>
                        {type === 'Inward' && isManualEntry && (
                            <TouchableOpacity onPress={() => setShowOrgModal(true)}>
                                <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold'}}>Select List</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
                
                {type === 'Inward' && !isManualEntry ? (
                    <TouchableOpacity style={styles.selector} onPress={() => setShowOrgModal(true)}>
                        <Text style={[styles.selectorText, !fromName && {color:'#999'}]}>{fromName || "Select Sender"}</Text>
                        {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="#3b5998" />}
                    </TouchableOpacity>
                ) : (
                    <TextInput 
                        style={styles.input} 
                        placeholder={type === 'Outward' ? "Sender Name (Your Branch)" : "Sender Name"} 
                        value={fromName} 
                        onChangeText={setFromName} 
                    />
                )}
                <TextInput style={styles.input} placeholder={type === 'Outward' ? "City (Your Location)" : "City / Location"} value={fromCity} onChangeText={setFromCity} />
            </View>

            <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="log-in-outline" size={20} color="#2e7d32" />
                    <View style={{flexDirection:'row', justifyContent:'space-between', flex:1, alignItems:'center'}}>
                         <Text style={styles.sectionTitle}>TO ({type === 'Inward' ? 'Our Office' : 'Customer / Party'})</Text>
                         {type === 'Outward' && isManualEntry && (
                             <TouchableOpacity onPress={() => setShowOrgModal(true)}>
                                 <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold'}}>Select List</Text>
                             </TouchableOpacity>
                         )}
                    </View>
                </View>

                {type === 'Outward' && !isManualEntry ? (
                    <TouchableOpacity style={styles.selector} onPress={() => setShowOrgModal(true)}>
                        <Text style={[styles.selectorText, !toName && {color:'#999'}]}>{toName || "Select Receiver"}</Text>
                        {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="#3b5998" />}
                    </TouchableOpacity>
                ) : (
                    <TextInput 
                        style={styles.input} 
                        placeholder={type === 'Inward' ? "Receiver Name (Your Branch)" : "Receiver Name"} 
                        value={toName} 
                        onChangeText={setToName} 
                    />
                )}
                <TextInput style={styles.input} placeholder={type === 'Inward' ? "City (Your Location)" : "City / Address"} value={toCity} onChangeText={setToCity} />
            </View>

            <Text style={styles.label}>Courier Service Details</Text>
            <View style={styles.row}>
                <TextInput style={[styles.input, {flex:1, marginRight:10}]} placeholder="Service Name" value={courierName} onChangeText={setCourierName} />
                <TextInput style={[styles.input, {flex:1}]} placeholder="Docket / Track No" value={docketNo} onChangeText={setDocketNo} />
            </View>
            <View style={{marginBottom:15}}>
                <Text style={styles.label}>Booking Date (on Receipt)</Text>
                <TouchableOpacity style={styles.selector} onPress={() => setShowCourierDatePicker(true)}>
                    <Text style={{color:'#333', fontWeight:'bold'}}>{formatDate(courierDate)}</Text>
                    <Ionicons name="calendar" size={20} color="#3b5998" />
                </TouchableOpacity>
                {showCourierDatePicker && <DateTimePicker value={courierDate} mode="date" onChange={(e, d) => { setShowCourierDatePicker(false); if(d) setCourierDate(d); }} />}
            </View>

            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:10}}>
                <Text style={styles.label}>Material Details</Text>
                <TouchableOpacity onPress={handleAddItem} style={{flexDirection:'row', alignItems:'center', padding:5}}>
                    <Ionicons name="add-circle" size={20} color="#3b5998" />
                    <Text style={{color:'#3b5998', fontWeight:'bold', marginLeft:5}}>Add Item</Text>
                </TouchableOpacity>
            </View>
            
            <View style={{flexDirection:'row', marginBottom: 5, paddingHorizontal:5}}>
                <Text style={{flex:2, fontSize:12, fontWeight:'bold', color:'gray'}}>Description</Text>
                <Text style={{flex:0.6, fontSize:12, fontWeight:'bold', color:'gray', textAlign:'center'}}>Qty</Text>
                <View style={{width:30}} /> 
            </View>

            {items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                    <Text style={{position:'absolute', left:-15, top:12, fontSize:10, color:'#ccc'}}>{index+1}.</Text>
                    
                    <View style={{flex: 2, marginRight: 10, position: 'relative'}}>
                        <TextInput 
                            style={[styles.dynamicInput, {width: '100%', paddingRight: 35}]}
                            multiline={true} 
                            placeholder="Item Name" 
                            value={item.description} 
                            onChangeText={(t) => handleItemChange(t, index, 'description')} 
                        />
                        <TouchableOpacity 
                            style={{position: 'absolute', right: 5, top: 8}}
                            onPress={() => openProductModal(index)}
                        >
                            <Ionicons name="list-circle" size={24} color="#3b5998" />
                        </TouchableOpacity>
                    </View>

                    <TextInput 
                        style={[styles.dynamicInput, {flex:0.6, textAlign:'center'}]} 
                        placeholder="0" 
                        keyboardType="numeric"
                        value={item.qty} 
                        onChangeText={(t) => handleItemChange(t, index, 'qty')} 
                    />
                    {items.length > 1 ? (
                        <TouchableOpacity onPress={() => handleRemoveItem(index)} style={{padding:5}}>
                            <Ionicons name="trash-outline" size={20} color="#ff4444" />
                        </TouchableOpacity>
                    ) : (
                         <View style={{width:30}} />
                    )}
                </View>
            ))}
            
            <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
                <Text style={{color:'#3b5998'}}>+ Add Another Item</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="white"/> : <Text style={styles.saveText}>{type === 'Outward' ? 'Save & Generate DC' : 'Save Entry'}</Text>}
            </TouchableOpacity>
            
            <View style={{height: 100}} />

        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showOrgModal} animationType="slide">
        <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select {type === 'Outward' ? 'Receiver' : 'Sender'}</Text>
                <TouchableOpacity onPress={() => setShowOrgModal(false)}><Ionicons name="close-circle" size={30} color="#d32f2f"/></TouchableOpacity>
            </View>
            <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color="gray" />
                <TextInput style={styles.searchInputModal} placeholder="Search Name..." value={searchOrg} onChangeText={setSearchOrg} autoFocus />
            </View>

            <TouchableOpacity style={styles.manualOption} onPress={handleManualEntry}>
                <Ionicons name="pencil" size={18} color="#e65100" />
                <Text style={{marginLeft:10, fontWeight:'bold', color:'#e65100'}}>Other (Manual Entry)</Text>
            </TouchableOpacity>

            <FlatList
                data={filteredOrgs}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                    <TouchableOpacity style={styles.orgItem} onPress={() => handleOrgSelect(item)}>
                        <View style={styles.orgIcon}>
                            <Ionicons name="business" size={20} color="#3b5998" />
                        </View>
                        <View style={{flex:1}}>
                            <Text style={styles.orgName}>{item.name || item.orgName}</Text>
                            <Text style={styles.orgSubText}>{item.city ? `📍 ${item.city}` : ''}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#ccc" />
                    </TouchableOpacity>
                )}
            />
        </View>
      </Modal>

      <Modal visible={showProductModal} animationType="slide">
        <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Item</Text>
                <TouchableOpacity onPress={() => setShowProductModal(false)}><Ionicons name="close-circle" size={30} color="#d32f2f"/></TouchableOpacity>
            </View>
            <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color="gray" />
                <TextInput style={styles.searchInputModal} placeholder="Search Product..." value={searchProduct} onChangeText={setSearchProduct} autoFocus />
            </View>

            <FlatList
                data={filteredProducts}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                    <TouchableOpacity style={styles.orgItem} onPress={() => handleSelectProduct(item)}>
                        <View style={{flex:1}}>
                            <Text style={styles.orgName}>{item.name}</Text>
                            {item.model ? <Text style={styles.orgSubText}>Model: {item.model}</Text> : null}
                        </View>
                        <Ionicons name="add-circle-outline" size={24} color="#3b5998" />
                    </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No Products Found</Text>}
            />
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  content: { padding: 15, paddingBottom: 50 },
  topRow: { flexDirection:'row', justifyContent:'space-between', marginBottom: 20 },
  dateBtn: { backgroundColor:'white', padding:8, borderRadius:8, borderWidth:1, borderColor:'#ddd', flex:0.4 },
  toggleBox: { flexDirection:'row', backgroundColor:'#e0e0e0', borderRadius:8, flex:0.55, padding:2 },
  toggleBtn: { flex:1, alignItems:'center', justifyContent:'center', borderRadius:6 },
  activeInward: { backgroundColor:'#3b5998' },
  activeOutward: { backgroundColor:'#d32f2f' },
  toggleText: { fontSize:11, fontWeight:'bold', color:'#555' },
  sectionCard: { backgroundColor:'white', padding:15, borderRadius:12, marginBottom:15, elevation:1 },
  sectionHeader: { flexDirection:'row', alignItems:'center', marginBottom:10 },
  sectionTitle: { fontWeight:'bold', fontSize:14, marginLeft:8, color:'#444' },
  label: { marginBottom: 5, color:'#555', fontWeight:'bold', fontSize:13 },
  input: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#e0e0e0', borderRadius: 8, padding: 12, marginBottom: 10, fontSize:15, color:'#333' },
  selector: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor: '#f0f4ff', borderWidth:1, borderColor:'#d1d9ff', borderRadius: 8, padding: 12, marginBottom: 10 },
  selectorText: { fontSize:15, fontWeight:'bold', color:'#3b5998' },
  row: { flexDirection: 'row' },
  saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20, elevation: 3 },
  saveText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  modalContainer: { flex: 1, backgroundColor: 'white', padding: 20, paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  searchBox: { flexDirection:'row', alignItems:'center', backgroundColor: '#f0f2f5', paddingHorizontal: 10, borderRadius: 10, marginBottom: 15, height: 50 },
  searchInputModal: { flex: 1, marginLeft: 10, fontSize: 16 },
  manualOption: { flexDirection:'row', alignItems:'center', padding:15, backgroundColor:'#fff3e0', borderRadius:10, marginBottom:10, borderWidth:1, borderColor:'#ffcc80' },
  orgItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  orgIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e3f2fd', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  orgName: { fontWeight: 'bold', fontSize: 16 },
  orgSubText: { color: 'gray', fontSize: 12, marginTop: 2 },
  
  itemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      paddingBottom: 10,
      marginLeft: 15
  },
  dynamicInput: {
      backgroundColor: 'white',
      borderWidth: 1,
      borderColor: '#e0e0e0',
      borderRadius: 8,
      padding: 10,
      fontSize: 15,
      minHeight: 45,
      color: '#333',
  },
  addItemBtn: {
      alignItems: 'center',
      padding: 10,
      marginTop: 5,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: '#3b5998',
      borderRadius: 8,
      borderStyle: 'dashed',
      backgroundColor: '#f0f4ff'
  }
});
