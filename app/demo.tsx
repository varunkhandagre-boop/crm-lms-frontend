import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Linking,
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
// 🔥 Phase 2: demos & sales visits now go through the new backend API
import { listDemos } from '../services/api/demos';
import { listSalesVisits } from '../services/api/salesVisits';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fetchOrganizations } from '../services/api/organizations';
import { fetchTeamMembers } from '../services/api/users';

export default function DemoScreen() {
  const router = useRouter();
  
  const { currentUser, companyProfile } = useData(); 

  // 🔥 SaaS Engine kept only for isDbLoading (search-icon spinner); demos no longer go through this
  const { isDbLoading } = useSaaSDB();

  // demoList now comes from useCachedList below (cache-first)
  // salesVisitList/orgList now come from useCachedList below (cache-first, shared keys)
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);

  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [orgDetails, setOrgDetails] = useState<any>(null); 
  const [generatingPdf, setGeneratingPdf] = useState(false); 

  const [selectedEmployee, setSelectedEmployee] = useState('All'); 
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  const isAdmin = ['Admin', 'Manager', 'Accountant' , 'Account', 'Hr', 'SuperAdmin'].includes(currentUser?.role || '');

  useEffect(() => {
      if (viewMode === 'Day') {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, selectedEmployee, searchText]);

  // 🔥 DEMOS — cache-first (instant from AsyncStorage, then background
  // refresh from the API). See hooks/useCachedList.ts.
  const demosCacheKey = buildCacheKey('demos', currentUser?.companyId);
  const {
      data: demoList,
      setData: setDemoList,
      loading: demosLoading,
      refreshing: demosRefreshing,
      refresh: refreshDemos,
  } = useCachedList({
      cacheKey: demosCacheKey,
      enabled: !!currentUser?.companyId,
      fetcher: listDemos, // was: fetchSaaSData("demos")
  });

  // 🔥 Team members — cache-first, shares the SAME 'team_members' cache key
  // as manage_team.tsx/employee_timeline.tsx.
  const { data: teamMembersForDemo } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });
  useEffect(() => {
      if (isAdmin) {
          const mappedUsers = teamMembersForDemo.map((u: any) => ({
              id: u.id,
              name: u.name || 'Unknown User'
          }));
          setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
      }
  }, [teamMembersForDemo, isAdmin]);

  // 🔥 senderName was never populated — the API only returns senderId (see
  // services/api/demos.ts's comment), so every demo showed no name at all.
  // Fill it in once team members are available.
  useEffect(() => {
      if (teamMembersForDemo.length === 0 || demoList.length === 0) return;
      const nameById = new Map(teamMembersForDemo.map((u: any) => [u.id, u.name || 'Unknown']));
      const needsEnrichment = demoList.some((d: any) => d.senderName === undefined);
      if (!needsEnrichment) return;
      setDemoList(demoList.map((d: any) => ({ ...d, senderName: nameById.get(d.senderId) || 'Unknown' })));
  }, [demoList, teamMembersForDemo]);

  // Sales visits/orgs — unchanged plain fetch-on-mount (out of scope for
  // this pass).
  // 🔥 Sales visits + Organizations — cache-first, sharing the SAME cache
  // keys as sales.tsx ('sales_visits') and organization.tsx/messaging_center.tsx
  // ('organizations').
  const { data: salesVisitList } = useCachedList({
      cacheKey: buildCacheKey('sales_visits', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: listSalesVisits, // was: fetchSaaSData("sales_reports")
  });
  const { data: orgList } = useCachedList({
      cacheKey: buildCacheKey('organizations', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: () => fetchOrganizations({ limit: 200 }),
  });

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

    const generateDemoPDF = async (demoData: any) => {
    setGeneratingPdf(true);
    try {
        const logoHTML = companyProfile?.logoUrl 
            ? `<img src="${companyProfile.logoUrl}" style="height: 62px; object-fit: contain;" />` 
            : `<div style="font-size:24px; font-weight:800; color:#0f2557; letter-spacing:0.5px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = companyProfile?.signatureUrl 
            ? `<img src="${companyProfile.signatureUrl}" style="height: 50px; object-fit: contain; margin-bottom: 6px;" />` 
            : `<div style="height: 50px;"></div>`;

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
                display: inline-block; background: #7c3aed; color: white;
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
                background: #f5f3ff; border-left: 4px solid #7c3aed; border-radius: 8px;
                padding: 16px 20px; font-size: 13.5px; color: #4a4a68; margin-bottom: 20px; line-height: 1.6;
              }
              .remarks b { color: #5b21b6; }

              .note {
                font-size: 11.5px; color: #6b7280; font-style: italic; margin-bottom: 34px; padding: 0 4px;
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
              ${logoHTML}
              <div class="company-meta">
                <div style="font-weight:700; font-size:14px; margin-bottom:3px;">${companyProfile?.companyName || ''}</div>
                <div>${companyProfile?.address || ''}</div>
                <div>${companyProfile?.contactPhone || companyProfile?.phone || '-'} &nbsp;•&nbsp; ${companyProfile?.contactEmail || companyProfile?.email || '-'}</div>
              </div>
            </div>

            <div class="doc-band">
              <div>
                <div class="doc-title">PRODUCT DEMO REPORT</div>
                <div class="status-pill">✓ DEMO COMPLETED</div>
              </div>
              <div class="doc-meta">
                <div>Date: <b>${demoData.date || '-'}</b></div>
                <div>Duration: <b>${demoData.duration || '1'} Day${(demoData.duration || 1) > 1 ? 's' : ''}</b></div>
              </div>
            </div>

            <div class="sheet">
              <div class="grid">
                <div class="card">
                  <div class="card-label">CLIENT DETAILS</div>
                  <div class="row"><span class="k">Hospital / Client</span><span class="v">${demoData.hospital || '-'}</span></div>
                  <div class="row"><span class="k">Address</span><span class="v">${demoData.address || demoData.city || '-'}</span></div>
                  <div class="row"><span class="k">Department</span><span class="v">${demoData.department || '-'}</span></div>
                </div>
                <div class="card">
                  <div class="card-label">CONTACT PERSON</div>
                  <div class="row"><span class="k">Name</span><span class="v">${demoData.contactPerson || '-'}</span></div>
                  <div class="row"><span class="k">Designation</span><span class="v">${demoData.designation || '-'}</span></div>
                  <div class="row"><span class="k">Mobile</span><span class="v">${demoData.contactNumber || '-'}</span></div>
                </div>
              </div>

              <table class="table">
                <thead>
                  <tr>
                    <th style="width: 55%;">Product</th>
                    <th style="width: 45%;">Serial No.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <b>${demoData.product || '-'}</b>
                      <div class="model-sub">Model: ${demoData.model || '-'}</div>
                    </td>
                    <td><b>${demoData.serialNo || 'N/A'}</b></td>
                  </tr>
                </tbody>
              </table>

              <div class="remarks">
                <b>Demo Outcome / Remarks:</b> ${demoData.result || demoData.outcome || 'Demo completed successfully.'}
              </div>

              ${demoData.notes ? `<div class="note">Internal Note: ${demoData.notes}</div>` : ''}

              <div class="footer">
                <div class="sign-box">
                  <div class="sign-space"></div>
                  <div class="sign-line"></div>
                  <div class="sign-label">Client Signature & Stamp</div>
                </div>
                <div class="sign-box">
                  <div class="sign-sub" style="margin-bottom:6px;">${demoData.senderName || ''}</div>
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
        const cleanName = `Demo_${(demoData.hospital || 'Client').replace(/ /g, '_')}_${Date.now()}.pdf`;
        // @ts-ignore
        const newPath = `${FileSystem.cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Demo Report` });
        } catch (error) {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
    } catch (error) {
        // Alert.alert("Error", "Could not generate PDF");
    } finally {
        setGeneratingPdf(false);
    }
  };

  // --- SMART MERGE LOGIC (unchanged, now fed by API data) ---
  const getAllDemos = () => {
      const salesDemos = salesVisitList ? salesVisitList.filter((item: any) => 
          (item.discussion && item.discussion.toLowerCase().includes('demo')) || 
          (item.outcome && item.outcome.toLowerCase().includes('demo'))
      ).map((item: any) => ({
          id: item.id, 
          hospital: item.hospital,
          orgId: item.orgId || '', 
          date: item.date,
          product: 'See Details', 
          result: item.outcome || 'N/A',
          status: 'Completed',    
          isFromSales: true,      
          fullData: item,
          senderId: item.senderId,
          senderName: item.senderName || 'Unknown'
      })) : [];

      const actualDemos = demoList || [];
      
      let combined = [...actualDemos, ...salesDemos].map(item => {
        const org = orgList.find((o: any) => (o.id === item.orgId) || (o.orgName === item.hospital) || (o.name === item.hospital));
        return { ...item, city: item.city || (org ? org.city : '') };
      });

      if (!isAdmin) {
          const myId = currentUser?.id || currentUser?.uid;
          combined = combined.filter((item: any) => item.senderId === myId || item.userName === currentUser?.name);
      }

      return combined;
  };

  const allData = getAllDemos(); 

  const getFilteredData = () => {
    let data = allData;

    if (isAdmin && selectedEmployee !== 'All') {
        data = data.filter((item: any) => 
          (item.senderId === selectedEmployee) || 
          (item.userId === selectedEmployee) ||
          (item.senderName === selectedEmployeeName)
        );
    }

    if (searchText) {
        const lowerTerm = searchText.toLowerCase();
        data = data.filter((item: any) => {
           const fullString = `
               ${item.hospital || ''} 
               ${item.product || ''} 
               ${item.result || ''} 
               ${item.senderName || ''}
               ${item.date || ''}
               ${item.id || ''}
           `.toLowerCase();
           return fullString.includes(lowerTerm);
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

    return data.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  };

  const fullList = getFilteredData(); 
  const renderedList = fullList.slice(0, visibleCount);

  const openDetails = (item: any) => {
      setSelectedItem(item);
      const foundOrg = orgList.find((o: any) => (o.id === item.orgId) || (o.orgName === item.hospital) || (o.name === item.hospital));
      setOrgDetails(foundOrg || null);
      setModalVisible(true);
  };

  const handleCall = (num: string) => {
      if(num) Linking.openURL(`tel:${num}`);
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.row}>
            <Text style={{color:'gray', fontSize:12, fontWeight:'bold'}}>{item.date}</Text>
            <View style={item.isFromSales ? styles.badgeOrange : styles.badgeBlue}>
                <Text style={item.isFromSales ? styles.textOrange : styles.textBlue}>
                    {item.isFromSales ? 'From Sales' : 'Direct Demo'}
                </Text>
            </View>
        </View>
        
        <Text style={styles.title}>{item.hospital || 'Unknown Hospital'}</Text>
        
        {item.city ? (
            <View style={{flexDirection:'row', alignItems:'center', marginBottom: 5}}>
                <Ionicons name="location-outline" size={12} color="gray" />
                <Text style={{fontSize: 11, color: 'gray', marginLeft: 2}}>
                    {item.city}
                </Text>
            </View>
        ) : null}
        
        <View style={styles.row}>
            {isAdmin && (
                 <View style={{flexDirection:'row', alignItems:'center'}}>
                     <Ionicons name="person" size={10} color="#3b5998" />
                     <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginLeft:2}}>
                         {item.senderName ? item.senderName.split(' ')[0] : 'Unknown'}
                     </Text>
                 </View>
            )}
        </View>
        
        <View style={styles.divider} />
        
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
             <View style={{flex: 1}}>
                 <Text style={{fontSize:13, color:'#3b5998', fontWeight:'bold'}}>
                     {item.product}
                 </Text>
                 {item.model ? (
                     <Text style={{fontSize:11, color:'#555'}}>Model: {item.model}</Text>
                 ) : null}
             </View>
             <Text style={styles.resultText} numberOfLines={1}>Result: {item.result || 'Pending'}</Text>
        </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Demonstration Note</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/add_demo' as any)}>
            <Ionicons name="add-circle" size={32} color="#3b5998" />
        </TouchableOpacity>
      </View>

      <View style={{backgroundColor:'white', paddingBottom:10}}>
          
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'FY', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {isAdmin && (
            <View style={{paddingHorizontal: 15, marginBottom: 10}}>
               <TouchableOpacity 
                   style={styles.employeeFilterBtn} 
                   onPress={() => setShowEmployeePicker(true)}
               >
                   <Ionicons name="people" size={18} color="#2e7d32" />
                   <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                       {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
                   </Text>
                   <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:'auto'}}/>
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

          <View style={{paddingHorizontal:15}}>
              <View style={styles.searchBar}>
                  {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
                  <TextInput 
                    style={styles.input} 
                    placeholder={isAdmin ? "Search Hospital, Product, Employee..." : "Search Hospital, Product..."}
                    value={searchText}
                    onChangeText={setSearchText}
                  />
                  {searchText.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchText('')}>
                          <Ionicons name="close-circle" size={20} color="gray" />
                      </TouchableOpacity>
                  )}
              </View>
              <Text style={{textAlign:'right', fontSize:12, color:'gray', marginTop:5}}>
                  Total: <Text style={{fontWeight:'bold', color:'green'}}>{fullList.length}</Text> Records
              </Text>
          </View>
      </View>

      <FlatList 
        data={renderedList}
        keyExtractor={(item, index) => (item.id || index.toString()) + index} 
        renderItem={renderItem}
        contentContainerStyle={{padding: 15}}
        refreshControl={
            <RefreshControl refreshing={demosRefreshing} onRefresh={refreshDemos} colors={['#3b5998']} tintColor="#3b5998" />
        }
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                <Ionicons name="flask-outline" size={60} color="#ccc" />
                <Text style={{color:'gray', marginTop:10}}>{demosLoading ? 'Loading Demos...' : 'No Demo Records Found'}</Text>
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

      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                      <Text style={styles.modalTitle}>Demo Report</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}>
                          <Ionicons name="close-circle" size={30} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  {selectedItem && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          
                          <View style={styles.section}>
                              <Text style={styles.hospitalHeader}>{selectedItem.hospital}</Text>
                              <Text style={{color:'gray', fontSize:12, marginBottom:5}}>{selectedItem.date}</Text>
                              
                              {orgDetails && (
                                  <View style={{flexDirection:'row', alignItems:'center', marginTop:5}}>
                                      <Ionicons name="location" size={14} color="#555" />
                                      <Text style={{fontSize:12, color:'#555', marginLeft:5}}>
                                          {orgDetails.city}, {orgDetails.state}
                                      </Text>
                                  </View>
                              )}
                          </View>

                          <View style={styles.section}>
                              <Text style={styles.sectionTitle}>Contact Person</Text>
                              <DetailRow label="Name" value={selectedItem.contactPerson || 'N/A'} icon="person" />
                              <TouchableOpacity onPress={() => handleCall(selectedItem.contactNumber)}>
                                  <DetailRow label="Mobile" value={selectedItem.contactNumber} icon="call" highlight />
                              </TouchableOpacity>
                              <DetailRow label="Email" value={selectedItem.email} icon="mail" />
                              <DetailRow label="Dept" value={selectedItem.department} icon="medkit" />
                          </View>

                          <View style={styles.section}>
                              <Text style={styles.sectionTitle}>Product Details</Text>
                              <DetailRow label="Product" value={selectedItem.product} icon="cube" />
                              <DetailRow label="Model" value={selectedItem.model} icon="hardware-chip" />
                              <DetailRow label="Serial No" value={selectedItem.serialNo} icon="barcode" />
                              <DetailRow label="Duration" value={selectedItem.duration ? `${selectedItem.duration} Days` : 'N/A'} icon="time" />
                          </View>

                          <View style={styles.section}>
                              <Text style={styles.sectionTitle}>Feedback & Notes</Text>
                              <View style={styles.noteBox}>
                                  <Text style={styles.noteLabel}>Outcome / Feedback:</Text>
                                  <Text style={styles.noteText}>{selectedItem.result || selectedItem.fullData?.outcome || 'No feedback yet.'}</Text>
                              </View>

                              {selectedItem.notes ? (
                                  <View style={[styles.noteBox, {marginTop:10, backgroundColor:'#f3e5f5', borderColor:'#e1bee7'}]}>
                                      <Text style={[styles.noteLabel, {color:'#7b1fa2'}]}>Private Notes:</Text>
                                      <Text style={styles.noteText}>{selectedItem.notes}</Text>
                                  </View>
                              ) : null}
                          </View>

                          <View style={[styles.section, {borderBottomWidth:0}]}>
                              <DetailRow label="Entry By" value={selectedItem.senderName} icon="person-circle" />
                          </View>

                                                    <TouchableOpacity 
                              style={[styles.pdfBtn, generatingPdf && { opacity: 0.6 }]}
                              onPress={() => generateDemoPDF(selectedItem)}
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

                          {!selectedItem.isFromSales && (
                              <TouchableOpacity 
                                  style={styles.editBtn}
                                  onPress={() => {
                                      setModalVisible(false);
                                      router.push({
                                          pathname: '/add_demo' as any,
                                          params: {
                                              editId: selectedItem.id,
                                              hospital: selectedItem.hospital || '',
                                              orgId: selectedItem.orgId || '',
                                              address: selectedItem.address || '',
                                              city: selectedItem.city || '',
                                              department: selectedItem.department || '',
                                              product: selectedItem.product || '',
                                              model: selectedItem.model || '',
                                              serialNo: selectedItem.serialNo || '',
                                              contactPerson: selectedItem.contactPerson || '',
                                              designation: selectedItem.designation || '',
                                              contactNumber: selectedItem.contactNumber || '',
                                              email: selectedItem.email || '',
                                              date: selectedItem.dateIso || selectedItem.date || '',
                                              duration: String(selectedItem.duration || ''),
                                              result: selectedItem.result || '',
                                              notes: selectedItem.notes || '',
                                          },
                                      });
                                  }}
                              >
                                  <Ionicons name="create-outline" size={20} color="#3b5998" />
                                  <Text style={styles.editBtnText}>Edit Demo</Text>
                              </TouchableOpacity>
                          )}

                          <View style={{height:20}} />
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
                    renderItem={({item}) => (
                      <TouchableOpacity 
                        style={styles.pickerItem} 
                        onPress={() => { 
                            setSelectedEmployee(item.id); 
                            setSelectedEmployeeName(item.name);
                            setShowEmployeePicker(false); 
                        }}
                      >
                          <View style={{flexDirection:'row', alignItems:'center'}}>
                             <Ionicons name="person-circle" size={24} color="#555" style={{marginRight:10}}/>
                             <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
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

const DetailRow = ({label, value, icon, highlight}: any) => (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom:8}}>
        <View style={{width:30}}><Ionicons name={icon} size={18} color="#3b5998" /></View>
        <Text style={{fontSize:12, color:'gray', width:70}}>{label}</Text>
        <Text style={{fontSize:14, fontWeight: highlight ? 'bold' : '500', color: highlight ? '#2e7d32' : '#333', flex:1}}>
            {value || '-'}
        </Text>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 0 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 15, borderRadius: 8, padding: 3, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#2e7d32' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 4, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 36 },
  input: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, alignItems:'center' },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 5, color:'#333' },
  resultText: { fontSize:12, color:'#555', maxWidth:'60%' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  
  badgeBlue: { backgroundColor: '#e3f2fd', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  textBlue: { color: '#1565c0', fontSize: 10, fontWeight:'bold' },
  badgeOrange: { backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  textOrange: { color: '#e65100', fontSize: 10, fontWeight:'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width:'100%', backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color:'#3b5998' },
  
  section: { borderBottomWidth:1, borderBottomColor:'#eee', paddingBottom:15, marginBottom:15 },
  hospitalHeader: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 10, textDecorationLine:'underline' },
  
  noteBox: { backgroundColor: '#fffde7', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#fff9c4' },
  noteLabel: { fontSize: 12, fontWeight: 'bold', color: '#f57f17', marginBottom: 5 },
  noteText: { fontSize: 13, color: '#333' },

  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, marginTop: 15, borderWidth: 1, borderColor: '#2196f3' },
  pdfBtnText: { color: '#1565c0', fontWeight: 'bold', marginLeft: 8 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8eaf6', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#3b5998' },
  editBtnText: { color: '#3b5998', fontWeight: 'bold', marginLeft: 8 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});
