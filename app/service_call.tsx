import { Ionicons } from '@expo/vector-icons';
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
// 🔥 Phase 4: service calls now via new backend API
import { closeServiceCall as apiCloseServiceCall, listServiceCalls } from '../services/api/serviceCalls';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { listInstallations } from '../services/api/installations';
import { fetchOrganizations } from '../services/api/organizations';
import { fetchTeamMembers } from '../services/api/users';

export default function ServiceCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const { currentUser, companyProfile } = useData(); 

  // 🔥 SaaS Engine kept only for isDbLoading (search-icon spinner); service calls no longer go through this
  const { isDbLoading } = useSaaSDB();

  // serviceCallList/orgList/installList now come from useCachedList below (cache-first, shared keys)
  const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);

  const [statusFilter, setStatusFilter] = useState<'Open' | 'Closed' | 'All'>('Open');
  useEffect(() => {
      if (params.filter === 'Closed') {
          setStatusFilter('Closed');
      }
  }, [params]);
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedCall, setSelectedCall] = useState<any>(null);

  const [resolutionNote, setResolutionNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false); 

  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
      if (viewMode === 'Day' && statusFilter === 'All' && !searchText) {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, statusFilter, searchText, selectedEmployee]);

  const isAdmin = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr', 'SuperAdmin'].includes(currentUser?.role || '');

  // 🔥 SERVICE CALLS — cache-first (instant from AsyncStorage, then
  // background refresh). See hooks/useCachedList.ts.
  const serviceCallsCacheKey = buildCacheKey('service_calls', currentUser?.companyId);
  const {
      data: serviceCallList,
      setData: setServiceCallList,
      loading: serviceCallsLoading,
      refresh: refreshServiceCalls,
  } = useCachedList({
      cacheKey: serviceCallsCacheKey,
      enabled: !!currentUser?.companyId,
      fetcher: listServiceCalls, // was: fetchSaaSData("service_calls")
  });
  const openCount = serviceCallList.filter((i: any) => i.status === 'Open' || i.status === 'Assigned').length;

  // 🔥 Team members — cache-first, shares the SAME 'team_members' cache key
  // as manage_team.tsx/employee_timeline.tsx.
  const { data: teamMembersForServiceCall, refresh: refreshTeamMembersForServiceCall } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });
  useEffect(() => {
      if (isAdmin) {
          const mappedUsers = teamMembersForServiceCall.map((u: any) => ({
              id: u.id,
              name: u.name || 'Unknown User'
          }));
          setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
      }
  }, [teamMembersForServiceCall, isAdmin]);

  // 🔥 senderName was never populated — the API only returns senderId (see
  // services/api/serviceCalls.ts's comment), so every service call showed
  // no name (the "Unknown" text seen in the list). Fill it in once team
  // members are available.
  useEffect(() => {
      if (teamMembersForServiceCall.length === 0 || serviceCallList.length === 0) return;
      const nameById = new Map(teamMembersForServiceCall.map((u: any) => [u.id, u.name || 'Unknown']));
      const needsEnrichment = serviceCallList.some((s: any) => s.senderName === undefined);
      if (!needsEnrichment) return;
      setServiceCallList(serviceCallList.map((s: any) => ({ ...s, senderName: nameById.get(s.senderId) || 'Unknown' })));
  }, [serviceCallList, teamMembersForServiceCall]);

  // 🔥 Organizations/installations — cache-first, sharing the SAME cache
  // keys as organization.tsx ('organizations') and installation.tsx
  // ('installations').
  const { data: orgList, refresh: refreshOrgsForServiceCall } = useCachedList({
      cacheKey: buildCacheKey('organizations', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: () => fetchOrganizations({ limit: 200 }),
  });
  const { data: installList, refresh: refreshInstallsForServiceCall } = useCachedList({
      cacheKey: buildCacheKey('installations', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: listInstallations,
  });

  const onRefresh = async () => {
      setRefreshing(true);
      await Promise.all([refreshServiceCalls(), refreshTeamMembersForServiceCall(), refreshOrgsForServiceCall(), refreshInstallsForServiceCall()]);
      setRefreshing(false);
  };

  const parseDate = (dateStr: any) => {
    if (!dateStr) return 0;
    if (typeof dateStr === 'number') return dateStr;
    if (dateStr instanceof Date) return dateStr.getTime();
    if (typeof dateStr === 'string') {
      let cleanStr = dateStr.replace(/\./g, '/').replace(/-/g, '/');
      const parts = cleanStr.split('/');
      if (parts.length === 3 && parts[0].length === 4) return new Date(cleanStr).getTime();
      if (parts.length === 3 && parts[2].length === 4) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
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

      const generateServicePDF = async (ticketData: any) => {
    setGeneratingPdf(true);
    try {
        // Warranty isn't stored on ServiceCall — looked up by matching
        // serialNo against the Installation record.
        let warrantyHTML = '';
        const matchedInstall = installList.find((i: any) => 
            i.serialNo && ticketData.serialNo && 
            String(i.serialNo).trim().toLowerCase() === String(ticketData.serialNo).trim().toLowerCase()
        );
        if (matchedInstall?.warrantyExpiry) {
            const expiryDate = new Date(matchedInstall.warrantyExpiry);
            const today = new Date();
            const isInWarranty = expiryDate >= today;
            const expiryDisplay = expiryDate.toLocaleDateString('en-GB');
            warrantyHTML = `<span style="color:${isInWarranty ? '#16a34a' : '#dc2626'}; font-weight:700;">${isInWarranty ? 'In Warranty' : 'Out of Warranty'}</span> (Exp: ${expiryDisplay})`;
        } else {
            warrantyHTML = `<span style="color:#9ca3af;">Not Available</span>`;
        }

        const logoHTML = companyProfile?.logoUrl 
            ? `<img src="${companyProfile.logoUrl}" style="height: 62px; object-fit: contain;" />` 
            : `<div style="font-size:24px; font-weight:800; color:#0f2557; letter-spacing:0.5px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = companyProfile?.signatureUrl 
            ? `<img src="${companyProfile.signatureUrl}" style="height: 50px; object-fit: contain; margin-bottom: 6px;" />` 
            : `<div style="height: 50px;"></div>`;

        const genDate = new Date().toLocaleDateString('en-GB');
        const ticketDate = new Date(ticketData.dateIso || ticketData.date).toLocaleDateString('en-GB');
        const isResolved = (ticketData.status || '').toLowerCase() === 'closed' || (ticketData.status || '').toLowerCase() === 'resolved';

        let partsHTML = '';
        if (ticketData.partsUsed && ticketData.partsUsed.length > 0) {
            const rows = ticketData.partsUsed.map((p: any, i: number) => `
                <tr>
                    <td style="text-align:center; color:#6b7280;">${i + 1}</td>
                    <td><b>${p.partName}</b><div class="model-sub">${p.partNo || '-'}</div></td>
                    <td style="text-align:center;">${p.usedQty}</td>
                </tr>
            `).join('');

            partsHTML = `
                <table class="table" style="margin-top: 6px;">
                    <thead>
                        <tr>
                            <th style="width: 10%; text-align:center;">#</th>
                            <th style="width: 65%;">Part Name</th>
                            <th style="width: 25%; text-align:center;">Qty</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        } else {
            partsHTML = `<div class="note" style="margin-bottom: 26px;">No spare parts used for this service.</div>`;
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
                display: inline-block; color: white;
                font-size: 11.5px; font-weight: 700; letter-spacing: 0.6px;
                padding: 5px 14px; border-radius: 20px; margin-top: 6px;
                background: ${isResolved ? '#16a34a' : '#ea580c'};
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
                padding: 14px 18px; font-size: 14px; border-bottom: 1px solid #e9ecf5; background: #ffffff;
              }
              .table .model-sub { color: #6b7280; font-size: 12px; margin-top: 4px; }

              .section-label { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: 1px; margin: 20px 0 10px; }
              .problem-box {
                background: #fef2f2; border-left: 4px solid #dc2626; border-radius: 8px;
                padding: 16px 20px; font-size: 13.5px; color: #4a4a68; margin-bottom: 18px; line-height: 1.6;
              }
              .resolution-box {
                background: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 8px;
                padding: 16px 20px; font-size: 13.5px; color: #4a4a68; margin-bottom: 26px; line-height: 1.6;
              }

              .note { font-size: 11.5px; color: #6b7280; font-style: italic; }

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
                <div class="doc-title">SERVICE REPORT</div>
                <div class="status-pill">${isResolved ? '✓ RESOLVED' : '⏳ ' + (ticketData.status || 'OPEN').toUpperCase()}</div>
              </div>
              <div class="doc-meta">
                <div>Ticket No: <b>${ticketData.scrId || '-'}</b></div>
                <div>Date: <b>${ticketDate}</b> &nbsp;•&nbsp; Type: <b>${ticketData.serviceType || '-'}</b></div>
              </div>
            </div>

            <div class="sheet">
              <div class="grid">
                <div class="card">
                  <div class="card-label">CLIENT DETAILS</div>
                  <div class="row"><span class="k">Hospital / Client</span><span class="v">${ticketData.hospitalName || '-'}</span></div>
                  <div class="row"><span class="k">Address</span><span class="v">${ticketData.address || '-'}${ticketData.city ? ', ' + ticketData.city : ''}</span></div>
                  <div class="row"><span class="k">Department</span><span class="v">${ticketData.department || '-'}</span></div>
                </div>
                                <div class="card">
                  <div class="card-label">MACHINE DETAILS</div>
                  <div class="row"><span class="k">Machine</span><span class="v">${ticketData.machine || '-'}</span></div>
                  <div class="row"><span class="k">Model</span><span class="v">${ticketData.model || '-'}</span></div>
                  <div class="row"><span class="k">Serial No</span><span class="v">${ticketData.serialNo || '-'}</span></div>
                  <div class="row"><span class="k">Installed On</span><span class="v">${ticketData.installationDate || '-'}</span></div>
                  <div class="row"><span class="k">Warranty</span><span class="v">${warrantyHTML}</span></div>
                </div>
              </div>

              <div class="problem-box">
                <b style="color:#991b1b;">Problem Reported:</b> ${ticketData.remark || '-'}
              </div>

              <div class="resolution-box">
                <b style="color:#15803d;">Action Taken / Resolution:</b> ${ticketData.resolutionNote || 'Work in progress / Pending for parts.'}
              </div>

              <div class="section-label">SPARE PARTS CONSUMED</div>
              ${partsHTML}

              <div class="footer">
                <div class="sign-box">
                  <div class="sign-space"></div>
                  <div class="sign-line"></div>
                  <div class="sign-label">Customer Sign & Stamp</div>
                </div>
                <div class="sign-box">
                  <div class="sign-sub" style="margin-bottom:6px;">${ticketData.senderName || ''}</div>
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
    } finally {
        setGeneratingPdf(false);
    }
  };

  const getSortedFilteredData = () => {
    let data = serviceCallList ? [...serviceCallList] : [];
    if (isAdmin && selectedEmployee !== 'All') {
      data = data.filter((item: any) => {
        if (item.senderId === selectedEmployee) return true;
        if (item.assignedToId === selectedEmployee) return true;
        if (item.senderName && item.senderName.toLowerCase() === selectedEmployeeName.toLowerCase()) return true;
        if (item.userName && item.userName.toLowerCase() === selectedEmployeeName.toLowerCase()) return true;
        return false;
      });
    } else if (!isAdmin) {
      const myId = currentUser?.uid || currentUser?.id;
      data = data.filter((item: any) => item.senderId === myId || item.assignedToId === myId);
    }

    if (statusFilter === 'Open') {
      data = data.filter((item: any) => item.status === 'Open' || item.status === 'Assigned');
    } else if (statusFilter === 'Closed') {
      data = data.filter((item: any) => item.status === 'Resolved' || item.status === 'Closed');
    }

    if (searchText) {
      const lowerText = searchText.toLowerCase();
      data = data.filter((item: any) =>
        `${item.hospitalName} ${item.scrId} ${item.serialNo} ${item.city} ${item.model}`.toLowerCase().includes(lowerText)
      );
    }

    if (viewMode !== 'All') {
      const tYear = currentDate.getFullYear();
      const tMonth = currentDate.getMonth();
      const tDay = currentDate.getDate();

      const fyStartYear = tMonth >= 3 ? tYear : tYear - 1;
      let fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
      const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); 

      const APP_LAUNCH_DATE = new Date(2026, 0, 1).getTime(); 
      if (fyStartDate < APP_LAUNCH_DATE) {
          fyStartDate = APP_LAUNCH_DATE;
      }

      data = data.filter((item: any) => {
        const ts = parseDate(item.createdAt || item.dateIso || item.date);
        if (!ts) return false;
        const d = new Date(ts);
        const itemTime = d.getTime();

        if (viewMode === 'Month') return d.getFullYear() === tYear && d.getMonth() === tMonth;
        if (viewMode === 'Day') return d.getFullYear() === tYear && d.getMonth() === tMonth && d.getDate() === tDay;
        if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
        return true;
      });
    }

    data.sort((a: any, b: any) => parseDate(b.dateIso || b.date || b.createdAt) - parseDate(a.dateIso || a.date || a.createdAt));
    return data;
  };

  const displayList = getSortedFilteredData(); 
  const renderedList = displayList.slice(0, visibleCount);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Resolved': return { bg: '#e8f5e9', text: '#2e7d32' };
      case 'Assigned': return { bg: '#e3f2fd', text: '#1565c0' };
      case 'Open': return { bg: '#ffebee', text: '#c62828' };
      default: return { bg: '#f5f5f5', text: 'gray' };
    }
  };

  const openDetails = (item: any) => {
    setSelectedCall(item);
    setResolutionNote(item.resolutionNote || '');
    setDetailsModalVisible(true);
  };

  // 🔥 CLOSE TICKET LOGIC — via new backend API
  const handleCloseCall = async () => {
    if (!resolutionNote) { Alert.alert("Required", "Please enter a resolution note."); return; }
    setLoading(true);
    try {
      const updated = await apiCloseServiceCall(selectedCall.id, resolutionNote);
      setServiceCallList(prev => prev.map(item => item.id === selectedCall.id ? { ...item, ...updated } : item));

      setDetailsModalVisible(false);
      
      Alert.alert(
          "Call Closed Successfully!", 
          "Do you want to share the Service Report PDF?",
          [
              { text: "No", style: 'cancel' },
              { text: "Yes, Share PDF", onPress: async () => { 
                  await generateServicePDF(updated);
              }}
          ]
      );
    } catch (error: any) { Alert.alert("Error", error?.message || "Could not update status."); }
    finally { setLoading(false); }
  };

  const renderCard = ({ item }: any) => {
    const statusStyle = getStatusColor(item.status);
    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.cardHeader}>
          <Text style={styles.hospitalName} numberOfLines={1}>{item.hospitalName}</Text>
          <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
            <Text style={{ color: statusStyle.text, fontSize: 10, fontWeight: 'bold' }}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.addressText}><Ionicons name="location-outline" size={12} /> {item.city || 'N/A'}</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Machine:</Text>
          <Text style={styles.value} numberOfLines={1}>
            {item.machine}
            {item.model ? ` • ${item.model}` : ''}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Ticket:</Text>
          <Text style={[styles.value, { fontWeight: 'bold' }]}>{item.scrId}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>{item.dateIso || item.date}</Text>
          <Text style={[styles.footerText, { color: '#3b5998', fontWeight: 'bold' }]}>
            {item.senderName ? item.senderName.split(' ')[0] : 'Unknown'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10 }}>
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Service Calls</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_service_call' as any)}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={{ color: 'white', fontWeight: 'bold', marginLeft: 5 }}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity style={[styles.tab, statusFilter === 'Open' && styles.activeTabOpen]} onPress={() => setStatusFilter('Open')}>
          <Text style={[styles.tabText, statusFilter === 'Open' && { color: 'white' }]}>Open ({openCount})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, statusFilter === 'Closed' && styles.activeTabClosed]} onPress={() => setStatusFilter('Closed')}>
          <Text style={[styles.tabText, statusFilter === 'Closed' && { color: 'white' }]}>Closed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, statusFilter === 'All' && styles.activeTabAll]} onPress={() => setStatusFilter('All')}>
          <Text style={[styles.tabText, statusFilter === 'All' && { color: 'white' }]}>All</Text>
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: 'white', paddingBottom: 10, marginBottom: 5 }}>
        <View style={styles.dateTabRow}>
          {['Day', 'Month', 'FY', 'All'].map((m) => (
            <TouchableOpacity key={m} style={[styles.dateTab, viewMode === m && styles.activeDateTab]} onPress={() => setViewMode(m as any)}>
              <Text style={[styles.dateTabText, viewMode === m && styles.activeDateTabText]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isAdmin && (
          <View style={{ paddingHorizontal: 10, marginBottom: 5 }}>
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

        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
            <TextInput style={styles.input} placeholder="Search Ticket, Hospital..." value={searchText} onChangeText={setSearchText} />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="gray" /></TouchableOpacity>
            )}
          </View>
        </View>
        
        <Text style={{textAlign:'right', fontSize:12, color:'gray', paddingRight:15}}>Total: {displayList.length}</Text>
      </View>

      <FlatList
        data={renderedList}
        keyExtractor={item => item.id}
        renderItem={renderCard}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.contentContainer}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            {serviceCallsLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                <>
                    <Ionicons name="construct-outline" size={60} color="#ddd" />
                    <Text style={{ textAlign: 'center', marginTop: 10, color: 'gray' }}>No Data Found</Text>
                </>
            )}
          </View>
        }
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < displayList.length ? (
                    <TouchableOpacity 
                        onPress={() => setVisibleCount(prev => prev + 20)} 
                        style={{
                            padding: 12, 
                            backgroundColor: '#fff', 
                            alignItems: 'center', 
                            marginVertical: 15, 
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#ddd',
                            elevation: 1
                        }}
                    >
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                            👇 Load More Records ({displayList.length - visibleCount} remaining)
                        </Text>
                    </TouchableOpacity>
                ) : (
                    displayList.length > 0 ? (
                        <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                            --- End of List ---
                        </Text>
                    ) : null
                )}
            </View> 
        }
      />

      <Modal visible={detailsModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedCall && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 5 }}>
                  <Text style={styles.modalTitle}>Ticket Details</Text>
                  <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                    <Ionicons name="close-circle" size={30} color="#d32f2f" />
                  </TouchableOpacity>
                </View>

                <DetailRow label="Hospital" value={selectedCall.hospitalName} icon="business" highlight />
                <DetailRow label="City" value={selectedCall.city} icon="location" />
                <DetailRow label="Ticket No" value={selectedCall.scrId} icon="pricetag" />
                <DetailRow label="Date" value={selectedCall.dateIso || selectedCall.date} icon="calendar" />
                <DetailRow label="Engineer" value={selectedCall.senderName || selectedCall.userName} icon="person" />

                <View style={styles.divider} />

                <DetailRow label="Machine" value={selectedCall.machine} icon="cube" />
                <DetailRow label="Model" value={selectedCall.model} icon="layers" />
                <DetailRow label="Serial No" value={selectedCall.serialNo} icon="barcode" />
                <DetailRow label="Type" value={selectedCall.serviceType || 'Unknown'} icon="document-text" />

                <View style={styles.divider} />

                <Text style={styles.sectionHeader}>COMPLAINT / ISSUE</Text>
                <View style={{ backgroundColor: '#ffebee', padding: 10, borderRadius: 8, marginBottom: 10 }}>
                  <Text style={{ color: '#c62828' }}>{selectedCall.remark}</Text>
                </View>

                {selectedCall.partsText && (
                  <View>
                    <Text style={styles.sectionHeader}>SPARE PARTS USED</Text>
                    <View style={{ backgroundColor: '#fff3e0', padding: 10, borderRadius: 8, marginBottom: 10 }}>
                      <Text style={{ color: '#e65100' }}>{selectedCall.partsText}</Text>
                    </View>
                  </View>
                )}

                {(selectedCall.status === 'Open' || selectedCall.status === 'Assigned') ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.sectionHeader}>ACTION TAKEN (TO CLOSE)</Text>
                    <TextInput
                      style={styles.actionInput}
                      multiline
                      placeholder="Describe repair details..."
                      value={resolutionNote}
                      onChangeText={setResolutionNote}
                    />
                    <TouchableOpacity style={[styles.resolveBtn, loading && { backgroundColor: '#ccc' }]} onPress={handleCloseCall} disabled={loading}>
                      <Text style={styles.btnText}>{loading ? 'Updating...' : 'Mark as Closed'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.sectionHeader}>RESOLUTION NOTE</Text>
                    <View style={{ backgroundColor: '#e8f5e9', padding: 10, borderRadius: 8 }}>
                      <Text style={{ color: '#2e7d32' }}>{selectedCall.resolutionNote || 'Closed without notes.'}</Text>
                    </View>

                    <TouchableOpacity 
                        style={styles.pdfBtn}
                        onPress={() => generateServicePDF(selectedCall)}
                        disabled={generatingPdf}
                    >
                        {generatingPdf ? (
                            <ActivityIndicator color="#1565c0" size="small" />
                        ) : (
                            <>
                                <Ionicons name="document-text-outline" size={20} color="#1565c0" />
                                <Text style={styles.pdfBtnText}>Share Service Report</Text>
                            </>
                        )}
                    </TouchableOpacity>
                  </View>
                )}

                {selectedCall.imageUri && (
                  <View style={{ marginTop: 15 }}>
                    <Text style={styles.sectionHeader}>PHOTO</Text>
                    <Image source={{ uri: selectedCall.imageUri }} style={{ width: '100%', height: 200, borderRadius: 10, resizeMode: 'cover' }} />
                  </View>
                )}
                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
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

