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
import { useData } from './context/DataContext';

import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// 🔥 PDF & FILE SYSTEM IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function AddCourierScreen() {
  const router = useRouter();
  // 🔥 UPDATED: Added 'productList'
  const { addCourier, user, courierList, orgList, companyProfile, productList = [] } = useData();

  // STATES
  const [date, setDate] = useState(new Date()); 
  const [courierDate, setCourierDate] = useState(new Date()); 
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCourierDatePicker, setShowCourierDatePicker] = useState(false);

  const [type, setType] = useState<'Inward' | 'Outward'>('Outward');
  const [docketNo, setDocketNo] = useState('');
  const [courierName, setCourierName] = useState('');
  
  // ORG & MANUAL ENTRY STATES
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [searchOrg, setSearchOrg] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [isManualEntry, setIsManualEntry] = useState(false); 

  // ADDRESS STATES
  const [fromName, setFromName] = useState(''); 
  const [fromCity, setFromCity] = useState(''); 
  const [toName, setToName] = useState('');     
  const [toCity, setToCity] = useState('');     

  // ITEMS STATE
  const [items, setItems] = useState([{ description: '', qty: '' }]);
  const [loading, setLoading] = useState(false);

  // 🔥 PRODUCT MODAL STATES
  const [showProductModal, setShowProductModal] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(-1);
  const [searchProduct, setSearchProduct] = useState('');

  // AUTO FILL LOGIC
  useEffect(() => {
      const myCompName = companyProfile?.companyName || 'My Company';
      const myCity = companyProfile?.city || 'Head Office';

      if (type === 'Outward') {
          setFromName(myCompName);
          setFromCity(myCity);
          setToName(''); setToCity('');
          setSelectedOrg(null); setIsManualEntry(false);
      } else {
          setFromName(''); setFromCity('');
          setSelectedOrg(null); setIsManualEntry(false);

          const myRole = user?.role || '';
          const isOfficeRole = ['Admin', 'Manager', 'Account', 'Accountant', 'Store', 'Store Keeper', 'Hr'].includes(myRole);

          if (isOfficeRole) {
              setToName(myCompName);
              setToCity(myCity);
          } else {
              setToName(user?.name || 'Office'); 
              setToCity('Nagpur');
          }
      }
  }, [type, user, companyProfile]);

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

  // 🔥 HANDLE PRODUCT SELECT
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

  // PDF GENERATOR
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
                      <td style="text-align: center;">${index + 1}</td>
                      <td style="text-align: left;">${item.description.replace(/\n/g, '<br>')}</td>
                      <td style="text-align: center;">${item.qty}</td>
                    </tr>
                  `;
              });
          } else {
              tableRows = `<tr><td colspan="3" style="text-align:center;">No Items</td></tr>`;
          }

          const logoHTML = companyProfile?.logoUrl 
                ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` 
                : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

          const signatureHTML = companyProfile?.signatureUrl 
                ? `<img src="${companyProfile.signatureUrl}" style="height: 50px; margin-top: 5px;" />` 
                : `<div style="height: 40px;"></div>`;

          const htmlContent = `
          <html>
            <head>
              <style>
                body { font-family: 'Helvetica', sans-serif; padding: 30px; border: 2px solid #000; }
                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                .title { font-size: 24px; font-weight: bold; color: #1a237e; text-transform: uppercase; }
                .sub-title { font-size: 12px; margin-top: 5px; color: #333; }
                .row { display: flex; justify-content: space-between; margin-bottom: 15px; }
                .label { font-weight: bold; font-size: 14px; }
                .box { border: 1px solid #000; padding: 10px; margin-top: 10px; }
                .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                .table th, .table td { border: 1px solid #000; padding: 8px; text-align: center; vertical-align: top; }
                .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
                .sign { border-top: 1px solid #000; width: 150px; text-align: center; padding-top: 5px; font-size:12px; }
                .sign-img-box { text-align: center; width: 150px; }
              </style>
            </head>
            <body>
              <div class="header">
                ${logoHTML}
                ${companyProfile?.logoUrl ? `<div class="title" style="font-size:20px;">${companyProfile.companyName}</div>` : ''}
                
                <div class="sub-title">${companyProfile?.address}</div>
                <div class="sub-title">
                    Phone: ${companyProfile?.contactPhone || companyProfile?.phone} |
                    Email: ${companyProfile?.contactEmail || companyProfile?.email || '-'}
                </div>
                <div class="sub-title">
                    ${companyProfile?.gstNumber ? `GSTIN: ${companyProfile.gstNumber}` : ''}
                </div>
              </div>

              <h3 style="text-align: center; text-decoration: underline;">DELIVERY CHALLAN</h3>

              <div class="row">
                <div><span class="label">DC No:</span> <b>${data.dcNo}</b></div>
                <div><span class="label">Date:</span> ${data.date}</div>
              </div>

              <div class="box">
                <div class="label" style="margin-bottom:5px;">Consignee / Receiver Details:</div>
                <div style="font-size: 18px; font-weight: bold; text-transform: uppercase;">
                    ${type === 'Outward' ? data.receiver.split(',')[0] : data.receiver}
                </div>
                <div style="font-size: 14px; margin-top: 5px;">
                    ${data.toCity ? data.toCity : ''}
                </div>
              </div>

              <div class="box">
                <div class="label">Dispatch Details:</div>
                <div style="margin-top:5px;">Courier: <b>${data.courierName}</b></div>
                <div>Docket/Track No: <b>${data.docketNo}</b></div>
                <div>Booking Date: ${data.courierDate}</div> 
              </div>
              
              <table class="table">
                <tr style="background-color: #eee;">
                  <th style="width: 10%;">Sr.</th>
                  <th style="width: 70%;">Description of Material</th>
                  <th style="width: 20%;">Qty</th>
                </tr>
                ${tableRows}
                <tr style="background-color: #f9f9f9; font-weight: bold;">
                  <td colspan="2" style="text-align: right;">TOTAL QUANTITY</td>
                  <td style="text-align: center;">${totalQty}</td>
                </tr>
              </table>

              <div class="footer">
                <div class="sign">Receiver's Sign & Stamp</div>
                
                <div class="sign-img-box">
                    <div style="font-size:10px; margin-bottom:5px;">For, ${companyProfile?.companyName}</div>
                    ${signatureHTML}
                    <div class="sign">Authorised Signatory</div>
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
      setSelectedOrg(item);
      setIsManualEntry(false); 
      setShowOrgModal(false);
  };

  const handleManualEntry = () => {
      setIsManualEntry(true); 
      setSelectedOrg(null);
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
          
          let dcNumber = "";
          if (type === 'Outward') {
              const currentYear = new Date().getFullYear();
              const count = courierList ? courierList.filter((c: any) => c.type === 'Outward' && c.dateIso && c.dateIso.startsWith(String(currentYear))).length + 1 : 1;
              const prefix = companyProfile?.shortName ? companyProfile.shortName.toUpperCase() : 'LMS';
              dcNumber = `${prefix}-DC-${currentYear}-${String(count).padStart(3, '0')}`;
          }

          const newEntry = {
              id: Date.now().toString(),
              date: formatDate(date), 
              dateIso: date.toISOString().split('T')[0], 
              courierDate: formatDate(courierDate),
              type, docketNo, courierName,
              sender: finalSender, receiver: finalReceiver, toCity, 
              
              items: items, 
              material: items.map(i => i.description).join(', '), 
              qty: items.length.toString(), 
              
              dcNo: dcNumber, 
              status: 'Pending',
              senderId: user?.uid || 'guest', senderName: user?.name || 'Unknown', role: user?.role || 'Employee',
              createdAt: new Date().toISOString(),
              location: null 
          };

          await addCourier(newEntry);
          
          try {
              let notifTitle = type === 'Inward' ? "New Courier Received 📦" : "Courier Dispatched 🚀";
              let notifMsg = type === 'Inward' ? `Courier from ${fromName}` : `Outward to ${toName}. DC: ${dcNumber}`;
              await addDoc(collection(db, "notifications"), {
                  title: notifTitle, message: notifMsg, to: "Admin", route: "/courier", read: false, createdAt: new Date().toISOString(), type: "info"
              });
          } catch(e) {}

          if (type === 'Outward') {
              Alert.alert("Success ✅", "Saved! Share Delivery Challan?", [
                  { text: "No", onPress: () => router.back(), style: 'cancel' },
                  { text: "Yes, Share PDF", onPress: async () => { await generateChallan(newEntry); router.back(); }}
              ]);
          } else {
              Alert.alert("Success", "Entry Saved!");
              router.back();
          }
      } catch (e) { Alert.alert("Error", "Could not save entry."); } 
      finally { setLoading(false); }
  };

  const filteredOrgs = orgList.filter((o:any) => (o.name || '').toLowerCase().includes(searchOrg.toLowerCase()) || (o.orgName || '').toLowerCase().includes(searchOrg.toLowerCase()));
  
  // 🔥 FILTER PRODUCTS
  const filteredProducts = productList.filter((p:any) => (p.name || '').toLowerCase().includes(searchProduct.toLowerCase()));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Log New Courier</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.content}>
            
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
                        <Ionicons name="search" size={20} color="#3b5998" />
                    </TouchableOpacity>
                ) : (
                    <TextInput 
                        style={[styles.input, type==='Outward' && {backgroundColor:'#eee'}]} 
                        placeholder="Sender Name" value={fromName} onChangeText={setFromName} 
                        editable={type === 'Inward' || isManualEntry} 
                    />
                )}
                <TextInput style={[styles.input, type==='Outward' && {backgroundColor:'#eee'}]} placeholder="City / Location" value={fromCity} onChangeText={setFromCity} editable={type === 'Inward' || isManualEntry} />
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
                        <Ionicons name="search" size={20} color="#3b5998" />
                    </TouchableOpacity>
                ) : (
                    <TextInput 
                        style={[styles.input, type==='Inward' && {backgroundColor:'#eee'}]} 
                        placeholder="Receiver Name" value={toName} onChangeText={setToName} 
                        editable={type === 'Outward' || isManualEntry} 
                    />
                )}
                <TextInput style={[styles.input, type==='Inward' && {backgroundColor:'#eee'}]} placeholder="City / Address" value={toCity} onChangeText={setToCity} editable={type === 'Outward' || isManualEntry} />
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
                    
                    {/* 🔥 UPDATED: Input with List Icon */}
                    <View style={{flex: 2, marginRight: 10, position: 'relative'}}>
                        <TextInput 
                            style={[styles.dynamicInput, {width: '100%', paddingRight: 35}]} // Padding for icon
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
            <View style={{height: 50}} />

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ORG MODAL */}
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

      {/* 🔥 NEW: PRODUCT SELECTION MODAL */}
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