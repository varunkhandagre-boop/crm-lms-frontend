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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useData } from './context/DataContext';

// 🔥 FIREBASE IMPORTS
import { addDoc, collection, doc, getDocs, query, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function ServiceCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { serviceCallList = [], user, addNotification, companyProfile } = useData(); 

  // --- STATES ---
  const [statusFilter, setStatusFilter] = useState<'Open' | 'Closed' | 'All'>('Open');
  useEffect(() => {
      if (params.filter === 'Closed') {
          setStatusFilter('Closed');
      }
  }, [params]);
  const [searchText, setSearchText] = useState('');

  // 🔥 CHANGED: 'Year' to 'FY'
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedCall, setSelectedCall] = useState<any>(null);

  const [resolutionNote, setResolutionNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false); 

  // --- NEW: EMPLOYEE FILTER STATES ---
  const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);
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

  const isAdmin = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr'].includes(user?.role || '');
  const openCount = serviceCallList.filter((i: any) => i.status === 'Open' || i.status === 'Assigned').length;

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

  // 🔥 CHANGED: FY Navigation
  const changeDate = (dir: number) => {
    const d = new Date(currentDate);
    if (viewMode === 'Day') d.setDate(d.getDate() + dir);
    else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
    else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
    setCurrentDate(d);
  };

  // 🔥 CHANGED: FY Header Text Logic
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

  // 🔥 PDF GENERATOR
  const generateServicePDF = async (ticketData: any) => {
    setGeneratingPdf(true);
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

            <h3 style="text-align: center; text-decoration: underline;">SERVICE REPORT</h3>

            <div class="box">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <div><b>Ticket No:</b> ${ticketData.scrId}</div>
                    <div><b>Date:</b> ${new Date(ticketData.date).toLocaleDateString('en-GB')}</div>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <div><b>Status:</b> ${ticketData.status}</div>
                    <div><b>Type:</b> ${ticketData.serviceType}</div>
                </div>
            </div>

            <div class="box">
                <div style="font-size:14px; margin-bottom:5px;"><b>Client:</b> ${ticketData.hospitalName}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Address:</b> ${ticketData.address}, ${ticketData.city}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Department:</b> ${ticketData.department || '-'}</div>
            </div>

            <div class="box">
                <div style="margin-bottom:5px;"><b>Machine:</b> ${ticketData.machine}</div>
                <div style="margin-bottom:5px;"><b>Model:</b> ${ticketData.model}</div>
                <div style="margin-bottom:5px;"><b>Serial No:</b> ${ticketData.serialNo}</div>
                <div><b>Installed On:</b> ${ticketData.installationDate || '-'}</div>
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
      data = data.filter((item: any) => item.senderId === user?.uid || item.assignedToId === user?.uid);
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

    // 🔥 CHANGED: FY Boundaries Logic
    if (viewMode !== 'All') {
      const tYear = currentDate.getFullYear();
      const tMonth = currentDate.getMonth();
      const tDay = currentDate.getDate();

      const fyStartYear = tMonth >= 3 ? tYear : tYear - 1;
      let fyStartDate = new Date(fyStartYear, 3, 1).getTime(); // 1st April
      const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); // 31st March

      // 🔥 Apply App Launch Date (Jan 1, 2026) Limit
      const APP_LAUNCH_DATE = new Date(2026, 0, 1).getTime(); 
      if (fyStartDate < APP_LAUNCH_DATE) {
          fyStartDate = APP_LAUNCH_DATE;
      }

      data = data.filter((item: any) => {
        const ts = parseDate(item.createdAt || item.date);
        if (!ts) return false;
        const d = new Date(ts);
        const itemTime = d.getTime();

        if (viewMode === 'Month') return d.getFullYear() === tYear && d.getMonth() === tMonth;
        if (viewMode === 'Day') return d.getFullYear() === tYear && d.getMonth() === tMonth && d.getDate() === tDay;
        if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
        return true;
      });
    }

    data.sort((a: any, b: any) => parseDate(b.date || b.createdAt) - parseDate(a.date || a.createdAt));
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

  const handleCloseCall = async () => {
    if (!resolutionNote) { Alert.alert("Required", "Please enter a resolution note."); return; }
    setLoading(true);
    try {
      const callRef = doc(db, "service_calls", selectedCall.id);
      
      const updateData = {
        status: 'Resolved',
        resolutionNote: resolutionNote,
        resolvedAt: new Date().toISOString(),
        resolvedBy: user?.name || 'Admin'
      };

      await updateDoc(callRef, updateData);
      
      try {
          const targetUser = user?.role === 'Admin' ? selectedCall.senderId : 'Admin';
          await addDoc(collection(db, "notifications"), {
              title: "Service Call Resolved ✅",
              message: `Ticket #${selectedCall.scrId} resolved by ${user?.name}.`,
              to: targetUser, 
              screen: "/service_call?filter=Closed",
              read: false,
              createdAt: new Date().toISOString(),
              type: "success"
          });
      } catch (error) {}

      setDetailsModalVisible(false);
      
      Alert.alert(
          "Call Closed Successfully!", 
          "Do you want to share the Service Report PDF?",
          [
              { text: "No", style: 'cancel' },
              { text: "Yes, Share PDF", onPress: async () => { 
                  const finalData = { ...selectedCall, ...updateData };
                  await generateServicePDF(finalData);
              }}
          ]
      );

    } catch (error) { Alert.alert("Error", "Could not update status."); }
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
          <Text style={styles.footerText}>{item.date}</Text>
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
          {/* 🔥 CHANGED: 'Year' replaced with 'FY' */}
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
            <Ionicons name="search" size={20} color="gray" />
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
        contentContainerStyle={styles.contentContainer}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            <Ionicons name="construct-outline" size={60} color="#ddd" />
            <Text style={{ textAlign: 'center', marginTop: 10, color: 'gray' }}>No Data Found</Text>
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
                <DetailRow label="Date" value={selectedCall.date} icon="calendar" />
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

                    {/* 🔥 SHARE PDF BUTTON FOR CLOSED TICKETS */}
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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
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