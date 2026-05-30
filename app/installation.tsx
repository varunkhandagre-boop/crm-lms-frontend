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

// 🔥 SAAS IMPORTS (No Direct Firebase DB calls)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function InstallationListScreen() {
  const router = useRouter();
  
  const { currentUser, companyProfile } = useData(); 
  const { fetchSaaSData, updateSaaSData, deleteSaaSData, isDbLoading } = useSaaSDB();

  const [installList, setInstallList] = useState<any[]>([]);
  const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);

  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [selectedItem, setSelectedItem] = useState<any>(null); 
  const [modalVisible, setModalVisible] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false); 
  const [isDeleting, setIsDeleting] = useState(false); 

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [showEditInstallDate, setShowEditInstallDate] = useState(false);
  const [showEditExpiryDate, setShowEditExpiryDate] = useState(false);
  const [editInstallDateObj, setEditInstallDateObj] = useState(new Date());
  const [editExpiryDateObj, setEditExpiryDateObj] = useState(new Date());

  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  const isAdmin = ['Admin', 'Manager', 'Hr', 'Account', 'Accountant', 'SuperAdmin'].includes(currentUser?.role || '');
  const isStrictAdmin = ['Admin', 'Manager', 'SuperAdmin'].includes(currentUser?.role || '');

  useEffect(() => {
      if (viewMode === 'Day') setVisibleCount(500); 
      else setVisibleCount(20); 
  }, [viewMode, currentDate, searchText, selectedEmployee]);

  const loadData = async () => {
      if (currentUser?.companyId) {
          const [installs, users] = await Promise.all([
              fetchSaaSData("installations"),
              fetchSaaSData("users")
          ]);
          console.log("🔥 FETCHED INSTALLS:", installs.length);
          if (installs.length > 0) console.log("🔥 FIRST ITEM:", installs[0]);
          setInstallList(installs);

          if (isAdmin) {
              const mappedUsers = users.map((u: any) => ({
                  id: u.id,
                  name: u.name || 'Unknown User'
              }));
              setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
          }
      }
  };

  useEffect(() => {
      loadData();
  }, [currentUser]);

  const parseDate = (dateStr: any) => {
    if (!dateStr) return 0;
    if (typeof dateStr === 'number') return dateStr;
    if (dateStr instanceof Date) return dateStr.getTime();

    if (typeof dateStr === 'string') {
      let cleanStr = dateStr.replace(/\./g, '/').replace(/-/g, '/');
      const parts = cleanStr.split('/');

      if (parts.length === 3 && parts[0].length === 4) {
        return new Date(cleanStr).getTime();
      }
      if (parts.length === 3 && parts[2].length === 4) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
      }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const formatDateStr = (rawDate: Date) => {
      let day = rawDate.getDate().toString().padStart(2, '0');
      let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
      let year = rawDate.getFullYear();
      return `${year}-${month}-${day}`; 
  };

  const changeDate = (dir: number) => {
    const d = new Date(currentDate);
    if (viewMode === 'Day') d.setDate(d.getDate() + dir);
    else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
    else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
    setCurrentDate(d);
  };

  const getHeaderDate = () => {
    if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (viewMode === 'FY') {
        const m = currentDate.getMonth(); 
        const y = currentDate.getFullYear();
        const startY = m >= 3 ? y : y - 1;
        return `FY ${startY.toString().slice(-2)}-${(startY + 1).toString().slice(-2)}`;
    }
    return "All Time";
  };

  const generatePDF = async (item: any) => {
    setGeneratingPdf(true);
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
              .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              .table th, .table td { padding: 10px; border: 1px solid #000; text-align: left; font-size: 12px; }
              .table th { background-color: #eee; }
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
              <div class="sub-title">
                Phone: ${companyProfile?.contactPhone || companyProfile?.phone || '-'} | 
                Email: ${companyProfile?.contactEmail || companyProfile?.email || '-'}
              </div>
            </div>

            <h3 style="text-align: center; text-decoration: underline;">INSTALLATION REPORT</h3>

            <div class="box">
              <div style="font-size: 14px;"><b>Client Name:</b> ${item.orgName || item.hospital}</div>
              <div style="font-size: 14px;"><b>Address:</b> ${item.address || ''}, ${item.city || ''}</div>
              <div style="font-size: 14px;"><b>Contact:</b> ${item.contactPerson || '-'} (${item.mobile || '-'})</div>
              <div style="font-size: 14px; margin-top:5px;"><b>Department:</b> ${item.department || '-'}</div>
              <div style="font-size: 14px;"><b>Installation Date:</b> ${item.date || item.displayDate || item.dateIso || '-'}</div>
            </div>

            <table class="table">
                <thead>
                    <tr>
                        <th style="width: 40%;">Product / Model</th>
                        <th style="width: 30%;">Serial No.</th>
                        <th style="width: 30%;">Warranty Expiry</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <b>${item.product || item.productName}</b><br>
                            <span style="color:#555;">Model: ${item.model || '-'}</span>
                        </td>
                        <td><b>${item.serialNo}</b></td>
                        <td>${item.warrantyExpiry || '-'}</td>
                    </tr>
                </tbody>
            </table>

            <div style="margin-top: 20px; font-size: 12px; color: #555;">
                <b>Engineer Remarks:</b> ${item.note || 'Installation completed successfully.'}
            </div>

            <div class="footer">
              <div class="sign-box">
                <div style="height: 60px;"></div> 
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Client Signature & Stamp</div>
              </div>

              <div class="sign-box">
                <div style="font-weight: bold; font-size: 12px;">Installed By: ${item.engineer || item.senderName || '-'}</div>
                ${signatureHTML}
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Engineer Signature</div>
              </div>
            </div>
          </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `Installation_${(item.orgName || 'Client').replace(/ /g, '_')}_${Date.now()}.pdf`;
        const newPath = `${(FileSystem as any).cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Report` });
        } catch (error) {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
    } catch (error) {
        Alert.alert("Error", "Could not generate PDF");
    } finally {
        setGeneratingPdf(false);
    }
  };

  const getSortedAndFilteredData = () => {
    let data = installList ? [...installList] : [];

    if (isAdmin && selectedEmployee !== 'All') {
      const targetName = selectedEmployeeName ? selectedEmployeeName.toLowerCase().trim() : '';
      data = data.filter((item: any) => {
        if (item.senderId === selectedEmployee) return true;
        if (item.engineer && item.engineer.toLowerCase().trim() === targetName) return true;
        if (item.senderName && item.senderName.toLowerCase().trim() === targetName) return true;
        if (item.userName && item.userName.toLowerCase().trim() === targetName) return true;
        return false;
      });
    } 
    else if (!isAdmin) {
      const myId = currentUser?.id || currentUser?.uid;
      data = data.filter((item: any) => 
          item.senderId === myId || 
          (item.engineer && item.engineer.toLowerCase() === currentUser?.name?.toLowerCase())
      );
    }

    if (searchText) {
      const term = searchText.toLowerCase();
      data = data.filter((item: any) => {
        const fullString = `
          ${item.hospital || ''}
          ${item.orgName || ''}
          ${item.serialNo || ''}
          ${item.product || ''}
          ${item.productName || ''}
          ${item.model || ''}
          ${item.senderName || ''}
          ${item.department || ''}
          ${item.city || ''}
        `.toLowerCase();
        return fullString.includes(term);
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
        // 🔥 FIX: Ab yeh directly timestamp ya createdAt ka use karega (Bulletproof)
        let ts = item.timestamp;
        if (!ts && item.createdAt) ts = new Date(item.createdAt).getTime();
        if (!ts) ts = parseDate(item.dateIso || item.date || item.displayDate);
        
        if (!ts || isNaN(ts)) return false;
        
        const itemDate = new Date(ts);
        const itemTime = itemDate.getTime();

        if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
        if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
        if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
        return true;
      });
    }

    // 🔥 FIX: Sorting bhi ab createdAt ke hisaab se ekdum perfect hogi
    data.sort((a: any, b: any) => {
        let tsA = a.timestamp || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        if (!tsA) tsA = parseDate(a.dateIso || a.date || a.displayDate);

        let tsB = b.timestamp || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        if (!tsB) tsB = parseDate(b.dateIso || b.date || b.displayDate);

        return tsB - tsA; // Newest first
    });

    return data;
  };

  const fullList = getSortedAndFilteredData(); 
  const renderedList = fullList.slice(0, visibleCount);

  const openDetails = (item: any) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const openEditModal = (item: any) => {
      const installTs = parseDate(item.dateIso || item.date || item.displayDate);
      if (installTs > 0) setEditInstallDateObj(new Date(installTs));
      else setEditInstallDateObj(new Date());

      const expiryTs = parseDate(item.warrantyExpiry);
      if (expiryTs > 0) setEditExpiryDateObj(new Date(expiryTs));
      else setEditExpiryDateObj(new Date());

      setEditData({
          id: item.id,
          orgId: item.orgId || '', 
          hospital: item.hospital || item.orgName || '',
          city: item.city || '',
          department: item.department || '',
          engineer: item.engineer || item.senderName || '',
          product: item.product || item.productName || '',
          model: item.model || '',
          serialNo: item.serialNo || '',
          date: item.date || item.displayDate || item.dateIso || '',
          warrantyExpiry: item.warrantyExpiry || '',
          note: item.note || ''
      });
      setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
      if (!editData.id) return;
      if (!editData.hospital || !editData.serialNo) {
          Alert.alert("Error", "Hospital Name and Serial No are mandatory.");
          return;
      }
      setIsSavingEdit(true);
      try {
          const res = await updateSaaSData("installations", editData.id, {
              hospital: editData.hospital,
              orgName: editData.hospital, 
              orgId: editData.orgId || '', 
              city: editData.city,
              department: editData.department,
              engineer: editData.engineer,
              product: editData.product,
              productName: editData.product, 
              model: editData.model,
              serialNo: editData.serialNo,
              date: editData.date,
              displayDate: editData.date,
              warrantyExpiry: editData.warrantyExpiry,
              note: editData.note
          });

          if (res.success) {
              setInstallList(prev => prev.map(item => item.id === editData.id ? { ...item, ...editData } : item));
              Alert.alert("Success", "Installation details updated!");
              setEditModalVisible(false);
          } else {
              Alert.alert("Error", "Could not update installation.");
          }
      } catch (error: any) {
          Alert.alert("Error", "Could not update installation. " + error.message);
      } finally {
          setIsSavingEdit(false);
      }
  };

  const handleDeleteInstallation = async () => {
      if (!selectedItem) return;
      Alert.alert(
          "Delete Installation?",
          "Are you sure you want to permanently delete this installation record?",
          [
              { text: "Cancel", style: "cancel" },
              {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                      setIsDeleting(true);
                      try {
                          const res = await deleteSaaSData("installations", selectedItem.id);
                          if(res.success) {
                              setInstallList(prev => prev.filter(i => i.id !== selectedItem.id));
                              setModalVisible(false);
                              Alert.alert("Deleted", "Installation record has been deleted successfully.");
                          } else {
                              Alert.alert("Error", "Failed to delete installation.");
                          }
                      } catch (error: any) {
                          Alert.alert("Error", error.message);
                      } finally {
                          setIsDeleting(false);
                      }
                  }
              }
          ]
      );
  };

  const getWarrantyStatus = (expiryDate: string) => {
    if (!expiryDate) return { label: 'No Date', color: 'gray' };
    const ts = parseDate(expiryDate);
    if (ts === 0) return { label: 'Invalid', color: 'gray' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(ts);
    expiry.setHours(0, 0, 0, 0);

    if (expiry.getTime() < today.getTime()) {
      return { label: 'Expired', color: '#d32f2f' };
    } else {
      return { label: 'Active', color: '#2e7d32' };
    }
  };

  const renderItem = ({ item, index }: any) => {
    const warranty = getWarrantyStatus(item.warrantyExpiry);
    const isNewEntry = !searchText && index < 3;

    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.hospitalName} numberOfLines={1}>{item.orgName || item.hospital}</Text>
              {isNewEntry && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>🆕 NEW</Text>
                </View>
              )}
              {isStrictAdmin && (
                  <TouchableOpacity style={{marginLeft: 10}} onPress={() => openEditModal(item)}>
                      <Ionicons name="create" size={18} color="#d32f2f" />
                  </TouchableOpacity>
              )}
            </View>
            
            {item.city ? (
                <Text style={{fontSize: 11, color: 'gray', marginBottom: 3}}>
                    <Ionicons name="location-outline" size={11} color="gray" /> {item.city}
                </Text>
            ) : null}

            <Text style={styles.productName}>{item.product || item.productName}</Text>
            {item.model ? <Text style={{fontSize:11, color:'gray', marginTop:2}}>Model: {item.model}</Text> : null}
            
          </View>
          <View style={[styles.statusBadge, { backgroundColor: warranty.color + '20' }]}>
            <Text style={{ color: warranty.color, fontWeight: 'bold', fontSize: 10 }}>{warranty.label}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.infoBox}>
            <Text style={styles.label}>Serial No</Text>
            <Text style={styles.value}>{item.serialNo}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.label}>Install Date</Text>
            <Text style={styles.value}>{item.date || item.displayDate || item.dateIso || '-'}</Text>
          </View>
        </View>

        <View style={{ height: 5 }} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Eng: {item.engineer || item.senderName || '-'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="person-circle-outline" size={14} color="#3b5998" />
            <Text style={[styles.footerText, { color: '#3b5998', marginLeft: 2 }]}>
              Ad: {item.senderName || 'Unknown'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Installation Reports</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_installation' as any)}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: 'white', paddingBottom: 10 }}>
        <View style={styles.tabContainer}>
          {['Day', 'Month', 'FY', 'All'].map((m) => (
            <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
              <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isAdmin && (
          <View style={{ paddingHorizontal: 15, marginBottom: 10 }}>
            <TouchableOpacity
              style={styles.employeeFilterBtn}
              onPress={() => setShowEmployeePicker(true)}
            >
              <Ionicons name="people" size={18} color="#2e7d32" />
              <Text style={{ fontSize: 13, marginLeft: 8, color: '#2e7d32', fontWeight: '600' }}>
                {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </View>
        )}

        {viewMode !== 'All' && (
          <View style={styles.dateNav}>
            <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
            <Text style={styles.monthText}>{getHeaderDate()}</Text>
            <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
          </View>
        )}

        <View style={{ paddingHorizontal: 15 }}>
          <View style={styles.searchBar}>
            {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
            <TextInput
              style={styles.input}
              placeholder="Search Hospital, Serial, Product..."
              value={searchText}
              onChangeText={setSearchText}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={20} color="gray" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={{ textAlign: 'right', fontSize: 12, color: 'gray', marginTop: 5 }}>
            Total: <Text style={{ fontWeight: 'bold', color: 'green' }}>{fullList.length}</Text> Records
          </Text>
        </View>
      </View>

      <FlatList
        data={renderedList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 5, paddingBottom: 50 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                <>
                    <Ionicons name="cube-outline" size={60} color="#ddd" />
                    <Text style={{ textAlign: 'center', marginTop: 10, color: 'gray' }}>No Installations Found</Text>
                </>
            )}
          </View>
        }
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < fullList.length ? (
                    <TouchableOpacity 
                        onPress={() => setVisibleCount(prev => prev + 20)} 
                        style={styles.loadMoreBtn}
                    >
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                            👇 Load More Records ({fullList.length - visibleCount} remaining)
                        </Text>
                    </TouchableOpacity>
                ) : (
                    fullList.length > 0 ? (
                        <Text style={styles.endListText}>--- End of List ---</Text>
                    ) : null
                )}
            </View>
        }
      />

      {/* ADMIN EDIT MODAL WITH CALENDAR */}
      <Modal visible={editModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={styles.modalTitle}>Edit Installation</Text>
                      <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                          <Ionicons name="close-circle" size={28} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                      <Text style={styles.inputLabel}>Client / Hospital Name *</Text>
                      <TextInput style={styles.editInput} value={editData.hospital} onChangeText={t => setEditData({...editData, hospital: t})} />

                      <Text style={styles.inputLabel}>City</Text>
                      <TextInput style={styles.editInput} value={editData.city} onChangeText={t => setEditData({...editData, city: t})} />

                      <Text style={styles.inputLabel}>Department</Text>
                      <TextInput style={styles.editInput} value={editData.department} onChangeText={t => setEditData({...editData, department: t})} />

                      <Text style={styles.inputLabel}>Product / Machine Name</Text>
                      <TextInput style={styles.editInput} value={editData.product} onChangeText={t => setEditData({...editData, product: t})} />

                      <Text style={styles.inputLabel}>Model</Text>
                      <TextInput style={styles.editInput} value={editData.model} onChangeText={t => setEditData({...editData, model: t})} />

                      <Text style={styles.inputLabel}>Serial No *</Text>
                      <TextInput style={styles.editInput} value={editData.serialNo} onChangeText={t => setEditData({...editData, serialNo: t})} />

                      <Text style={styles.inputLabel}>Installation Date</Text>
                      <TouchableOpacity style={styles.editDateBtn} onPress={() => setShowEditInstallDate(true)}>
                          <Text style={{color: '#333'}}>{editData.date}</Text>
                          <Ionicons name="calendar" size={18} color="gray" />
                      </TouchableOpacity>
                      {showEditInstallDate && (
                          <DateTimePicker 
                              value={editInstallDateObj} 
                              mode="date" 
                              onChange={(e, d) => { 
                                  setShowEditInstallDate(false); 
                                  if(d) { 
                                      setEditInstallDateObj(d); 
                                      setEditData({...editData, date: formatDateStr(d)}); 
                                  }
                              }} 
                          />
                      )}

                      <Text style={styles.inputLabel}>Warranty Expiry</Text>
                      <TouchableOpacity style={styles.editDateBtn} onPress={() => setShowEditExpiryDate(true)}>
                          <Text style={{color: '#333'}}>{editData.warrantyExpiry}</Text>
                          <Ionicons name="calendar" size={18} color="gray" />
                      </TouchableOpacity>
                      {showEditExpiryDate && (
                          <DateTimePicker 
                              value={editExpiryDateObj} 
                              mode="date" 
                              onChange={(e, d) => { 
                                  setShowEditExpiryDate(false); 
                                  if(d) { 
                                      setEditExpiryDateObj(d); 
                                      setEditData({...editData, warrantyExpiry: formatDateStr(d)}); 
                                  }
                              }} 
                          />
                      )}

                      <Text style={styles.inputLabel}>Engineer Assigned</Text>
                      <TextInput style={styles.editInput} value={editData.engineer} onChangeText={t => setEditData({...editData, engineer: t})} />

                      <Text style={styles.inputLabel}>Remarks / Notes</Text>
                      <TextInput style={[styles.editInput, {height: 60, textAlignVertical: 'top'}]} multiline value={editData.note} onChangeText={t => setEditData({...editData, note: t})} />
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

      {/* DETAILS MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={styles.modalTitle}>Installation Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#d32f2f" />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sectionHeaderBox}>
                    <Text style={styles.sectionHeaderText}>🏢 Client Info</Text>
                </View>
                <DetailRow label="Hospital" value={selectedItem.orgName || selectedItem.hospital} icon="business" highlight />
                <DetailRow label="City" value={selectedItem.city} icon="location" />
                <DetailRow label="Department" value={selectedItem.department || 'N/A'} icon="medkit" />
                <DetailRow label="Engineer" value={selectedItem.engineer || selectedItem.senderName || '-'} icon="construct" />

                <View style={styles.sectionHeaderBox}>
                    <Text style={styles.sectionHeaderText}>⚙️ Machine Info</Text>
                </View>
                <DetailRow label="Product" value={selectedItem.product || selectedItem.productName} icon="cube" />
                <DetailRow label="Model" value={selectedItem.model} icon="hardware-chip" />
                <DetailRow label="Serial No" value={selectedItem.serialNo} icon="barcode" highlight />

                <View style={styles.sectionHeaderBox}>
                    <Text style={styles.sectionHeaderText}>📅 Warranty Info</Text>
                </View>
                <DetailRow label="Installed On" value={selectedItem.date || selectedItem.displayDate || selectedItem.dateIso || '-'} icon="calendar" />
                <DetailRow label="Warranty Expiry" value={selectedItem.warrantyExpiry} icon="hourglass" color="#d32f2f" />

                <View style={styles.divider} />
                <DetailRow label="Entry By" value={selectedItem.senderName || 'Unknown'} icon="person" />

                {selectedItem.note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Accessories / Notes:</Text>
                    <Text style={styles.noteText}>{selectedItem.note}</Text>
                  </View>
                ) : null}

                <TouchableOpacity 
                    style={styles.pdfBtn}
                    onPress={() => generatePDF(selectedItem)}
                    disabled={generatingPdf}
                >
                    {generatingPdf ? (
                        <ActivityIndicator color="#1565c0" size="small" />
                    ) : (
                        <>
                            <Ionicons name="document-text-outline" size={20} color="#1565c0" />
                            <Text style={styles.pdfBtnText}>Share Report PDF</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* ADMIN DELETE BUTTON */}
                {isStrictAdmin && (
                    <TouchableOpacity 
                        style={{marginTop: 15, backgroundColor: '#ffebee', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ef9a9a'}}
                        onPress={handleDeleteInstallation}
                        disabled={isDeleting}
                    >
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            {isDeleting ? <ActivityIndicator size="small" color="#d32f2f" /> : <Ionicons name="trash-outline" size={18} color="#d32f2f" />}
                            <Text style={{color: '#d32f2f', fontWeight: 'bold', marginLeft: 8}}>
                                {isDeleting ? "Deleting..." : "Delete Installation"}
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}

                <View style={{height: 20}} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* EMPLOYEE PICKER MODAL */}
      <Modal visible={showEmployeePicker} transparent animationType="fade">
        <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerHeader}>Select Employee View</Text>
            <FlatList
              data={employees}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setSelectedEmployee(item.id);
                    setSelectedEmployeeName(item.name);
                    setShowEmployeePicker(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="person-circle" size={24} color="#555" style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 16, color: '#333' }}>{item.name}</Text>
                  </View>
                  {selectedEmployee === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                </TouchableOpacity>
              )} />
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const DetailRow = ({ label, value, icon, highlight, color }: any) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
    <View style={{ width: 30 }}><Ionicons name={icon} size={18} color={highlight ? "#3b5998" : "gray"} /></View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: 'gray' }}>{label}</Text>
      <Text style={{
        fontSize: 14,
        fontWeight: highlight ? 'bold' : '500',
        color: color || '#333'
      }}>{value || '-'}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, paddingTop: 50, backgroundColor: 'white', elevation: 0 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  addBtn: { flexDirection: 'row', backgroundColor: '#3b5998', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignItems: 'center' },
  addBtnText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },

  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 10, borderRadius: 8, padding: 2, marginBottom: 5 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2e7d32' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 4, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 36 },
  input: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  productName: { fontSize: 13, color: '#3b5998', marginTop: 2, fontWeight: '600' },
  statusBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },

  newBadge: { backgroundColor: '#ffeb3b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  newBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#f57f17' },

  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  infoBox: { width: '48%' },
  label: { fontSize: 11, color: 'gray', marginBottom: 2 },
  value: { fontSize: 13, color: '#333', fontWeight: '500' },

  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, borderTopWidth: 1, borderTopColor: '#f5f5f5', paddingTop: 5 },
  footerText: { fontSize: 11, color: 'gray' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: 'white', borderRadius: 15, padding: 25, maxHeight: '85%', elevation: 5 }, 
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
  
  sectionHeaderBox: { backgroundColor: '#e3f2fd', padding: 6, borderRadius: 6, marginTop: 10, marginBottom: 10 },
  sectionHeaderText: { fontSize: 12, fontWeight: 'bold', color: '#1565c0' },

  noteBox: { backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, marginTop: 15, borderWidth: 1, borderColor: '#eee' },
  noteLabel: { fontSize: 12, fontWeight: 'bold', color: '#3b5998', marginBottom: 5 },
  noteText: { fontSize: 13, color: '#333', fontStyle: 'italic' },

  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, marginTop: 20, borderWidth: 1, borderColor: '#2196f3' },
  pdfBtnText: { color: '#1565c0', fontWeight: 'bold', marginLeft: 8 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation: 10 },
  pickerHeader: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#3b5998', textAlign: 'center' },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  inputLabel: { fontSize: 12, color: 'gray', marginTop: 10, marginBottom: 5, fontWeight: 'bold' },
  editInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, color: '#333', backgroundColor: '#f9f9f9' },
  editDateBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, backgroundColor: '#f9f9f9' },
  saveEditBtn: { backgroundColor: '#d32f2f', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  btnText: { color: 'white', fontWeight: 'bold' },

  loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  endListText: { textAlign: 'center', padding: 20, color: '#aaa', fontSize: 12, fontStyle: 'italic' },
});