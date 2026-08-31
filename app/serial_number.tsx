import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';

// 🔥 FILE SYSTEM IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// 🔥 SAAS IMPORTS (installations/organizations/service_calls/pms_reports/
// payments/dues/couriers still Firestore — out of scope until Phase 4/6/8)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Light Phase 3 patch: sales visits (Phase 2) and orders (Phase 3) now
// come from the new backend API. NOTE: order detail fields here (name,
// product, totalReceived, createdBy) don't map 1:1 to the new Order shape —
// those specific detail-modal lines may show blank/undefined until this
// screen gets a full rewrite in a later phase; the org-level financial
// totals and timeline dates/amounts are correct.
import { listSalesVisits } from '../services/api/salesVisits';
import { listOrders } from '../services/api/orders';

export default function SerialNumberScreen() {
  const router = useRouter();
  
  const { currentUser } = useData();

  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  const userRole = (currentUser?.role || '').toLowerCase().trim();
  const isFinanceRole = ['admin', 'manager', 'account', 'accountant', 'superadmin'].includes(userRole);

  const [searchType, setSearchType] = useState<'MACHINE' | 'ORGANIZATION'>('MACHINE');
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<'IDLE' | 'LIST' | 'DETAILS' | 'ORG_DETAILS'>('IDLE');
  
  const [installList, setInstallList] = useState<any[]>([]);
  const [orgList, setOrgList] = useState<any[]>([]);
  
  const [machineList, setMachineList] = useState<any[]>([]); 
  const [selectedMachine, setSelectedMachine] = useState<any>(null); 
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  
  const [timeline, setTimeline] = useState<any[]>([]);
  const [orgSummary, setOrgSummary] = useState({ installs: 0, services: 0, pms: 0, visits: 0, orders: 0, payments: 0, couriers: 0, dues: 0 });
  const [orgFinance, setOrgFinance] = useState({ totalValue: 0, totalReceived: 0, totalDues: 0 });

  const [activeTimelineFilter, setActiveTimelineFilter] = useState<'All' | 'Installation' | 'Service' | 'PMS' | 'Sales Visit' | 'Order' | 'Payment' | 'Due' | 'Courier'>('All');
  const [visibleCount, setVisibleCount] = useState(20);
  
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isDataFetching, setIsDataFetching] = useState(false);

  useEffect(() => {
      setVisibleCount(20);
      setActiveTimelineFilter('All');
  }, [viewMode, selectedOrg, selectedMachine]);

  // 🔥 3. LOAD CORE MASTERS ON MOUNT (Only Installs and Orgs for quick search)
  useEffect(() => {
      const loadInitialMasters = async () => {
          if (currentUser?.companyId) {
              setIsDataFetching(true);
              const [installs, orgs] = await Promise.all([
                  fetchSaaSData("installations"),
                  fetchSaaSData("organizations")
              ]);
              setInstallList(installs);
              setOrgList(orgs);
              setIsDataFetching(false);
          }
      };
      loadInitialMasters();
  }, [currentUser]);

  const handleSearchInput = (text: string) => {
      setSearchInput(text);
      if (text.length > 0) {
          const lowerText = text.toLowerCase();
          let matches: any[] = [];
          if (searchType === 'MACHINE') {
              matches = installList.filter((item: any) => 
                  (item.serialNo && item.serialNo.toLowerCase().includes(lowerText)) ||
                  (item.hospital && item.hospital.toLowerCase().includes(lowerText)) ||
                  (item.product && item.product.toLowerCase().includes(lowerText))
              ).slice(0, 5);
          } else {
              matches = orgList.filter((item: any) => 
                  (item.orgName && item.orgName.toLowerCase().includes(lowerText)) ||
                  (item.name && item.name.toLowerCase().includes(lowerText)) ||
                  (item.city && item.city.toLowerCase().includes(lowerText))
              ).slice(0, 5);
          }
          setSuggestions(matches);
          setShowSuggestions(true);
      } else {
          setSuggestions([]);
          setShowSuggestions(false);
          setViewMode('IDLE');
      }
  };

  const handleSelectSuggestion = (item: any) => {
      setShowSuggestions(false); 
      Keyboard.dismiss(); 
      if (searchType === 'MACHINE') {
          setSearchInput(item.serialNo); 
          openMachineHistory(item); 
      } else {
          setSearchInput(item.orgName || item.name);
          openHospitalKundali(item);
      }
  };

  const handleMasterSearch = () => {
      setShowSuggestions(false);
      Keyboard.dismiss();
      if (!searchInput.trim()) return;

      const lowerQuery = searchInput.toLowerCase().trim();
      if (searchType === 'MACHINE') {
          const directMatch = installList.find((item: any) => (item.serialNo || '').toLowerCase() === lowerQuery);
          if (directMatch) {
              openMachineHistory(directMatch);
          } else {
              const matches = installList.filter((item: any) => 
                  (item.hospital || '').toLowerCase().includes(lowerQuery) || 
                  (item.product || '').toLowerCase().includes(lowerQuery) ||
                  (item.serialNo || '').toLowerCase().includes(lowerQuery)
              );
              setMachineList(matches);
              setViewMode('LIST');
          }
      } else {
          const directOrg = orgList.find((item: any) => (item.orgName || item.name || '').toLowerCase().trim() === lowerQuery);
          if (directOrg) {
              openHospitalKundali(directOrg);
          } else {
              Alert.alert("Not Found", "Please select a valid organization from the suggestions.");
          }
      }
  };

  // 🔥 4. LOAD DEEP DATA FOR SPECIFIC MACHINE
  const openMachineHistory = async (machine: any) => {
      setSelectedMachine(machine);
      setIsDataFetching(true);
      
      const [serviceCalls, pmsReports] = await Promise.all([
          fetchSaaSData("service_calls"),
          fetchSaaSData("pms_reports")
      ]);

      const services = serviceCalls.filter((item: any) => item.serialNo?.toLowerCase() === machine.serialNo?.toLowerCase());
      const pms = pmsReports.filter((item: any) => item.serialNo?.toLowerCase() === machine.serialNo?.toLowerCase());

      const events = [
          {
              type: 'Installation',
              date: machine.dateIso || machine.date || machine.createdAt,
              title: 'Machine Installed',
              desc: `Model: ${machine.model || '-'} | By: ${machine.engineer || machine.senderName || 'Unknown'}`,
              status: 'Installed',
              icon: 'checkmark-circle',
              color: '#4caf50',
              rawData: machine
          },
          ...services.map((s: any) => ({
              type: 'Service',
              date: s.dateIso || s.date || s.createdAt,
              title: s.status === 'Open' ? 'Ticket Raised' : 'Service Done',
              desc: s.remark || s.resolutionNote || 'No details',
              status: s.status,
              icon: 'construct',
              color: s.status === 'Resolved' || s.status === 'Closed' ? '#388e3c' : '#d32f2f',
              rawData: s
          })),
          ...pms.map((p: any) => ({
              type: 'PMS',
              date: p.lastDoneDate || p.dateIso || p.date || p.createdAt,
              title: `PMS (${p.currentPmsNumber}/${p.totalPms})`,
              desc: p.remarks || p.remark || 'Routine checkup',
              status: p.status,
              icon: 'sync-circle',
              color: '#8e44ad',
              rawData: p
          }))
      ];
      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setTimeline(events);
      setIsDataFetching(false);
      setViewMode('DETAILS');
  };

  // 🔥 5. LOAD DEEP DATA FOR SPECIFIC HOSPITAL/ORG
  const openHospitalKundali = async (org: any) => {
      Keyboard.dismiss();
      setSelectedOrg(org);
      setIsDataFetching(true);
      
      const [services, pmsData, visits, orders, payments, dues, couriers] = await Promise.all([
          fetchSaaSData("service_calls"),
          fetchSaaSData("pms_reports"),
          listSalesVisits(),  // was: fetchSaaSData("sales_reports")
          listOrders(),       // was: fetchSaaSData("orders")
          fetchSaaSData("payments"),
          fetchSaaSData("dues"), // Make sure your context uses 'dues' collection
          fetchSaaSData("couriers")
      ]);
      
      const orgId = String(org.id || '').trim(); 
      const orgNameClean = (org.orgName || org.name || '').toLowerCase().trim();

      const matchOrg = (item: any) => {
          if (!item) return false;
          if (item.orgId && String(item.orgId).trim() === orgId) return true;
          if (item.hospitalId && String(item.hospitalId).trim() === orgId) return true;
          
          const possibleNames = [
              item.client, item.clientName, item.orgName, item.hospital, 
              item.hospitalName, item.partyName, item.name, item.customerName, 
              item.to, item.receiverName, item.receiver
          ];
          
          if (possibleNames.some(n => n && String(n).toLowerCase().trim() === orgNameClean)) return true;
          if (orgNameClean.length > 3) {
              if (possibleNames.some(n => n && String(n).toLowerCase().includes(orgNameClean))) return true;
          }
          return false;
      };

      const matchedInstalls = installList.filter(matchOrg);
      const matchedServices = services.filter(matchOrg);
      const matchedPms = pmsData.filter(matchOrg);
      const matchedVisits = visits.filter(matchOrg);
      const matchedOrders = orders.filter(matchOrg);
      const matchedPayments = payments.filter(matchOrg);
      const matchedDues = dues.filter(matchOrg);
      const matchedCouriers = couriers.filter(matchOrg);

      let tValue = 0; let tReceived = 0; let tDues = 0;
      matchedOrders.forEach((o: any) => tValue += Number(o.totalValue || o.orderValue || o.amount) || 0);
      matchedPayments.forEach((p: any) => tReceived += Number(p.amount || p.receivedAmount) || 0);
      matchedDues.forEach((d: any) => tDues += Number(d.balance !== undefined ? d.balance : (d.dueAmount || d.amount || 0)));
      
      setOrgFinance({ totalValue: tValue, totalReceived: tReceived, totalDues: tDues });

      setOrgSummary({
          installs: matchedInstalls.length, services: matchedServices.length, pms: matchedPms.length, visits: matchedVisits.length,
          orders: matchedOrders.length, payments: matchedPayments.length, couriers: matchedCouriers.length, dues: matchedDues.length
      });

      const events = [
          ...matchedOrders.map((o: any) => ({
              type: 'Order',
              date: o.dateIso || o.createdAt || o.date || new Date().toISOString(),
              title: `Order: ${o.name || o.product || 'New Order'}`,
              desc: isFinanceRole ? `Value: ₹${(Number(o.totalValue || o.orderValue || o.amount) || 0).toLocaleString()}` : 'Order Placed',
              status: o.status || 'Confirmed',
              icon: 'cart',
              color: '#8e24aa', 
              rawData: o
          })),
          ...matchedPayments.map((pay: any) => ({
              type: 'Payment',
              date: pay.dateIso || pay.date || pay.paymentDate || new Date().toISOString(),
              title: `Payment Recd: ₹${(Number(pay.amount || pay.receivedAmount) || 0).toLocaleString()}`,
              desc: `Mode: ${pay.mode || pay.paymentMode || 'N/A'}\nNote: ${pay.note || pay.remark || '-'}`,
              status: 'Received',
              icon: 'cash',
              color: '#00897b', 
              rawData: pay
          })),
          ...matchedDues.map((due: any) => {
              const pendingBalance = due.balance !== undefined ? Number(due.balance) : Number(due.dueAmount || due.amount || 0);
              return {
                  type: 'Due',
                  date: due.dueDate || due.dateIso || due.date || due.createdAt || new Date().toISOString(),
                  title: `Pending Due: ₹${pendingBalance.toLocaleString()}`,
                  desc: `Original Bill: ₹${Number(due.amount || 0).toLocaleString()}`,
                  status: due.status || 'Pending',
                  icon: 'alert-circle',
                  color: pendingBalance > 0 ? '#d32f2f' : '#388e3c', 
                  rawData: due
              };
          }),
          ...matchedCouriers.map((item: any) => ({
              type: 'Courier',
              date: item.dateIso || item.date || item.dispatchDate || item.createdAt || new Date().toISOString(),
              title: `Courier: ${item.courierName || item.name || 'Dispatch'}`,
              desc: `Docket: ${item.docketNo || item.trackingNo || 'N/A'}\nQty: ${item.qty || 1}`,
              status: item.status || 'Dispatched',
              icon: 'cube',
              color: item.status === 'Delivered' ? '#2e7d32' : '#f57c00', 
              rawData: item
          })),
          ...matchedInstalls.map((i: any) => ({
              type: 'Installation',
              date: i.dateIso || i.date || i.createdAt || new Date().toISOString(),
              title: `Install: ${i.product || i.productName}`,
              desc: `S/N: ${i.serialNo}\nBy: ${i.engineer || i.senderName}`,
              status: 'Installed',
              icon: 'checkmark-done-circle',
              color: '#2e7d32', 
              rawData: i
          })),
          ...matchedServices.map((s: any) => ({
              type: 'Service',
              date: s.dateIso || s.date || s.createdAt || new Date().toISOString(),
              title: `Service: ${s.machine || 'Machine'}`,
              desc: `S/N: ${s.serialNo || 'N/A'}\nIssue: ${s.remark || 'N/A'}\nBy: ${s.senderName || 'Unknown'}`,
              status: s.status || 'Open',
              icon: 'construct',
              color: '#c62828', 
              rawData: s
          })),
          ...matchedPms.map((p: any) => ({
              type: 'PMS',
              date: p.lastDoneDate || p.dateIso || p.date || p.createdAt || new Date().toISOString(),
              title: `PMS: ${p.machine || 'Machine'}`,
              desc: `S/N: ${p.serialNo || 'N/A'}\nCycle: ${p.currentPmsNumber}/${p.totalPms}\nBy: ${p.senderName || 'Unknown'}`,
              status: p.status || 'Pending',
              icon: 'sync',
              color: '#1565c0', 
              rawData: p
          })),
          ...matchedVisits.map((v: any) => ({
              type: 'Sales Visit',
              date: v.dateIso || v.date || v.createdAt || new Date().toISOString(),
              title: `Visit by ${v.senderName || 'Unknown'}`,
              desc: `Met: ${v.person || 'N/A'}\nNote: ${v.discussion ? v.discussion.split('\n')[0] : 'N/A'}`,
              status: v.outcome || 'Visited',
              icon: 'walk',
              color: '#f57c00', 
              rawData: v
          }))
      ];

      const secureEvents = isFinanceRole ? events : events.filter(e => !['Order', 'Payment', 'Due'].includes(e.type));
      secureEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setTimeline(secureEvents);
      setIsDataFetching(false);
      setViewMode('ORG_DETAILS');
  };

  const getWarrantyStatus = (expiryDate: string) => {
      if (!expiryDate) return { label: 'Unknown Warranty', color: 'gray', bg: '#eee' };
      const today = new Date();
      today.setHours(0,0,0,0);
      const expiry = new Date(expiryDate);
      expiry.setHours(0,0,0,0);
      if (expiry > today) return { label: 'Active Warranty', color: '#4caf50', bg: '#e8f5e9' };
      return { label: 'Warranty Expired', color: '#d32f2f', bg: '#ffebee' };
  };

  const switchSearchType = (type: 'MACHINE' | 'ORGANIZATION') => {
      setSearchType(type);
      setSearchInput('');
      setSuggestions([]);
      setShowSuggestions(false);
      setViewMode('IDLE');
  };

  const toggleTimelineFilter = (type: any) => {
      setActiveTimelineFilter(prev => prev === type ? 'All' : type);
      setVisibleCount(20);
  };

  const filteredTimeline = timeline.filter(item => activeTimelineFilter === 'All' || item.type === activeTimelineFilter);
  const renderedTimeline = filteredTimeline.slice(0, visibleCount);

  const openEventDetails = (event: any) => {
      setSelectedEvent(event);
      setDetailModalVisible(true);
  };

  const exportToExcel = async () => {
    try {
      if (filteredTimeline.length === 0) {
        Alert.alert("Empty", "No records found to export.");
        return;
      }

      let csvString = "\uFEFFDate,Type,Title,Status,Amount_Value,Assigned_AddedBy,SerialNo_Docket,Model_Machine,Extra_Details,Description\n";
      
      filteredTimeline.forEach(item => {
        const date = item.date ? new Date(item.date).toLocaleDateString('en-GB') : '-';
        const type = item.type || '-';
        const title = (item.title || '-').replace(/,/g, ' ').replace(/"/g, '""');
        const status = (item.status || '-').replace(/,/g, ' ');
        
        let value = '-';
        if (['Payment', 'Due', 'Order'].includes(item.type) && isFinanceRole) {
          value = item.rawData?.balance !== undefined ? item.rawData?.balance : (item.rawData?.amount || item.rawData?.totalValue || '-');
        } else if (item.type === 'Courier') {
          value = item.rawData?.qty || '1';
        }

        let assignedTo = (item.rawData?.assignedToName || item.rawData?.engineer || item.rawData?.userName || item.rawData?.senderName || item.rawData?.addedBy || item.rawData?.createdBy || '-').replace(/,/g, ' ');
        let serialOrDocket = (item.rawData?.serialNo || item.rawData?.docketNo || item.rawData?.trackingNo || '-').replace(/,/g, ' ');
        let machineModel = (item.rawData?.product || item.rawData?.productName || item.rawData?.machine || item.rawData?.model || '-').replace(/,/g, ' ');
        
        let extraInfo = '-';
        if (item.type === 'Service') extraInfo = `Resolution: ${item.rawData?.resolutionNote || 'Pending'}`;
        else if (item.type === 'PMS') extraInfo = `Cycle: ${item.rawData?.currentPmsNumber}/${item.rawData?.totalPms}`;
        else if (item.type === 'Courier') extraInfo = `Delivery: ${item.rawData?.deliveryDate ? new Date(item.rawData.deliveryDate).toLocaleDateString('en-GB') : 'Pending'}`;
        else if (item.type === 'Sales Visit') extraInfo = `Met: ${item.rawData?.person || 'N/A'} (${item.rawData?.designation || 'N/A'})`;
        else if (item.type === 'Installation') extraInfo = `Warranty Expiry: ${item.rawData?.warrantyExpiry || 'N/A'}`;
        else if (item.type === 'Due') extraInfo = `Original Bill: ${item.rawData?.amount || 'N/A'}`;
        else if (item.type === 'Order') extraInfo = `Received: ${item.rawData?.totalReceived || '0'}`;

        extraInfo = extraInfo.replace(/,/g, ' ').replace(/\n/g, ' | ').replace(/"/g, '""');
        const desc = (item.desc || '').replace(/,/g, ' ').replace(/\n/g, ' | ').replace(/"/g, '""');
        
        csvString += `"${date}","${type}","${title}","${status}","${value}","${assignedTo}","${serialOrDocket}","${machineModel}","${extraInfo}","${desc}"\n`;
      });

      const rawName = viewMode === 'DETAILS' ? selectedMachine?.serialNo : (selectedOrg?.orgName || selectedOrg?.name);
      const safeName = (rawName || 'Report').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `${safeName}_${Date.now()}.csv`;
      
      const uri = FileSystem.cacheDirectory + fileName;

      await FileSystem.writeAsStringAsync(uri, csvString, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Download Detailed Report'
      });

    } catch (error: any) {
      console.error("Export Error:", error);
      Alert.alert("Error", error.message);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={() => { setShowSuggestions(false); Keyboard.dismiss(); }}>
        <View style={styles.container}>
        
        <View style={styles.header}>
            <TouchableOpacity onPress={() => ['DETAILS', 'ORG_DETAILS'].includes(viewMode) ? setViewMode('IDLE') : router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
                {viewMode === 'DETAILS' ? 'Machine History' : viewMode === 'ORG_DETAILS' ? 'Organization Record' : 'Universal Tracker'}
            </Text>
            {isDataFetching ? <ActivityIndicator size="small" color="#333" /> : <View style={{width:24}} />}
        </View>

        {!['DETAILS', 'ORG_DETAILS'].includes(viewMode) && (
            <View style={styles.toggleContainer}>
                <TouchableOpacity style={[styles.toggleBtn, searchType === 'MACHINE' && styles.activeToggle]} onPress={() => switchSearchType('MACHINE')}>
                    <Ionicons name="barcode-outline" size={16} color={searchType === 'MACHINE' ? 'white' : '#555'} />
                    <Text style={[styles.toggleText, searchType === 'MACHINE' && {color:'white'}]}> Machine Serial</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toggleBtn, searchType === 'ORGANIZATION' && styles.activeToggle]} onPress={() => switchSearchType('ORGANIZATION')}>
                    <Ionicons name="business-outline" size={16} color={searchType === 'ORGANIZATION' ? 'white' : '#555'} />
                    <Text style={[styles.toggleText, searchType === 'ORGANIZATION' && {color:'white'}]}> Organization Name</Text>
                </TouchableOpacity>
            </View>
        )}

        {!['DETAILS', 'ORG_DETAILS'].includes(viewMode) && (
            <View style={{zIndex: 10}}> 
                <View style={styles.searchSection}>
                    <Text style={styles.label}>Enter {searchType === 'MACHINE' ? 'Serial Number' : 'Org Name'}</Text>
                    <View style={styles.searchBox}>
                        <TextInput 
                            style={styles.input}
                            placeholder="Start typing..."
                            value={searchInput}
                            onChangeText={handleSearchInput}
                            onSubmitEditing={handleMasterSearch}
                        />
                        <TouchableOpacity style={styles.searchBtn} onPress={handleMasterSearch}>
                            <Ionicons name="search" size={20} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>

                {showSuggestions && suggestions.length > 0 && (
                    <View style={styles.suggestionList}>
                        {suggestions.map((item, index) => (
                            <TouchableOpacity key={index} style={styles.suggestionItem} onPress={() => handleSelectSuggestion(item)}>
                                <Ionicons name={searchType === 'MACHINE' ? "barcode-outline" : "business"} size={18} color="gray" />
                                <View style={{marginLeft: 10}}>
                                    <Text style={styles.sugSerial}>{searchType === 'MACHINE' ? item.serialNo : (item.orgName || item.name)}</Text>
                                    <Text style={styles.sugText}>{searchType === 'MACHINE' ? `${item.hospital} - ${item.product}` : `${item.city}`}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>
        )}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            
            {viewMode === 'IDLE' && (
                <View style={styles.centerState}>
                    <Ionicons name={searchType === 'MACHINE' ? "search" : "business"} size={60} color="#ddd" />
                    <Text style={{color:'gray', marginTop:10, textAlign:'center'}}>Type above to find history</Text>
                </View>
            )}

            {viewMode === 'LIST' && (
                <View>
                    <Text style={styles.sectionHeader}>Found {machineList.length} Machine(s)</Text>
                    {machineList.map((item, index) => (
                        <TouchableOpacity key={index} style={styles.listItem} onPress={() => openMachineHistory(item)}>
                            <View style={styles.listIcon}><Ionicons name="medical" size={24} color="#3b5998" /></View>
                            <View style={{flex:1}}>
                                <Text style={styles.listTitle}>{item.product}</Text>
                                <Text style={styles.listSub}>{item.hospital}</Text>
                                <Text style={styles.listSerial}>S/N: {item.serialNo}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#ccc" />
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {viewMode === 'DETAILS' && selectedMachine && (
                <>
                    <View style={styles.machineCard}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <View style={styles.iconBox}><Ionicons name="hardware-chip-outline" size={30} color="#3b5998" /></View>
                            <View style={{flex:1, marginLeft:15}}>
                                <Text style={styles.machineName}>{selectedMachine.product}</Text>
                                <Text style={styles.serialText}>S/N: {selectedMachine.serialNo}</Text>
                            </View>
                            <TouchableOpacity onPress={exportToExcel} style={styles.downloadBtn}><Ionicons name="download-outline" size={24} color="#1565c0" /></TouchableOpacity>
                        </View>
                        <View style={styles.divider} />
                        <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                            <View style={{flex:1}}><Text style={styles.infoLabel}>Organization</Text><Text style={styles.infoValue}>{selectedMachine.hospital}</Text></View>
                            <View style={{alignItems:'flex-end'}}><Text style={styles.infoLabel}>Warranty Till</Text><Text style={styles.infoValue}>{selectedMachine.warrantyExpiry || 'N/A'}</Text></View>
                        </View>
                    </View>

                    <View style={styles.timelineContainer}>
                        {renderedTimeline.map((item, index) => (
                            <TouchableOpacity key={index} style={styles.timelineItem} onPress={() => openEventDetails(item)}>
                                <View style={styles.timelineLeft}>
                                    <View style={[styles.dot, {backgroundColor: item.color}]}><Ionicons name={item.icon as any} size={12} color="white" /></View>
                                    {index !== renderedTimeline.length - 1 && <View style={styles.line} />}
                                </View>
                                <View style={[styles.timelineContent, {borderLeftWidth: 3, borderLeftColor: item.color}]}>
                                    <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                        <Text style={styles.eventTitle}>{item.title}</Text>
                                        <Text style={styles.eventDate}>{item.date ? new Date(item.date).toLocaleDateString('en-GB') : '-'}</Text>
                                    </View>
                                    <Text style={styles.eventDesc}>{item.desc}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </>
            )}

            {viewMode === 'ORG_DETAILS' && selectedOrg && (
                <>
                    <View style={styles.machineCard}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <View style={[styles.iconBox, {backgroundColor:'#e8f5e9'}]}><Ionicons name="business" size={30} color="#2e7d32" /></View>
                            <View style={{flex:1, marginLeft:15}}>
                                <Text style={styles.machineName}>{selectedOrg.orgName || selectedOrg.name}</Text>
                                <Text style={styles.serialText}>📍 {selectedOrg.city}</Text>
                            </View>
                            <TouchableOpacity onPress={exportToExcel} style={[styles.downloadBtn, {backgroundColor:'#e8f5e9'}]}><Ionicons name="download-outline" size={24} color="#2e7d32" /></TouchableOpacity>
                        </View>
                        <View style={styles.divider} />
                        <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                            <View><Text style={styles.infoLabel}>Contact</Text><Text style={styles.infoValue}>{selectedOrg.contactPerson || 'N/A'}</Text></View>
                            <View style={{alignItems:'flex-end'}}><Text style={styles.infoLabel}>Mobile</Text><Text style={styles.infoValue}>{selectedOrg.mobile || 'N/A'}</Text></View>
                        </View>
                    </View>

                    {isFinanceRole && (
                        <View style={styles.financeCard}>
                            <Text style={styles.financeCardLabel}>Financial Overview</Text>
                            <View style={styles.divider} />
                            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                                <View><Text style={styles.infoLabel}>Total Orders</Text><Text style={[styles.infoValue, {color: '#1565c0'}]}>₹ {orgFinance.totalValue.toLocaleString()}</Text></View>
                                <View style={{alignItems: 'flex-end'}}><Text style={styles.infoLabel}>Total Received</Text><Text style={[styles.infoValue, {color: '#2e7d32'}]}>₹ {orgFinance.totalReceived.toLocaleString()}</Text></View>
                            </View>
                            <View style={[styles.balanceBox, { backgroundColor: orgFinance.totalDues > 0 ? '#ffebee' : '#e8f5e9' }]}>
                                <Text style={{fontWeight: 'bold', color: orgFinance.totalDues > 0 ? '#c62828' : '#2e7d32'}}>
                                    Due Balance: ₹ {orgFinance.totalDues.toLocaleString()}
                                </Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.summaryRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {isFinanceRole && (
                                <>
                                    <TouchableOpacity style={[styles.sumCard, {backgroundColor: '#f3e5f5'}, activeTimelineFilter === 'Order' && styles.activeSumCard]} onPress={() => toggleTimelineFilter('Order')}>
                                        <Text style={styles.sumVal}>{orgSummary.orders}</Text><Text style={styles.sumLabel}>Orders</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.sumCard, {backgroundColor: '#e0f2f1'}, activeTimelineFilter === 'Payment' && styles.activeSumCard]} onPress={() => toggleTimelineFilter('Payment')}>
                                        <Text style={styles.sumVal}>{orgSummary.payments}</Text><Text style={styles.sumLabel}>Payments</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.sumCard, {backgroundColor: '#ffebee'}, activeTimelineFilter === 'Due' && styles.activeSumCard]} onPress={() => toggleTimelineFilter('Due')}>
                                        <Text style={styles.sumVal}>{orgSummary.dues}</Text><Text style={styles.sumLabel}>Dues</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                            <TouchableOpacity style={[styles.sumCard, {backgroundColor: '#fff3e0'}, activeTimelineFilter === 'Courier' && styles.activeSumCard]} onPress={() => toggleTimelineFilter('Courier')}>
                                <Text style={styles.sumVal}>{orgSummary.couriers}</Text><Text style={styles.sumLabel}>Couriers</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.sumCard, {backgroundColor: '#e8f5e9'}, activeTimelineFilter === 'Installation' && styles.activeSumCard]} onPress={() => toggleTimelineFilter('Installation')}>
                                <Text style={styles.sumVal}>{orgSummary.installs}</Text><Text style={styles.sumLabel}>Installs</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.sumCard, {backgroundColor: '#ffebee'}, activeTimelineFilter === 'Service' && styles.activeSumCard]} onPress={() => toggleTimelineFilter('Service')}>
                                <Text style={styles.sumVal}>{orgSummary.services}</Text><Text style={styles.sumLabel}>Services</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.sumCard, {backgroundColor: '#e3f2fd'}, activeTimelineFilter === 'PMS' && styles.activeSumCard]} onPress={() => toggleTimelineFilter('PMS')}>
                                <Text style={styles.sumVal}>{orgSummary.pms}</Text><Text style={styles.sumLabel}>PMS</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.sumCard, {backgroundColor: '#fce4ec'}, activeTimelineFilter === 'Sales Visit' && styles.activeSumCard]} onPress={() => toggleTimelineFilter('Sales Visit')}>
                                <Text style={styles.sumVal}>{orgSummary.visits}</Text><Text style={styles.sumLabel}>Visits</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>

                    <View style={styles.timelineContainer}>
                        {renderedTimeline.map((item, index) => (
                            <TouchableOpacity key={index} style={styles.timelineItem} onPress={() => openEventDetails(item)}>
                                <View style={styles.timelineLeft}>
                                    <View style={[styles.dot, {backgroundColor: item.color}]}><Ionicons name={item.icon as any} size={12} color="white" /></View>
                                    {index !== renderedTimeline.length - 1 && <View style={styles.line} />}
                                </View>
                                <View style={[styles.timelineContent, {borderLeftWidth: 3, borderLeftColor: item.color}]}>
                                    <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                        <Text style={styles.eventTitle}>{item.title}</Text>
                                        <Text style={styles.eventDate}>{item.date ? new Date(item.date).toLocaleDateString('en-GB') : '-'}</Text>
                                    </View>
                                    <Text style={styles.eventDesc} numberOfLines={2}>{item.desc}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {visibleCount < filteredTimeline.length && (
                        <TouchableOpacity onPress={() => setVisibleCount(prev => prev + 20)} style={styles.loadMoreBtn}>
                            <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records</Text>
                        </TouchableOpacity>
                    )}
                </>
            )}
            
            <View style={{height: 100}} />
        </ScrollView>

        {/* 🔥 EXPANDED MODAL FOR DETAILED VIEW */}
        <Modal visible={detailModalVisible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.detailCard}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                        <Text style={{fontSize:18, fontWeight:'bold', color: selectedEvent?.color}}>{selectedEvent?.type} Details</Text>
                        <TouchableOpacity onPress={() => setDetailModalVisible(false)}><Ionicons name="close-circle" size={28} color="#d32f2f" /></TouchableOpacity>
                    </View>
                    
                    {selectedEvent && selectedEvent.rawData && (
                        <ScrollView showsVerticalScrollIndicator={false} style={{maxHeight: 400}}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 10}}>
                                <Text style={{fontWeight:'bold', fontSize:14}}>{selectedEvent.date ? new Date(selectedEvent.date).toLocaleDateString('en-GB') : '-'}</Text>
                                <View style={{backgroundColor: selectedEvent.color + '20', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10}}>
                                    <Text style={{fontWeight:'bold', color: selectedEvent.color, fontSize: 12}}>{selectedEvent.status}</Text>
                                </View>
                            </View>

                            {/* CONDITIONAL RENDERING BASED ON EVENT TYPE */}
                            {selectedEvent.type === 'Order' && (
                                <>
                                    <DetailRow label="Product/Name" value={selectedEvent.rawData.name || selectedEvent.rawData.product || selectedEvent.rawData.productDetails} />
                                    {isFinanceRole && (
                                        <>
                                            <DetailRow label="Order Value" value={`₹ ${Number(selectedEvent.rawData.totalValue || selectedEvent.rawData.orderValue || selectedEvent.rawData.amount || 0).toLocaleString()}`} />
                                            <DetailRow label="Amount Received" value={`₹ ${Number(selectedEvent.rawData.totalReceived || selectedEvent.rawData.advanceAmount || 0).toLocaleString()}`} />
                                            <DetailRow label="Pending Balance" value={`₹ ${Number(selectedEvent.rawData.balance ?? ((selectedEvent.rawData.totalValue || 0) - (selectedEvent.rawData.totalReceived || 0))).toLocaleString()}`} />
                                        </>
                                    )}
                                    <DetailRow label="Created By" value={selectedEvent.rawData.createdBy || selectedEvent.rawData.senderName} />
                                    <DetailRow label="Client / Location" value={`${selectedEvent.rawData.client || selectedEvent.rawData.hospital || selectedEvent.rawData.hospitalName} (${selectedEvent.rawData.location || selectedEvent.rawData.city || 'N/A'})`} />
                                </>
                            )}
                            
                            {selectedEvent.type === 'Payment' && (
                                <>
                                    <DetailRow label="Amount Received" value={`₹ ${Number(selectedEvent.rawData.amount || selectedEvent.rawData.receivedAmount || 0).toLocaleString()}`} />
                                    <DetailRow label="Payment Mode" value={selectedEvent.rawData.mode || selectedEvent.rawData.paymentMode} />
                                    <DetailRow label="Added By" value={selectedEvent.rawData.addedBy || selectedEvent.rawData.senderName} />
                                    <View style={styles.infoBox}><Text style={styles.infoLabel}>Note:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.note || selectedEvent.rawData.remark || '-'}</Text></View>
                                </>
                            )}

                            {selectedEvent.type === 'Due' && (
                                <>
                                    <DetailRow label="Pending Amount" value={`₹ ${Number(selectedEvent.rawData.balance !== undefined ? selectedEvent.rawData.balance : (selectedEvent.rawData.dueAmount || selectedEvent.rawData.amount || 0)).toLocaleString()}`} />
                                    <DetailRow label="Original Bill" value={`₹ ${Number(selectedEvent.rawData.amount || 0).toLocaleString()}`} />
                                    <DetailRow label="Expected Due Date" value={selectedEvent.rawData.dueDate ? new Date(selectedEvent.rawData.dueDate).toLocaleDateString('en-GB') : '-'} />
                                    <DetailRow label="Added By" value={selectedEvent.rawData.addedBy || selectedEvent.rawData.senderName} />
                                    <View style={styles.infoBox}><Text style={styles.infoLabel}>Note:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.note || selectedEvent.rawData.remark || '-'}</Text></View>
                                </>
                            )}

                            {selectedEvent.type === 'Courier' && (
                                <>
                                    <DetailRow label="Item Name" value={selectedEvent.rawData.name || selectedEvent.rawData.itemName} />
                                    <DetailRow label="Quantity" value={selectedEvent.rawData.qty || '1'} />
                                    <DetailRow label="Courier Partner" value={selectedEvent.rawData.courierName || 'N/A'} />
                                    <DetailRow label="Docket/Tracking No" value={selectedEvent.rawData.docketNo || selectedEvent.rawData.trackingNo || 'N/A'} />
                                    <DetailRow label="Delivery Mode" value={selectedEvent.rawData.deliveryMode || 'Pending'} />
                                    <DetailRow label="Delivery Date" value={selectedEvent.rawData.deliveryDate ? new Date(selectedEvent.rawData.deliveryDate).toLocaleDateString('en-GB') : '-'} />
                                </>
                            )}

                            {selectedEvent.type === 'Installation' && (
                                <>
                                    <DetailRow label="Machine Name" value={selectedEvent.rawData.product || selectedEvent.rawData.productName} />
                                    <DetailRow label="Machine Model" value={selectedEvent.rawData.model || 'N/A'} />
                                    <DetailRow label="Serial Number" value={selectedEvent.rawData.serialNo} />
                                    <DetailRow label="Installed By" value={selectedEvent.rawData.engineer || selectedEvent.rawData.senderName} />
                                    <DetailRow label="Department" value={selectedEvent.rawData.department || 'N/A'} />
                                    <DetailRow label="Warranty Expiry" value={selectedEvent.rawData.warrantyExpiry || 'N/A'} />
                                    <View style={styles.infoBox}><Text style={styles.infoLabel}>Remarks:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.note || '-'}</Text></View>
                                </>
                            )}

                            {selectedEvent.type === 'Service' && (
                                <>
                                    <DetailRow label="Ticket ID" value={selectedEvent.rawData.scrId || selectedEvent.rawData.id} />
                                    <DetailRow label="Machine / Model" value={`${selectedEvent.rawData.machine || 'N/A'} / ${selectedEvent.rawData.model || 'N/A'}`} />
                                    <DetailRow label="Serial Number" value={selectedEvent.rawData.serialNo || 'N/A'} />
                                    <DetailRow label="Assigned To" value={selectedEvent.rawData.assignedToName || selectedEvent.rawData.senderName} />
                                    <View style={[styles.infoBox, {backgroundColor: '#ffebee'}]}><Text style={styles.infoLabel}>Customer Complaint:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.remark || 'N/A'}</Text></View>
                                    <View style={[styles.infoBox, {backgroundColor: '#e8f5e9'}]}><Text style={styles.infoLabel}>Resolution / Action Taken:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.resolutionNote || 'Pending'}</Text></View>
                                </>
                            )}

                            {selectedEvent.type === 'PMS' && (
                                <>
                                    <DetailRow label="Machine Name" value={selectedEvent.rawData.machine || 'N/A'} />
                                    <DetailRow label="Serial Number" value={selectedEvent.rawData.serialNo || 'N/A'} />
                                    <DetailRow label="Attended By" value={selectedEvent.rawData.userName || selectedEvent.rawData.senderName} />
                                    <DetailRow label="PMS Cycle" value={`Cycle ${selectedEvent.rawData.currentPmsNumber} out of ${selectedEvent.rawData.totalPms}`} />
                                    <DetailRow label="Next Due Date" value={selectedEvent.rawData.computedDueDate || selectedEvent.rawData.nextServiceDate || 'N/A'} />
                                    <View style={styles.infoBox}><Text style={styles.infoLabel}>Engineer's Report:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.remarks || selectedEvent.rawData.remark || 'No remarks provided.'}</Text></View>
                                </>
                            )}

                            {selectedEvent.type === 'Sales Visit' && (
                                <>
                                    <DetailRow label="Executive Name" value={selectedEvent.rawData.senderName} />
                                    <DetailRow label="Person Met" value={selectedEvent.rawData.person || 'N/A'} />
                                    <DetailRow label="Designation" value={selectedEvent.rawData.designation || 'N/A'} />
                                    <DetailRow label="Visit Purpose" value={selectedEvent.rawData.purpose || 'N/A'} />
                                    <DetailRow label="Outcome" value={selectedEvent.rawData.outcome || 'N/A'} />
                                    <View style={styles.infoBox}><Text style={styles.infoLabel}>Discussion Notes:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.discussion || 'No notes.'}</Text></View>
                                </>
                            )}

                            <View style={{height: 20}} />
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
        </View>
    </TouchableWithoutFeedback>
  );
}

const DetailRow = ({label, value}: any) => (
    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:8, borderBottomWidth:1, borderBottomColor:'#f0f0f0', paddingBottom:5}}>
        <Text style={{color:'gray', fontSize: 12, flex: 0.4}}>{label}</Text>
        <Text style={{fontWeight:'bold', fontSize: 13, color:'#333', flex: 0.6, textAlign: 'right'}}>{value || '-'}</Text>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 0, zIndex: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  toggleContainer: { flexDirection: 'row', backgroundColor: 'white', paddingHorizontal: 15, paddingBottom: 10, elevation: 2 },
  toggleBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderWidth: 1, borderColor: '#eee', backgroundColor: '#f9f9f9' },
  activeToggle: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
  toggleText: { fontSize: 13, fontWeight: 'bold', color: '#555' },
  searchSection: { padding: 15, backgroundColor: 'white', borderBottomLeftRadius: 15, borderBottomRightRadius: 15, elevation: 3, marginBottom:10 },
  label: { fontWeight: '600', color: '#555', marginBottom: 8, fontSize: 13 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 10, overflow: 'hidden', borderWidth:1, borderColor:'#e0e0e0' },
  input: { flex: 1, padding: 10, fontSize: 15, color: '#333' },
  searchBtn: { backgroundColor: '#3b5998', padding: 12, alignItems: 'center', justifyContent: 'center', width: 50 },
  suggestionList: { position: 'absolute', top: 120, left: 15, right: 15, backgroundColor: 'white', borderRadius: 10, elevation: 10, maxHeight: 220, zIndex: 999 },
  suggestionItem: { flexDirection:'row', alignItems:'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  sugSerial: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
  sugText: { color: 'gray', fontSize: 12 },
  content: { padding: 15 },
  centerState: { alignItems: 'center', marginTop: 50 },
  sectionHeader: { fontSize: 15, fontWeight: 'bold', color: '#555', marginBottom: 15 },
  listItem: { flexDirection:'row', alignItems:'center', backgroundColor:'white', padding:15, borderRadius:10, marginBottom:10, elevation:1 },
  listIcon: { width:40, height:40, backgroundColor:'#e3f2fd', borderRadius:20, justifyContent:'center', alignItems:'center', marginRight:15 },
  listTitle: { fontWeight:'bold', fontSize:15, color:'#333' },
  listSub: { color:'gray', fontSize:12 },
  listSerial: { color:'#3b5998', fontWeight:'bold', fontSize:11 },
  machineCard: { backgroundColor: 'white', borderRadius: 12, padding: 20, elevation: 3, marginBottom: 20 },
  financeCard: { backgroundColor: 'white', borderRadius: 12, padding: 15, elevation: 2, marginBottom: 20, borderWidth: 1, borderColor: '#bbdefb' },
  financeCardLabel: { fontSize: 14, color: '#1565c0', fontWeight: 'bold', textTransform: 'uppercase' },
  balanceBox: { marginTop: 10, padding: 10, borderRadius: 8, alignItems: 'center' },
  downloadBtn: { padding: 8, backgroundColor: '#e3f2fd', borderRadius: 8 },
  iconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#e3f2fd', justifyContent: 'center', alignItems: 'center' },
  machineName: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  serialText: { color: 'gray', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  infoLabel: { fontSize: 11, color: 'gray' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  summaryRow: { flexDirection: 'row', marginBottom: 20 },
  sumCard: { width: 80, alignItems: 'center', paddingVertical: 12, borderRadius: 10, marginRight: 10, elevation: 1, borderWidth: 2, borderColor: 'transparent' },
  activeSumCard: { borderColor: '#3b5998' }, 
  sumVal: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  sumLabel: { fontSize: 10, color: '#555', fontWeight: '600' },
  timelineContainer: { paddingLeft: 5 },
  timelineItem: { flexDirection: 'row' },
  timelineLeft: { alignItems: 'center', width: 30, marginRight: 10 },
  dot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  line: { width: 2, backgroundColor: '#ddd', flex: 1 },
  timelineContent: { flex: 1, backgroundColor: 'white', borderRadius: 8, padding: 12, marginBottom: 15, elevation: 1 },
  eventTitle: { fontWeight: 'bold', fontSize: 13, color: '#333' },
  eventDate: { fontSize: 11, color: 'gray' },
  eventDesc: { fontSize: 12, color: '#555', marginTop: 5 },
  loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  newSearchBtn: { alignSelf:'center', marginTop:15, padding:10, backgroundColor: '#e3f2fd', borderRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  detailCard: { backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5, maxHeight: '80%' },
  infoBox: { padding: 10, borderRadius: 8, marginTop: 10, backgroundColor: '#f9f9f9' }
});
