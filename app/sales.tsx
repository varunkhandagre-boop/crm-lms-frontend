import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (organizations/users still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { markAllNotificationsRead } from '../services/api/notifications';
import { fetchOrganizations } from '../services/api/organizations';
import { fetchTeamMembers } from '../services/api/users';
import { useData } from './context/DataContext';
// 🔥 Phase 2: sales visits now go through the new backend API
import { deleteSalesVisit as apiDeleteSalesVisit, listSalesVisits } from '../services/api/salesVisits';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

export default function SalesReportScreen() {
  const router = useRouter();
  
  const { currentUser } = useData();

  // 🔥 SaaS Engine kept for organizations/users only
  const { isDbLoading } = useSaaSDB();

  // salesVisitList now comes from useCachedList below (cache-first)
  // orgList now comes from useCachedList below (cache-first, shared 'organizations' key)
  // userList now comes from useCachedList below (cache-first, shared 'team_members' key)
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
      if (markAllNotificationsRead) {
          markAllNotificationsRead();
      }
  }, []);

  const [visitTypeFilter, setVisitTypeFilter] = useState<'Cold Call' | 'Follow Up' | 'All'>('All');
  const [searchText, setSearchText] = useState('');
  
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [selectedEmployee, setSelectedEmployee] = useState('All'); 
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  const userRole = currentUser?.role ? currentUser.role.toLowerCase() : 'unknown';
  const isAdmin = userRole === 'admin' || userRole === 'manager' || userRole === 'accountant' || userRole === 'hr' || userRole === 'store' || userRole === 'superadmin';
  const isStrictAdmin = userRole === 'admin' || userRole === 'manager';

  useEffect(() => {
      if (viewMode === 'Day' && visitTypeFilter === 'All' && !searchText) {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, visitTypeFilter, searchText, selectedEmployee]);

  // 🔥 SALES VISITS (DSR) — cache-first (instant from AsyncStorage, then
  // background refresh). See hooks/useCachedList.ts.
  const salesVisitsCacheKey = buildCacheKey('sales_visits', currentUser?.companyId);
  const {
      data: salesVisitList,
      setData: setSalesVisitList,
      loading: salesVisitsLoading,
      refresh: refreshSalesVisits,
  } = useCachedList({
      cacheKey: salesVisitsCacheKey,
      enabled: !!currentUser?.companyId,
      fetcher: listSalesVisits, // was: fetchSaaSData("sales_reports")
  });

  // 🔥 Users — cache-first, shares the SAME 'team_members' cache key as
  // manage_team.tsx/employee_timeline.tsx.
  const { data: userList } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });

  // 🔥 senderName was never populated — the API only returns senderId (see
  // services/api/salesVisits.ts), so DSR entries showed no name. Fill it
  // in once team members are available.
  useEffect(() => {
      if (userList.length === 0 || salesVisitList.length === 0) return;
      const nameById = new Map(userList.map((u: any) => [u.id, u.name || 'Unknown']));
      const needsEnrichment = salesVisitList.some((v: any) => v.senderName === undefined);
      if (!needsEnrichment) return;
      setSalesVisitList(salesVisitList.map((v: any) => ({ ...v, senderName: nameById.get(v.senderId) || 'Unknown' })));
  }, [salesVisitList, userList]);

  useEffect(() => {
      if (isAdmin) {
          const mappedUsers = userList.map((u: any) => ({
              id: u.id,
              name: u.name || 'Unknown User'
          }));
          setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
      }
  }, [userList, isAdmin]);

  // Organizations — cache-first, shares the SAME 'organizations' cache key
  // as organization.tsx/messaging_center.tsx.
  const { data: orgList } = useCachedList({
      cacheKey: buildCacheKey('organizations', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: () => fetchOrganizations({ limit: 500 }),
  });

  const onRefresh = async () => {
      setRefreshing(true);
      await refreshSalesVisits();
      setRefreshing(false);
  };

  const getCity = (item: any) => {
      if (item.city) return item.city;
      const orgData = orgList.find((o: any) => (item.orgId && o.id === item.orgId) || o.orgName === item.hospital || o.name === item.hospital);
      return orgData?.city || '';
  };

  const parseDate = (dateStr: any) => {
      if (!dateStr) return 0;
      if (typeof dateStr === 'number') return dateStr;
      if (dateStr instanceof Date) return dateStr.getTime();
      if (typeof dateStr === 'string') {
          if (dateStr.includes('T')) return new Date(dateStr).getTime();
          if (dateStr.includes('-')) return new Date(dateStr).getTime();
          if (dateStr.includes('/')) {
              const parts = dateStr.split('/');
              if (parts.length === 3 && parts[2].length === 4) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
          }
      }
      return new Date(dateStr).getTime();
  };

  const formatDateDisplay = (dateStr: any) => {
      if (!dateStr) return 'N/A';
      const ts = parseDate(dateStr);
      return ts === 0 ? 'N/A' : new Date(ts).toLocaleDateString('en-GB'); 
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

  const getProductDisplay = (productData: any) => {
      if (!productData) return '';
      if (Array.isArray(productData)) return productData.join(', ');
      return String(productData);
  };

  const renderProductList = (productData: any) => {
      if (!productData) return null;

      if (Array.isArray(productData) && productData.length > 0) {
          return (
              <View style={{ marginTop: 4 }}>
                  {productData.map((prod, idx) => (
                      <View key={idx} style={{flexDirection:'row', alignItems:'flex-start', marginTop: 3}}>
                          <Ionicons name="cube-outline" size={12} color="#555" style={{marginTop: 2}} />
                          <Text style={{fontSize:12, color:'#444', marginLeft:4, fontWeight:'500', flex: 1}}>
                              {prod}
                          </Text>
                      </View>
                  ))}
              </View>
          );
      }

      if (typeof productData === 'string' && productData.trim() !== '') {
          return (
              <View style={{flexDirection:'row', alignItems:'center', marginTop:4}}>
                  <Ionicons name="cube-outline" size={12} color="#555" />
                  <Text style={{fontSize:12, color:'#444', marginLeft:4, fontWeight:'500'}}>{productData}</Text>
              </View>
          );
      }
      return null;
  };

  const getData = () => {
      let list = salesVisitList ? [...salesVisitList] : [];

      if (!isAdmin) {
          const myId = currentUser?.uid || currentUser?.id;
          list = list.filter((item: any) => item.senderId === myId || item.senderUid === myId);
      } else if (selectedEmployee !== 'All') {
          list = list.filter((item: any) => (item.senderId === selectedEmployee) || (item.senderUid === selectedEmployee) || (item.senderName === selectedEmployeeName));
      }

      if (visitTypeFilter === 'Cold Call') list = list.filter((i: any) => i.visitType === 'Cold Call');
      else if (visitTypeFilter === 'Follow Up') list = list.filter((i: any) => i.visitType === 'Follow Up');

      if (searchText) {
          const term = searchText.toLowerCase();
          list = list.filter((item: any) => {
              const city = getCity(item).toLowerCase();
              const prodStr = getProductDisplay(item.product);
              const mainText = `${item.hospital || ''} ${city} ${item.person || ''} ${item.senderName || ''} ${item.outcome || ''} ${prodStr}`.toLowerCase();
              return mainText.includes(term);
          });
      } 
      else if (viewMode !== 'All') {
          const tYear = currentDate.getFullYear();
          const tMonth = currentDate.getMonth();
          const tDay = currentDate.getDate();

          const fyStartYear = tMonth >= 3 ? tYear : tYear - 1;
          const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
          const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime();

          list = list.filter((item: any) => {
              const dateField = item.dateIso || item.date || item.createdAt;
              if(!dateField) return false;
              const itemDate = new Date(parseDate(dateField));
              const itemTime = itemDate.getTime();
              
              if (viewMode === 'Month') return itemDate.getFullYear() === tYear && itemDate.getMonth() === tMonth;
              if (viewMode === 'Day') return itemDate.getFullYear() === tYear && itemDate.getMonth() === tMonth && itemDate.getDate() === tDay;
              if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
              return true;
          });
      }

      return list.sort((a: any, b: any) => {
          const dateA = a.nextFollowUp ? parseDate(a.nextFollowUp) : parseDate(a.dateIso || a.date);
          const dateB = b.nextFollowUp ? parseDate(b.nextFollowUp) : parseDate(b.dateIso || b.date);
          return dateB - dateA; 
      });
  };

  const displayList = getData(); 
  const renderedList = displayList.slice(0, visibleCount);

  const shareDailyReport = async () => {
      const now = new Date();
      const localTodayStr = now.toISOString().split('T')[0];

      const todaysVisits = salesVisitList.filter((item: any) => {
          const isDateMatch = (item.dateIso === localTodayStr || item.date === localTodayStr);
          const targetId = selectedEmployee !== 'All' ? selectedEmployee : (currentUser?.uid || currentUser?.id);
          const isUserMatch = item.senderId === targetId || item.senderUid === targetId; 
          return isDateMatch && isUserMatch;
      });

      if (todaysVisits.length === 0) return Alert.alert("No Data", `No visits found for date: ${localTodayStr}`);

      const reportName = selectedEmployee !== 'All' ? selectedEmployeeName : (currentUser?.name || 'Sales Person');
      let message = `📅 *Daily Sales Report (DSR)* \n👤 *${reportName}*\n📆 Date: ${now.toLocaleDateString('en-GB')}\n\n`;

      todaysVisits.forEach((visit: any, index: number) => {
          const note = (visit.discussion || '-').split('\n')[0].substring(0, 30);
          const prodStr = getProductDisplay(visit.product);
          const productLine = prodStr ? `   └ 📦 Item: ${prodStr}\n` : ''; 
          message += `${index + 1}. *[${visit.visitType || 'Visit'}] ${visit.hospital || visit.hospitalName}*\n${productLine}   └ 📊 Status: ${visit.outcome}\n   └ 📝 Note: ${note}...\n\n`;
      });

      message += `------------------\n*Total Visits: ${todaysVisits.length}* 🚀`;
      try { await Share.share({ message }); } catch (error) {}
  };

  const openDetails = (item: any) => {
      if (item.leadId) {
          router.push({ pathname: '/lead_details', params: { id: item.leadId } } as any);
      } else {
          setSelectedItem(item);
          setModalVisible(true);
      }
  };

  // 🔥 DELETE — via new backend API
  const handleDeleteVisit = async () => {
      if (!selectedItem) return;
      Alert.alert(
          "Delete Visit?",
          "Are you sure you want to permanently delete this visit record?",
          [
              { text: "Cancel", style: "cancel" },
              { 
                  text: "Delete", 
                  style: "destructive", 
                  onPress: async () => {
                      setIsDeleting(true);
                      try {
                          await apiDeleteSalesVisit(selectedItem.id);
                          setModalVisible(false);
                          Alert.alert("Deleted", "Visit record has been deleted successfully.");
                          refreshSalesVisits();
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

    const renderItem = ({ item }: any) => {
      const isColdCall = item.visitType === 'Cold Call';
      const city = getCity(item); 
      // toLegacySalesVisit() never sets senderName (backend only returns
      // createdById, a UUID) — resolve it from the already-loaded team list
      // instead of always falling to "Unknown".
      const createdBy = item.senderName || item.userName || (userList || []).find((u: any) => u.id === item.senderId)?.name || 'Unknown';

      return (
          <TouchableOpacity 
              style={[styles.card, { borderLeftColor: isColdCall ? '#1976d2' : '#f57f17', borderLeftWidth: 4 }]} 
              onPress={() => openDetails(item)}
          >
              <View style={styles.cardHeader}>
                  <View style={{flex:1, marginRight: 5}}>
                      <Text style={styles.hospitalName} numberOfLines={1}>{item.hospital || item.hospitalName}</Text>
                      
                      {renderProductList(item.product)}

                      <Text style={styles.subText} numberOfLines={1}>
                          {city ? `📍 ${city} • ` : ''} {item.person}
                      </Text>
                      <View style={{flexDirection:'row', alignItems:'center', marginTop:3}}>
                          <Ionicons name="person-circle-outline" size={14} color="#666" />
                          <Text style={{fontSize:11, color:'#555', marginLeft:2, fontWeight:'bold'}}>{createdBy}</Text>
                      </View>
                  </View>
                  
                  <View style={{alignItems: 'flex-end'}}>
                      <View style={[styles.badge, { backgroundColor: isColdCall ? '#e3f2fd' : '#fff3e0' }]}>
                          <Text style={[styles.badgeText, { color: isColdCall ? '#1565c0' : '#f57f17' }]}>
                              {item.visitType || 'Visit'}
                          </Text>
                      </View>
                      <Text style={{fontSize: 10, color: 'gray', marginTop: 4, fontWeight: 'bold'}}>{item.outcome}</Text>
                  </View>
              </View>
              <View style={styles.divider} />
              <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                  <Text style={styles.dateText}>📅 {formatDateDisplay(item.dateIso || item.date)}</Text>
                  {item.nextFollowUp && <Text style={[styles.dateText, {color: '#d32f2f', fontWeight:'bold'}]}>⏰ {item.nextFollowUp}</Text>}
              </View>
              {item.discussion ? <Text style={styles.noteText} numberOfLines={1}>📝 {item.discussion.split('\n')[0]}</Text> : null}
              
              <Text style={{textAlign:'center', fontSize:10, color:'#ccc', marginTop:8, fontStyle:'italic'}}>
                  {item.leadId ? 'Tap to open Lead Details' : 'Tap to view Visit Details'}
              </Text>
          </TouchableOpacity>
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()} style={{padding:5}}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Visits DSR</Text>
        </View>
        <View style={{flexDirection:'row'}}>
            <TouchableOpacity style={[styles.addBtn, {backgroundColor:'#4caf50', marginRight:10}]} onPress={shareDailyReport}>
                <Ionicons name="share-social" size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_sales' as any)}>
                <Ionicons name="add" size={20} color="white" /><Text style={styles.addBtnText}>New Visit</Text>
            </TouchableOpacity>
        </View>
      </View>

      <View style={styles.subTabContainer}>
          <TouchableOpacity style={[styles.subTab, visitTypeFilter === 'Cold Call' && styles.activeSubTabColdCall]} onPress={() => setVisitTypeFilter('Cold Call')}>
              <Text style={[styles.subTabText, visitTypeFilter === 'Cold Call' && {color:'white'}]}>Cold Calls</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.subTab, visitTypeFilter === 'Follow Up' && styles.activeSubTabFollow]} onPress={() => setVisitTypeFilter('Follow Up')}>
              <Text style={[styles.subTabText, visitTypeFilter === 'Follow Up' && {color:'white'}]}>Follow-ups</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.subTab, visitTypeFilter === 'All' && styles.activeSubTabAll]} onPress={() => setVisitTypeFilter('All')}>
              <Text style={[styles.subTabText, visitTypeFilter === 'All' && {color:'white'}]}>All Visits</Text>
          </TouchableOpacity>
      </View>

      <View style={{backgroundColor:'white', padding:10, marginBottom:5}}>
          <View style={styles.searchBar}>
              {isDbLoading ? <ActivityIndicator size="small" color="#1565c0" style={{marginRight: 5}}/> : <Ionicons name="search" size={24} color="#1565c0" />} 
              <TextInput style={styles.input} placeholder="Search: Hospital, City..." value={searchText} onChangeText={setSearchText} />
              {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="#d32f2f" /></TouchableOpacity>
              )}
          </View>

          {!searchText && (
            <>
              <View style={styles.dateTabContainer}>
                  {['Day', 'Month', 'FY', 'All'].map((m) => (
                      <TouchableOpacity key={m} style={[styles.dateTab, viewMode === m && styles.activeDateTab]} onPress={() => setViewMode(m as any)}>
                          <Text style={[styles.dateTabText, viewMode === m && styles.activeDateTabText]}>{m}</Text>
                      </TouchableOpacity>
                  ))}
              </View>

              {isAdmin && (
                <View style={{flexDirection:'row', justifyContent:'space-between', paddingHorizontal:15, marginBottom:10}}>
                    <TouchableOpacity style={styles.employeeFilterBtn} onPress={() => setShowEmployeePicker(true)}>
                        <Ionicons name="people" size={18} color="#2e7d32" />
                        <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                            {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:5}}/>
                    </TouchableOpacity>
                    {viewMode !== 'All' && (
                        <View style={styles.miniDateNav}>
                            <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={20} color="#555" /></TouchableOpacity>
                            <Text style={{fontWeight:'bold', color:'#3b5998', fontSize:12, marginHorizontal:5}}>{getHeaderDate()}</Text>
                            <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={20} color="#555" /></TouchableOpacity>
                        </View>
                    )}
                </View>
              )}

              {(!isAdmin && viewMode !== 'All') && (
                  <View style={styles.dateNav}>
                      <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                      <Text style={styles.monthText}>{getHeaderDate()}</Text>
                      <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
                  </View>
              )}
            </>
          )}
          
          <Text style={{textAlign:'right', fontSize:12, color:'gray', paddingRight:15, marginTop:5}}>
              Total: <Text style={{fontWeight:'bold', color:'green'}}>{displayList.length}</Text> Records
          </Text>
      </View>

      <FlatList 
          data={renderedList}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565c0']} tintColor="#1565c0" />
          }
          ListEmptyComponent={
              <View style={{alignItems:'center', marginTop:50}}>
                  {salesVisitsLoading ? <ActivityIndicator size="large" color="#1565c0"/> : (
                      <>
                        <Ionicons name="folder-open-outline" size={60} color="#ddd" />
                        <Text style={{color:'gray', marginTop:0}}>No Visits Found.</Text>
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
                              padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd'
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

      {/* READ-ONLY MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15, alignItems:'center'}}>
                      <Text style={styles.modalTitle}>Visit Details</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{top:10, bottom:10, left:10, right:10}}>
                          <Ionicons name="close-circle" size={32} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>
                  {selectedItem && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          <View style={styles.readOnlyBox}>
                              <Text style={styles.roTitle}>{selectedItem.hospital || selectedItem.hospitalName}</Text>
                              <Text style={styles.roSub}>{selectedItem.person} • {getCity(selectedItem)}</Text>
                              
                              <View style={{marginTop: 5}}>
                                  <Text style={{fontWeight:'bold', color:'#333', marginBottom: 2}}>Products Discussed:</Text>
                                  {renderProductList(selectedItem.product) || <Text style={{fontSize: 12, color: 'gray'}}>None</Text>}
                              </View>
                          </View>
                          
                          <View style={styles.historyBox}>
                              <Text style={{fontWeight: 'bold', color: '#555', marginBottom: 5}}>Type: <Text style={{color: '#1565c0'}}>{selectedItem.visitType || 'Visit'}</Text></Text>
                              <Text style={{fontWeight: 'bold', color: '#555', marginBottom: 5}}>Outcome: <Text style={{color: '#d32f2f'}}>{selectedItem.outcome}</Text></Text>
                              <Text style={{fontWeight: 'bold', color: '#555', marginBottom: 10}}>Date: <Text style={{color: '#3b5998'}}>{formatDateDisplay(selectedItem.dateIso || selectedItem.date)}</Text></Text>
                              <View style={styles.divider} />
                              <Text style={styles.sectionHeader}>DISCUSSION NOTE</Text>
                              <Text style={styles.historyText}>{selectedItem.discussion || 'No discussion notes recorded.'}</Text>
                          </View>

                          {isStrictAdmin && (
                              <TouchableOpacity 
                                  style={{marginTop: 5, marginBottom: 20, backgroundColor: '#ffebee', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ef9a9a'}} 
                                  onPress={handleDeleteVisit}
                                  disabled={isDeleting}
                              >
                                  <View style={{flexDirection:'row', alignItems:'center'}}>
                                      {isDeleting ? <ActivityIndicator size="small" color="#d32f2f" /> : <Ionicons name="trash-outline" size={18} color="#d32f2f" />}
                                      <Text style={{color: '#d32f2f', fontWeight: 'bold', marginLeft: 8}}>
                                          {isDeleting ? "Deleting..." : "Delete Visit Entry"}
                                      </Text>
                                  </View>
                              </TouchableOpacity>
                          )}

                      </ScrollView>
                  )}
              </View>
          </View>
      </Modal>

      {/* EMPLOYEE PICKER */}
      <Modal visible={showEmployeePicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Employee View</Text>
                  <FlatList 
                    data={employees} 
                    keyExtractor={item => item.id} 
                    renderItem={({item}) => (
                      <TouchableOpacity style={styles.pickerItem} onPress={() => { setSelectedEmployee(item.id); setSelectedEmployeeName(item.name); setShowEmployeePicker(false); }}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 0, zIndex: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  addBtn: { flexDirection:'row', backgroundColor:'#3b5998', paddingHorizontal:12, paddingVertical:8, borderRadius:20, alignItems:'center' },
  addBtnText: { color:'white', fontWeight:'bold', marginLeft:5 },
  
  subTabContainer: { flexDirection: 'row', padding: 5, backgroundColor: 'white', justifyContent:'space-between', borderTopWidth:1, borderTopColor:'#eee' },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, marginHorizontal: 4, backgroundColor: '#f0f0f0' },
  activeSubTabColdCall: { backgroundColor: '#1976d2' },
  activeSubTabFollow: { backgroundColor: '#f57f17' },
  activeSubTabAll: { backgroundColor: '#3b5998' },
  subTabText: { fontSize: 12, fontWeight: 'bold', color: '#555' },
  
  dateTabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 5, borderRadius: 8, padding: 3, marginBottom: 5 },
  dateTab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeDateTab: { backgroundColor: 'white', elevation: 2 },
  dateTabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeDateTabText: { color: '#3b5998', fontWeight: 'bold' },
  
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 10, marginHorizontal: 15, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#eee' },
  miniDateNav: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:15, paddingHorizontal:5, paddingVertical:5 },
  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:8, borderRadius:20, borderWidth:1, borderColor:'#2e7d32' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
  
  searchBar: { backgroundColor: '#e3f2fd', borderRadius: 10, flexDirection:'row', alignItems:'center', paddingHorizontal: 15, height: 40, marginHorizontal: 15, marginBottom: 0, borderWidth: 1, borderColor: '#90caf9', elevation: 0 },
  input: { flex:1, marginLeft:10, fontSize:16, color:'#1565c0', fontWeight:'500' },
  
  listContent: { paddingHorizontal: 15, paddingBottom: 20 },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 5, elevation: 2, marginTop: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  subText: { fontSize: 13, color: '#555', marginTop: 2 }, 
  badge: { paddingHorizontal:8, paddingVertical:4, borderRadius:4 },
  badgeText: { fontSize:10, fontWeight:'bold' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  dateText: { fontSize: 12, color: '#555' },
  noteText: { fontSize: 13, color: '#444', marginTop:5, fontStyle:'italic' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '95%', backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
  readOnlyBox: { backgroundColor:'#e3f2fd', padding:15, borderRadius:8, marginBottom:15, borderLeftWidth:4, borderLeftColor:'#3b5998' },
  roTitle: { fontSize:16, fontWeight:'bold', color:'#3b5998' },
  roSub: { fontSize:13, color:'#555', marginTop:2 },
  
  historyBox: { backgroundColor:'#fffde7', padding:15, borderRadius:8, borderWidth:1, borderColor:'#ffe0b2', marginBottom:20 },
  historyText: { fontSize:14, color:'#333', lineHeight:22 },
  sectionHeader: { fontWeight:'bold', marginBottom:10, color:'#e65100', fontSize:12, marginTop:5, letterSpacing: 1 },
  
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight: 'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between' }
});
