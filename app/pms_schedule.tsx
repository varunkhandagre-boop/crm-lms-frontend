import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, getDocs, query } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function PMSScheduleScreen() {
  const router = useRouter();
  // 🔥 Added orgList to fetch missing address for PDF
  const { pmsList = [], orgList = [], user, refreshData, companyProfile } = useData(); 

  // --- STATES ---
  const [filter, setFilter] = useState<'All' | 'Upcoming' | 'Completed' | 'Overdue'>('All');
  const [searchText, setSearchText] = useState('');
  
  // 🔥 CHANGED: 'Year' to 'FY'
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false); 

  // --- EMPLOYEE FILTER ---
  const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  // 🔥 PAGINATION STATE (SMART LOAD MORE)
  const [visibleCount, setVisibleCount] = useState(20);

  // 🔥 RESET PAGINATION ON FILTER CHANGE
  useEffect(() => {
      if (viewMode === 'Day') {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, searchText, filter, selectedEmployee]);

  const isAdmin = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr'].includes(user?.role || '');

  // --- FETCH EMPLOYEES ---
  useEffect(() => {
    if (isAdmin) {
      const fetchEmployees = async () => {
        try {
          const q = query(collection(db, "users"));
          const querySnapshot = await getDocs(q);
          const usersData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'Unknown User'
          }));
          setEmployees([{ id: 'All', name: 'All Staff' }, ...usersData]);
        } catch (error) {
          console.log("Error fetching employees:", error);
        }
      };
      fetchEmployees();
    }
  }, [user]);

  // --- HELPER: CHECK STATUS ---
  const isTaskCompleted = (status: string) => {
    const s = (status || '').toLowerCase();
    return s === 'done' || s === 'completed' || s === 'resolved' || s === 'closed';
  };

  // --- DATE PARSER ---
  const parseDate = (dateStr: any) => {
    if (!dateStr) return 0;
    if (typeof dateStr === 'number') return dateStr;
    if (dateStr instanceof Date) return dateStr.getTime();

    if (typeof dateStr === 'string') {
      let cleanStr = dateStr.replace(/[\.\-]/g, '/');
      const parts = cleanStr.split('/');

      if (parts.length === 3 && parts[0].length === 4) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        return new Date(year, month, day).getTime();
      }
      if (parts.length === 3 && parts[2].length === 4) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);
        return new Date(year, month, day).getTime();
      }
    }
    return new Date(dateStr).getTime();
  };

  // Add Months Logic
  const addMonths = (dateStr: any, months: number) => {
    let timestamp = parseDate(dateStr);
    if (!timestamp) timestamp = new Date().getTime();

    const d = new Date(timestamp);
    d.setMonth(d.getMonth() + months);

    let dd = d.getDate().toString().padStart(2, '0');
    let mm = (d.getMonth() + 1).toString().padStart(2, '0');
    let yyyy = d.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  };

  // 🔥 CHANGED: FY Navigation
  const changeDate = (dir: number) => {
    const d = new Date(currentDate);
    if (viewMode === 'Day') d.setDate(d.getDate() + dir);
    else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
    else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
    setCurrentDate(d);
  };

  // 🔥 CHANGED: Header Title logic for Financial Year
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

  // 🔥 PDF GENERATOR FOR PMS REPORT
  const generatePMSPDF = async (pmsData: any) => {
    setGeneratingPdf(true);
    try {
        // 🔥 SMART ADDRESS FALLBACK
        let orgAddr = pmsData.address || '';
        let orgCity = pmsData.city || '';
        
        if (!orgAddr || !orgCity) {
            const org = orgList.find((o: any) => 
                (pmsData.orgId && o.id === pmsData.orgId) || 
                o.orgName === pmsData.hospitalName || 
                o.name === pmsData.hospitalName
            );
            if (org) {
                orgAddr = orgAddr || org.address || '';
                orgCity = orgCity || org.city || '';
            }
        }

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

            <h3 style="text-align: center; text-decoration: underline;">PREVENTIVE MAINTENANCE REPORT</h3>

            <div class="box">
                <div class="row">
                    <div><span class="label">PMS Type:</span> <b>${pmsData.type || 'Preventive'}</b></div>
                    <div><span class="label">Date:</span> ${new Date(pmsData.lastDoneDate || pmsData.date).toLocaleDateString('en-GB')}</div>
                </div>
            </div>

            <div class="box">
                <div style="font-size:14px; margin-bottom:5px;"><b>Client:</b> ${pmsData.hospitalName}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Address:</b> ${orgAddr}, ${orgCity}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Department:</b> ${pmsData.department || '-'}</div>
            </div>

            <div class="box">
                <div class="row"><div><span class="label">Machine:</span> ${pmsData.machine || pmsData.machineName}</div></div>
                <div class="row"><div><span class="label">Model:</span> ${pmsData.model}</div></div>
                <div class="row"><div><span class="label">Serial No:</span> <b>${pmsData.serialNo}</b></div></div>
            </div>

            <div class="box" style="background-color: #e8f5e9;">
                <div class="row">
                    <div><span class="label">Next Due Date:</span> <b style="color:#d32f2f; font-size:16px;">${new Date(pmsData.computedDueDate).toLocaleDateString('en-GB')}</b></div>
                </div>
            </div>

            <div class="box">
                <div style="font-weight:bold; text-decoration:underline;">Engineer Checklist / Remarks:</div>
                <div style="margin-top:10px; min-height: 60px;">${pmsData.remarks || pmsData.remark || 'Routine checkup done. Machine working fine.'}</div>
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
        const cleanName = `PMS_${(pmsData.hospitalName || 'Client').replace(/ /g, '_')}_${Date.now()}.pdf`;
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
    } finally {
        setGeneratingPdf(false);
    }
  };

  // --- DATA PROCESSING ---
  const getProcessedList = () => {
    if (!pmsList) return [];
    return pmsList.map((item: any) => {
      let computedDueDate = item.dueDate;
      if (!computedDueDate) {
        const baseDate = item.lastDoneDate || item.date || item.createdAt || new Date();
        computedDueDate = addMonths(baseDate, 3);
      }
      return { ...item, computedDueDate };
    });
  };

  const processedList = getProcessedList();

  useFocusEffect(
    useCallback(() => { if (refreshData) refreshData(); }, [refreshData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (refreshData) await refreshData();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refreshData]);

  // --- 🔥 MAIN FILTER LOGIC ---
  const getFilteredData = () => {
    let data = [...processedList];

    // 0. Employee Filter
    if (isAdmin && selectedEmployee !== 'All') {
      data = data.filter((item: any) =>
        (item.userId === selectedEmployee) ||
        (item.engineerId === selectedEmployee) ||
        (item.userName === selectedEmployeeName) ||
        (item.senderName === selectedEmployeeName)
      );
    } else if (!isAdmin) {
      data = data.filter((item: any) => item.userId === user?.uid || item.engineerId === user?.uid);
    }

    // 1. Search Logic
    if (searchText) {
      const term = searchText.toLowerCase().trim();
      data = data.filter((item: any) =>
        `${item.hospital || ''} ${item.hospitalName || ''} ${item.city || ''} ${item.serialNo || ''} ${item.machine || ''}`.toLowerCase().includes(term)
      );
    }

    const nowTs = new Date().setHours(0, 0, 0, 0);

    // 2. STATUS FILTER
    if (filter === 'Completed') {
      data = data.filter((i: any) => isTaskCompleted(i.status));
    }
    else if (filter === 'Overdue') {
      data = data.filter((i: any) => {
        const dueTs = parseDate(i.computedDueDate);
        return dueTs < nowTs;
      });
    }
    else if (filter === 'Upcoming') {
      data = data.filter((i: any) => {
        const dueTs = parseDate(i.computedDueDate);
        return dueTs >= nowTs;
      });
    }

    // 3. DATE FILTER (🔥 FY Boundaries added)
    const shouldApplyDateFilter = viewMode !== 'All' && (filter === 'All' || filter === 'Completed');

    if (shouldApplyDateFilter) {
      const tYear = currentDate.getFullYear();
      const tMonth = currentDate.getMonth();
      const tDay = currentDate.getDate();

      // FY Boundaries Logic
      const fyStartYear = tMonth >= 3 ? tYear : tYear - 1;
      const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); // 1st April
      const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); // 31st March

      data = data.filter((item: any) => {
        let dateField;
        if (isTaskCompleted(item.status)) {
          dateField = item.lastDoneDate || item.date;
        } else {
          dateField = item.computedDueDate;
        }

        const ts = parseDate(dateField);
        if (!ts) return false;

        const d = new Date(ts);
        const itemTime = d.getTime();

        if (viewMode === 'Month') return d.getFullYear() === tYear && d.getMonth() === tMonth;
        if (viewMode === 'Day') return d.getFullYear() === tYear && d.getMonth() === tMonth && d.getDate() === tDay;
        if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
        return true;
      });
    }

    // 4. SORTING
    data.sort((a: any, b: any) => {
      if (filter === 'Upcoming' || filter === 'Overdue') {
        return parseDate(a.computedDueDate) - parseDate(b.computedDueDate);
      }
      const dateA = isTaskCompleted(a.status) ? parseDate(a.lastDoneDate || a.date) : parseDate(a.computedDueDate);
      const dateB = isTaskCompleted(b.status) ? parseDate(b.lastDoneDate || b.date) : parseDate(b.computedDueDate);
      return dateA - dateB;
    });

    return data;
  };

  const fullList = getFilteredData(); 
  const renderedList = fullList.slice(0, visibleCount);

  const openDetails = (item: any) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isDone = isTaskCompleted(item.status);
    const dueTs = parseDate(item.computedDueDate);
    const nowTs = new Date().setHours(0, 0, 0, 0);
    const isOverdue = dueTs < nowTs;

    let displayDate = item.computedDueDate;
    let dateLabel = "NEXT DUE";
    let badgeColor = isOverdue ? '#ffebee' : '#e3f2fd';
    let textColor = isOverdue ? 'red' : '#1565c0';

    if (filter === 'Completed') {
      displayDate = item.lastDoneDate || item.date;
      dateLabel = "COMPLETED";
      badgeColor = '#e8f5e9';
      textColor = 'green';
    } else if (filter === 'All') {
      if (isDone) {
        displayDate = item.lastDoneDate || item.date;
        dateLabel = "DONE";
        badgeColor = '#e8f5e9';
        textColor = 'green';
      }
    }

    return (
      <TouchableOpacity
        style={[styles.card, isDone ? styles.cardDone : (isOverdue ? styles.cardOverdue : null)]}
        onPress={() => openDetails(item)}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hospitalName} numberOfLines={1}>
                {item.hospital || item.hospitalName || 'Unknown'}
                {item.city ? `, ${item.city}` : ''}
            </Text>
            
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 13, color: '#3b5998', fontWeight: 'bold' }}>
                {item.machine || item.machineName || 'Machine'}
                {item.model ? ` • ${item.model}` : ''}
              </Text>
              <Text style={{ fontWeight: 'normal', color: 'gray', fontSize: 11, marginTop: 2 }}>
                SN: {item.serialNo}
              </Text>
            </View>

          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.dateBadge, { backgroundColor: badgeColor }]}>
              <Text style={{ fontSize: 9, color: '#555', marginBottom: 2, fontWeight: 'bold' }}>{dateLabel}</Text>
              <Text style={[styles.dateText, { color: textColor }]}>
                {displayDate}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 10, justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={[styles.contractBadge, { backgroundColor: '#eeeeee' }]}>
              <Text style={[styles.contractText, { color: '#616161' }]}>
                {item.contractType || item.type || 'Warranty'}
              </Text>
            </View>
            {item.senderName && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="person-circle-outline" size={14} color="#666" />
                <Text style={{ fontSize: 10, color: '#555', marginLeft: 2, fontWeight: 'bold' }}>{item.senderName}</Text>
              </View>
            )}
          </View>

          {(filter === 'Upcoming' || filter === 'Overdue' || !isDone) && (
            <TouchableOpacity 
                style={styles.actionBtn} 
                onPress={() => router.push({ pathname: '/add_pms', params: { id: item.id, hospital: item.hospitalName, orgId: item.orgId || '', serial: item.serialNo } } as any)}
            >
              <Text style={styles.btnText}>Perform</Text>
              <Ionicons name="arrow-forward" size={12} color="#3b5998" />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>PMS Schedule</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_pms' as any)}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={{ color: 'white', fontWeight: 'bold', marginLeft: 5 }}>New</Text>
        </TouchableOpacity>
      </View>

      {/* FILTERS */}
      <View style={{ backgroundColor: 'white', paddingBottom: 10, marginBottom: 5 }}>
        <View style={styles.tabContainer}>
          {/* 🔥 CHANGED: 'Year' to 'FY' */}
          {['Day', 'Month', 'FY', 'All'].map((m) => (
            <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
              <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* --- ADMIN STAFF DROPDOWN --- */}
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

        {/* SEARCH */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="gray" />
          <TextInput
            style={styles.input}
            placeholder="Search Hospital, Machine, Serial..."
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={18} color="gray" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 15, paddingVertical: 5 }}>
          {['All', 'Upcoming', 'Overdue', 'Completed'].map((t) => (
            <TouchableOpacity key={t} style={[styles.filterChip, filter === t && styles.activeChip]} onPress={() => setFilter(t as any)}>
              <Text style={[styles.chipText, filter === t && { color: 'white' }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={{ textAlign: 'right', fontSize: 12, color: 'gray', paddingRight: 15 }}>Total: {fullList.length}</Text>
      </View>

      <FlatList
        data={renderedList}
        keyExtractor={(item, index) => item.id || index.toString()}
        contentContainerStyle={{ padding: 5, paddingBottom: 100 }}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 50, color: 'gray' }}>No Data Found</Text>}
        
        // 🔥 LOAD MORE BUTTON WRAPPED WITH PADDING
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
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
                            borderColor: '#ddd',
                            marginHorizontal: 15
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

      {/* DETAILS MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 10 }}>
              <Text style={styles.modalTitle}>PMS Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#d32f2f" />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView>
                <View style={styles.infoSection}>
                  <Text style={styles.sectionHeader}>MACHINE INFO</Text>
                  <DetailRow label="Hospital" 
                             value={`${selectedItem.hospital || selectedItem.hospitalName}${selectedItem.city ? `, ${selectedItem.city}` : ''}`} 
                  />
                  <DetailRow label="Machine" value={selectedItem.machine || selectedItem.machineName} />
                  <DetailRow label="Model" value={selectedItem.model} /> 
                  <DetailRow label="Serial No" value={selectedItem.serialNo} highlight />
                  <DetailRow label="Department" value={selectedItem.department} />
                </View>

                <View style={styles.infoSection}>
                  <Text style={styles.sectionHeader}>STATUS INFO</Text>
                  <DetailRow label="Status" value={selectedItem.status} color={isTaskCompleted(selectedItem.status) ? 'green' : 'orange'} highlight />
                  <DetailRow label="Type" value={selectedItem.contractType || selectedItem.type || 'Preventive'} />
                  <DetailRow label="Engineer" value={selectedItem.senderName || selectedItem.userName || 'Unknown'} highlight color="#3b5998" />
                </View>

                <View style={styles.dateRowBox}>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 10, color: 'gray' }}>LAST DONE</Text>
                    <Text style={{ fontWeight: 'bold' }}>{selectedItem.lastDoneDate || selectedItem.date || '-'}</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: '#ccc', height: '100%' }} />
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 10, color: 'gray' }}>NEXT DUE</Text>
                    <Text style={{ fontWeight: 'bold', color: '#1565c0' }}>{selectedItem.computedDueDate}</Text>
                  </View>
                </View>

                <Text style={[styles.sectionHeader, { marginTop: 15 }]}>REMARKS</Text>
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>{selectedItem.remarks || selectedItem.remark || 'No remarks added.'}</Text>
                </View>

                {isTaskCompleted(selectedItem.status) && (
                    <TouchableOpacity 
                        style={[styles.pdfBtn, generatingPdf && { opacity: 0.6 }]}
                        onPress={() => generatePMSPDF(selectedItem)}
                        disabled={generatingPdf}
                    >
                        {generatingPdf ? (
                            <ActivityIndicator color="#1565c0" size="small" />
                        ) : (
                            <>
                                <Ionicons name="document-text-outline" size={20} color="#1565c0" />
                                <Text style={styles.pdfBtnText}>Share PMS Report</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}

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

const DetailRow = ({ label, value, highlight, color }: any) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
    <Text style={{ color: 'gray', fontSize: 13, width: '40%' }}>{label}</Text>
    <Text style={{ fontWeight: highlight ? 'bold' : '500', color: color || '#333', fontSize: 14, flex: 1, textAlign: 'right' }}>{value || '-'}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, paddingTop: 50, backgroundColor: 'white', elevation: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  addBtn: { flexDirection: 'row', backgroundColor: '#3b5998', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignItems: 'center' },

  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 10, borderRadius: 8, padding: 2, marginBottom: 5 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2e7d32' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 4, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', marginHorizontal: 15, paddingHorizontal: 10, borderRadius: 8, height: 36, alignItems: 'center', marginBottom: 5 },
  input: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  filterChip: { paddingHorizontal: 15, paddingVertical: 6, backgroundColor: '#eee', borderRadius: 20, marginRight: 10 },
  activeChip: { backgroundColor: '#3b5998' },
  chipText: { fontSize: 12, color: '#555' },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#2196f3' },
  cardOverdue: { borderLeftColor: '#d32f2f' },
  cardDone: { borderLeftColor: '#4caf50' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName: { fontSize: 15, fontWeight: 'bold', color: '#333', flex: 1, marginRight: 5 },
  
  dateBadge: { backgroundColor: '#f9f9f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignItems: 'flex-end', minWidth: 80 },
  dateText: { fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  contractBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  contractText: { fontSize: 10, fontWeight: 'bold' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  btnText: { color: '#3b5998', fontWeight: 'bold', marginRight: 5, fontSize: 11 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '90%', backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  sectionHeader: { fontSize: 12, fontWeight: 'bold', color: '#999', marginBottom: 8, marginTop: 5 },
  infoSection: { marginBottom: 15 },
  dateRowBox: { flexDirection: 'row', backgroundColor: '#f5f5f5', padding: 10, borderRadius: 8, marginBottom: 10 },
  noteBox: { backgroundColor: '#fff3e0', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ffe0b2' },
  noteText: { fontSize: 13, color: '#e65100', fontStyle: 'italic' },

  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, marginTop: 15, borderWidth: 1, borderColor: '#2196f3' },
  pdfBtnText: { color: '#1565c0', fontWeight: 'bold', marginLeft: 8 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation: 10 },
  pickerHeader: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#3b5998', textAlign: 'center' },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});