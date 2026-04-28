import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

export default function SalesAnalysisScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se sirf user nikalenge
  const { currentUser } = useData();

  // 🔥 2. Naya SaaS Engine
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded States
  const [orderList, setOrderList] = useState<any[]>([]);
  const [paymentList, setPaymentList] = useState<any[]>([]);
  const [orgList, setOrgList] = useState<any[]>([]);
  const [userList, setUserList] = useState<any[]>([]);

  // STATES
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  
  // MODALS
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [poModalVisible, setPoModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  
  // GRAPH
  const [graphModalVisible, setGraphModalVisible] = useState(false);
  const [graphTab, setGraphTab] = useState<'Trend' | 'Products'>('Trend');
  const [trendData, setTrendData] = useState<any[]>([]); 
  const [productData, setProductData] = useState<any[]>([]); 

  // PAGINATION STATE 
  const [visibleCount, setVisibleCount] = useState(20);

  const userRole = currentUser?.role ? currentUser.role.toLowerCase() : 'unknown';
  const isAdmin = ['admin', 'manager', 'accountant', 'hr', 'superadmin'].includes(userRole);

  useEffect(() => {
      if (viewMode === 'Day') {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, selectedEmployee, searchText]);

  // 🔥 4. LOAD SAAS DATA ON MOUNT
  const loadData = async () => {
      if (currentUser?.companyId) {
          const [orders, payments, orgs, users] = await Promise.all([
              fetchSaaSData("orders"),
              fetchSaaSData("payments"),
              fetchSaaSData("organizations"),
              fetchSaaSData("users")
          ]);
          setOrderList(orders);
          setPaymentList(payments);
          setOrgList(orgs);
          setUserList(users);
      }
  };

  useEffect(() => {
      loadData();
  }, [currentUser]);

  // HELPER: Standardize any date string to YYYY-MM-DD
  const getValidDateStr = (obj: any) => {
      if (obj.dateIso) return obj.dateIso;
      if (obj.createdAt) return obj.createdAt.split('T')[0];
      if (obj.date && obj.date.includes('-')) {
           const parts = obj.date.split('-');
           if (parts[0].length === 4) return obj.date.split('T')[0]; // YYYY-MM-DD
           if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`; // DD-MM-YYYY
      }
      if (obj.date && obj.date.includes('/')) {
          const parts = obj.date.split('/');
          if(parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return "1970-01-01";
  };

  const parseAmount = (amountStr: any) => {
      if(!amountStr) return 0;
      const str = amountStr.toString().replace(/[^0-9.]/g, '');
      return parseFloat(str) || 0;
  };

  // Navigation for FY
  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (viewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  // FY Header Date format
  const getHeaderDate = () => {
      if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (viewMode === 'FY') {
          const currentMonth = currentDate.getMonth(); 
          const currentYear = currentDate.getFullYear();
          const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
          const fyEndYear = fyStartYear + 1;
          return `FY ${fyStartYear.toString().slice(-2)}-${fyEndYear.toString().slice(-2)}`;
      }
      return "All Time";
  };

  // --- 1. FILTER LOGIC FOR ORDERS ---
  const getFilteredData = () => {
      let data = [...orderList];

      data = data.filter(order => 
          ['Approved', 'Completed', 'Dispatched'].includes(order.status)
      );

      if (isAdmin) {
          if (selectedEmployee) {
              const selectedUserObj = userList.find((u: any) => (u.uid === selectedEmployee || u.id === selectedEmployee));
              const targetName = selectedUserObj?.name?.trim().toLowerCase();

              data = data.filter((item: any) => {
                  const idMatch = (String(item.senderId) === String(selectedEmployee)) || 
                                  (String(item.userId) === String(selectedEmployee)) ||
                                  (String(item.uid) === String(selectedEmployee));
                  const itemName = (item.senderName || item.userName || '').trim().toLowerCase();
                  const nameMatch = targetName && itemName === targetName;
                  return idMatch || nameMatch;
              });
          }
      } else {
          data = data.filter((o: any) => 
              o.senderId === currentUser?.uid || 
              o.senderId === currentUser?.id || 
              o.userName === currentUser?.name
          );
      }

      if (searchText) {
          const lower = searchText.toLowerCase();
          data = data.filter((item: any) => {
              const fullString = `${item.hospitalName} ${item.poNumber} ${item.orderId} ${item.status}`.toLowerCase();
              return fullString.includes(lower);
          });
      }

      if (viewMode !== 'All') {
          const targetYear = currentDate.getFullYear();
          const targetMonth = currentDate.getMonth();
          const targetDay = currentDate.getDate();

          const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
          const fyStartDateStr = `${fyStartYear}-04-01`; 
          const fyEndDateStr = `${fyStartYear + 1}-03-31`;
          
          const targetYM = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
          const targetYMD = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

          data = data.filter((item: any) => {
              const dateStr = getValidDateStr(item);
              if(dateStr === "1970-01-01") return false;
              
              if (viewMode === 'Month') return dateStr.startsWith(targetYM);
              if (viewMode === 'Day') return dateStr === targetYMD;
              if (viewMode === 'FY') return dateStr >= fyStartDateStr && dateStr <= fyEndDateStr;
              return true;
          });
      }

      return data.sort((a: any, b: any) => getValidDateStr(b).localeCompare(getValidDateStr(a)));
  };

  // 🔥 FILTER PAYMENTS INDEPENDENTLY
  const getFilteredPayments = () => {
      let pData = [...paymentList];

      if (isAdmin) {
          if (selectedEmployee) {
              const selectedUserObj = userList.find((u: any) => (u.uid === selectedEmployee || u.id === selectedEmployee));
              const targetName = selectedUserObj?.name?.trim().toLowerCase();

              pData = pData.filter((item: any) => {
                  const idMatch = (String(item.senderId) === String(selectedEmployee)) || 
                                  (String(item.userId) === String(selectedEmployee));
                  const itemName = (item.userName || item.senderName || '').trim().toLowerCase();
                  const nameMatch = targetName && itemName === targetName;
                  return idMatch || nameMatch;
              });
          }
      } else {
          pData = pData.filter((p: any) => 
              p.senderId === currentUser?.uid || 
              p.senderId === currentUser?.id || 
              p.userName === currentUser?.name
          );
      }

      if (viewMode !== 'All') {
          const targetYear = currentDate.getFullYear();
          const targetMonth = currentDate.getMonth();
          const targetDay = currentDate.getDate();

          const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
          const fyStartDateStr = `${fyStartYear}-04-01`; 
          const fyEndDateStr = `${fyStartYear + 1}-03-31`;
          
          const targetYM = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
          const targetYMD = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

          pData = pData.filter((item: any) => {
              const dateStr = getValidDateStr(item);
              if(dateStr === "1970-01-01") return false;
              
              if (viewMode === 'Month') return dateStr.startsWith(targetYM);
              if (viewMode === 'Day') return dateStr === targetYMD;
              if (viewMode === 'FY') return dateStr >= fyStartDateStr && dateStr <= fyEndDateStr;
              return true;
          });
      }
      return pData;
  };

  const displayList = getFilteredData(); 
  const renderedList = displayList.slice(0, visibleCount);
  const displayPayments = getFilteredPayments(); 

  // --- 2. CALCULATIONS ---
  const totalSales = displayList.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const totalCollection = displayPayments.reduce((sum, item) => sum + parseAmount(item.amount), 0);

  let baseMonthlyTarget = 0;
  if (selectedEmployee) {
      const u = userList.find((x:any) => x.uid === selectedEmployee || x.id === selectedEmployee);
      baseMonthlyTarget = (u && u.monthlyTarget && Number(u.monthlyTarget) > 0) ? Number(u.monthlyTarget) : 1000000;
  } else if (!isAdmin) {
      baseMonthlyTarget = (currentUser?.monthlyTarget && Number(currentUser.monthlyTarget) > 0) ? Number(currentUser.monthlyTarget) : 1000000;
  } else {
      baseMonthlyTarget = userList.reduce((sum:number, u:any) => {
          const role = (u.role || '').toLowerCase();
          if(role.includes('sales') || role.includes('manager') || role.includes('admin') || role.includes('account')) {
              const t = (u.monthlyTarget && Number(u.monthlyTarget) > 0) ? Number(u.monthlyTarget) : 1000000;
              return sum + t;
          }
          return sum;
      }, 0);
  }

  let target1 = baseMonthlyTarget;
  if (viewMode === 'FY') {
      target1 = baseMonthlyTarget * 12; 
  } else if (viewMode === 'Day') {
      target1 = baseMonthlyTarget / 25; 
  } else if (viewMode === 'All') {
      if (displayList.length > 0) {
          const oldestDateStr = getValidDateStr(displayList[displayList.length - 1]);
          const oldestDate = new Date(oldestDateStr !== "1970-01-01" ? oldestDateStr : Date.now());
          const today = new Date();
          const monthsDiff = Math.abs((today.getFullYear() - oldestDate.getFullYear()) * 12 + (today.getMonth() - oldestDate.getMonth())) + 1;
          target1 = baseMonthlyTarget * Math.max(1, monthsDiff);
      } else {
          target1 = baseMonthlyTarget * 12; 
      }
  }

  const target2 = target1 * 1.5;
  const t1Percent = target1 > 0 ? (totalSales / target1) * 100 : 0;
  const t2Percent = target2 > 0 ? (totalSales / target2) * 100 : 0;

 // --- 3. GRAPH LOGIC (100% Bulletproof Date Matching) ---
  const handleGraph = () => {
      let graphSourceList = [...orderList];
      
      graphSourceList = graphSourceList.filter(order => ['Approved', 'Completed', 'Dispatched'].includes(order.status));
      
      if (isAdmin && selectedEmployee) {
          const selectedUserObj = userList.find((u: any) => (u.uid === selectedEmployee || u.id === selectedEmployee));
          const targetName = selectedUserObj?.name?.trim().toLowerCase();
          
          graphSourceList = graphSourceList.filter((item: any) => {
              const idMatch = (String(item.senderId) === String(selectedEmployee)) || 
                              (String(item.userId) === String(selectedEmployee)) ||
                              (String(item.uid) === String(selectedEmployee));
              const itemName = (item.senderName || item.userName || '').trim().toLowerCase();
              const nameMatch = targetName && itemName === targetName;
              return idMatch || nameMatch;
          });
      } else if (!isAdmin) {
          graphSourceList = graphSourceList.filter((o: any) => 
              o.senderId === currentUser?.uid || o.senderId === currentUser?.id || o.userName === currentUser?.name
          );
      }

      const targetMonth = currentDate.getMonth(); 
      const targetYear = currentDate.getFullYear();
      const targetDay = currentDate.getDate();
      
      const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
      const fyStartDateStr = `${fyStartYear}-04-01`; 
      const fyEndDateStr = `${fyStartYear + 1}-03-31`;
      
      const targetYM = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
      const targetYMD = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

      graphSourceList = graphSourceList.filter((item: any) => {
          const dateStr = getValidDateStr(item);
          if (dateStr === "1970-01-01") return false;

          if (viewMode === 'FY') return dateStr >= fyStartDateStr && dateStr <= fyEndDateStr;
          if (viewMode === 'Month') return dateStr.startsWith(targetYM);
          if (viewMode === 'Day') return dateStr === targetYMD;
          return true; 
      });

      let tData: any[] = [];
      if (viewMode === 'Day') {
          tData = graphSourceList.slice(0, 7).map((o:any, i) => ({ label: `Ord ${i+1}`, value: parseAmount(o.amount) }));
      } else if (viewMode === 'Month') {
          tData = [1,2,3,4].map(week => ({label: `Wk ${week}`, value: 0})); 
          graphSourceList.forEach(o => {
              const dateStr = getValidDateStr(o);
              const day = parseInt(dateStr.split('-')[2]); 
              const weekIdx = Math.min(Math.floor((day-1)/7), 3);
              tData[weekIdx].value += parseAmount(o.amount);
          });
      } else {
          const fyMonthsStr = [
              `${fyStartYear}-04`, `${fyStartYear}-05`, `${fyStartYear}-06`,
              `${fyStartYear}-07`, `${fyStartYear}-08`, `${fyStartYear}-09`,
              `${fyStartYear}-10`, `${fyStartYear}-11`, `${fyStartYear}-12`,
              `${fyStartYear + 1}-01`, `${fyStartYear + 1}-02`, `${fyStartYear + 1}-03`
          ];
          const fyMonthLabels = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
          
          tData = fyMonthsStr.map((ym, i) => {
              const monthSales = graphSourceList.filter((o:any) => getValidDateStr(o).startsWith(ym))
                                                .reduce((sum, o:any) => sum + parseAmount(o.amount), 0);
              return { label: fyMonthLabels[i], value: monthSales };
          });
      }
      setTrendData(tData);

      const stats: Record<string, number> = {};
      graphSourceList.forEach((order: any) => {
          const rawName = order.productDetails || "Unknown";
          const name = rawName.split(',')[0].split('-')[0].trim().substring(0, 15);
          stats[name] = (stats[name] || 0) + parseAmount(order.amount);
      });
      
      const pData = Object.keys(stats).map(key => ({ label: key, value: stats[key] })).sort((a, b) => b.value - a.value).slice(0, 5);
      setProductData(pData.length ? pData : [{label:'No Data', value:0}]);
      
      setGraphTab('Trend'); 
      setGraphModalVisible(true);
  };

  const getSelectedEmployeeName = () => {
      if (!selectedEmployee) return 'All Team';
      const found = userList.find((u: any) => u.uid === selectedEmployee || u.id === selectedEmployee);
      return found ? found.name : 'Unknown User';
  };

  const getOrderPayments = (order: any) => {
      return paymentList.filter((p:any) => 
          (p.orderId && p.orderId === order.id) || 
          (p.orderRef && p.orderRef === order.orderId)
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Sales & Collection Trends</Text>
        </View>
      </View>

      <View style={styles.filterBox}>
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

          <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                  {isDbLoading ? <ActivityIndicator size="small" color="#1565c0" /> : <Ionicons name="search" size={20} color="gray" />}
                  <TextInput 
                      style={styles.input}
                      placeholder="Search ID, Hospital..."
                      value={searchText}
                      onChangeText={setSearchText}
                  />
                  {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="gray" /></TouchableOpacity>}
              </View>
              
              {isAdmin && (
                  <TouchableOpacity style={styles.filterBtn} onPress={() => setShowEmpPicker(true)}>
                      <Ionicons name="people" size={20} color={selectedEmployee ? "#3b5998" : "gray"} />
                  </TouchableOpacity>
              )}
          </View>

          <View style={{flexDirection:'row', justifyContent:'space-between', paddingHorizontal:5, marginTop:5}}>
              <Text style={{fontSize:11, color:'gray'}}>Orders: {displayList.length}</Text>
              {selectedEmployee && <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold'}}>Filter: {getSelectedEmployeeName()}</Text>}
          </View>
      </View>

      <ScrollView contentContainerStyle={{paddingBottom: 20}}>
        
        <View style={styles.cardsContainer}>
            <TouchableOpacity style={styles.targetCard} onPress={handleGraph}>
                <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Sales Achievement ({viewMode})</Text>
                    <Ionicons name="bar-chart" size={18} color="#3b5998" />
                </View>
                <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:5}}>
                    <View>
                        <Text style={{fontSize:12, color:'gray'}}>Confirmed Sales</Text>
                        <Text style={styles.achievedText}>₹ {totalSales.toLocaleString()}</Text>
                    </View>
                    <View style={{alignItems:'flex-end'}}>
                        <Text style={{fontSize:12, color:'gray'}}>Target 1</Text>
                        <Text style={[styles.achievedText, {color:'#555'}]}>₹ {target1.toLocaleString()}</Text>
                    </View>
                </View>
                
                <View style={styles.progressBg}>
                    <View style={[styles.progressFill, {
                        width: `${Math.min(t1Percent, 100)}%` as any, 
                        backgroundColor: t1Percent >= 100 ? '#4caf50' : '#1976D2'
                    }]} />
                    {t1Percent >= 100 && (
                        <View style={{
                            position:'absolute', left:0, height:'100%', 
                            backgroundColor:'#FFD700', width: `${Math.min(t2Percent - 100, 100)}%` as any, opacity: 0.7
                        }} />
                    )}
                </View>

                <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:4}}>
                    <Text style={{fontSize:11, color:'#1976D2', fontWeight:'bold'}}>
                        {t1Percent.toFixed(0)}% of Base Target
                    </Text>
                    
                    {t1Percent >= 100 ? (
                        <Text style={{fontSize:11, color:'#e65100', fontWeight:'bold'}}>
                            Next Goal (1.5x): {t2Percent.toFixed(0)}% 🚀
                        </Text>
                    ) : (
                        <Text style={{fontSize:11, color:'gray'}}>
                            Short by: ₹ {(target1 - totalSales).toLocaleString()}
                        </Text>
                    )}
                </View>

                <View style={{marginTop:15, paddingTop:10, borderTopWidth:1, borderColor:'#eee', flexDirection:'row', justifyContent:'space-between'}}>
                      <Text style={{fontSize:12, color:'gray'}}>Total Collection:</Text>
                      <Text style={{fontSize:14, fontWeight:'bold', color: '#2e7d32'}}>₹{totalCollection.toLocaleString()}</Text>
                </View>
                {totalSales > 0 && (
                    <Text style={{fontSize:11, color:'gray', alignSelf:'flex-end', marginTop:2}}>
                        Recovery: {((totalCollection/totalSales)*100).toFixed(0)}%
                    </Text>
                )}
            </TouchableOpacity>
        </View>

        <View style={styles.listSection}>
            <Text style={styles.sectionHeader}>Confirmed Orders</Text>
            <FlatList 
                data={renderedList}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                ListEmptyComponent={
                    <View style={{alignItems:'center'}}>
                        {isDbLoading ? <ActivityIndicator size="small" color="#1565c0" /> : <Text style={{color:'gray'}}>No confirmed orders found.</Text>}
                    </View>
                }
                renderItem={({item}) => {
                    const totalAmt = parseAmount(item.amount);
                    
                    let pending = 0;
                    let paidAmt = 0;

                    if (item.balance !== undefined) {
                        pending = parseFloat(item.balance);
                        paidAmt = totalAmt - pending;
                    } else {
                        paidAmt = getOrderPayments(item).reduce((s:number, p:any) => s + parseAmount(p.amount), 0);
                        pending = totalAmt - paidAmt;
                    }

                    const isPaid = pending <= 0;

                    return (
                        <TouchableOpacity style={styles.card} onPress={() => { setSelectedOrder(item); setPoModalVisible(true); }}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:5}}>
                                <View style={styles.idBadge}>
                                    <Text style={styles.idText}>{item.orderId || 'No ID'}</Text>
                                </View>
                                <Text style={styles.dateText}>{item.date}</Text>
                            </View>

                            <Text style={styles.hospitalName} numberOfLines={1}>{item.hospitalName}</Text>
                            
                            <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:8}}>
                                <View>
                                    <Text style={styles.label}>Value</Text>
                                    <Text style={styles.amount}>₹{totalAmt.toLocaleString()}</Text>
                                </View>
                                <View style={{alignItems:'flex-end'}}>
                                    <Text style={styles.label}>Received</Text>
                                    <Text style={[styles.amount, {color: paidAmt > 0 ? '#2e7d32' : 'gray'}]}>₹{paidAmt.toLocaleString()}</Text>
                                </View>
                            </View>

                            <View style={[styles.progressBg, {height:4, marginTop:8}]}>
                                <View style={[styles.progressFill, {width: `${Math.min((paidAmt/totalAmt)*100, 100)}%` as any, backgroundColor: isPaid ? 'green' : 'orange'}]} />
                            </View>
                            <Text style={{fontSize:10, color: isPaid?'green':'#d32f2f', textAlign:'right', marginTop:2}}>
                                {isPaid ? 'Fully Paid' : `Pending: ₹${pending.toLocaleString()}`}
                            </Text>
                        </TouchableOpacity>
                    );
                }}
                
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
        </View>
      </ScrollView>

      <Modal visible={showEmpPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.pickerContainer}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={styles.pickerHeader}>Filter by Employee</Text>
                      <TouchableOpacity onPress={() => setShowEmpPicker(false)}><Ionicons name="close" size={24} color="red"/></TouchableOpacity>
                  </View>
                  <ScrollView>
                      <TouchableOpacity style={styles.pickerOption} onPress={() => { setSelectedEmployee(null); setShowEmpPicker(false); }}>
                          <Text style={[styles.pickerText, !selectedEmployee && {fontWeight:'bold', color:'#3b5998'}]}>All Team</Text>
                          {!selectedEmployee && <Ionicons name="checkmark" size={18} color="#3b5998"/>}
                      </TouchableOpacity>
                      {userList.map((u:any) => (
                          <TouchableOpacity key={u.id} style={styles.pickerOption} onPress={() => { setSelectedEmployee(u.uid || u.id); setShowEmpPicker(false); }}>
                              <Text style={[styles.pickerText, selectedEmployee === (u.uid || u.id) && {fontWeight:'bold', color:'#3b5998'}]}>{u.name}</Text>
                              {selectedEmployee === (u.uid || u.id) && <Ionicons name="checkmark" size={18} color="#3b5998"/>}
                          </TouchableOpacity>
                      ))}
                  </ScrollView>
              </View>
          </View>
      </Modal>

      <Modal visible={poModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeaderRow}>
                    <Text style={styles.modalTitle}>{selectedOrder?.orderId || 'Order Details'}</Text>
                    <TouchableOpacity onPress={() => setPoModalVisible(false)}>
                        <Ionicons name="close-circle" size={28} color="#d32f2f" />
                    </TouchableOpacity>
                </View>

                {selectedOrder && (
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.modalHospitalName}>{selectedOrder.hospitalName}</Text>
                        <Text style={{color:'gray', marginBottom:15}}>PO: {selectedOrder.poNumber} • Date: {selectedOrder.date}</Text>

                        <View style={{backgroundColor:'#f0f4c3', padding:10, borderRadius:8, marginBottom:15}}>
                            <Text style={{fontWeight:'bold', color:'#555', marginBottom:5}}>PAYMENT HISTORY</Text>
                            {getOrderPayments(selectedOrder).length > 0 ? (
                                getOrderPayments(selectedOrder).map((p:any, i:number) => (
                                    <View key={i} style={{flexDirection:'row', justifyContent:'space-between', borderBottomWidth:1, borderColor:'#dce775', paddingVertical:5}}>
                                        <Text style={{fontSize:12}}>{p.date}</Text>
                                        <Text style={{fontSize:12}}>{p.mode}</Text>
                                        <Text style={{fontSize:12, fontWeight:'bold', color:'#2e7d32'}}>₹{p.amount}</Text>
                                    </View>
                                ))
                            ) : <Text style={{fontSize:12, fontStyle:'italic', color:'gray'}}>No linked payments found.</Text>}
                            
                            <View style={{marginTop:8, borderTopWidth:1, borderColor:'#999', paddingTop:5, flexDirection:'row', justifyContent:'space-between'}}>
                                <Text style={{fontWeight:'bold'}}>Total Received:</Text>
                                <Text style={{fontWeight:'bold', color:'#2e7d32'}}>₹{getOrderPayments(selectedOrder).reduce((s:number,p:any)=>s+p.amount,0).toLocaleString()}</Text>
                            </View>
                        </View>

                        <Text style={styles.sectionHeader}>Product Details</Text>
                        <View style={styles.productBox}>
                            <Text style={{color:'#333', lineHeight:20}}>{selectedOrder.productDetails}</Text>
                        </View>
                    </ScrollView>
                )}
            </View>
        </View>
      </Modal>

      <Modal visible={graphModalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.graphModalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                      <Text style={styles.modalTitle}>Performance Analysis</Text>
                      <TouchableOpacity onPress={() => setGraphModalVisible(false)}>
                          <Ionicons name="close" size={24} color="red" />
                      </TouchableOpacity>
                  </View>

                  <View style={{flexDirection:'row', backgroundColor:'#f0f0f0', borderRadius:8, padding:3, marginBottom:20}}>
                      <TouchableOpacity 
                          style={{flex:1, paddingVertical:8, alignItems:'center', borderRadius:6, backgroundColor: graphTab==='Trend'?'white':'transparent', elevation: graphTab==='Trend'?2:0}} 
                          onPress={()=>setGraphTab('Trend')}>
                          <Text style={{fontWeight:'bold', color: graphTab==='Trend'?'#3b5998':'gray'}}>📈 Sales Trend</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                          style={{flex:1, paddingVertical:8, alignItems:'center', borderRadius:6, backgroundColor: graphTab==='Products'?'white':'transparent', elevation: graphTab==='Products'?2:0}} 
                          onPress={()=>setGraphTab('Products')}>
                          <Text style={{fontWeight:'bold', color: graphTab==='Products'?'#3b5998':'gray'}}>🏆 Top Items</Text>
                      </TouchableOpacity>
                  </View>

                  <View style={styles.chartContainer}>
                      <Text style={{position:'absolute', top:-20, left:0, fontSize:12, color:'gray', fontStyle:'italic'}}>
                          {graphTab === 'Trend' ? `Sales over Time (${viewMode})` : `Top Selling Products (By Value)`}
                      </Text>
                      
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {(graphTab === 'Trend' ? trendData : productData).map((d, i) => (
                              <View key={i} style={{alignItems:'center', marginRight:15, width:55, justifyContent:'flex-end'}}>
                                  <Text style={{fontSize:10, marginBottom:4, fontWeight:'bold', color:'#333'}}>
                                      {d.value > 100000 ? (d.value/100000).toFixed(1)+'L' : (d.value > 1000 ? (d.value/1000).toFixed(0)+'k' : d.value)}
                                  </Text>
                                  <View style={{
                                      width:30, 
                                      backgroundColor: graphTab==='Trend' ? '#3b5998' : '#e65100', 
                                      height: (d.value / (Math.max(...(graphTab==='Trend'?trendData:productData).map((x:any)=>x.value))||1)) * 300, 
                                      borderRadius:4,
                                      minHeight: 10
                                  }} />
                                  <Text style={{fontSize:10, marginTop:6, textAlign:'center', color:'#555'}} numberOfLines={2}>
                                      {d.label}
                                  </Text>
                              </View>
                          ))}
                      </ScrollView>
                  </View>

              </View>
          </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  filterBox: { backgroundColor: 'white', padding: 10, paddingBottom:5, marginBottom: 10, elevation: 1 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 3, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
  searchRow: { flexDirection: 'row', justifyContent: 'space-between' },
  searchBar: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 8, flexDirection:'row', alignItems:'center', paddingHorizontal: 10, height: 40 },
  input: { flex:1, marginLeft:5, fontSize:14 },
  filterBtn: { width:40, height:40, marginLeft:10, backgroundColor:'white', borderRadius:8, justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:'#ddd' },
  cardsContainer: { padding: 15, paddingBottom:0 },
  targetCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { color: 'gray', fontWeight: 'bold', fontSize:12, textTransform:'uppercase' },
  achievedText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  progressBg: { height: 10, backgroundColor: '#f0f0f0', borderRadius: 5, overflow: 'hidden', marginBottom: 5, marginTop:10, position:'relative' },
  progressFill: { height: '100%', borderRadius: 5 },
  percentText: { fontSize: 12, fontWeight: 'bold', alignSelf: 'flex-end', color: '#555' },
  listSection: { padding: 15 },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 1 },
  hospitalName: { fontWeight: 'bold', fontSize: 15, color:'#333', marginTop:5 },
  amount: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  dateText: { fontSize: 11, color: '#999' },
  label: { fontSize: 10, color: 'gray', marginBottom: 2 },
  
  idBadge: { backgroundColor:'#e3f2fd', paddingHorizontal:6, paddingVertical:2, borderRadius:4, alignSelf:'flex-start' },
  idText: { fontSize:10, color:'#1565c0', fontWeight:'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '90%', backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '80%' },
  pickerContainer: { width: '90%', backgroundColor: 'white', borderRadius: 12, padding: 20, elevation: 10, maxHeight: '70%' },
  pickerHeader: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  pickerOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection: 'row', justifyContent: 'space-between' },
  pickerText: { fontSize: 15, color: '#444' },
  modalHeaderRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15, borderBottomWidth:1, borderBottomColor:'#eee', paddingBottom:10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  modalHospitalName: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  productBox: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  graphModalContent: { width: '95%', backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5, maxHeight: '85%' },
  chartContainer: { height: 400, flexDirection: 'row', alignItems: 'flex-end', paddingTop: 20 },
});