import { Ionicons } from '@expo/vector-icons';
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

// 🔥 SAAS IMPORTS (Direct Firebase DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function CourierScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se sirf Profile, User & Notifications Nikala
  const { currentUser, addNotification, companyProfile } = useData(); 

  // 🔥 2. Naya SaaS Engine
  const { fetchSaaSData, updateSaaSData, deleteSaaSData, isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded Lists
  const [courierList, setCourierList] = useState<any[]>([]);
  const [orgList, setOrgList] = useState<any[]>([]);

  // --- STATES ---
  const [activeTab, setActiveTab] = useState<'All' | 'Inward' | 'Outward'>('All'); 
  const [activeStatus, setActiveStatus] = useState('Pending'); 
  const [searchText, setSearchText] = useState('');
  
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  // MODAL STATES
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<any>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  // ADMIN EDIT STATES
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
      if (viewMode === 'Day') setVisibleCount(500); 
      else setVisibleCount(20); 
  }, [viewMode, currentDate, activeTab, activeStatus, searchText]);

  // 🔥 4. LOAD DATA ON MOUNT
  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              const [couriers, orgs] = await Promise.all([
                  fetchSaaSData("couriers"),
                  fetchSaaSData("organizations")
              ]);
              setCourierList(couriers);
              setOrgList(orgs);
          }
      };
      loadData();
  }, [currentUser]);

  // POWER USER CHECK
  const role = currentUser?.role || ''; 
  const canManage = 
      role === 'Admin' || 
      role === 'Manager' || 
      role === 'Account' || role === 'Accountant' ||
      role === 'Hr' ||  
      role === 'Store' || role === 'Store Keeper' || role === 'SuperAdmin';    

  const isStrictAdmin = role === 'Admin' || role === 'Manager' || role === 'SuperAdmin';

  // --- BADGE COUNTS ---
  const inwardPending = courierList.filter((c: any) => c.type === 'Inward' && c.status === 'Pending').length;
  const outwardPending = courierList.filter((c: any) => c.type === 'Outward' && c.status === 'Pending').length;

  const parseDate = (dateStr: string) => {
      if (!dateStr) return new Date(0);
      if (dateStr.includes('T')) return new Date(dateStr);
      if (dateStr.includes('-')) return new Date(dateStr);
      const parts = dateStr.split('/');
      if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      return new Date(0);
  };

  const generateChallan = async (data: any) => {
      try {
          let tableRows = '';
          let totalQty = 0;
          let itemsList = [];

          if (data.items && Array.isArray(data.items)) {
              itemsList = data.items;
          } else {
              const names = (data.material || '').split('\n').filter((l: string) => l.trim() !== '');
              const qtys = (data.qty || '').split('\n');
              itemsList = names.map((name: string, i: number) => ({
                  description: name,
                  qty: qtys[i] || (i === 0 ? qtys[0] : '1')
              }));
          }
          
          if (itemsList.length > 0) {
              itemsList.forEach((item: any, index: number) => {
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
              tableRows = `<tr><td colspan="3" style="text-align: center;">No Material Details</td></tr>`;
          }

          const logoHTML = companyProfile?.logoUrl 
                ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` 
                : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

          const signatureHTML = companyProfile?.signatureUrl 
                ? `<img src="${companyProfile.signatureUrl}" style="height: 50px; margin-top: 5px;" />` 
                : `<div style="height: 40px;"></div>`;

          let receiverName = data.receiver ? data.receiver.split(',')[0] : '-';
          let receiverAddr = data.toCity || '';
          
          const org = orgList.find((o: any) => 
              (data.orgId && o.id === data.orgId) || 
              o.orgName === receiverName || 
              o.name === receiverName
          );
          
          if (org) {
              receiverAddr = org.address ? `${org.address}, ${org.city || ''}` : (org.city || receiverAddr);
          }

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
                .sign { border-top: 1px solid #000; width: 150px; text-align: center; padding-top: 5px; font-size: 12px; }
                .sign-img-box { text-align: center; width: 150px; }
              </style>
            </head>
            <body>
              <div class="header">
                ${logoHTML}
                ${companyProfile?.logoUrl ? `<div class="title" style="font-size:20px;">${companyProfile.companyName}</div>` : ''}
                
                <div class="sub-title">${companyProfile?.address || ''}</div>
                <div class="sub-title">
                    Phone: ${companyProfile?.contactPhone || companyProfile?.phone || '-'} |
                    Email: ${companyProfile?.contactEmail || companyProfile?.email || '-'}
                </div>
                <div class="sub-title">
                    ${companyProfile?.gstNumber ? `GSTIN: ${companyProfile.gstNumber}` : ''}
                </div>
              </div>

              <h3 style="text-align: center; text-decoration: underline;">DELIVERY CHALLAN</h3>

              <div class="row">
                <div><span class="label">DC No:</span> ${data.dcNo || '-'}</div>
                <div><span class="label">Date:</span> ${data.date}</div>
              </div>

              <div class="box">
                <div class="label" style="margin-bottom:5px;">Consignee / Receiver Details:</div>
                <div style="font-size: 18px; font-weight: bold; text-transform: uppercase;">${receiverName}</div>
                <div style="font-size: 14px; margin-top: 5px;">${receiverAddr}</div>
              </div>

              <div class="box">
                <div class="label">Dispatch Details:</div>
                <div style="margin-top:5px;">Courier: <b>${data.courierName}</b></div>
                <div>Docket/Track No: <b>${data.docketNo}</b></div>
                <div>Booking Date: ${data.courierDate || '-'}</div> 
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
                <div class="sign">Receiver's Sign</div>
                
                <div class="sign-img-box">
                    <div style="font-size:10px; margin-bottom:5px;">For, ${companyProfile?.companyName || 'Us'}</div>
                    ${signatureHTML}
                    <div class="sign">Authorised Signatory</div>
                </div>
              </div>
            </body>
          </html>`;

          const { uri } = await Print.printToFileAsync({ html: htmlContent });
          const newFileName = `${data.dcNo || 'Challan'}.pdf`;
          
          const fs = FileSystem as any;
          const newPath = `${fs.cacheDirectory}${newFileName}`;

          try {
              await FileSystem.copyAsync({ from: uri, to: newPath });
              await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf' });
          } catch (renameError) {
              await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
          }
      } catch (error) { Alert.alert("Error", "Could not generate PDF."); }
  };

  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (viewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  const getHeaderDate = () => {
      if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (viewMode === 'FY') {
          const m = currentDate.getMonth(); 
          const y = currentDate.getFullYear();
          const startY = m >= 3 ? y : y - 1;
          return `FY ${startY.toString().slice(-2)}-${(startY + 1).toString().slice(-2)}`;
      }
      return "All Time";
  };

  const getFilteredData = () => {
      let data = Array.isArray(courierList) ? [...courierList] : [];

      if (!canManage && currentUser?.uid) {
          data = data.filter((item: any) => 
              item.senderId === currentUser.uid || 
              (item.receiver && item.receiver.toLowerCase().includes(currentUser.name?.toLowerCase())) ||
              (item.sender && item.sender.toLowerCase().includes(currentUser.name?.toLowerCase()))
          );
      }

      if (activeTab !== 'All') {
          data = data.filter((item: any) => item.type === activeTab);
      }

      if (activeStatus !== 'All') {
          data = data.filter((item: any) => item.status === activeStatus);
      }

      if (searchText) {
          const lowerText = searchText.toLowerCase();
          data = data.filter((item: any) => {
              const fullString = `${item.docketNo} ${item.courierName} ${item.receiver} ${item.sender} ${item.materialSummary || item.material || ''} ${item.type}`.toLowerCase();
              return fullString.includes(lowerText);
          });
      }

      if (viewMode !== 'All') {
          const targetYear = currentDate.getFullYear();
          const targetMonth = currentDate.getMonth();
          const targetDay = currentDate.getDate();

          const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
          const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
          const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); 

          data = data.filter((item: any) => {
              if(!item.date) return false;
              const itemDate = parseDate(item.date);
              const itemTime = itemDate.getTime();

              if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
              if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
              if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
              return true;
          });
      }

      data.sort((a: any, b: any) => new Date(b.createdAt || b.dateIso || b.date).getTime() - new Date(a.createdAt || a.dateIso || a.date).getTime());
      return data;
  };

  const fullList = getFilteredData(); 
  const renderedList = fullList.slice(0, visibleCount);

  const openDetails = (item: any) => {
      setSelectedCourier(item);
      setNote(item.note || item.notes || ''); 
      setModalVisible(true);
  };
  
  const openEditModal = (item: any) => {
    let itemsText = '';
    if (item.items && Array.isArray(item.items)) {
        itemsText = item.items.map((i: any) => `${i.description} - Qty: ${i.qty}`).join('\n');
    } else {
        itemsText = `${item.material || ''}\nQty: ${item.qty || ''}`;
    }

    setEditData({
        id: item.id,
        orgId: item.orgId || '', 
        docketNo: item.docketNo || '',
        courierName: item.courierName || '',
        date: item.date || '',
        type: item.type || 'Outward',
        sender: item.sender || '',
        receiver: item.receiver || '',
        material: itemsText, 
        status: item.status || 'Pending',
        notes: item.notes || item.note || ''
    });
    setEditModalVisible(true);
  };

  // 🔥 5. SAAS UPDATE LOGIC (EDIT)
  const handleSaveEdit = async () => {
    if (!editData.id) return;
    if (!editData.docketNo || !editData.courierName) {
        Alert.alert("Error", "Docket No and Courier Name are mandatory.");
        return;
    }
    setIsSavingEdit(true);
    try {
        const res = await updateSaaSData("couriers", editData.id, {
            orgId: editData.orgId || '', 
            docketNo: editData.docketNo,
            courierName: editData.courierName,
            date: editData.date,
            type: editData.type,
            sender: editData.sender,
            receiver: editData.receiver,
            material: editData.material, 
            status: editData.status,
            notes: editData.notes,
            note: editData.notes 
        });

        if (res.success) {
            setCourierList(prev => prev.map(item => item.id === editData.id ? { ...item, ...editData } : item));
            Alert.alert("Success", "Courier details updated successfully!");
            setEditModalVisible(false);
        } else {
            Alert.alert("Error", "Could not update.");
        }
    } catch (error: any) {
        Alert.alert("Error", "Could not update courier. ");
    } finally {
        setIsSavingEdit(false);
    }
  };

  // 🔥 6. SAAS DELETE LOGIC
  const handleDelete = async () => {
    if (!selectedCourier) return;
    Alert.alert("Delete Entry?", "Permanently delete this record?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: 'destructive', onPress: async () => {
          setLoading(true); 
          try {
            const res = await deleteSaaSData("couriers", selectedCourier.id);
            if (res.success) {
                setCourierList(prev => prev.filter(item => item.id !== selectedCourier.id));
                setModalVisible(false);
                Alert.alert("Deleted", "Success.");
            } else {
                Alert.alert("Error", "Could not delete.");
            }
          } catch (error) { Alert.alert("Error", "Could not delete."); }
          finally { setLoading(false); } 
        }
      }
    ]);
  };

  // 🔥 7. SAAS UPDATE LOGIC (STATUS)
  const handleUpdateStatus = (newStatus: string) => {
      if (!selectedCourier) return;
      Alert.alert("Confirm", `Mark as ${newStatus}?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Yes", onPress: async () => {
              setLoading(true); 
              try {
                  const res = await updateSaaSData("couriers", selectedCourier.id, { status: newStatus, notes: note }); 
                  
                  if (res.success) {
                      if (addNotification) {
                          const targetUser = selectedCourier.type === 'Inward' ? selectedCourier.receiver : selectedCourier.sender;
                          await addNotification({
                              title: `Courier ${newStatus}`, 
                              message: `Docket: ${selectedCourier.docketNo} marked as ${newStatus}.`, 
                              type: 'info', 
                              to: targetUser, 
                              route: '/courier'
                          });
                      }
                      setCourierList(prev => prev.map(item => item.id === selectedCourier.id ? { ...item, status: newStatus, notes: note } : item));
                      setModalVisible(false);
                      Alert.alert("Success", "Status Updated!");
                  } else {
                      Alert.alert("Error", "Update failed.");
                  }
              } catch (error) { Alert.alert("Error", "Update failed."); }
              finally { setLoading(false); } 
          }}
      ]);
  };

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'Pending': return { bg: '#fff3e0', text: '#ef6c00' };
          case 'Received': return { bg: '#e8f5e9', text: '#2e7d32' };
          case 'Delivered': return { bg: '#e3f2fd', text: '#1565c0' };
          default: return { bg: '#f5f5f5', text: 'gray' };
      }
  };

  const renderItem = ({item}: any) => {
    const statusStyle = getStatusColor(item.status);
    const isInward = item.type === 'Inward';
    let materialText = item.material || item.materialSummary || "No Details";
    
    return (
        <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
            <View style={styles.cardHeader}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Ionicons name="calendar-outline" size={14} color="gray" />
                    <Text style={styles.dateText}> {item.date}</Text>
                </View>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <View style={[styles.statusBadge, {backgroundColor: statusStyle.bg}]}>
                        <Text style={{color: statusStyle.text, fontSize:10, fontWeight:'bold'}}>{item.status}</Text>
                    </View>
                    {isStrictAdmin && (
                        <TouchableOpacity style={{marginLeft: 10}} onPress={() => openEditModal(item)}>
                            <Ionicons name="create" size={18} color="#d32f2f" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
            <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:12}}>
                <View>
                    <Text style={styles.courierName}>{item.courierName}</Text>
                    <Text style={styles.docketNo}>#{item.docketNo}</Text>
                </View>
                <View style={[styles.typeBadge, isInward ? styles.inBadge : styles.outBadge]}>
                    <Text style={[styles.typeText, isInward ? {color:'#2e7d32'} : {color:'#c62828'}]}>{item.type?.toUpperCase()}</Text>
                </View>
            </View>
            <View style={styles.addressBox}>
                <View style={styles.addressRow}>
                    <Ionicons name="log-out-outline" size={16} color="#e65100" />
                    <View style={{marginLeft:8, flex:1}}><Text style={styles.addrLabel}>From</Text><Text style={styles.addrValue} numberOfLines={1}>{item.sender}</Text></View>
                </View>
                <View style={styles.divider} />
                <View style={styles.addressRow}>
                    <Ionicons name="log-in-outline" size={16} color="#2e7d32" />
                    <View style={{marginLeft:8, flex:1}}><Text style={styles.addrLabel}>To</Text><Text style={styles.addrValue} numberOfLines={1}>{item.receiver}</Text></View>
                </View>
            </View>
            <View style={styles.footer}>
                <Text style={styles.materialText} numberOfLines={1}>📦 {materialText}</Text>
                {canManage && <Text style={{fontSize:10, color:'#3b5998', fontWeight:'bold'}}>By: {item.senderName || 'Unknown'}</Text>}
            </View>
        </TouchableOpacity>
    );
  };

  const isReceiver = selectedCourier && currentUser?.name && selectedCourier.receiver ? selectedCourier.receiver.toLowerCase().includes(currentUser.name.toLowerCase()) : false;
  const canUpdate = canManage || isReceiver;

  const renderMaterialList = (item: any) => {
      if (item.items && Array.isArray(item.items)) {
          return (
              <View>
                  <View style={{flexDirection:'row', marginBottom:5, borderBottomWidth:1, borderColor:'#ddd', paddingBottom:5}}>
                      <Text style={{flex:2, fontSize:12, color:'gray', fontWeight:'bold'}}>Item</Text>
                      <Text style={{flex:1, fontSize:12, color:'gray', fontWeight:'bold', textAlign:'center'}}>Qty</Text>
                  </View>
                  {item.items.map((i: any, index: number) => (
                      <View key={index} style={{flexDirection:'row', marginBottom:5}}>
                          <Text style={{flex:2, fontSize:13, color:'#333'}}>{i.description}</Text>
                          <Text style={{flex:1, fontSize:13, color:'#333', textAlign:'center'}}>{i.qty}</Text>
                      </View>
                  ))}
              </View>
          );
      }
      return <Text style={{color:'#555'}}>{item.material} - {item.qty}</Text>;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
             <View style={{flexDirection:'row', alignItems:'center'}}>
                 <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                 <Text style={styles.headerTitle}>Couriers</Text>
             </View>
             <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_courier' as any)}>
                <Ionicons name="add" size={20} color="#3b5998" />
                <Text style={{color:'#3b5998', fontWeight:'bold', marginLeft:2}}>Log</Text>
            </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mainTabContainer}>
          {['All', 'Inward', 'Outward'].map((t) => (
              <TouchableOpacity key={t} style={[styles.mainTab, activeTab === t && styles.activeMainTab]} onPress={() => setActiveTab(t as any)}>
                  <Text style={[styles.mainTabText, activeTab === t && styles.activeMainTabText]}>{t}</Text>
                  {t === 'Inward' && inwardPending > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{inwardPending}</Text></View>}
                  {t === 'Outward' && outwardPending > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{outwardPending}</Text></View>}
              </TouchableOpacity>
          ))}
      </View>

      <View style={{backgroundColor:'white', paddingBottom:5, marginBottom:0}}>
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'FY', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>
          {viewMode !== 'All' && (
              <View style={styles.dateNav}>
                  <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                  <Text style={styles.monthText}>{getHeaderDate()}</Text>
                  <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
              </View>
          )}
          <View style={styles.searchBar}>
              {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
              <TextInput style={styles.input} placeholder="Search Docket, Name..." value={searchText} onChangeText={setSearchText} />
              {searchText.length > 0 && (<TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="gray" /></TouchableOpacity>)}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 15, paddingVertical: 5}}>
              {['All', 'Pending', 'Received', 'Delivered'].map((tab) => (
                  <TouchableOpacity key={tab} style={[styles.filterChip, activeStatus === tab && styles.activeChip]} onPress={() => setActiveStatus(tab)}>
                      <Text style={[styles.chipText, activeStatus === tab && styles.activeChipText]}>{tab}</Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>
          <Text style={{textAlign:'right', fontSize:11, color:'gray', paddingRight:15, marginTop:2}}>Total: {fullList.length}</Text>
      </View>

      <FlatList 
        data={renderedList} 
        keyExtractor={item => item.id} 
        contentContainerStyle={styles.contentContainer} 
        ListEmptyComponent={<Text style={{textAlign:'center', marginTop:50, color:'gray'}}>{isDbLoading ? 'Loading data...' : 'No Couriers Found'}</Text>} 
        renderItem={renderItem} 
        ListFooterComponent={
            <View style={{ paddingBottom: 100 }}>
                {visibleCount < fullList.length ? (
                    <TouchableOpacity 
                        onPress={() => setVisibleCount(prev => prev + 20)} 
                        style={{
                            padding: 12, 
                            backgroundColor: '#fff', 
                            alignItems: 'center', 
                            marginVertical: 10, 
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#ddd'
                        }}
                    >
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                            👇 Load More Records ({fullList.length - visibleCount} remaining)
                        </Text>
                    </TouchableOpacity>
                ) : (
                    fullList.length > 0 ? (
                        <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                            --- End of List ---
                        </Text>
                    ) : null
                )}
            </View>
        }
      />

      {/* ADMIN EDIT MODAL */}
      <Modal visible={editModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={styles.modalTitle}>Edit Courier (Admin)</Text>
                      <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                          <Ionicons name="close-circle" size={28} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                      <Text style={styles.inputLabel}>Docket No *</Text>
                      <TextInput style={styles.editInput} value={editData.docketNo} onChangeText={t => setEditData({...editData, docketNo: t})} />

                      <Text style={styles.inputLabel}>Courier Service Name *</Text>
                      <TextInput style={styles.editInput} value={editData.courierName} onChangeText={t => setEditData({...editData, courierName: t})} />

                      <Text style={styles.inputLabel}>Date</Text>
                      <TextInput style={styles.editInput} value={editData.date} onChangeText={t => setEditData({...editData, date: t})} />

                      <Text style={styles.inputLabel}>Type</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10}}>
                          {['Inward', 'Outward'].map(ty => (
                              <TouchableOpacity 
                                  key={ty} 
                                  style={[styles.statusChip, editData.type === ty && {backgroundColor: '#3b5998', borderColor: '#3b5998'}]}
                                  onPress={() => setEditData({...editData, type: ty})}
                              >
                                  <Text style={{color: editData.type === ty ? 'white' : '#555', fontSize: 12}}>{ty}</Text>
                              </TouchableOpacity>
                          ))}
                      </ScrollView>

                      <Text style={styles.inputLabel}>From (Sender)</Text>
                      <TextInput style={styles.editInput} value={editData.sender} onChangeText={t => setEditData({...editData, sender: t})} />

                      <Text style={styles.inputLabel}>To (Receiver)</Text>
                      <TextInput style={styles.editInput} value={editData.receiver} onChangeText={t => setEditData({...editData, receiver: t})} />

                      <Text style={styles.inputLabel}>Material Details / Items</Text>
                      <TextInput style={[styles.editInput, {height: 80, textAlignVertical: 'top'}]} multiline value={editData.material} onChangeText={t => setEditData({...editData, material: t})} />

                      <Text style={styles.inputLabel}>Status</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10}}>
                          {['Pending', 'Received', 'Delivered'].map(st => (
                              <TouchableOpacity 
                                  key={st} 
                                  style={[styles.statusChip, editData.status === st && {backgroundColor: '#3b5998', borderColor: '#3b5998'}]}
                                  onPress={() => setEditData({...editData, status: st})}
                              >
                                  <Text style={{color: editData.status === st ? 'white' : '#555', fontSize: 12}}>{st}</Text>
                              </TouchableOpacity>
                          ))}
                      </ScrollView>

                      <Text style={styles.inputLabel}>Notes</Text>
                      <TextInput style={[styles.editInput, {height: 60, textAlignVertical: 'top'}]} multiline value={editData.notes} onChangeText={t => setEditData({...editData, notes: t})} />
                  </ScrollView>

                  <TouchableOpacity 
                      style={[styles.saveEditBtn, isSavingEdit && {opacity: 0.6}]} 
                      onPress={handleSaveEdit}
                      disabled={isSavingEdit}
                  >
                      {isSavingEdit ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Save Changes</Text>}
                  </TouchableOpacity>
              </View>
          </KeyboardAvoidingView>
      </Modal>

      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  {selectedCourier && (
                      <ScrollView>
                          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                              <Text style={styles.modalTitle}>Courier Details</Text>
                              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={28} color="#d32f2f" /></TouchableOpacity>
                          </View>
                          <DetailRow label="Docket No" value={selectedCourier.docketNo} icon="barcode" />
                          <DetailRow label="Service" value={selectedCourier.courierName} icon="cube" />
                          <DetailRow label="Type" value={selectedCourier.type} icon="swap-vertical" />
                          <DetailRow label="Date" value={selectedCourier.date} icon="calendar" />
                          
                          <View style={{backgroundColor:'#f9f9f9', padding:10, borderRadius:8, marginVertical:10}}>
                              <Text style={{color:'gray', fontSize:11, marginBottom:2}}>FROM:</Text>
                              <Text style={{fontWeight:'bold', color:'#333', marginBottom:8}}>{selectedCourier.sender}</Text>
                              <View style={{height:1, backgroundColor:'#eee', marginBottom:8}}/>
                              <Text style={{color:'gray', fontSize:11, marginBottom:2}}>TO:</Text>
                              <Text style={{fontWeight:'bold', color:'#333'}}>{selectedCourier.receiver}</Text>
                          </View>
                          
                          <View style={styles.materialBox}>
                              <Text style={{fontWeight:'bold', color:'#333', marginBottom: 5}}>Material Details:</Text>
                              {renderMaterialList(selectedCourier)}
                          </View>
                          {(selectedCourier.notes || selectedCourier.note) ? (
                            <View style={{marginTop: 15, backgroundColor: '#fff8e1', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ffe0b2'}}>
                                <Text style={{fontSize: 12, fontWeight: 'bold', color: '#ff6f00', marginBottom: 5}}>
                                    📝 Remarks / Note:
                                </Text>
                                <Text style={{color: '#333', fontSize: 14}}>
                                    {selectedCourier.notes || selectedCourier.note}
                                </Text>
                            </View>
                        ) : null}
                          {selectedCourier.status === 'Pending' && canUpdate ? (
                              <View>
                                  <Text style={{fontWeight:'bold', marginTop:15, marginBottom:5}}>Remarks / Note:</Text>
                                  <TextInput style={styles.noteInput} multiline placeholder="Add a note..." value={note} onChangeText={setNote} />
                                  <View style={{marginTop: 10}}>
                                      {selectedCourier.type === 'Inward' && (
                                          <TouchableOpacity 
                                              style={[styles.actionBtnGreen, loading && {opacity: 0.7}]} 
                                              onPress={() => handleUpdateStatus('Received')} 
                                              disabled={loading} 
                                          >
                                              {loading ? <ActivityIndicator color="white"/> : <Text style={styles.btnText}>Mark as Received</Text>}
                                          </TouchableOpacity>
                                      )}

                                      {selectedCourier.type === 'Outward' && (
                                          <TouchableOpacity 
                                              style={[styles.actionBtnBlue, loading && {opacity: 0.7}]} 
                                              onPress={() => handleUpdateStatus('Delivered')} 
                                              disabled={loading}
                                          >
                                              {loading ? <ActivityIndicator color="white"/> : <Text style={styles.btnText}>Mark as Delivered</Text>}
                                          </TouchableOpacity>
                                      )}
                                  </View>
                              </View>
                          ) : null}

                          {selectedCourier.type === 'Outward' && (
                              <TouchableOpacity 
                                  style={{flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:'#e3f2fd', padding:12, borderRadius:8, marginTop:15, borderWidth:1, borderColor:'#2196f3'}}
                                  onPress={() => generateChallan(selectedCourier)}
                              >
                                  <Ionicons name="document-text-outline" size={20} color="#1565c0" />
                                  <Text style={{color:'#1565c0', fontWeight:'bold', marginLeft:8}}>Share DC PDF</Text>
                              </TouchableOpacity>
                          )}

                          {canManage && (
                              <TouchableOpacity 
                                  style={{marginTop: 20, backgroundColor: '#ffebee', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ef9a9a', opacity: loading ? 0.5 : 1}} 
                                  onPress={handleDelete}
                                  disabled={loading}
                              >
                                  <View style={{flexDirection:'row', alignItems:'center'}}>
                                      {loading ? (
                                          <ActivityIndicator size="small" color="#d32f2f" />
                                      ) : (
                                          <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                                      )}
                                      <Text style={{color: '#d32f2f', fontWeight: 'bold', marginLeft: 8}}>
                                          {loading ? "Deleting..." : "Delete Entry"}
                                      </Text>
                                  </View>
                              </TouchableOpacity>
                          )}
                          <View style={{height: 20}} />
                      </ScrollView>
                  )}
              </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const DetailRow = ({label, value, icon}: any) => (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom:10}}>
        <View style={{width:30}}><Ionicons name={icon} size={20} color="#3b5998" /></View>
        <View><Text style={{fontSize:11, color:'gray'}}>{label}</Text><Text style={{fontSize:14, fontWeight:'500', color:'#333'}}>{value}</Text></View>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: 'white',paddingHorizontal: 15, paddingTop: 50,paddingBottom: 0, elevation: 2 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom:10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  addBtn: { flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#3b5998', borderRadius:5, paddingHorizontal:10, paddingVertical:5 },
  mainTabContainer: { flexDirection: 'row', backgroundColor: 'white', paddingHorizontal: 15, paddingBottom: 0 },
  mainTab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent', flexDirection:'row', justifyContent:'center' },
  activeMainTab: { borderBottomColor: '#3b5998' },
  mainTabText: { color: 'gray', fontWeight: '600' },
  activeMainTabText: { color: '#3b5998', fontWeight: 'bold' },
  badge: { backgroundColor: '#d32f2f', borderRadius: 10, paddingHorizontal: 6, marginLeft: 5, paddingVertical:1 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  tabContainer: { 
      flexDirection: 'row', 
      backgroundColor: '#e0e0e0', 
      marginHorizontal: 15, 
      marginTop: 10,      
      marginBottom: 5,      
      borderRadius: 8, 
      padding: 2            
  },
  tab: { flex: 1, paddingVertical: 4, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 6, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 36, marginHorizontal: 15, marginBottom: 5 },
  input: { flex:1, marginLeft:5, fontSize:15, color:'black' },
  filterChip: { paddingHorizontal:15, paddingVertical:6, backgroundColor:'#eee', borderRadius:20, marginRight:10 },
  activeChip: { backgroundColor:'#3b5998' },
  chipText: { fontSize:12, color:'#555' },
  activeChipText: { color:'white', fontWeight:'bold' },
  contentContainer: { padding: 15,paddingTop: 0, paddingBottom: 100 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom:5 },
  dateText: { fontSize: 12, color: 'gray' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  docketNo: { fontWeight: 'bold', fontSize: 14, color:'#3b5998' },
  courierName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  inBadge: { backgroundColor: '#e8f5e9' },
  outBadge: { backgroundColor: '#ffebee' },
  typeText: { fontSize: 10, fontWeight: 'bold' },
  addressBox: { backgroundColor:'#f9f9f9', borderRadius:8, padding:10, marginBottom:10, borderLeftWidth:3, borderLeftColor:'#3b5998' },
  addressRow: { flexDirection:'row', alignItems:'center', marginVertical:2 },
  addrLabel: { fontSize:10, color:'gray', textTransform:'uppercase', width: 40 },
  addrValue: { fontSize:13, fontWeight:'bold', color:'#333', flex: 1 },
  divider: { height:1, backgroundColor:'#eee', marginVertical:5 },
  footer: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:5 },
  materialText: { fontSize:12, color:'#555', fontStyle:'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 10 },
  modalContent: { width: '100%', backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  materialBox: { backgroundColor:'#f0f4ff', padding:10, borderRadius:8, marginTop:10 },
  noteInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, height: 60, textAlignVertical: 'top', marginBottom: 10, backgroundColor:'#f9f9f9' },
  actionBtnGreen: { backgroundColor: '#2e7d32', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  actionBtnBlue: { backgroundColor: '#1565c0', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  btnText: { color: 'white', fontWeight: 'bold' },
  
  inputLabel: { fontSize: 12, color: 'gray', marginTop: 10, marginBottom: 5, fontWeight: 'bold' },
  editInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, color: '#333', backgroundColor: '#f9f9f9' },
  saveEditBtn: { backgroundColor: '#d32f2f', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', marginRight: 10 },
});