const DetailRow = ({ label, value, icon, highlight }: any) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
    <View style={{ width: 25 }}><Ionicons name={icon} size={16} color="#3b5998" /></View>
    <Text style={{ fontSize: 12, color: 'gray', width: 80 }}>{label}</Text>
    <Text style={{ fontSize: 14, fontWeight: highlight ? 'bold' : '500', color: '#333', flex: 1 }}>{value || '-'}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: 'white', paddingTop: 40, paddingBottom: 0, elevation: 0 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, marginBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998', marginLeft: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b5998', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },

  tabsContainer: { flexDirection: 'row', padding: 2, backgroundColor: 'white', justifyContent: 'space-between' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, marginHorizontal: 4, backgroundColor: '#f0f0f0' },
  activeTabOpen: { backgroundColor: '#d32f2f' },
  activeTabClosed: { backgroundColor: '#388e3c' },
  activeTabAll: { backgroundColor: '#3b5998' },
  tabText: { fontSize: 13, fontWeight: 'bold', color: '#555' },

  dateTabRow: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 10, borderRadius: 8, padding: 3 },
  dateTab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeDateTab: { backgroundColor: 'white', elevation: 2 },
  dateTabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeDateTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2e7d32' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 4, marginHorizontal: 10, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchRow: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 5 },
  searchBar: { flex: 1, backgroundColor: '#e0e0e0', paddingHorizontal: 10, borderRadius: 5, flexDirection: 'row', alignItems: 'center', height: 36 },
  input: { flex: 1, marginLeft: 5, fontSize: 15, color: 'black' },

  contentContainer: { padding: 5, paddingBottom: 100 },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
  hospitalName: { fontWeight: 'bold', fontSize: 16, width: '75%', color: '#333' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: 'center' },
  addressText: { color: 'gray', fontSize: 12, marginBottom: 10 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 70, color: 'gray', fontSize: 12, fontWeight: '600' },
  value: { color: '#333', fontSize: 13, fontWeight: '500', flex: 1 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { color: 'gray', fontSize: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, width: '90%', maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', width: '85%' },
  sectionHeader: { fontSize: 12, fontWeight: 'bold', color: '#999', marginTop: 15, marginBottom: 5 },
  resolveBtn: { backgroundColor: '#d32f2f', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: 'bold' },
  actionInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, height: 80, textAlignVertical: 'top', marginBottom: 10, backgroundColor: '#f9f9f9' },

  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, marginTop: 15, borderWidth: 1, borderColor: '#2196f3' },
  pdfBtnText: { color: '#1565c0', fontWeight: 'bold', marginLeft: 8 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation: 10 },
  pickerHeader: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#3b5998', textAlign: 'center' },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
