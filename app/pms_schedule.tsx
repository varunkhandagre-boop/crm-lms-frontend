import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
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

// 🔥 SAAS IMPORTS (organizations/users still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 4: PMS reports now via new backend API
import { listPmsReports } from '../services/api/pmsReports';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fetchOrganizations } from '../services/api/organizations';
import { fetchTeamMembers } from '../services/api/users';

export default function PMSScheduleScreen() {
  const router = useRouter();
  
  const { currentUser, companyProfile } = useData(); 
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  const [pmsList, setPmsList] = useState<any[]>([]);
  const [orgList, setOrgList] = useState<any[]>([]);
  const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);

  const [filter, setFilter] = useState<'All' | 'Upcoming' | 'Completed' | 'Overdue'>('All');
  const [searchText, setSearchText] = useState('');
  
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false); 

  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  const isAdmin = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr', 'SuperAdmin'].includes(currentUser?.role || '');

  useEffect(() => {
      if (viewMode === 'Day') {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, searchText, filter, selectedEmployee]);

  // 🔥 LOAD DATA — PMS reports via new API; organizations/users via Firestore
  const loadData = async () => {
      if (currentUser?.companyId) {
          const [pms, orgs, users] = await Promise.all([
             listPmsReports(), // was: fetchSaaSData("pms_reports")
             fetchOrganizations({ limit: 200 }),
             fetchTeamMembers()
          ]);
          setPmsList(pms);
          setOrgList(orgs);

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

  useFocusEffect(
      useCallback(() => { 
          loadData(); 
      }, [])
  );

  const onRefresh = async () => {
      setRefreshing(true);
      await loadData();
      setRefreshing(false);
  };

  const isTaskCompleted = (status: string) => {
    const s = (status || '').toLowerCase();
    return s === 'done' || s === 'completed' || s === 'resolved' || s === 'closed';
  };

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

    const generatePMSPDF = async (pmsData: any) => {
    setGeneratingPdf(true);
    try {
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
            ? `<img src="${companyProfile.logoUrl}" style="height: 62px; object-fit: contain;" />` 
            : `<div style="font-size:24px; font-weight:800; color:#0f2557; letter-spacing:0.5px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = companyProfile?.signatureUrl 
            ? `<img src="${companyProfile.signatureUrl}" style="height: 50px; object-fit: contain; margin-bottom: 6px;" />` 
            : `<div style="height: 50px;"></div>`;

        const genDate = new Date().toLocaleDateString('en-GB');
        const serviceDate = new Date(pmsData.lastDoneDate || pmsData.dateIso || pmsData.date).toLocaleDateString('en-GB');
        const nextDueDate = new Date(pmsData.computedDueDate).toLocaleDateString('en-GB');

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

              .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; border-radius: 12px; overflow: hidden; }
              .table th {
                background: #0f2557; color: white; font-size: 12.5px; letter-spacing: 0.5px;
                text-align: left; padding: 15px 18px; font-weight: 600;
              }
              .table td {
                padding: 16px 18px; font-size: 14px; border-bottom: 1px solid #e9ecf5; background: #ffffff;
              }
              .table .model-sub { color: #6b7280; font-size: 12px; margin-top: 4px; }

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
                <div>Service Date: <b>${serviceDate}</b></div>
              </div>
            </div>

            <div class="sheet">
              <div class="grid">
                <div class="card">
                  <div class="card-label">CLIENT DETAILS</div>
                  <div class="row"><span class="k">Hospital / Client</span><span class="v">${pmsData.hospitalName || '-'}</span></div>
                  <div class="row"><span class="k">Address</span><span class="v">${orgAddr || '-'}${orgCity ? ', ' + orgCity : ''}</span></div>
                  <div class="row"><span class="k">Department</span><span class="v">${pmsData.department || '-'}</span></div>
                </div>
                <div class="card">
                  <div class="card-label">MACHINE DETAILS</div>
                  <div class="row"><span class="k">Machine</span><span class="v">${pmsData.machine || pmsData.machineName || '-'}</span></div>
                  <div class="row"><span class="k">Model</span><span class="v">${pmsData.model || '-'}</span></div>
                  <div class="row"><span class="k">Serial No</span><span class="v">${pmsData.serialNo || '-'}</span></div>
                </div>
              </div>

              <div class="due-banner">
                <div>
                  <div class="label">⏰ NEXT SERVICE DUE</div>
                  <div class="date">${nextDueDate}</div>
                </div>
              </div>

              <div class="remarks">
                <b>Engineer Checklist / Remarks:</b> ${pmsData.remarks || pmsData.remark || 'Routine checkup done. Machine working fine.'}
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

  const getProcessedList = () => {
    if (!pmsList) return [];
    return pmsList.map((item: any) => {
      let computedDueDate = item.dueDate || item.nextServiceDate;
      if (!computedDueDate) {
        const baseDate = item.lastDoneDate || item.dateIso || item.date || item.createdAt || new Date();
        computedDueDate = addMonths(baseDate, 3);
      }
      return { ...item, computedDueDate };
    });
  };

  const processedList = getProcessedList();

  const getFilteredData = () => {
    let data = [...processedList];

    if (isAdmin && selectedEmployee !== 'All') {
      data = data.filter((item: any) =>
        (item.userId === selectedEmployee) ||
        (item.engineerId === selectedEmployee) ||
        (item.userName === selectedEmployeeName) ||
        (item.senderName === selectedEmployeeName)
      );
    } else if (!isAdmin) {
      const myId = currentUser?.uid || currentUser?.id;
      data = data.filter((item: any) => item.userId === myId || item.engineerId === myId || item.senderId === myId);
    }

    if (searchText) {
      const term = searchText.toLowerCase().trim();
      data = data.filter((item: any) =>
        `${item.hospital || ''} ${item.hospitalName || ''} ${item.city || ''} ${item.serialNo || ''} ${item.machine || ''}`.toLowerCase().includes(term)
      );
    }

    const nowTs = new Date().setHours(0, 0, 0, 0);

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

    const shouldApplyDateFilter = viewMode !== 'All' && (filter === 'All' || filter === 'Completed');

    if (shouldApplyDateFilter) {
      const tYear = currentDate.getFullYear();
      const tMonth = currentDate.getMonth();
      const tDay = currentDate.getDate();

      const fyStartYear = tMonth >= 3 ? tYear : tYear - 1;
      const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
      const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); 

      data = data.filter((item: any) => {
        let dateField;
        if (isTaskCompleted(item.status)) {
          dateField = item.lastDoneDate || item.dateIso || item.date;
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

    data.sort((a: any, b: any) => {
      if (filter === 'Upcoming' || filter === 'Overdue') {
        return parseDate(a.computedDueDate) - parseDate(b.computedDueDate);
      }
      const dateA = isTaskCompleted(a.status) ? parseDate(a.lastDoneDate || a.dateIso || a.date) : parseDate(a.computedDueDate);
      const dateB = isTaskCompleted(b.status) ? parseDate(b.lastDoneDate || b.dateIso || b.date) : parseDate(b.computedDueDate);
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

      <View style={{ backgroundColor: 'white', paddingBottom: 10, marginBottom: 5 }}>
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

        <View style={styles.searchBar}>
          {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
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
        ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 50 }}>
                {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : <Text style={{ color: 'gray' }}>No Data Found</Text>}
            </View>
        }
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
                    <Text style={{ fontWeight: 'bold' }}>{selectedItem.lastDoneDate || selectedItem.dateIso || selectedItem.date || '-'}</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingTop: 50, backgroundColor: 'white', elevation: 4, alignItems:'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  addBtn: { flexDirection:'row', backgroundColor:'#3b5998', paddingVertical:6, paddingHorizontal:12, borderRadius:20, alignItems:'center' },
  filterBox: { backgroundColor:'white', padding:15, paddingBottom:10, marginBottom:5 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 10, borderRadius: 8, padding: 2, marginBottom: 5 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#eee' },
  navText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', marginHorizontal: 15, paddingHorizontal: 10, borderRadius: 8, height: 36, marginBottom: 5 },
  input: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },
  filterChip: { paddingHorizontal: 15, paddingVertical: 6, backgroundColor: '#eee', borderRadius: 20, marginRight: 10 },
  activeChip: { backgroundColor: '#3b5998' },
  chipText: { fontSize: 12, color: '#555' },
  employeeFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2e7d32' },
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 4, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
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
