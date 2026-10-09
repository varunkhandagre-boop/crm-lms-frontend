import { Ionicons } from '@expo/vector-icons';
import { saveAndShareFile } from '../utils/saveFile';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { sharePdfFromHtml } from '../utils/sharePdf';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

// 🔥 SAAS IMPORTS (No direct Firebase DB imports)
import { getSalesSummary, listSoldOrdersPage, SalesFilters, SalesSummary } from '../services/api/orders';
import { listPaymentCollectionsPage, PaymentPageFilters } from '../services/api/paymentCollections';
import { useServerPagedList } from '../hooks/useServerPagedList';
import { periodRange, useDebounced } from '../utils/periodRange';
import { fetchTeamMembers } from '../services/api/users';
import { useData } from './context/DataContext';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { PeriodTabs, StaffPeriodRow } from '../components/compact';


export default function SalesAnalysisScreen() {
  const headerTop = useHeaderTop();
  const router = useRouter();
  
  // 🔥 Context se SaaS User
  const { currentUser } = useData();

  // 🔥 SaaS Engine

  // STATES FOR DATA
  // userList now comes from useCachedList below (cache-first, shared 'team_members' key)
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);

  // STATES
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  
  // 🔥 State for Cash/Credit/Collection filtering
  const [saleTypeFilter, setSaleTypeFilter] = useState<'All' | 'Cash' | 'Credit' | 'Collection'>('All');
  
  // MODALS
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  
  // Order Modal States
  const [poModalVisible, setPoModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // 🔥 Payment/Collection Modal States
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  
  // GRAPH
  const [graphModalVisible, setGraphModalVisible] = useState(false);
  const [graphTab, setGraphTab] = useState<'Trend' | 'Products'>('Trend');
  const [trendData, setTrendData] = useState<any[]>([]); 
  const [productData, setProductData] = useState<any[]>([]); 

  // PAGINATION & EXPORT STATE 
  const [isDownloading, setIsDownloading] = useState(false);

  const userRole = currentUser?.role ? currentUser.role.toLowerCase() : 'unknown';
  const isAdmin = ['admin', 'manager', 'accountant', 'hr', 'superadmin'].includes(userRole);

  useEffect(() => {
      setSaleTypeFilter('All');
  }, [viewMode, currentDate, selectedEmployee, searchText]);

  // 🔥 SALES + COLLECTIONS — totals, charts and top products are summed on the
  // server for the date range / person / search; the list below is one page of
  // sold orders (or receipts on the Collection tab) at a time.
  const debouncedSearch = useDebounced(searchText.trim());
  const salesFilters = useMemo<SalesFilters>(() => ({
      ...periodRange(viewMode, currentDate),
      createdById: isAdmin && selectedEmployee ? selectedEmployee : undefined,
      search: debouncedSearch || undefined,
  }), [viewMode, currentDate, isAdmin, selectedEmployee, debouncedSearch]);
  const isCollectionTab = saleTypeFilter === 'Collection';
  const orderFilters = useMemo(() => ({
      ...salesFilters,
      saleType: saleTypeFilter === 'Cash' ? 'Cash' as const : saleTypeFilter === 'Credit' ? 'Credit' as const : undefined,
  }), [salesFilters, saleTypeFilter]);
  const payFilters = useMemo<PaymentPageFilters>(() => ({
      fromDate: salesFilters.fromDate, toDate: salesFilters.toDate, createdById: salesFilters.createdById,
  }), [salesFilters]);
  const orderPages = useServerPagedList<typeof orderFilters, any>({
      fetchPage: listSoldOrdersPage, filters: orderFilters, enabled: !!currentUser?.companyId && !isCollectionTab,
  });
  const payPages = useServerPagedList<PaymentPageFilters, any>({
      fetchPage: listPaymentCollectionsPage, filters: payFilters, enabled: !!currentUser?.companyId && isCollectionTab,
  });
  const activePages = isCollectionTab ? payPages : orderPages;
  const listData = activePages.items;

  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryKey = JSON.stringify(salesFilters);
  const summaryReq = useRef(0);
  const loadSummary = useCallback(async () => {
      if (!currentUser?.companyId) return;
      const id = ++summaryReq.current;
      setSummaryLoading(true);
      try {
          const s = await getSalesSummary(JSON.parse(summaryKey));
          if (id === summaryReq.current) setSummary(s);
      } catch (e) {
          // keep the last numbers on a transient error
      } finally {
          if (id === summaryReq.current) setSummaryLoading(false);
      }
  }, [summaryKey, currentUser?.companyId]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const isAnalysisLoading = activePages.loading || summaryLoading;
  const analysisRefreshing = activePages.refreshing;
  const onRefresh = () => { activePages.refresh(); loadSummary(); };

  /** Every row of the current filter (bounded by the date range) — for PDF / CSV. */
  const fetchAllRows = async (): Promise<any[]> => {
      const rows: any[] = [];
      for (let page = 1; page <= 50; page++) {
          const r = isCollectionTab
              ? await listPaymentCollectionsPage({ ...payFilters, page, limit: 100 })
              : await listSoldOrdersPage({ ...orderFilters, page, limit: 100 });
          rows.push(...r.items);
          if (page >= r.totalPages) break;
      }
      return rows;
  };

  // 🔥 Users — cache-first, shares the SAME 'team_members' cache key as
  // manage_team.tsx/employee_timeline.tsx.
  const { data: userList } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });
  useEffect(() => {
      if (isAdmin) {
          const mappedUsers = userList.map((u: any) => ({
              id: u.id,
              name: u.name || 'Unknown User'
          }));
          setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
      }
  }, [userList, isAdmin]);



  const parseAmount = (amountStr: any) => {
      if(!amountStr) return 0;
      const str = amountStr.toString().replace(/[^0-9.]/g, '');
      return parseFloat(str) || 0;
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
          const currentMonth = currentDate.getMonth(); 
          const currentYear = currentDate.getFullYear();
          const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
          const fyEndYear = fyStartYear + 1;
          return `FY ${fyStartYear.toString().slice(-2)}-${fyEndYear.toString().slice(-2)}`;
      }
      return "All Time";
  };

  const getCity = (item: any) => item.city || ''; // stored on the order

  // Totals for the whole filter, from the server.
  const totalSales = summary?.totalSales ?? 0;
  const cashSales = summary?.cashSales ?? 0;
  const creditSales = summary?.creditSales ?? 0;
  const totalCollection = summary?.totalCollection ?? 0;

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
      if (summary?.oldestDate) {
          const oldestDateStr = summary.oldestDate;
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

  const handleGraph = () => {
      let tData: any[] = [];
      const targetMonth = currentDate.getMonth(); 
      const targetYear = currentDate.getFullYear();
      const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;

      if (viewMode === 'Day') {
          tData = (isCollectionTab ? [] : listData).slice(0, 7).map((o:any, i: number) => ({ label: `Ord ${i+1}`, value: parseAmount(o.amount) }));
      } else if (viewMode === 'Month') {
          tData = [1,2,3,4].map(week => ({label: `Wk ${week}`, value: 0})); 
          (summary?.byDay || []).forEach(d => {
              const day = parseInt(d.date.split('-')[2]); 
              const weekIdx = Math.min(Math.floor((day-1)/7), 3);
              tData[weekIdx].value += d.amount;
          });
      } else {
          const fyMonthsStr = [
              `${fyStartYear}-04`, `${fyStartYear}-05`, `${fyStartYear}-06`,
              `${fyStartYear}-07`, `${fyStartYear}-08`, `${fyStartYear}-09`,
              `${fyStartYear}-10`, `${fyStartYear}-11`, `${fyStartYear}-12`,
              `${fyStartYear + 1}-01`, `${fyStartYear + 1}-02`, `${fyStartYear + 1}-03`
          ];
          const fyMonthLabels = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
          tData = fyMonthsStr.map((ym, i) => ({
              label: fyMonthLabels[i],
              value: (summary?.byMonth || []).find(m => m.month === ym)?.amount ?? 0,
          }));
      }
      setTrendData(tData);

      const pData = summary?.topProducts || [];
      setProductData(pData.length ? pData : [{label:'No Data', value:0}]);
      
      setGraphTab('Trend'); 
      setGraphModalVisible(true);
  };

  const getSelectedEmployeeName = () => {
      if (!selectedEmployee) return 'All Team';
      const found = userList.find((u: any) => u.uid === selectedEmployee || u.id === selectedEmployee);
      return found ? found.name : 'Unknown User';
  };

  // Receipts linked to the order in the popup — fetched when it opens.
  const [orderPayments, setOrderPayments] = useState<any[]>([]);
  const openOrder = (order: any) => {
      setSelectedOrder(order);
      setOrderPayments([]);
      setPoModalVisible(true);
      listPaymentCollectionsPage({ linkedOrderId: order.id, page: 1, limit: 100 })
          .then(r => setOrderPayments(r.items))
          .catch(() => {});
  };
  const getOrderPayments = (order: any) => (selectedOrder && order?.id === selectedOrder.id ? orderPayments : []);

  // 🔥 DOWNLOAD EXCEL (CSV) LOGIC
  const downloadReportCSV = async () => {
      if(listData.length === 0) {
          Alert.alert("No Data", "There is no data to download for this filter.");
          return;
      }
      setIsDownloading(true);
      try {
          const rows = await fetchAllRows(); // the whole filter, not just the loaded page
          let csvString = "";
          
          if (saleTypeFilter === 'Collection') {
              csvString = "S.No,Date,Receipt No,Client / Hospital,Payment Mode,Collected By,Amount (Rs)\n";
              rows.forEach((item, index) => {
                  const date = item.date || '-';
                  const receipt = item.receiptNo || '-';
                  const hospital = `"${(item.orgName || '').replace(/"/g, '""')}"`;
                  const mode = item.mode || '-';
                  const user = item.userName || '-';
                  const amount = parseAmount(item.amount);
                  csvString += `${index + 1},${date},${receipt},${hospital},${mode},${user},${amount}\n`;
              });
              csvString += `\n,,,,,,Total Collection,Rs. ${totalCollection}\n`;
          } else {
              csvString = "S.No,Date,Order ID,Client / Hospital,City,Products,Type,Amount (Rs)\n";
              rows.forEach((item, index) => {
                  const type = item.saleType === 'Cash' ? 'Cash' : 'Credit';
                  const date = item.date || '-';
                  const orderId = item.orderId || '-';
                  const hospital = `"${(item.hospitalName || '').replace(/"/g, '""')}"`;
                  const city = `"${getCity(item).replace(/"/g, '""')}"`;
                  const products = `"${(item.productDetails || '-').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
                  const amount = parseAmount(item.amount);
                  csvString += `${index + 1},${date},${orderId},${hospital},${city},${products},${type},${amount}\n`;
              });
              csvString += `\n,,,,,Total Cash Sales,Rs. ${cashSales}\n`;
              csvString += `,,,,,Total Credit Sales,Rs. ${creditSales}\n`;
              csvString += `,,,,,Grand Total Sales,Rs. ${totalSales}\n`;
          }

          const fileName = `${saleTypeFilter === 'Collection' ? 'Collection' : 'Sales'}_Report_${Date.now()}.csv`;
          await saveAndShareFile({ content: csvString, fileName, mimeType: 'text/csv', dialogTitle: 'Download Excel (CSV) Report' });
      } catch (error) {
          Alert.alert("Error", "Could not generate Excel/CSV file");
      } finally {
          setIsDownloading(false);
      }
  };

  // 🔥 DOWNLOAD PDF LOGIC
  const downloadReportPDF = async () => {
      if(listData.length === 0) {
          Alert.alert("No Data", "There is no data to download for this filter.");
          return;
      }
      setIsDownloading(true);
      try {
          const rows = await fetchAllRows(); // the whole filter, not just the loaded page
          
          let tableHTML = "";
          if (saleTypeFilter === 'Collection') {
              tableHTML = `
              <table>
                  <thead>
                      <tr>
                          <th width="5%" class="center">#</th>
                          <th width="12%">Date</th>
                          <th width="15%">Receipt No</th>
                          <th width="28%">Client / Hospital</th>
                          <th width="15%">Mode</th>
                          <th width="15%">Collected By</th>
                          <th width="10%" class="right">Amount (Rs)</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${rows.map((item, index) => `
                      <tr>
                          <td class="center">${index + 1}</td>
                          <td>${item.date || '-'}</td>
                          <td>${item.receiptNo || '-'}</td>
                          <td><strong>${item.orgName || '-'}</strong></td>
                          <td>${item.mode || '-'} ${item.bankName ? `<br><small>${item.bankName}</small>` : ''}</td>
                          <td>${item.userName || '-'}</td>
                          <td class="right"><strong>${parseAmount(item.amount).toLocaleString()}</strong></td>
                      </tr>
                      `).join('')}
                      <tr style="background-color: #f0f4f8;">
                          <td colspan="6" class="right" style="font-weight: bold; color: #333;">Total Collection</td>
                          <td class="right" style="font-weight: bold; font-size: 14px; color: #e65100;">Rs. ${totalCollection.toLocaleString()}</td>
                      </tr>
                  </tbody>
              </table>`;
          } else {
              tableHTML = `
              <table>
                  <thead>
                      <tr>
                          <th width="5%" class="center">#</th>
                          <th width="10%">Date</th>
                          <th width="12%">Order ID</th>
                          <th width="20%">Client / Hospital</th>
                          <th width="10%">City</th>
                          <th width="20%">Products</th>
                          <th width="8%" class="center">Type</th>
                          <th width="15%" class="right">Amount (Rs)</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${rows.map((item, index) => {
                          const isCash = item.saleType === 'Cash';
                          return `
                          <tr>
                              <td class="center">${index + 1}</td>
                              <td>${item.date}</td>
                              <td>${item.orderId || 'N/A'}</td>
                              <td><strong>${item.hospitalName}</strong></td>
                              <td>${getCity(item)}</td>
                              <td>${item.productDetails || '-'}</td>
                              <td class="center ${isCash ? 'cash' : 'credit'}">${isCash ? 'Cash' : 'Credit'}</td>
                              <td class="right"><strong>${parseAmount(item.amount).toLocaleString()}</strong></td>
                          </tr>
                          `;
                      }).join('')}
                      <tr style="background-color: #f0f4f8;">
                          <td colspan="7" class="right" style="font-weight: bold; color: #333;">Grand Total</td>
                          <td class="right" style="font-weight: bold; font-size: 16px; color: #3b5998;">Rs. ${totalSales.toLocaleString()}</td>
                      </tr>
                  </tbody>
              </table>`;
          }

          const htmlContent = `
          <html>
          <head>
              <style>
                  body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #333; }
                  .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #3b5998; padding-bottom: 10px; }
                  .title { font-size: 24px; font-weight: bold; color: #3b5998; margin: 0; }
                  .sub-title { font-size: 14px; color: #555; margin-top: 5px; }
                  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                  th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 12px; }
                  th { background-color: #f0f4f8; color: #3b5998; font-weight: bold; }
                  .right { text-align: right; }
                  .center { text-align: center; }
                  .cash { color: #2e7d32; font-weight: bold; }
                  .credit { color: #1565c0; font-weight: bold; }
                  .summary-box { display: flex; justify-content: space-between; background-color: #f9f9f9; border: 1px solid #ddd; padding: 15px; margin-top: 20px; border-radius: 8px; }
                  .summary-item { text-align: center; }
                  .summary-value { font-size: 18px; font-weight: bold; margin-top: 5px; }
              </style>
          </head>
          <body>
              <div class="header">
                  <p class="title">${saleTypeFilter === 'Collection' ? 'COLLECTION REPORT' : `SALES REPORT ${saleTypeFilter !== 'All' ? `(${saleTypeFilter} Only)` : ''}`}</p>
                  <p class="sub-title">Period: <strong>${getHeaderDate()}</strong> | Employee: <strong>${getSelectedEmployeeName()}</strong></p>
              </div>

              ${saleTypeFilter !== 'Collection' ? `
              <div class="summary-box">
                  <div class="summary-item">
                      <div style="color: gray; font-size: 12px;">Total Cash Sales</div>
                      <div class="summary-value cash">Rs. ${cashSales.toLocaleString()}</div>
                  </div>
                  <div class="summary-item">
                      <div style="color: gray; font-size: 12px;">Total Credit Sales</div>
                      <div class="summary-value credit">Rs. ${creditSales.toLocaleString()}</div>
                  </div>
                  <div class="summary-item">
                      <div style="color: gray; font-size: 12px;">Total Sales</div>
                      <div class="summary-value" style="color: #333;">Rs. ${totalSales.toLocaleString()}</div>
                  </div>
              </div>` : ''}

              ${tableHTML}

              <div style="margin-top: 30px; text-align: center; font-size: 10px; color: gray;">
                  *This report was auto-generated by the system on ${new Date().toLocaleString()}.
              </div>
          </body>
          </html>
          `;

          await sharePdfFromHtml(htmlContent, `Sales_Report_${Date.now()}`, 'Download Report');
      } catch (error) {
          Alert.alert("Error", "Could not generate PDF report");
      } finally {
          setIsDownloading(false);
      }
  };

  const handleDownloadOptions = () => {
      if(listData.length === 0) {
          Alert.alert("No Data", "There is no data to download for this filter.");
          return;
      }
      
      const reportName = saleTypeFilter === 'Collection' ? 'Payments' : (saleTypeFilter === 'All' ? 'All Orders' : `${saleTypeFilter} Orders`);
      
      Alert.alert(
          "Download Report",
          `Download list for ${reportName}:`,
          [
              { text: "Cancel", style: "cancel" },
              { text: "📄 PDF", onPress: downloadReportPDF },
              { text: "📊 Excel (CSV)", onPress: downloadReportCSV }
          ]
      );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Sales & Collection Trends</Text>
        </View>
        
        {/* 🔥 DOWNLOAD BUTTON */}
        <TouchableOpacity onPress={handleDownloadOptions} style={styles.downloadBtn} disabled={isDownloading}>
            {isDownloading ? <ActivityIndicator color="#3b5998" size="small" /> : <Ionicons name="download-outline" size={24} color="#3b5998" />}
        </TouchableOpacity>
      </View>

      <View style={styles.filterBox}>
          <PeriodTabs value={viewMode} onChange={setViewMode} />
          <StaffPeriodRow
              periodLabel={viewMode !== 'All' ? getHeaderDate() : undefined}
              onPrev={() => changeDate(-1)}
              onNext={() => changeDate(1)}
          />

          <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                  {<Ionicons name="search" size={20} color="gray" />}
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

          <View style={{flexDirection:'row', justifyContent:'space-between', paddingHorizontal:14, marginTop:4}}>
              <Text style={{fontSize:11, color:'gray'}}>Records: {activePages.total}</Text>
              {selectedEmployee && <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold'}}>Filter: {getSelectedEmployeeName()}</Text>}
          </View>
      </View>

      <ScrollView
          contentContainerStyle={{paddingBottom: 20}}
          refreshControl={
              <RefreshControl refreshing={analysisRefreshing} onRefresh={onRefresh} colors={['#1565c0']} tintColor="#1565c0" />
          }
      >
        
        {/* SUMMARY CARD WITH CASH/CREDIT FILTERS */}
        <View style={styles.cardsContainer}>
            <View style={styles.targetCard}>
                <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Performance Snapshot ({viewMode})</Text>
                    <TouchableOpacity onPress={handleGraph}><Ionicons name="bar-chart" size={18} color="#3b5998" /></TouchableOpacity>
                </View>
                
                <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:5}}>
                    <TouchableOpacity onPress={() => setSaleTypeFilter('All')}>
                        <Text style={{fontSize:12, color:'gray'}}>Confirmed Sales</Text>
                        <Text style={styles.achievedText}>₹ {totalSales.toLocaleString()}</Text>
                        <Text style={{fontSize:9, color:'#1976D2', marginTop:2}}>Click to view all</Text>
                    </TouchableOpacity>
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

                {/* 🔥 CASH, CREDIT & COLLECTION FILTER BUTTONS */}
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderColor: '#eee'}}>
                    <TouchableOpacity 
                        style={{alignItems: 'center', flex: 1, paddingVertical: 5, backgroundColor: saleTypeFilter === 'Cash' ? '#e8f5e9' : 'transparent', borderRadius: 8}}
                        onPress={() => setSaleTypeFilter('Cash')}
                    >
                        <Text style={{fontSize: 10, color: 'gray', marginBottom: 2}}>💵 Cash Sales</Text>
                        <Text style={{fontSize: 13, fontWeight: 'bold', color: '#2e7d32'}}>₹{cashSales.toLocaleString()}</Text>
                    </TouchableOpacity>
                    
                    <View style={{width: 1, backgroundColor: '#eee', height: '100%'}} />
                    
                    <TouchableOpacity 
                        style={{alignItems: 'center', flex: 1, paddingVertical: 5, backgroundColor: saleTypeFilter === 'Credit' ? '#e3f2fd' : 'transparent', borderRadius: 8}}
                        onPress={() => setSaleTypeFilter('Credit')}
                    >
                        <Text style={{fontSize: 10, color: 'gray', marginBottom: 2}}>📄 Billed (Credit)</Text>
                        <Text style={{fontSize: 13, fontWeight: 'bold', color: '#1565c0'}}>₹{creditSales.toLocaleString()}</Text>
                    </TouchableOpacity>
                    
                    <View style={{width: 1, backgroundColor: '#eee', height: '100%'}} />
                    
                    <TouchableOpacity 
                        style={{alignItems: 'center', flex: 1, paddingVertical: 5, backgroundColor: saleTypeFilter === 'Collection' ? '#fff3e0' : 'transparent', borderRadius: 8}}
                        onPress={() => setSaleTypeFilter('Collection')}
                    >
                        <Text style={{fontSize: 10, color: 'gray', marginBottom: 2}}>💰 Collection</Text>
                        <Text style={{fontSize: 13, fontWeight: 'bold', color: '#e65100'}}>₹{totalCollection.toLocaleString()}</Text>
                    </TouchableOpacity>
                </View>
                
                {totalSales > 0 && (
                    <Text style={{fontSize: 10, color: 'gray', alignSelf: 'flex-end', marginTop: 8}}>
                        Overall Recovery: {((totalCollection / totalSales) * 100).toFixed(0)}%
                    </Text>
                )}
            </View>
        </View>

        {/* LIST */}
        <View style={styles.listSection}>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 6}}>
                <Text style={styles.sectionHeader}>
                    {saleTypeFilter === 'Collection' ? 'Payment Collections' : 'Confirmed Orders'} 
                    {saleTypeFilter !== 'All' ? <Text style={{color:'#d32f2f', fontSize:12}}> ({saleTypeFilter} Only)</Text> : ''}
                </Text>
                {saleTypeFilter !== 'All' && (
                    <TouchableOpacity onPress={() => setSaleTypeFilter('All')}>
                        <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold'}}>Clear Filter</Text>
                    </TouchableOpacity>
                )}
            </View>

            <FlatList 
                data={listData}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                renderItem={({item}) => {
                    
                    // 🔥 RENDER PAYMENT CARD
                    if (saleTypeFilter === 'Collection') {
                        return (
                            <TouchableOpacity 
                                style={styles.card} 
                                onPress={() => { setSelectedPayment(item); setPaymentModalVisible(true); }}
                            >
                                <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:5}}>
                                    <View style={[styles.idBadge, {backgroundColor:'#fff3e0'}]}>
                                        <Text style={[styles.idText, {color:'#e65100'}]}>{item.receiptNo || 'Receipt'}</Text>
                                    </View>
                                    <Text style={styles.dateText}>{item.date}</Text>
                                </View>
                                
                                <Text style={styles.hospitalName} numberOfLines={1}>{item.orgName}</Text>
                                
                                <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:8}}>
                                    <View>
                                        <Text style={styles.label}>Mode</Text>
                                        <Text style={styles.amount}>{item.mode} {item.bankName ? `(${item.bankName})` : ''}</Text>
                                    </View>
                                    <View style={{alignItems:'flex-end'}}>
                                        <Text style={styles.label}>Amount</Text>
                                        <Text style={[styles.amount, {color: '#2e7d32'}]}>₹{parseAmount(item.amount).toLocaleString()}</Text>
                                    </View>
                                </View>
                                {item.orderRef && <Text style={{fontSize:10, color:'gray', marginTop:4}}>Linked Ref: {item.orderRef}</Text>}
                                {item.userName && <Text style={{fontSize:10, color:'#3b5998', marginTop:2}}>Collected by: {item.userName}</Text>}
                            </TouchableOpacity>
                        );
                    }

                    // 🔥 RENDER ORDER CARD (CASH/CREDIT/ALL)
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
                    const isCash = item.saleType === 'Cash';

                    return (
                        <TouchableOpacity style={styles.card} onPress={() => openOrder(item)}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:5}}>
                                <View style={styles.idBadge}>
                                    <Text style={styles.idText}>{item.orderId || 'No ID'}</Text>
                                </View>
                                <Text style={styles.dateText}>{item.date}</Text>
                            </View>

                            <Text style={styles.hospitalName} numberOfLines={1}>{item.hospitalName}</Text>
                            
                            <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:8}}>
                                <View>
                                    <Text style={styles.label}>Value ({isCash ? '💵 Cash' : '📄 Credit'})</Text>
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
                ListEmptyComponent={<Text style={{textAlign:'center', color:'gray', marginTop:20}}>{activePages.loading ? 'Loading...' : activePages.error ? 'Could not load — pull down to retry.' : 'No records found for this filter.'}</Text>}
                
                ListFooterComponent={
                    <View style={{ paddingBottom: 80 }}>
                        {activePages.hasMore ? (
                            <TouchableOpacity
                                onPress={activePages.loadMore}
                                disabled={activePages.loadingMore}
                                style={{
                                    padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 15, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', elevation: 1
                                }}
                            >
                                {activePages.loadingMore ? <ActivityIndicator color="#3b5998" /> : (
                            <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({activePages.total - listData.length} remaining)</Text>
                        )}
                            </TouchableOpacity>
                        ) : (
                            listData.length > 0 ? (
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

      {/* --- EMPLOYEE PICKER MODAL --- */}
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

      {/* ORDER DETAILS MODAL */}
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
                        
                        {selectedOrder.poFileUri && (
                            <Text style={{color:'#1565c0', marginTop:10, textDecorationLine:'underline'}}>View Attached PO Document</Text>
                        )}
                    </ScrollView>
                )}
            </View>
        </View>
      </Modal>

      {/* 🔥 NEW: PAYMENT DETAILS MODAL */}
      <Modal visible={paymentModalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={styles.modalHeaderRow}>
                      <Text style={styles.modalTitle}>{selectedPayment?.receiptNo || 'Payment Details'}</Text>
                      <TouchableOpacity onPress={() => setPaymentModalVisible(false)}>
                          <Ionicons name="close-circle" size={28} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  {selectedPayment && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          <Text style={styles.modalHospitalName}>{selectedPayment.orgName}</Text>
                          <Text style={{color:'gray', marginBottom:15}}>Date: {selectedPayment.date}</Text>

                          <View style={{backgroundColor:'#e8f5e9', padding:15, borderRadius:10, marginBottom:15, alignItems:'center'}}>
                              <Text style={{fontSize:12, color:'gray', fontWeight:'bold'}}>AMOUNT RECEIVED</Text>
                              <Text style={{fontSize:26, fontWeight:'bold', color:'#2e7d32'}}>
                                  ₹ {parseAmount(selectedPayment.amount).toLocaleString()}
                              </Text>
                          </View>

                          <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Payment Mode</Text>
                              <Text style={styles.detailValue}>{selectedPayment.mode} {selectedPayment.bankName ? `(${selectedPayment.bankName})` : ''}</Text>
                          </View>

                          {selectedPayment.refNumber ? (
                              <View style={styles.detailRow}>
                                  <Text style={styles.detailLabel}>Ref / Cheque No</Text>
                                  <Text style={styles.detailValue}>{selectedPayment.refNumber}</Text>
                              </View>
                          ) : null}

                          {selectedPayment.pdcDate ? (
                              <View style={styles.detailRow}>
                                  <Text style={styles.detailLabel}>Instrument Date</Text>
                                  <Text style={styles.detailValue}>{selectedPayment.pdcDate}</Text>
                              </View>
                          ) : null}

                          <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Collected By</Text>
                              <Text style={styles.detailValue}>{selectedPayment.userName || '-'}</Text>
                          </View>

                          <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Linked Against</Text>
                              <Text style={styles.detailValue}>{selectedPayment.orderRef || selectedPayment.billRef || 'On Account'}</Text>
                          </View>

                          {selectedPayment.notes ? (
                              <View style={{marginTop:15, backgroundColor:'#f9f9f9', padding:10, borderRadius:8, borderWidth: 1, borderColor: '#eee'}}>
                                  <Text style={{fontSize:11, color:'gray', fontWeight:'bold'}}>NOTES</Text>
                                  <Text style={{color:'#555', fontStyle:'italic', marginTop:4}}>{selectedPayment.notes}</Text>
                              </View>
                          ) : null}
                      </ScrollView>
                  )}
              </View>
          </View>
      </Modal>

      {/* GRAPH MODAL */}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', elevation: 2, paddingBottom: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  downloadBtn: { padding: 5, backgroundColor: '#f0f4f8', borderRadius: 8, marginRight: 5 },
  filterBox: { backgroundColor: 'white', padding: 0, paddingBottom: 6, marginBottom: 4, elevation: 1 },
  searchRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, marginTop: 6 },
  searchBar: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 8, flexDirection:'row', alignItems:'center', paddingHorizontal: 10, height: 36},
  input: { flex:1, marginLeft:5, fontSize:14 },
  filterBtn: { width: 36, height: 36, marginLeft: 8, backgroundColor:'white', borderRadius:8, justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:'#ddd' },
  cardsContainer: { padding: 12, paddingBottom:0, paddingTop: 8 },
  targetCard: { backgroundColor: 'white', padding: 13, borderRadius: 12, marginBottom: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6},
  cardTitle: { color: 'gray', fontWeight: 'bold', fontSize:12, textTransform:'uppercase' },
  achievedText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  progressBg: { height: 10, backgroundColor: '#f0f0f0', borderRadius: 5, overflow: 'hidden', marginBottom: 5, marginTop:10, position:'relative' },
  progressFill: { height: '100%', borderRadius: 5 },
  percentText: { fontSize: 12, fontWeight: 'bold', alignSelf: 'flex-end', color: '#555' },
  listSection: { padding: 12, paddingTop: 0},
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  
  card: { backgroundColor: 'white', borderRadius: 10, padding: 11, marginBottom: 8, elevation: 1 },
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

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' },
  detailLabel: { color: 'gray', fontSize: 13 },
  detailValue: { fontWeight: 'bold', color: '#333', fontSize: 13 },
});