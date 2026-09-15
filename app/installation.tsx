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

// 🔥 SAAS IMPORTS (users still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 4: installations now via new backend API
import {
  deleteInstallation as apiDeleteInstallation,
  updateInstallation as apiUpdateInstallation,
  listInstallations,
  sendAmcReminder,
} from '../services/api/installations';

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fetchTeamMembers } from '../services/api/users';
import { urlToBase64Image } from '../utils/pdfImageHelper';

export default function InstallationListScreen() {
  const router = useRouter();
  
  const { currentUser, companyProfile } = useData(); 
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

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

  // 🔥 LOAD DATA — installations via new API; users via Firestore
  const loadData = async () => {
      if (currentUser?.companyId) {
          const [installs, users] = await Promise.all([
              listInstallations(), // was: fetchSaaSData("installations")
              fetchTeamMembers()
          ]);
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
        const logoBase64 = await urlToBase64Image(companyProfile?.logoUrl);
        const signatureBase64 = await urlToBase64Image(companyProfile?.signatureUrl);

        const logoHTML = logoBase64 
            ? `<img src="${logoBase64}" style="height: 62px; object-fit: contain;" />` 
            : `<div style="font-size:24px; font-weight:800; color:#0f2557; letter-spacing:0.5px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = signatureBase64 
            ? `<img src="${signatureBase64}" style="height: 50px; object-fit: contain; margin-bottom: 6px;" />` 
            : `<div style="height: 50px;"></div>`;

        const reportNo = item.installId || item.id || '-';
        const genDate = new Date().toLocaleDateString('en-GB');

        // Warranty duration isn't stored as its own field — derived from the
        // gap between install date and warranty expiry (rounded to the
        // nearest whole year, e.g. "1 Year", "2 Years").
        let warrantyYearsLabel = '';
        const installDateRaw = item.date || item.dateIso;
        if (installDateRaw && item.warrantyExpiry) {
            const start = new Date(installDateRaw);
            const end = new Date(item.warrantyExpiry);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
                const years = Math.round((end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                if (years > 0) warrantyYearsLabel = `${years} Year${years > 1 ? 's' : ''} — `;
            }
        }

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
                display: inline-block; background: #16a34a; color: white;
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
                background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 8px;
                padding: 16px 20px; font-size: 13.5px; color: #4a4a68; margin-bottom: 34px; line-height: 1.6;
              }
              .remarks b { color: #92400e; }

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
                <div class="doc-title">INSTALLATION REPORT</div>
                <div class="status-pill">✓ COMPLETED</div>
              </div>
              <div class="doc-meta">
                <div>Report No: <b>${reportNo}</b></div>
                <div>Install Date: <b>${item.date || item.displayDate || item.dateIso || '-'}</b></div>
              </div>
            </div>

            <div class="sheet">
              <div class="grid">
                <div class="card">
                  <div class="card-label">CLIENT DETAILS</div>
                  <div class="row"><span class="k">Hospital / Client</span><span class="v">${item.orgName || item.hospital || '-'}</span></div>
                  <div class="row"><span class="k">Address</span><span class="v">${item.address || '-'}${item.city ? ', ' + item.city : ''}</span></div>
                  <div class="row"><span class="k">Department</span><span class="v">${item.department || '-'}</span></div>
                </div>
                <div class="card">
                  <div class="card-label">CONTACT PERSON</div>
                  <div class="row"><span class="k">Name</span><span class="v">${item.contactPerson || '-'}</span></div>
                  <div class="row"><span class="k">Mobile</span><span class="v">${item.mobile || '-'}</span></div>
                  <div class="row"><span class="k">Engineer</span><span class="v">${item.engineer || item.senderName || '-'}</span></div>
                </div>
              </div>

              <table class="table">
                <thead>
                  <tr>
                    <th style="width: 42%;">Product</th>
                    <th style="width: 22%;">Serial No.</th>
                    <th style="width: 36%;">Warranty</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <b>${item.product || item.productName || '-'}</b>
                      <div class="model-sub">Model: ${item.model || '-'}</div>
                    </td>
                    <td><b>${item.serialNo || '-'}</b></td>
                    <td>${warrantyYearsLabel}${item.warrantyExpiry ? `Exp: ${item.warrantyExpiry}` : '-'}</td>
                  </tr>
                </tbody>
              </table>

              <div class="remarks">
                <b>Engineer Remarks:</b> ${item.note || 'Installation completed successfully.'}
              </div>

              <div class="footer">
                <div class="sign-box">
                  <div class="sign-space"></div>
                  <div class="sign-line"></div>
                  <div class="sign-label">Client Signature & Stamp</div>
                </div>
                <div class="sign-box">
                  <div class="sign-sub" style="margin-bottom:6px;">${item.engineer || item.senderName || ''}</div>
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

    data.sort((a: any, b: any) => {
        let tsA = a.timestamp || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        if (!tsA) tsA = parseDate(a.dateIso || a.date || a.displayDate);

        let tsB = b.timestamp || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        if (!tsB) tsB = parseDate(b.dateIso || b.date || b.displayDate);

        return tsB - tsA;
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

  // 🔥 EDIT — via new backend API
  const handleSaveEdit = async () => {
      if (!editData.id) return;
      if (!editData.hospital || !editData.serialNo) {
          Alert.alert("Error", "Hospital Name and Serial No are mandatory.");
          return;
      }
      setIsSavingEdit(true);
      try {
          const updated = await apiUpdateInstallation(editData.id, {
              orgName: editData.hospital,
              orgId: editData.orgId || undefined,
              city: editData.city,
              department: editData.department,
              engineer: editData.engineer,
              product: editData.product,
              model: editData.model,
              serialNo: editData.serialNo,
              date: editData.date,
              warrantyExpiry: editData.warrantyExpiry || undefined,
              note: editData.note,
          });

          setInstallList(prev => prev.map(item => item.id === editData.id ? { ...item, ...updated } : item));
          Alert.alert("Success", "Installation details updated!");
          setEditModalVisible(false);
      } catch (error: any) {
          Alert.alert("Error", "Could not update installation. " + (error?.message || ''));
      } finally {
          setIsSavingEdit(false);
      }
  };

  // 🔥 DELETE — via new backend API
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
                          await apiDeleteInstallation(selectedItem.id);
                          setInstallList(prev => prev.filter(i => i.id !== selectedItem.id));
                          setModalVisible(false);
                          Alert.alert("Deleted", "Installation record has been deleted successfully.");
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

                <TouchableOpacity 
                    style={[styles.pdfBtn, { backgroundColor: '#25D366', borderColor: '#1DA851', marginTop: 10 }]}
                    onPress={() => {
                        Alert.alert(
                            "Send AMC Reminder",
                            `Send warranty/AMC renewal reminder to ${selectedItem?.hospital || selectedItem?.orgName}?`,
                            [
                                { text: "Cancel", style: "cancel" },
                                { text: "Send", onPress: async () => {
                                    try {
                                        await sendAmcReminder(selectedItem.id);
                                        Alert.alert("Success ✅", "AMC Reminder sent!");
                                    } catch (e: any) {
                                        Alert.alert("Error", e?.message || "Could not send reminder.");
                                    }
                                }}
                            ]
                        );
                    }}
                >
                    <Ionicons name="logo-whatsapp" size={20} color="white" />
                    <Text style={[styles.pdfBtnText, { color: 'white' }]}>Send AMC Reminder</Text>
                </TouchableOpacity>

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
