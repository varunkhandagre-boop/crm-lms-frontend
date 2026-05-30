import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as XLSX from 'xlsx';

// 🔥 SAAS IMPORTS (Direct Firestore imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

export default function CombinedActivityScreen() {
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'timeline' | 'employee' | 'download'>('timeline');

  // 🔥 1. Context se sirf user aur profile nikala
  const { currentUser, companyProfile } = useData();

  // 🔥 2. SaaS Engine connect kiya
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded Master States
  const [userList, setUserList] = useState<any[]>([]);
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [courierList, setCourierList] = useState<any[]>([]);
  const [serviceCallList, setServiceCallList] = useState<any[]>([]);
  const [orderList, setOrderList] = useState<any[]>([]);
  const [demoList, setDemoList] = useState<any[]>([]);
  const [installList, setInstallList] = useState<any[]>([]);
  const [paymentList, setPaymentList] = useState<any[]>([]);
  const [taskList, setTaskList] = useState<any[]>([]);
  const [pmsList, setPmsList] = useState<any[]>([]);
  const [salesVisitList, setSalesVisitList] = useState<any[]>([]);
  const [leadsList, setLeadsList] = useState<any[]>([]);
  const [expenseList, setExpenseList] = useState<any[]>([]);
  const [advanceList, setAdvanceList] = useState<any[]>([]);
  const [leaveList, setLeaveList] = useState<any[]>([]);
  const [travelList, setTravelList] = useState<any[]>([]);
  const [orgList, setOrgList] = useState<any[]>([]);

  // 🔥 4. LOAD ALL MODULE DATA VIA SAAS
  const loadAllData = async () => {
      if (currentUser?.companyId) {
          const [
              users, attendance, couriers, serviceCalls, orders, demos,
              installs, payments, tasks, pms, salesVisits, leads,
              expenses, advances, leaves, travels, orgs
          ] = await Promise.all([
              fetchSaaSData("users"),
              fetchSaaSData("attendance"),
              fetchSaaSData("couriers"),
              fetchSaaSData("service_calls"),
              fetchSaaSData("orders"),
              fetchSaaSData("demos"),
              fetchSaaSData("installations"),
              fetchSaaSData("payments"),
              fetchSaaSData("tasks"),
              fetchSaaSData("pms_reports"),
              fetchSaaSData("sales_reports"),
              fetchSaaSData("leads"),
              fetchSaaSData("expenses"),
              fetchSaaSData("advances"),
              fetchSaaSData("leaves"),
              fetchSaaSData("travel_notes"),
              fetchSaaSData("organizations")
          ]);

          setUserList(users); setAttendanceList(attendance); setCourierList(couriers);
          setServiceCallList(serviceCalls); setOrderList(orders); setDemoList(demos);
          setInstallList(installs); setPaymentList(payments); setTaskList(tasks);
          setPmsList(pms); setSalesVisitList(salesVisits); setLeadsList(leads);
          setExpenseList(expenses); setAdvanceList(advances); setLeaveList(leaves);
          setTravelList(travels); setOrgList(orgs);
      }
  };

  useEffect(() => {
      loadAllData();
  }, [currentUser]);

  const userRole = (currentUser?.role || '').toLowerCase().trim();
  const isFinanceRole = ['admin', 'manager', 'account', 'accountant', 'superadmin'].includes(userRole);

  // ==========================================
  // 🟢 SHARED UTILS & DATE LOGIC
  // ==========================================
  const extractTime = (dateString: string) => {
      if (!dateString) return "12:00 PM";
      if (dateString.includes('T')) {
          const d = new Date(dateString);
          return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      return dateString; 
  };

  const getStandardDate = (dateInput: any): string => {
      if (!dateInput) return "";
      try {
          if (dateInput instanceof Date) {
              const year = dateInput.getFullYear();
              const month = String(dateInput.getMonth() + 1).padStart(2, '0');
              const day = String(dateInput.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
          }
          if (typeof dateInput === 'string') {
              const clean = dateInput.trim();
              if (clean.includes('/')) {
                  const parts = clean.split('/');
                  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              }
              if (clean.includes('-')) return clean.substring(0, 10); 
          }
      } catch (e) { return ""; }
      return "";
  };

  const getItemDate = (item: any) => {
      if (item.dateIso) return item.dateIso;
      if (item.paymentDate && item.paymentDate.includes('T')) return item.paymentDate.split('T')[0];
      if (item.paymentDate) return item.paymentDate;
      if (item.createdAt && item.createdAt.includes('T')) return item.createdAt.split('T')[0];
      if (item.date && item.date.includes('T')) return item.date.split('T')[0];
      if (item.date) return item.date;
      return '';
  };

  const getItemTime = (item: any) => {
      if (item.time && !item.time.includes('T')) return item.time;
      if (item.createdAt) return extractTime(item.createdAt);
      if (item.timestamp) return extractTime(new Date(item.timestamp).toISOString());
      return "12:00 PM"; 
  };

  const getTimeValue = (timeStr: string) => new Date(`1970/01/01 ${timeStr}`).getTime();
  const getClientName = (item: any) => item.clientName || item.partyName || item.hospitalName || item.hospital || item.client || item.name || item.receiverName || item.orgName || 'Unknown Client';

  const getProductName = (item: any) => {
      if (!item) return '-';
      if (typeof item.productDetails === 'string' && item.productDetails.trim() !== '') {
          return item.productDetails.replace(/,\s*,/g, ', ').trim();
      }
      if (typeof item.product === 'string') return item.product;
      if (typeof item.productName === 'string') return item.productName;
      if (typeof item.itemName === 'string') return item.itemName;
      if (item.items) {
          try {
              let itemsArray = item.items;
              if (typeof itemsArray === 'string') itemsArray = JSON.parse(itemsArray);
              if (Array.isArray(itemsArray) && itemsArray.length > 0) {
                  return itemsArray.map((i: any) => i.productName || i.name || i.product || i.itemName || 'Item').join(', ');
              }
          } catch(e) {}
      }
      if (item.name) return item.name;
      return 'Multiple Items / Attached';
  };

  const currentMonthForFY = new Date().getMonth(); 
  const currentYearForFY = new Date().getFullYear();
  const defaultFYStartYear = currentMonthForFY >= 3 ? currentYearForFY : currentYearForFY - 1;

  const [selectedMonth, setSelectedMonth] = useState(-1);
  const [selectedYear, setSelectedYear] = useState(defaultFYStartYear); 
  const [showYearModal, setShowYearModal] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);

  const startYear = 2024;
  const years = Array.from({length: (new Date().getFullYear() - startYear) + 2}, (_, i) => startYear + i);
  const fyMonths = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

  const isDateInSelectedFY = (dateString: string) => {
      if (!dateString) return false;
      const stdDate = getStandardDate(dateString);
      if (!stdDate) return false;
      const d = new Date(stdDate);
      if (isNaN(d.getTime())) return false;
      const m = d.getMonth();
      const y = d.getFullYear();
      const itemFyStartYear = m >= 3 ? y : y - 1;
      if (itemFyStartYear !== selectedYear) return false;
      const actualTargetMonth = selectedMonth !== -1 ? (selectedMonth + 3) % 12 : -1;
      if (selectedMonth !== -1 && m !== actualTargetMonth) return false;
      return true;
  };

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // ==========================================
  // 🟢 VIEW 1: DAILY TIMELINE LOGIC
  // ==========================================
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null); 
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [timelineData, setTimelineData] = useState<any[]>([]);

  useEffect(() => {
      if (activeTab === 'timeline') generateTimeline();
  }, [selectedDate, selectedUser, attendanceList, courierList, serviceCallList, orderList, demoList, installList, paymentList, taskList, pmsList, salesVisitList, leadsList, activeTab]);

  const generateTimeline = () => {
      const targetDate = getStandardDate(selectedDate);
      const events: any[] = [];
      const checkUser = (id: string, name: string) => !selectedUser || selectedUser.id === id || selectedUser.name === name || selectedUser.email === id;

      const processedAtt = new Set();

      attendanceList?.forEach((a: any) => {
          if (getStandardDate(a.date) === targetDate && checkUser(a.userId, a.userName)) {
              if(!processedAtt.has(a.userId)) {
                  processedAtt.add(a.userId);
                  events.push({ id: `in_${a.id}`, time: a.inTime || '09:00 AM', title: `${a.userName} Logged In`, desc: `Location: ${a.inLocation || a.location?.address || 'Unknown'}`, icon: 'log-in', color: '#4caf50', rawData: a, type: 'Attendance' });
                  if (a.outTime && a.outTime !== '--') {
                      events.push({ id: `out_${a.id}`, time: a.outTime, title: `${a.userName} Logged Out`, desc: `Location: ${a.outLocation || a.outAddress || 'Unknown'}`, icon: 'log-out', color: '#f44336', rawData: a, type: 'Attendance' });
                  }
              }
          }
      });

      orderList?.forEach((o: any) => {
          if (getStandardDate(getItemDate(o)) === targetDate && checkUser(o.senderId || o.addedBy, o.senderName || o.addedBy)) events.push({ id: `ord_${o.id}`, time: getItemTime(o), title: `${o.senderName || o.addedBy || 'User'} added an Order`, desc: `Client: ${getClientName(o)}`, extra: `Products: ${getProductName(o)} | Value: ₹${o.amount || o.totalValue || '0'}`, icon: 'cart', color: '#8e24aa', rawData: o, type: 'Order' });
      });
      serviceCallList?.forEach((s: any) => {
          if (getStandardDate(getItemDate(s)) === targetDate && checkUser(s.senderId, s.senderName)) events.push({ id: `srv_${s.id}`, time: getItemTime(s), title: `${s.senderName || 'User'} updated Service`, desc: `Client: ${getClientName(s)}`, extra: `Machine: ${s.machine || s.machineName || 'N/A'}\nStatus: ${s.status}`, icon: 'construct', color: '#c62828', rawData: s, type: 'Service' });
      });
      courierList?.forEach((c: any) => {
          if (getStandardDate(getItemDate(c)) === targetDate && checkUser(c.senderId, c.senderName)) events.push({ id: `cr_${c.id}`, time: getItemTime(c), title: `${c.senderName || 'User'} sent Courier`, desc: `To: ${getClientName(c)}`, extra: `Item: ${c.itemName || c.name || '-'}\nStatus: ${c.status || 'Dispatched'}`, icon: 'cube', color: '#e67e22', rawData: c, type: 'Courier' });
      });
      demoList?.forEach((d: any) => {
          if (getStandardDate(getItemDate(d)) === targetDate && checkUser(d.senderId, d.senderName)) events.push({ id: `dm_${d.id}`, time: getItemTime(d), title: `${d.senderName || 'User'} gave a Demo`, desc: `Client: ${getClientName(d)}`, extra: `Product: ${d.product}`, icon: 'play-circle', color: '#00bcd4', rawData: d, type: 'Demo' });
      });
      
      paymentList?.forEach((p: any) => {
          if (getStandardDate(getItemDate(p)) === targetDate && checkUser(p.senderId || p.addedBy || p.userId, p.senderName || p.addedBy || p.userName)) events.push({ id: `pay_${p.id}`, time: getItemTime(p), title: `${p.senderName || p.addedBy || 'User'} collected Payment`, desc: `Client: ${getClientName(p)}`, extra: `Amount: ₹${p.amount || p.receivedAmount || 0}`, icon: 'cash', color: '#00897b', rawData: p, type: 'Payment' });
      });

      installList?.forEach((i: any) => {
          if (getStandardDate(getItemDate(i)) === targetDate && checkUser(i.senderId, i.senderName)) events.push({ id: `inst_${i.id}`, time: getItemTime(i), title: `${i.senderName || 'User'} did Installation`, desc: `Client: ${getClientName(i)}`, extra: `Product: ${i.product || i.productName || '-'}\nSn: ${i.serialNo || 'N/A'}`, icon: 'checkmark-circle', color: '#2e7d32', rawData: i, type: 'Installation' });
      });
      salesVisitList?.forEach((sv: any) => {
          if (getStandardDate(getItemDate(sv)) === targetDate && checkUser(sv.senderId, sv.senderName)) events.push({ id: `sv_${sv.id}`, time: getItemTime(sv), title: `${sv.senderName || 'User'} Sales Visit`, desc: `Client: ${getClientName(sv)}`, extra: `Met: ${sv.person || '-'} | Outcome: ${sv.outcome || 'N/A'}`, icon: 'briefcase', color: '#f57c00', rawData: sv, type: 'Sales Visit' });
      });
      leadsList?.forEach((l: any) => {
          if (getStandardDate(getItemDate(l)) === targetDate && checkUser(l.senderId || l.assignedTo, l.senderName || l.assignedToName)) events.push({ id: `ld_${l.id}`, time: getItemTime(l), title: `${l.senderName || 'User'} Generated Lead`, desc: `Client: ${getClientName(l)}`, extra: `Status: ${l.status || 'New'}`, icon: 'funnel', color: '#f39c12', rawData: l, type: 'Lead' });
      });

      events.sort((a, b) => getTimeValue(a.time) - getTimeValue(b.time));
      setTimelineData(events);
  };

  const renderTimelineItem = ({ item, index }: any) => (
      <TouchableOpacity style={styles.timelineRow} onPress={() => { setSelectedEvent(item); setDetailModalVisible(true); }}>
          <View style={styles.timeBox}><Text style={styles.timeText}>{item.time}</Text></View>
          <View style={styles.lineBox}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              {index !== timelineData.length - 1 && <View style={styles.line} />}
          </View>
          <View style={styles.contentBox}>
              <View style={[styles.card, { borderLeftColor: item.color, borderLeftWidth: 4 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                      <Ionicons name={item.icon} size={16} color={item.color} style={{ marginRight: 5 }} />
                      <Text style={styles.cardTitle}>{item.title}</Text>
                  </View>
                  <Text style={styles.cardDesc}>{item.desc}</Text>
                  {item.extra && <View style={styles.extraBox}><Text style={styles.extraText}>{item.extra}</Text></View>}
              </View>
          </View>
      </TouchableOpacity>
  );

  // ==========================================
  // 🔥 VIEW 2: EMPLOYEE 360 (KUNDALI)
  // ==========================================
  const [empUser, setEmpUser] = useState<any>(null);
  const [empTimeline, setEmpTimeline] = useState<any[]>([]);
  const [empVisibleCount, setEmpVisibleCount] = useState(20);
  const [activeEmpFilter, setActiveEmpFilter] = useState('All');

  const [empSummary, setEmpSummary] = useState({ 
      ordersVal: 0, collectionsVal: 0, expensesVal: 0, advancesVal: 0, 
      attendanceCount: 0, shortCount: 0, leaveCount: 0, travelCount: 0, visitsCount: 0, leadsCount: 0 
  });

  useEffect(() => {
      setEmpVisibleCount(20);
      if (activeTab === 'employee' && empUser) {
          generateEmployeeKundali();
      }
  }, [activeTab, empUser, selectedYear, selectedMonth, attendanceList, orderList, paymentList, expenseList, advanceList, leaveList, travelList, salesVisitList, serviceCallList, pmsList, leadsList]);

  const generateEmployeeKundali = () => {
      if (!empUser) return;
      const checkUser = (id: string, name: string) => empUser.id === id || empUser.name === name || empUser.email === id;

      let oVal=0, cVal=0, eVal=0, aVal=0;
      let attCount=0, shortCount=0, levCount=0, trvCount=0, visCount=0, leadCount=0;
      const events: any[] = [];

      const pushEvent = (list: any[], type: string, icon: string, color: string, titleFn: any, descFn: any, amountFn?: any) => {
          list?.forEach((item: any) => {
              const dateStr = getItemDate(item);
              if (checkUser(item.senderId || item.userId || item.addedBy || item.assignedTo, item.senderName || item.userName || item.assignedToName || item.addedBy) && isDateInSelectedFY(dateStr)) {
                  const amt = amountFn ? amountFn(item) : 0;
                  events.push({
                      id: item.id, date: dateStr, type, icon, color,
                      title: titleFn(item), desc: descFn(item), amount: amt, rawData: item
                  });
              }
          });
      };

      orderList?.forEach((o: any) => {
          if (checkUser(o.senderId || o.addedBy, o.senderName || o.addedBy) && isDateInSelectedFY(getItemDate(o))) {
              const val = Number(o.amount || o.totalValue || 0); oVal += val;
              events.push({ id: o.id, date: getItemDate(o), type: 'Order', icon: 'cart', color: '#8e24aa', title: `Order: ${getClientName(o)}`, desc: `Product: ${getProductName(o)} \nStatus: ${o.status || 'Pending'}`, amount: val, rawData: o });
          }
      });

      paymentList?.forEach((p: any) => {
          if (checkUser(p.senderId || p.addedBy || p.userId, p.senderName || p.addedBy || p.userName) && isDateInSelectedFY(getItemDate(p))) {
              const val = Number(p.amount || p.receivedAmount || 0); cVal += val;
              events.push({ id: p.id, date: getItemDate(p), type: 'Payment', icon: 'cash', color: '#00897b', title: `Payment Recd: ${getClientName(p)}`, desc: `Mode: ${p.mode || p.paymentMode || '-'} \nNote: ${p.note || '-'}`, amount: val, rawData: p });
          }
      });

      advanceList?.forEach((a: any) => {
          if (checkUser(a.senderId || a.userId, a.senderName || a.userName) && isDateInSelectedFY(getItemDate(a))) {
              const val = Number(a.amount || 0); aVal += val;
              events.push({ id: a.id, date: getItemDate(a), type: 'Advance', icon: 'wallet', color: '#f57c00', title: `Advance Taken`, desc: a.note || a.reason || '-', amount: val, rawData: a });
          }
      });

      expenseList?.forEach((e: any) => {
          if (checkUser(e.senderId || e.userId, e.senderName || e.userName) && isDateInSelectedFY(getItemDate(e))) {
              const val = Number(e.amount || 0); eVal += val;
              events.push({ id: e.id, date: getItemDate(e), type: 'Expense', icon: 'receipt', color: '#d32f2f', title: `Expense: ${e.category || 'Misc'}`, desc: e.note || e.remark || '-', amount: val, rawData: e });
          }
      });

      leadsList?.forEach((l: any) => {
          if (checkUser(l.senderId || l.assignedTo, l.senderName || l.assignedToName) && isDateInSelectedFY(getItemDate(l))) {
              leadCount++;
              events.push({ id: l.id, date: getItemDate(l), type: 'Lead', icon: 'funnel', color: '#e67e22', title: `Lead: ${getClientName(l)}`, desc: `Product: ${l.product || l.requirement || '-'} \nStatus: ${l.status || 'New'}`, amount: 0, rawData: l });
          }
      });

      const processedDates = new Set();
      const sortedAtt = [...attendanceList].sort((a: any, b: any) => {
          if (a.outTime && a.outTime !== '--' && (!b.outTime || b.outTime === '--')) return -1;
          return 0;
      });

      sortedAtt.forEach((a: any) => {
          if (checkUser(a.userId, a.userName) && isDateInSelectedFY(a.date)) {
              const stdDate = getStandardDate(a.date);
              if (processedDates.has(stdDate)) return;

              if (a.status === 'Leave' || a.isLeave || a.leaveType) {
                  levCount++;
                  processedDates.add(stdDate);
                  events.push({ id: a.id, date: a.date, type: 'Leave', icon: 'bed', color: '#e53935', title: `Leave (${a.status || 'Marked'})`, desc: a.remark || a.reason || 'Leave via Attendance', amount: 0, rawData: a });
              } else if (a.status === 'Absent' || a.status === 'ABSENT' || a.inTime === '-' || !a.inTime) {
                  // Skip
              } else {
                  processedDates.add(stdDate);
                  let hours = 0;
                  if(a.workHrs && a.workHrs.includes(':')) {
                      const p = a.workHrs.split(':');
                      hours = parseInt(p[0]) + (parseInt(p[1])/60);
                  }
                  const hasLoggedOut = a.outTime && a.outTime !== '--';
                  const todayStr = getStandardDate(new Date());
                  const isToday = stdDate === todayStr;

                  let isShort = false;
                  if (hasLoggedOut && hours < 4) isShort = true;
                  if (!hasLoggedOut && !isToday) isShort = true;

                  if (isShort) shortCount++; else attCount++;

                  const dayExp = parseFloat(a.expenses?.totalAmount || a.dayExpense || a.expense || a.totalExpense || 0);
                  if (dayExp > 0) eVal += dayExp;
                  
                  events.push({ 
                      id: a.id, date: a.date, 
                      type: isShort ? 'Short Day' : 'Attendance', 
                      icon: isShort ? 'time' : 'log-in', 
                      color: isShort ? '#f57c00' : '#4caf50', 
                      title: isShort ? 'Short Day' : 'Present', 
                      desc: `In: ${a.inTime || '-'} | Out: ${a.outTime || '-'} ${dayExp > 0 ? `\nDay Expense: ₹${dayExp}` : ''}`, 
                      amount: dayExp, rawData: a 
                  });
              }
          }
      });

      leaveList?.forEach((l: any) => {
          if (checkUser(l.userId || l.senderId, l.userName || l.senderName) && l.status === 'Approved' && isDateInSelectedFY(l.fromDate || l.date)) {
              const stdDate = getStandardDate(l.fromDate || l.date);
              if (!processedDates.has(stdDate)) {
                  const days = parseFloat(l.days || 1);
                  levCount += days;
                  processedDates.add(stdDate);
                  events.push({ id: l.id, date: l.fromDate || l.date, type: 'Leave', icon: 'bed', color: '#e53935', title: `Leave (${days} Days)`, desc: l.reason || l.remark || 'Approved Leave', amount: 0, rawData: l });
              }
          }
      });

      pushEvent(serviceCallList, 'Service', 'construct', '#c62828', (s:any)=> `Service: ${getClientName(s)}`, (s:any)=> `Machine: ${s.machine || s.product || '-'} \nStatus: ${s.status}`);
      pushEvent(pmsList, 'PMS', 'sync', '#1565c0', (p:any)=> `PMS: ${getClientName(p)}`, (p:any)=> `Machine: ${p.machine || '-'} \nCycle: ${p.currentPmsNumber}/${p.totalPms}`);
      pushEvent(installList, 'Installation', 'checkmark-circle', '#2e7d32', (i:any)=> `Install: ${getClientName(i)}`, (i:any)=> `Product: ${i.product || i.productName || '-'} \nSn: ${i.serialNo || '-'}`);
      
      salesVisitList?.forEach((v: any) => { if (checkUser(v.senderId, v.senderName) && isDateInSelectedFY(getItemDate(v))) { visCount++; events.push({ id: v.id, date: getItemDate(v), type: 'Visit', icon: 'walk', color: '#1976d2', title: `Visit: ${getClientName(v)}`, desc: `Met: ${v.person || '-'} \nOutcome: ${v.outcome || '-'}`, amount: 0, rawData: v }); }});
      travelList?.forEach((t: any) => { if (checkUser(t.senderId || t.userId, t.senderName || t.userName) && isDateInSelectedFY(getItemDate(t))) { trvCount++; events.push({ id: t.id, date: getItemDate(t), type: 'Travel', icon: 'car', color: '#795548', title: `Travel: ${t.from || '-'} to ${t.to || '-'}`, desc: `Mode: ${t.mode || '-'} | Dist: ${t.distance || '-'}`, amount: 0, rawData: t }); }});

      setEmpSummary({ ordersVal: oVal, collectionsVal: cVal, expensesVal: eVal, advancesVal: aVal, attendanceCount: attCount, shortCount: shortCount, leaveCount: levCount, travelCount: trvCount, visitsCount: visCount, leadsCount: leadCount });
      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEmpTimeline(events);
  };

  const toggleEmpFilter = (type: string) => {
      setActiveEmpFilter(prev => prev === type ? 'All' : type);
      setEmpVisibleCount(20);
  };

  const filteredEmpTimeline = empTimeline.filter(item => {
      if (activeEmpFilter === 'All') return true;
      if (activeEmpFilter === 'Expense') return item.type === 'Expense' || (item.type === 'Attendance' && item.amount > 0) || (item.type === 'Short Day' && item.amount > 0);
      return item.type === activeEmpFilter;
  });
  const renderedEmpTimeline = filteredEmpTimeline.slice(0, empVisibleCount);

  const exportEmpToExcel = async () => {
      try {
          if (filteredEmpTimeline.length === 0) {
              Alert.alert("Empty", "No records found to export.");
              return;
          }
          let csvString = "\uFEFFDate,Type,Title,Amount,Description\n";
          filteredEmpTimeline.forEach(item => {
              const date = item.date ? new Date(item.date).toLocaleDateString('en-GB') : '-';
              const type = item.type || '-';
              const title = (item.title || '-').replace(/,/g, ' ').replace(/"/g, '""');
              const amount = item.amount || '0';
              const desc = (item.desc || '').replace(/,/g, ' ').replace(/\n/g, ' | ').replace(/"/g, '""');
              csvString += `"${date}","${type}","${title}","${amount}","${desc}"\n`;
          });
          const safeName = (empUser?.name || 'Employee').replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const fileName = `${safeName}_360_Report_${Date.now()}.csv`;
          const fs = FileSystem as any;
          const fileUri = `${fs.cacheDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, csvString, { encoding: 'utf8' });
          if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: `Export ${safeName} Data`, UTI: 'public.comma-separated-values-text' });
          } else Alert.alert("Error", "Sharing is not supported.");
      } catch (error: any) { Alert.alert("Report Error", "Could not generate report."); }
  };

  // ==========================================
  // 🟣 VIEW 3: MAIN DOWNLOAD REPORTS (SAAS UPGRADED)
  // ==========================================
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [selectedUserName, setSelectedUserName] = useState('All');

  const [modules, setModules] = useState({
      orders: true, collections: true, expenses: true, leads: true, attendance: true,
      installations: false, pms: false, service: false, demos: false, couriers: false,
      tasks: false, advances: false, travel: false, leaves: false, projects: false, organizations: false,
      // 🔥 NEW EXPORT MODULES
      dues: false, quotations: false, employees: false 
  });

  const filterDataForExport = (data: any[], dateField: string, userField: string, isOrg: boolean = false) => {
      return data.filter(item => {
          const stdDate = getStandardDate(item[dateField] || item.paymentDate || item.dateIso || item.createdAt || item.date);
          if(!stdDate) return false;
          
          const d = new Date(stdDate);
          if (isNaN(d.getTime())) return false; 

          const itemMonth = d.getMonth(); 
          const itemYear = d.getFullYear();
          const itemFyStartYear = itemMonth >= 3 ? itemYear : itemYear - 1;
          
          const isYearMatch = itemFyStartYear === selectedYear;
          const actualTargetMonth = selectedMonth !== -1 ? (selectedMonth + 3) % 12 : -1;
          const isMonthMatch = selectedMonth === -1 ? true : itemMonth === actualTargetMonth;
          
          let isUserMatch = true;
          if (selectedUserName !== 'All' && !isOrg) {
              const target = selectedUserName.toLowerCase().trim();
              const possibleNames = [item.senderName, item.userName, item.name, item.bookedBy, item.createdBy, item.addedBy, item.userId, item.senderId];
              isUserMatch = possibleNames.some(n => n && String(n).toLowerCase().includes(target));
          }
          return isYearMatch && isMonthMatch && isUserMatch;
      });
  };

  // 🔥 SAAS EXCEL FETCH LOGIC with bypassFilters flag
  const fetchAndAddSheet = async (wb: any, colName: string, sheetName: string, dateField: string, userField: string, isOrg: boolean = false, bypassFilters: boolean = false) => {
      if (!modules[sheetName.toLowerCase() as keyof typeof modules] && !modules[colName as keyof typeof modules]) return false;
      setProgress(`Fetching ${sheetName}...`);
      try {
          const rawData = await fetchSaaSData(colName);
          const cleanRawData = rawData.map((d: any) => {
              const { location, items, history, ...cleanData } = d; 
              return cleanData;
          });
          const filtered = bypassFilters ? cleanRawData : filterDataForExport(cleanRawData, dateField, userField, isOrg);
          if (filtered.length > 0) {
              const ws = XLSX.utils.json_to_sheet(filtered);
              XLSX.utils.book_append_sheet(wb, ws, sheetName);
              return true;
          }
      } catch (e) { console.log(`Error in ${sheetName}:`, e); }
      return false;
  };

  const generateExcel = async () => {
      setLoading(true); setProgress("Preparing...");
      try {
          const wb = XLSX.utils.book_new(); 
          let hasData = false;
          
          if(await fetchAndAddSheet(wb, "orders", "Orders", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "payments", "Collections", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "expenses", "Expenses", "dateIso", "userId")) hasData = true;
          if(await fetchAndAddSheet(wb, "leads", "Leads", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "attendance", "Attendance", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "installations", "Installations", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "pms_reports", "PMS", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "service_calls", "ServiceCalls", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "demos", "Demos", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "couriers", "Couriers", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "tasks", "Tasks", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "advances", "Advances", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "travel_notes", "Travel", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "leaves", "Leaves", "fromDateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "projects", "Projects", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "organizations", "Organizations", "dateIso", "addedBy", true)) hasData = true;
          
          // 🔥 NEW: Dues, Quotations, and bypassed Employees
          if(await fetchAndAddSheet(wb, "payment_dues", "Dues", "dateIso", "addedBy")) hasData = true;
          if(await fetchAndAddSheet(wb, "quotations", "Quotations", "dateIso", "senderId")) hasData = true;
          if(await fetchAndAddSheet(wb, "users", "Employees", "", "", false, true)) hasData = true; // bypassFilters = true

          if (!hasData) {
              Alert.alert("No Data", "No records found for the selected criteria.");
              setLoading(false); setProgress(''); return;
          }
          setProgress("Generating File...");
          const timeLabel = selectedMonth === -1 ? "Full_FY" : fyMonths[selectedMonth];
          const fyLabel = `FY${selectedYear.toString().slice(-2)}-${(selectedYear+1).toString().slice(-2)}`;
          const fileName = `Report_${selectedUserName}_${timeLabel}_${fyLabel}.xlsx`;
          const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
          const uri = (FileSystem as any).cacheDirectory + fileName;

          await FileSystem.writeAsStringAsync(uri, wbout, { encoding: 'base64' });
          await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Download Report Data' });
      } catch (error: any) { Alert.alert("Error", error.message); } 
      finally { setLoading(false); setProgress(''); }
  };

  const ToggleRow = ({label, field}: {label: string, field: keyof typeof modules}) => (
      <TouchableOpacity style={styles.row} onPress={() => setModules({...modules, [field]: !modules[field]})}>
          <Text style={styles.label}>{label}</Text>
          <Switch value={modules[field]} onValueChange={(val) => setModules({...modules, [field]: val})} trackColor={{false: "#767577", true: "#81b0ff"}} thumbColor={modules[field] ? "#3b5998" : "#f4f3f4"} />
      </TouchableOpacity>
  );

  return (
    <View style={{flex:1, backgroundColor:'#f4f6f8'}}>
      <View style={styles.header}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <TouchableOpacity onPress={() => router.back()} style={{marginRight: 10}}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Activity & Reports</Text>
        </View>
      </View>

      <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'timeline' && styles.activeTab]} onPress={() => setActiveTab('timeline')}>
              <Ionicons name="time" size={16} color={activeTab === 'timeline' ? "white" : "#666"} />
              <Text style={[styles.tabText, activeTab === 'timeline' && {color: 'white'}]}>Daily Log</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'employee' && styles.activeTab]} onPress={() => setActiveTab('employee')}>
              <Ionicons name="person" size={16} color={activeTab === 'employee' ? "white" : "#666"} />
              <Text style={[styles.tabText, activeTab === 'employee' && {color: 'white'}]}>Emp 360</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'download' && styles.activeTab]} onPress={() => setActiveTab('download')}>
              <Ionicons name="cloud-download" size={16} color={activeTab === 'download' ? "white" : "#666"} />
              <Text style={[styles.tabText, activeTab === 'download' && {color: 'white'}]}>Export</Text>
          </TouchableOpacity>
      </View>

      {/* ========================================= */}
      {/* 🔴 VIEW 1: DAILY TIMELINE */}
      {/* ========================================= */}
      {activeTab === 'timeline' && (
          <View style={{flex: 1}}>
            <View style={styles.filterContainer}>
                <TouchableOpacity style={styles.filterBox} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar" size={18} color="#3b5998" />
                    <Text style={styles.filterText}>{selectedDate.toLocaleDateString('en-GB')}</Text>
                </TouchableOpacity>
                {showDatePicker && <DateTimePicker value={selectedDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setSelectedDate(d); }} />}

                <TouchableOpacity style={styles.filterBox} onPress={() => setUserModalVisible(true)}>
                    <Ionicons name="person" size={18} color="#3b5998" />
                    <Text style={styles.filterText} numberOfLines={1}>{selectedUser ? selectedUser.name : 'All Employees'}</Text>
                </TouchableOpacity>
            </View>

            <FlatList 
                data={timelineData} keyExtractor={(item) => item.id} renderItem={renderTimelineItem}
                contentContainerStyle={{ padding: 15, paddingBottom: 50 }}
                ListEmptyComponent={
                    <View style={{alignItems:'center', marginTop: 50}}>
                        {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                            <>
                                <Ionicons name="time-outline" size={50} color="#ccc" />
                                <Text style={{color:'gray', marginTop:10}}>No activity found for this day.</Text>
                            </>
                        )}
                    </View>
                }
            />
          </View>
      )}

      {/* ========================================= */}
      {/* 🟢 VIEW 2: EMPLOYEE KUNDALI (360 VIEW) */}
      {/* ========================================= */}
      {activeTab === 'employee' && (
          <View style={{flex: 1, backgroundColor:'#f4f6f8'}}>
              <View style={styles.dlFilterRow}>
                  <TouchableOpacity style={[styles.dlDropdown, {flex: 1.5, margin: 10}]} onPress={() => setUserModalVisible(true)}>
                      <Ionicons name="person" size={18} color="#3b5998" />
                      <Text style={styles.dlDropdownText} numberOfLines={1}>{empUser ? empUser.name : 'Select Employee'}</Text>
                      <Ionicons name="chevron-down" size={16} color="gray" />
                  </TouchableOpacity>
              </View>
              <View style={[styles.dlFilterRow, {marginTop: 0, paddingHorizontal: 10, paddingBottom: 10}]}>
                  <TouchableOpacity style={styles.dlDropdown} onPress={() => setShowYearModal(true)}>
                      <Ionicons name="calendar" size={18} color="#3b5998" />
                      <Text style={styles.dlDropdownText}>FY {selectedYear.toString().slice(-2)}-{(selectedYear + 1).toString().slice(-2)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dlDropdown} onPress={() => setShowMonthModal(true)}>
                      <Ionicons name="calendar-outline" size={18} color="#3b5998" />
                      <Text style={styles.dlDropdownText}>{selectedMonth === -1 ? "All Months" : fyMonths[selectedMonth]}</Text>
                  </TouchableOpacity>
              </View>

              {!empUser ? (
                  <View style={styles.centerState}>
                      <Ionicons name="id-card-outline" size={60} color="#ddd" />
                      <Text style={{color:'gray', marginTop:10}}>Please select an employee to view records.</Text>
                  </View>
              ) : (
                  <ScrollView contentContainerStyle={{padding: 10, paddingBottom: 50}} showsVerticalScrollIndicator={false}>
                      <View style={styles.profileCard}>
                          <View style={styles.profileHeader}>
                              <View style={styles.profileAvatar}><Text style={styles.avatarText}>{empUser.name?.charAt(0)}</Text></View>
                              <View style={{marginLeft: 15, flex: 1}}>
                                  <Text style={styles.profileName}>{empUser.name}</Text>
                                  <Text style={styles.profileRole}>{empUser.role || 'Employee'} • {empUser.empId || 'No ID'}</Text>
                              </View>
                              <TouchableOpacity onPress={exportEmpToExcel} style={{backgroundColor:'#e8f5e9', padding:8, borderRadius:8}}>
                                  <Ionicons name="download-outline" size={24} color="#2e7d32" />
                              </TouchableOpacity>
                          </View>
                          <View style={styles.divider} />
                          <View style={styles.profileDetails}>
                              <View style={styles.profRow}><Ionicons name="mail" size={14} color="gray"/><Text style={styles.profText}>{empUser.email || 'N/A'}</Text></View>
                              <View style={styles.profRow}><Ionicons name="call" size={14} color="gray"/><Text style={styles.profText}>{empUser.mobile || 'N/A'}</Text></View>
                              <View style={styles.profRow}><Ionicons name="location" size={14} color="gray"/><Text style={styles.profText}>{empUser.address || 'N/A'}</Text></View>
                              <View style={styles.profRow}><Ionicons name="calendar" size={14} color="gray"/><Text style={styles.profText}>Joined: {empUser.joiningDate || 'N/A'}</Text></View>
                          </View>
                      </View>

                      <Text style={styles.sectionHeader}>Financial Performance</Text>
                      <View style={styles.financeGrid}>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Order')} style={[styles.finBox, activeEmpFilter==='Order' && styles.activeFinBox, {backgroundColor: '#f3e5f5'}]}>
                              <Text style={[styles.finVal, {color: '#8e24aa'}]}>₹ {(empSummary as any).ordersVal?.toLocaleString()}</Text><Text style={styles.finLabel}>Orders</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Payment')} style={[styles.finBox, activeEmpFilter==='Payment' && styles.activeFinBox, {backgroundColor: '#e0f2f1'}]}>
                              <Text style={[styles.finVal, {color: '#00897b'}]}>₹ {(empSummary as any).collectionsVal?.toLocaleString()}</Text><Text style={styles.finLabel}>Collections</Text>
                          </TouchableOpacity>
                      </View>
                      <View style={styles.financeGrid}>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Expense')} style={[styles.finBox, activeEmpFilter==='Expense' && styles.activeFinBox, {backgroundColor: '#ffebee'}]}>
                              <Text style={[styles.finVal, {color: '#d32f2f'}]}>₹ {(empSummary as any).expensesVal?.toLocaleString()}</Text><Text style={styles.finLabel}>Day Expenses</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Advance')} style={[styles.finBox, activeEmpFilter==='Advance' && styles.activeFinBox, {backgroundColor: '#fff3e0'}]}>
                              <Text style={[styles.finVal, {color: '#f57c00'}]}>₹ {(empSummary as any).advancesVal?.toLocaleString()}</Text><Text style={styles.finLabel}>Advances</Text>
                          </TouchableOpacity>
                      </View>

                      <Text style={styles.sectionHeader}>Activity Log</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 15}}>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Attendance')} style={[styles.statBadge, activeEmpFilter==='Attendance' && styles.activeFinBox]}>
                              <Text style={styles.statNum}>{(empSummary as any).attendanceCount}</Text><Text style={styles.statLbl}>Present</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Short Day')} style={[styles.statBadge, activeEmpFilter==='Short Day' && styles.activeFinBox]}>
                              <Text style={[styles.statNum, {color: '#ff9800'}]}>{(empSummary as any).shortCount}</Text><Text style={styles.statLbl}>Short Days</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Leave')} style={[styles.statBadge, activeEmpFilter==='Leave' && styles.activeFinBox]}>
                              <Text style={styles.statNum}>{(empSummary as any).leaveCount}</Text><Text style={styles.statLbl}>Leaves</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Lead')} style={[styles.statBadge, activeEmpFilter==='Lead' && styles.activeFinBox]}>
                              <Text style={[styles.statNum, {color:'#f39c12'}]}>{(empSummary as any).leadsCount}</Text><Text style={styles.statLbl}>Leads</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Visit')} style={[styles.statBadge, activeEmpFilter==='Visit' && styles.activeFinBox]}>
                              <Text style={styles.statNum}>{(empSummary as any).visitsCount}</Text><Text style={styles.statLbl}>Visits</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Travel')} style={[styles.statBadge, activeEmpFilter==='Travel' && styles.activeFinBox]}>
                              <Text style={styles.statNum}>{(empSummary as any).travelCount}</Text><Text style={styles.statLbl}>Travels</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={()=> toggleEmpFilter('Service')} style={[styles.statBadge, activeEmpFilter==='Service' && styles.activeFinBox]}>
                              <Text style={[styles.statNum, {color:'#c62828'}]}>-</Text><Text style={styles.statLbl}>Services</Text>
                          </TouchableOpacity>
                      </ScrollView>

                      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                          <Text style={[styles.sectionHeader, {marginBottom:0}]}>Detailed History {activeEmpFilter !== 'All' ? `(${activeEmpFilter})` : ''}</Text>
                          {activeEmpFilter !== 'All' && <TouchableOpacity onPress={() => toggleEmpFilter('All')}><Text style={{color:'#3b5998', fontSize:12, fontWeight:'bold'}}>Clear Filter</Text></TouchableOpacity>}
                      </View>

                      {filteredEmpTimeline.length === 0 ? (
                          <Text style={{textAlign:'center', color:'gray', marginVertical: 20}}>No records found for this period.</Text>
                      ) : (
                          renderedEmpTimeline.map((item, index) => (
                              <TouchableOpacity key={index} style={styles.empTimelineCard} onPress={() => { setSelectedEvent(item); setDetailModalVisible(true); }}>
                                  <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5}}>
                                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                          <Ionicons name={item.icon as any} size={16} color={item.color} style={{marginRight: 5}}/>
                                          <Text style={{fontWeight: 'bold', color: item.color, fontSize: 13}}>{item.type}</Text>
                                      </View>
                                      <Text style={{fontSize: 11, color: 'gray'}}>{new Date(item.date).toLocaleDateString('en-GB')}</Text>
                                  </View>
                                  <Text style={{fontWeight: 'bold', fontSize: 14, color: '#333'}}>{item.title}</Text>
                                  <Text style={{fontSize: 13, color: '#555', marginTop: 2}} numberOfLines={2}>{item.desc}</Text>
                                  {item.amount > 0 && <Text style={{fontWeight: 'bold', marginTop: 5, color: '#333'}}>Amount: ₹{item.amount.toLocaleString()}</Text>}
                              </TouchableOpacity>
                          ))
                      )}

                      {empVisibleCount < filteredEmpTimeline.length && (
                          <TouchableOpacity onPress={() => setEmpVisibleCount(prev => prev + 20)} style={styles.loadMoreBtn}>
                              <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More ({filteredEmpTimeline.length - empVisibleCount} left)</Text>
                          </TouchableOpacity>
                      )}
                  </ScrollView>
              )}
          </View>
      )}

      {/* ========================================= */}
      {/* 🔵 VIEW 3: DOWNLOAD REPORTS */}
      {/* ========================================= */}
      {activeTab === 'download' && (
          <View style={{flex: 1, backgroundColor:'#f4f6f8'}}>
              <ScrollView contentContainerStyle={{padding: 15, paddingBottom: 50}}>
                  <View style={styles.dlCard}>
                      <Text style={styles.dlCardHeader}>1. Select Period</Text>
                      <View style={styles.dlFilterRow}>
                          <TouchableOpacity style={styles.dlDropdown} onPress={() => setShowYearModal(true)}>
                              <Ionicons name="calendar" size={20} color="#3b5998" />
                              <Text style={styles.dlDropdownText}>FY {selectedYear.toString().slice(-2)}-{(selectedYear + 1).toString().slice(-2)}</Text>
                              <Ionicons name="chevron-down" size={16} color="gray" />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.dlDropdown} onPress={() => setShowMonthModal(true)}>
                              <Ionicons name="calendar-outline" size={20} color="#3b5998" />
                              <Text style={styles.dlDropdownText}>{selectedMonth === -1 ? "All Months" : fyMonths[selectedMonth]}</Text>
                              <Ionicons name="chevron-down" size={16} color="gray" />
                          </TouchableOpacity>
                      </View>
                  </View>

                  <View style={styles.dlCard}>
                      <Text style={styles.dlCardHeader}>2. Select Staff</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{marginTop:10}}>
                          <TouchableOpacity style={[styles.chip, selectedUserName === 'All' && styles.activeChip]} onPress={() => setSelectedUserName('All')}>
                              <Text style={[styles.chipText, selectedUserName === 'All' && {color:'white'}]}>All Staff</Text>
                          </TouchableOpacity>
                          {userList.map((u: any) => (
                              <TouchableOpacity key={u.id} style={[styles.chip, selectedUserName === u.name && styles.activeChip]} onPress={() => setSelectedUserName(u.name)}>
                                  <Text style={[styles.chipText, selectedUserName === u.name && {color:'white'}]}>{u.name}</Text>
                              </TouchableOpacity>
                          ))}
                      </ScrollView>
                  </View>

                  <View style={styles.dlCard}>
                      <Text style={styles.dlCardHeader}>3. Select Data</Text>
                      <View style={styles.grid}>
                          <View style={styles.col}>
                              <ToggleRow label="Orders" field="orders" />
                              <ToggleRow label="Collections" field="collections" />
                              <ToggleRow label="Expenses" field="expenses" />
                              <ToggleRow label="Leads" field="leads" />
                              <ToggleRow label="Attendance" field="attendance" />
                              <ToggleRow label="Quotations" field="quotations" />
                          </View>
                          <View style={styles.col}>
                              <ToggleRow label="Service Calls" field="service" />
                              <ToggleRow label="PMS Reports" field="pms" />
                              <ToggleRow label="Installations" field="installations" />
                              <ToggleRow label="Travel" field="travel" />
                              <ToggleRow label="Leaves" field="leaves" />
                              <ToggleRow label="Pending Dues" field="dues" />
                          </View>
                      </View>
                      <View style={styles.grid}>
                          <View style={styles.col}>
                              <ToggleRow label="Couriers" field="couriers" />
                              <ToggleRow label="Advances" field="advances" />
                              <ToggleRow label="Projects" field="projects" />
                          </View>
                          <View style={styles.col}>
                              <ToggleRow label="Demos" field="demos" />
                              <ToggleRow label="Tasks" field="tasks" />
                              <ToggleRow label="Organizations" field="organizations" />
                          </View>
                      </View>
                      <View style={styles.grid}>
                          <View style={styles.col}>
                              <ToggleRow label="Employees List" field="employees" />
                          </View>
                      </View>
                  </View>

                  <TouchableOpacity style={styles.downloadBtn} onPress={generateExcel} disabled={loading}>
                      {loading ? (
                          <View style={{flexDirection:'row', alignItems:'center'}}>
                              <ActivityIndicator color="white" />
                              <Text style={[styles.btnText, {fontSize:14, marginLeft:10}]}>{progress}</Text>
                          </View>
                      ) : (
                          <><Ionicons name="cloud-download-outline" size={24} color="white" /><Text style={styles.btnText}>Generate Excel</Text></>
                      )}
                  </TouchableOpacity>
              </ScrollView>
          </View>
      )}

      {/* ========================================= */}
      {/* 🟡 SHARED MODALS */}
      {/* ========================================= */}
      
      {/* UNIVERSAL DETAILS POPUP MODAL */}
      <Modal visible={detailModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.detailCard}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                      <Text style={{fontSize:18, fontWeight:'bold', color: selectedEvent?.color}}>{selectedEvent?.type} Details</Text>
                      <TouchableOpacity onPress={() => setDetailModalVisible(false)}><Ionicons name="close-circle" size={28} color="#d32f2f" /></TouchableOpacity>
                  </View>
                  
                  {selectedEvent && selectedEvent.rawData ? (
                      <ScrollView showsVerticalScrollIndicator={false} style={{maxHeight: 400}}>
                          <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 10}}>
                              <Text style={{fontWeight:'bold', fontSize:14}}>{selectedEvent.date ? new Date(selectedEvent.date).toLocaleDateString('en-GB') : '-'}</Text>
                              <View style={{backgroundColor: selectedEvent.color + '20', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10}}>
                                  <Text style={{fontWeight:'bold', color: selectedEvent.color, fontSize: 12}}>{selectedEvent.rawData.status || selectedEvent.type}</Text>
                              </View>
                          </View>

                          {selectedEvent.type === 'Order' && (
                              <>
                                  <DetailRow label="Product/Name" value={getProductName(selectedEvent.rawData)} />
                                  <DetailRow label="Quantity" value={selectedEvent.rawData.qty || '1'} />
                                  {isFinanceRole && (
                                      <DetailRow label="Order Value" value={`₹ ${Number(selectedEvent.rawData.totalValue || selectedEvent.rawData.orderValue || selectedEvent.rawData.amount || 0).toLocaleString()}`} />
                                  )}
                                  <DetailRow label="Client / Location" value={`${getClientName(selectedEvent.rawData)} (${selectedEvent.rawData.city || (typeof selectedEvent.rawData.location === 'string' ? selectedEvent.rawData.location : selectedEvent.rawData.location?.address) || 'N/A'})`} />
                                  <View style={styles.infoBox}><Text style={styles.infoLabel}>Remark:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.remark || selectedEvent.rawData.note || '-'}</Text></View>
                              </>
                          )}
                          
                          {selectedEvent.type === 'Payment' && (
                              <>
                                  <DetailRow label="Amount Received" value={`₹ ${Number(selectedEvent.rawData.amount || selectedEvent.rawData.receivedAmount || 0).toLocaleString()}`} />
                                  <DetailRow label="Payment Mode" value={selectedEvent.rawData.mode || selectedEvent.rawData.paymentMode} />
                                  <DetailRow label="Client Name" value={getClientName(selectedEvent.rawData)} />
                                  <View style={styles.infoBox}><Text style={styles.infoLabel}>Note:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.note || selectedEvent.rawData.remark || '-'}</Text></View>
                              </>
                          )}

                          {selectedEvent.type === 'Lead' && (
                              <>
                                  <DetailRow label="Client Name" value={getClientName(selectedEvent.rawData)} />
                                  <DetailRow label="Contact" value={selectedEvent.rawData.mobile || selectedEvent.rawData.contact || 'N/A'} />
                                  <DetailRow label="City" value={selectedEvent.rawData.city || selectedEvent.rawData.location || 'N/A'} />
                                  <View style={styles.infoBox}><Text style={styles.infoLabel}>Requirement:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.requirement || selectedEvent.rawData.product || '-'}</Text></View>
                              </>
                          )}

                          {(selectedEvent.type === 'Attendance' || selectedEvent.type === 'Short Day') && (
                              <>
                                  <DetailRow label="In Time" value={selectedEvent.rawData.inTime || 'N/A'} />
                                  <DetailRow label="Out Time" value={selectedEvent.rawData.outTime || 'N/A'} />
                                  <DetailRow label="Total Hrs" value={selectedEvent.rawData.workHrs || 'N/A'} />
                                  <DetailRow label="Day Expense" value={`₹ ${Number(selectedEvent.rawData.expenses?.totalAmount || selectedEvent.rawData.dayExpense || selectedEvent.rawData.expense || 0).toLocaleString()}`} />
                                  <View style={styles.infoBox}><Text style={styles.infoLabel}>Login Location:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.inLocation || selectedEvent.rawData.location?.address || '-'}</Text></View>
                              </>
                          )}

                          {selectedEvent.type === 'Leave' && (
                              <>
                                  <DetailRow label="Total Days" value={selectedEvent.rawData.days || '1'} />
                                  <DetailRow label="Status" value={selectedEvent.rawData.status || 'Pending'} />
                                  <View style={styles.infoBox}><Text style={styles.infoLabel}>Reason:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.reason || selectedEvent.rawData.remark || '-'}</Text></View>
                              </>
                          )}

                          {selectedEvent.type === 'Expense' && (
                              <>
                                  <DetailRow label="Category" value={selectedEvent.rawData.category || 'Misc'} />
                                  <DetailRow label="Amount" value={`₹ ${Number(selectedEvent.rawData.amount || 0).toLocaleString()}`} />
                                  <View style={styles.infoBox}><Text style={styles.infoLabel}>Note:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.note || selectedEvent.rawData.remark || '-'}</Text></View>
                              </>
                          )}

                          {selectedEvent.type === 'Advance' && (
                              <>
                                  <DetailRow label="Amount Taken" value={`₹ ${Number(selectedEvent.rawData.amount || 0).toLocaleString()}`} />
                                  <DetailRow label="Status" value={selectedEvent.rawData.status || 'Pending'} />
                                  <View style={styles.infoBox}><Text style={styles.infoLabel}>Reason:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.reason || selectedEvent.rawData.note || '-'}</Text></View>
                              </>
                          )}

                          {selectedEvent.type === 'Installation' && (
                              <>
                                  <DetailRow label="Client" value={getClientName(selectedEvent.rawData)} />
                                  <DetailRow label="Machine" value={selectedEvent.rawData.product || selectedEvent.rawData.productName} />
                                  <DetailRow label="Serial Number" value={selectedEvent.rawData.serialNo || 'N/A'} />
                                  <DetailRow label="Warranty Expiry" value={selectedEvent.rawData.warrantyExpiry || 'N/A'} />
                              </>
                          )}

                          {selectedEvent.type === 'Service' && (
                              <>
                                  <DetailRow label="Ticket ID" value={selectedEvent.rawData.scrId || selectedEvent.rawData.id} />
                                  <DetailRow label="Client" value={getClientName(selectedEvent.rawData)} />
                                  <DetailRow label="Machine / Serial" value={`${selectedEvent.rawData.machine || '-'} (${selectedEvent.rawData.serialNo || '-'})`} />
                                  <View style={[styles.infoBox, {backgroundColor: '#ffebee'}]}><Text style={styles.infoLabel}>Complaint:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.remark || '-'}</Text></View>
                                  <View style={[styles.infoBox, {backgroundColor: '#e8f5e9'}]}><Text style={styles.infoLabel}>Resolution:</Text><Text style={styles.infoValue}>{selectedEvent.rawData.resolutionNote || 'Pending'}</Text></View>
                              </>
                          )}

                          {!['Order', 'Payment', 'Lead', 'Attendance', 'Short Day', 'Leave', 'Expense', 'Advance', 'Installation', 'Service'].includes(selectedEvent.type) && (
                              <>
                                  <DetailRow label="Status/Info" value={selectedEvent.desc?.split('\n')[0] || '-'} />
                                  {selectedEvent.desc?.split('\n')[1] && <View style={styles.infoBox}><Text style={styles.infoLabel}>Extra Details:</Text><Text style={styles.infoValue}>{selectedEvent.desc?.split('\n')[1]}</Text></View>}
                              </>
                          )}
                          <View style={{height: 20}} />
                      </ScrollView>
                  ) : (
                      <Text style={{color:'gray', textAlign:'center'}}>No additional details available.</Text>
                  )}
              </View>
          </View>
      </Modal>

      <Modal visible={userModalVisible} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} onPress={() => setUserModalVisible(false)}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select Employee</Text>
                  <FlatList 
                      data={activeTab === 'employee' ? userList : [{id: 'all', name: 'All Employees'}, ...userList]} keyExtractor={(item) => item.id}
                      renderItem={({item}) => (
                          <TouchableOpacity style={styles.modalItem} onPress={() => { 
                              if (activeTab === 'employee') setEmpUser(item); 
                              else setSelectedUser(item.id === 'all' ? null : item); 
                              setUserModalVisible(false); 
                          }}>
                              <Text style={styles.modalItemText}>{item.name}</Text>
                          </TouchableOpacity>
                      )}
                  />
              </View>
          </TouchableOpacity>
      </Modal>

      <Modal visible={showYearModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select Year</Text>
                  {years.map(y => (
                      <TouchableOpacity key={y} style={styles.modalItemRow} onPress={() => { setSelectedYear(y); setShowYearModal(false); }}>
                          <Text style={[styles.modalItemText, selectedYear === y && {color:'#3b5998', fontWeight:'bold'}]}>FY {y.toString().slice(-2)}-{(y+1).toString().slice(-2)}</Text>
                          {selectedYear === y && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                      </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setShowYearModal(false)}><Text style={{color:'red'}}>Close</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={showMonthModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, {maxHeight: 500}]}>
                  <Text style={styles.modalTitle}>Select Month</Text>
                  <ScrollView>
                      <TouchableOpacity style={styles.modalItemRow} onPress={() => { setSelectedMonth(-1); setShowMonthModal(false); }}>
                          <Text style={[styles.modalItemText, selectedMonth === -1 && {color:'#3b5998', fontWeight:'bold'}]}>All Months</Text>
                          {selectedMonth === -1 && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                      </TouchableOpacity>
                      {fyMonths.map((m, i) => (
                          <TouchableOpacity key={m} style={styles.modalItemRow} onPress={() => { setSelectedMonth(i); setShowMonthModal(false); }}>
                              <Text style={[styles.modalItemText, selectedMonth === i && {color:'#3b5998', fontWeight:'bold'}]}>{m}</Text>
                              {selectedMonth === i && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                          </TouchableOpacity>
                      ))}
                  </ScrollView>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setShowMonthModal(false)}><Text style={{color:'red'}}>Close</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

    </View>
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
  header: { padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 10 },
  
  // Tabs
  tabContainer: { flexDirection: 'row', padding: 10, backgroundColor: 'white', paddingBottom: 15 },
  tabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderRadius: 25, backgroundColor: '#f0f0f0', marginHorizontal: 5 },
  activeTab: { backgroundColor: '#3b5998' },
  tabText: { marginLeft: 5, fontWeight: 'bold', color: '#666', fontSize: 13 },

  // Timeline UI
  filterContainer: { flexDirection: 'row', padding: 15, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#eee' },
  filterBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', padding: 10, borderRadius: 8, marginHorizontal: 5, justifyContent: 'center' },
  filterText: { marginLeft: 8, color: '#1565c0', fontWeight: 'bold', fontSize: 13 },
  timelineRow: { flexDirection: 'row', width: '100%' },
  timeBox: { width: 75, alignItems: 'flex-end', paddingRight: 10, paddingTop: 15 },
  timeText: { fontSize: 11, color: 'gray', fontWeight: 'bold' },
  lineBox: { width: 20, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 16, zIndex: 2 },
  line: { width: 2, backgroundColor: '#ddd', flex: 1, marginTop: -5, marginBottom: -15, zIndex: 1 },
  contentBox: { flex: 1, paddingBottom: 15, paddingLeft: 10, paddingTop: 5 },
  card: { backgroundColor: 'white', padding: 12, borderRadius: 8, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  cardDesc: { fontSize: 13, color: '#333', marginTop: 2, fontWeight: '500' },
  extraBox: { marginTop: 8, backgroundColor: '#f9f9f9', padding: 8, borderRadius: 5, borderWidth: 1, borderColor: '#eee' },
  extraText: { fontSize: 12, color: '#666', fontStyle: 'italic' },

  // Employee 360 UI
  profileCard: { backgroundColor: 'white', borderRadius: 12, padding: 15, elevation: 2, marginBottom: 15 },
  profileHeader: { flexDirection: 'row', alignItems: 'center' },
  profileAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#3b5998', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  profileName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  profileRole: { fontSize: 13, color: 'gray', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  profileDetails: { gap: 6 },
  profRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profText: { fontSize: 13, color: '#555' },
  
  financeGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  finBox: { flex: 1, padding: 15, borderRadius: 10, elevation: 1, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  activeFinBox: { borderColor: '#3b5998' },
  finVal: { fontSize: 18, fontWeight: 'bold' },
  finLabel: { fontSize: 11, color: '#555', marginTop: 4, textTransform: 'uppercase', fontWeight: 'bold' },
  
  statBadge: { backgroundColor: 'white', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, marginRight: 10, alignItems: 'center', elevation: 1, borderWidth: 2, borderColor: 'transparent' },
  statNum: { fontSize: 16, fontWeight: 'bold', color: '#3b5998' },
  statLbl: { fontSize: 10, color: 'gray', marginTop: 2 },
  
  empTimelineCard: { backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 10, elevation: 1, borderLeftWidth: 3, borderLeftColor: '#3b5998' },
  loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },

  // Download Reports UI
  dlCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 1 },
  dlCardHeader: { fontSize: 14, fontWeight: 'bold', color: '#555', borderBottomWidth:1, borderBottomColor:'#eee', paddingBottom:5 },
  dlFilterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  dlDropdown: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f4ff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d1d9ff', justifyContent: 'space-between' },
  dlDropdownText: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f0f0f0', borderRadius: 20, marginRight: 5, marginBottom: 5 },
  activeChip: { backgroundColor: '#3b5998' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, paddingVertical: 5, borderBottomWidth: 1, borderColor: '#f9f9f9' },
  label: { fontSize: 13, color: '#333' },
  downloadBtn: { backgroundColor: '#2e7d32', padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 3 },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },

  // Shared
  sectionHeader: { fontSize: 14, fontWeight: 'bold', color: 'gray', marginBottom: 10, marginTop: 5, textTransform: 'uppercase' },
  centerState: { alignItems: 'center', marginTop: 50 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: 400 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' },
  modalItemRow: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  modalItemText: { fontSize: 15, color: '#333', textAlign: 'center' },
  closeBtn: { marginTop: 15, alignItems: 'center', padding: 10 },
  detailCard: { backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5, maxHeight: '85%', width:'90%' },
  infoBox: { padding: 10, borderRadius: 8, marginTop: 10, backgroundColor: '#f9f9f9' },
  infoLabel: { fontSize: 11, color: 'gray', marginBottom: 2 },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#333' }
});