import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Dimensions,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import {
    BarChart,
    PieChart
} from 'react-native-chart-kit';

// 🔥 SAAS IMPORTS
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

const SCREEN_WIDTH = Dimensions.get('window').width - 36;

// ─── Chart Colors ──────────────────────────────────────────
const CHART_CONFIG = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(26, 35, 126, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(100, 100, 100, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: '4', strokeWidth: '2', stroke: '#1A237E' },
    propsForBackgroundLines: { stroke: '#f0f0f0' },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const getLast6Months = () => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ label: MONTHS[d.getMonth()], month: d.getMonth(), year: d.getFullYear() });
    }
    return months;
};

export default function UpdatedDashboard() {
    const router = useRouter();
    const { currentUser } = useData();
    const { fetchSaaSData, isDbLoading } = useSaaSDB();

    const [leadsList, setLeadsList] = useState<any[]>([]);
    const [dueList, setDueList] = useState<any[]>([]);
    const [paymentList, setPaymentList] = useState<any[]>([]);
    const [orderList, setOrderList] = useState<any[]>([]);
    const [taskList, setTaskList] = useState<any[]>([]);
    const [courierList, setCourierList] = useState<any[]>([]);
    const [serviceCallList, setServiceCallList] = useState<any[]>([]);
    const [salesVisitList, setSalesVisitList] = useState<any[]>([]);
    const [attendanceList, setAttendanceList] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [subDaysLeft, setSubDaysLeft] = useState<number | null>(null);
    const [chartsVisible, setChartsVisible] = useState(false);

    useEffect(() => {
        const checkSubscription = async () => {
            if (!currentUser?.companyId) return;
            try {
                const companies = await fetchSaaSData("companies");
                if (companies && companies.length > 0) {
                    const company = companies[0] as any;
                    if (company.expiryDate) {
                        const expiry = new Date(company.expiryDate);
                        const diff = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        setSubDaysLeft(diff);
                    }
                }
            } catch (e) {}
        };
        checkSubscription();
    }, [currentUser]);

    const loadDashboardData = async () => {
        if (currentUser?.companyId) {
            const [leads, dues, payments, orders, tasks, couriers, services, visits, attendance] = await Promise.all([
                fetchSaaSData("leads"),
                fetchSaaSData("payment_dues"),
                fetchSaaSData("payment_collections"),
                fetchSaaSData("orders"),
                fetchSaaSData("tasks"),
                fetchSaaSData("couriers"),
                fetchSaaSData("service_calls"),
                fetchSaaSData("sales_reports"),
                fetchSaaSData("attendance")
            ]);
            setLeadsList(leads); setDueList(dues); setPaymentList(payments);
            setOrderList(orders); setTaskList(tasks); setCourierList(couriers);
            setServiceCallList(services); setSalesVisitList(visits); setAttendanceList(attendance);
        }
    };

    useEffect(() => { loadDashboardData(); }, [currentUser]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadDashboardData();
        setRefreshing(false);
    }, [currentUser]);

    const userRole = (currentUser?.role || '').toLowerCase();
    const isAdmin = userRole.includes('admin') || userRole.includes('manager') || userRole.includes('account');
    const isLogisticsRole = isAdmin || userRole.includes('store');

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    let fyEndYear = fyStartYear + 1;
    const fyStartDate = new Date(fyStartYear, 3, 1);
    const fyEndDate = new Date(fyEndYear, 2, 31, 23, 59, 59);
    const fyLabel = `FY ${fyStartYear.toString().slice(-2)}-${fyEndYear.toString().slice(-2)}`;

    const parseDate = (dateStr: any) => {
        if (!dateStr) return new Date(0);
        if (typeof dateStr === 'string') {
            if (dateStr.includes('T')) return new Date(dateStr);
            if (dateStr.includes('-')) return new Date(dateStr);
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
        }
        return new Date(dateStr);
    };

    const getLeadActionCounts = () => {
        let myLeads = leadsList || [];
        if (!isAdmin) myLeads = myLeads.filter((l: any) => l.userId === currentUser?.uid || l.assignedTo === currentUser?.uid || l.senderId === currentUser?.uid);
        const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);
        let overdue = 0, dueToday = 0, hot = 0;
        myLeads.forEach((l: any) => {
            const status = (l.status || '').toLowerCase();
            if (status.includes('converted') || status.includes('lost') || status.includes('order closed') || status.includes('drop')) return;
            if (l.isHot || l.type === 'Hot') hot++;
            if (l.nextDate) {
                const nDate = parseDate(l.nextDate); nDate.setHours(0, 0, 0, 0);
                const diff = nDate.getTime() - todayObj.getTime();
                if (diff < 0) overdue++;
                else if (diff === 0) dueToday++;
            }
        });
        return { overdue, dueToday, hot };
    };
    const leadActionCounts = getLeadActionCounts();

    const calculateSales = () => orderList
        .filter((order: any) => {
            const isMine = isAdmin ? true : (order.senderId === currentUser?.id || order.senderId === currentUser?.uid);
            const isConfirmed = ['Approved', 'Completed', 'Dispatched', 'Billed'].includes(order.status);
            const orderDate = new Date(order.date || order.createdAt);
            return isMine && isConfirmed && orderDate >= fyStartDate && orderDate <= fyEndDate;
        })
        .reduce((sum: number, item: any) => {
            let amt = item.amount;
            if (typeof amt === 'string') amt = parseFloat(amt.replace(/[^0-9.]/g, ''));
            return sum + (amt || 0);
        }, 0);

    const totalSale = calculateSales();
    const userTarget = Number(currentUser?.salesTarget) || 0;
    const displayTarget = isAdmin ? 0 : userTarget;
    let progress = !isAdmin && userTarget > 0 ? Math.min((totalSale / userTarget) * 100, 100) : isAdmin ? 100 : 0;

    const totalMarketOutstanding = orderList
        .filter((order: any) => {
            const isApproved = ['Approved', 'Completed', 'Dispatched', 'Billed'].includes(order.status);
            const isMine = isAdmin ? true : (order.senderId === currentUser?.id || order.senderId === currentUser?.uid);
            const currentBal = order.balance !== undefined ? parseFloat(String(order.balance)) : parseFloat(String(order.amount || 0));
            return isApproved && isMine && currentBal > 0;
        })
        .reduce((sum: number, order: any) => {
            const due = order.balance !== undefined ? parseFloat(String(order.balance)) : parseFloat(String(order.amount || 0));
            return sum + (isNaN(due) ? 0 : due);
        }, 0);

    const totalRecoveryThisMonth = paymentList
        .filter((p: any) => {
            const isMine = isAdmin ? true : (p.senderId === currentUser?.id || p.senderId === currentUser?.uid);
            const payDate = new Date(p.date || p.timestamp);
            return isMine && payDate.getMonth() === currentMonth && payDate.getFullYear() === currentYear;
        })
        .reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayAttendanceCount = attendanceList.filter((a: any) =>
        isAdmin ? a.date === todayStr : (a.date === todayStr && (a.senderId === currentUser?.id || a.senderId === currentUser?.uid))
    ).length;

    const myTodayEntry = attendanceList.find((a: any) => a.date === todayStr && a.userName === currentUser?.name);
    let todayStatusText = "Mark Attendance", todayStatusColor = "#FF9800", todayStatusIcon = "time-outline";
    if (myTodayEntry) {
        if (myTodayEntry.outTime) { todayStatusText = "Logged Out"; todayStatusColor = "#757575"; todayStatusIcon = "checkmark-circle"; }
        else { todayStatusText = "Logged In"; todayStatusColor = "#4CAF50"; todayStatusIcon = "ellipse"; }
    }

    const myPendingTasks = taskList.filter((t: any) => {
        const taskTo = (t.to || '').toLowerCase().trim();
        const myName = (currentUser?.name || '').toLowerCase().trim();
        return t.status === 'Pending' && (taskTo === 'self' || taskTo === myName);
    }).length;
    const assignedPendingTasks = taskList.filter((t: any) => {
        const taskFrom = (t.from || '').toLowerCase().trim();
        const taskTo = (t.to || '').toLowerCase().trim();
        const myName = (currentUser?.name || '').toLowerCase().trim();
        return t.status === 'Pending' && (taskFrom === myName && taskTo !== 'self' && taskTo !== myName);
    }).length;
    const totalPendingTasks = isAdmin ? taskList.filter((t: any) => t.status === 'Pending').length : (myPendingTasks + assignedPendingTasks);
    const pendingCourierCount = courierList.filter((c: any) => c.status === 'Pending' && (isLogisticsRole ? true : (c.senderId === currentUser?.id || c.senderId === currentUser?.uid))).length;
    const openServiceCount = serviceCallList.filter((s: any) => (s.status === 'Open' || s.status === 'Assigned') && (isAdmin ? true : (s.senderId === currentUser?.id || s.senderId === currentUser?.uid))).length;

    const isVisitActive = (v: any) => { const o = (v.outcome || '').toLowerCase(); return !(o.includes('closed') || o.includes('order') || o.includes('lost') || o.includes('not interested')); };
    const isLeadActive = (l: any) => { const s = (l.status || '').toLowerCase(); return !(s === 'converted' || s === 'lost' || s === 'plan drop'); };
    const activeVisits = salesVisitList.filter((v: any) => (isAdmin ? true : (v.senderId === currentUser?.uid || v.senderId === currentUser?.id)) && isVisitActive(v)).length;
    const activeLeads = leadsList.filter((l: any) => (isAdmin ? true : (l.senderId === currentUser?.uid || l.senderId === currentUser?.id)) && isLeadActive(l)).length;
    const totalSalesFollowUps = activeVisits + activeLeads;

    const topDues = [...dueList]
        .filter((due: any) => isAdmin ? true : (due.assignedToUid === currentUser?.id || due.assignedToUid === currentUser?.uid || due.senderId === currentUser?.id || due.senderId === currentUser?.uid))
        .sort((a, b) => Number(b.amount) - Number(a.amount))
        .slice(0, 3);

    // =========================================================
    // 📊 CHART DATA — react-native-chart-kit format
    // =========================================================

    const last6Months = getLast6Months();

    // Chart 1 — Monthly Sales Bar Chart
    const salesChartData = {
        labels: last6Months.map(m => m.label),
        datasets: [{
            data: last6Months.map(({ month, year }) => {
                const val = orderList
                    .filter((o: any) => {
                        const d = new Date(o.date || o.createdAt);
                        const isMine = isAdmin ? true : (o.senderId === currentUser?.id || o.senderId === currentUser?.uid);
                        return isMine && ['Approved','Completed','Dispatched','Billed'].includes(o.status) && d.getMonth() === month && d.getFullYear() === year;
                    })
                    .reduce((sum: number, o: any) => {
                        let amt = o.amount;
                        if (typeof amt === 'string') amt = parseFloat(amt.replace(/[^0-9.]/g, ''));
                        return sum + (amt || 0);
                    }, 0);
                return Math.round(val / 1000); // ₹K
            })
        }]
    };

    // Chart 2 — Monthly Collection Bar Chart
    const collectionChartData = {
        labels: last6Months.map(m => m.label),
        datasets: [{
            data: last6Months.map(({ month, year }) => {
                const val = paymentList
                    .filter((p: any) => {
                        const d = new Date(p.date || p.createdAt);
                        const isMine = isAdmin ? true : (p.senderId === currentUser?.id || p.senderId === currentUser?.uid);
                        return isMine && d.getMonth() === month && d.getFullYear() === year;
                    })
                    .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
                return Math.round(val / 1000);
            })
        }]
    };

    // Chart 3 — Order Status Pie
    const orderStatusMap = orderList
        .filter((o: any) => isAdmin ? true : (o.senderId === currentUser?.id || o.senderId === currentUser?.uid))
        .reduce((acc: any, o: any) => {
            const s = o.status || 'Pending';
            acc[s] = (acc[s] || 0) + 1;
            return acc;
        }, {});

    const PIE_COLORS_ORDER = ['#1A237E', '#2E7D32', '#F57C00', '#D32F2F', '#607D8B'];
    const orderPieData = Object.entries(orderStatusMap)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, population]: any, i) => ({
            name: name.length > 10 ? name.slice(0, 10) + '...' : name,
            population,
            color: PIE_COLORS_ORDER[i % PIE_COLORS_ORDER.length],
            legendFontColor: '#555',
            legendFontSize: 11,
        }));

    // Chart 4 — Lead Status Pie
    const myLeadsForChart = isAdmin ? leadsList : leadsList.filter((l: any) => l.senderId === currentUser?.uid || l.senderId === currentUser?.id);
    const leadStatusMap = myLeadsForChart.reduce((acc: any, l: any) => {
        const s = l.status || 'New';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    const PIE_COLORS_LEAD = ['#1976D2', '#F57C00', '#2E7D32', '#D32F2F', '#9C27B0'];
    const leadPieData = Object.entries(leadStatusMap)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, population]: any, i) => ({
            name: name.length > 10 ? name.slice(0, 10) + '...' : name,
            population,
            color: PIE_COLORS_LEAD[i % PIE_COLORS_LEAD.length],
            legendFontColor: '#555',
            legendFontSize: 11,
        }));

    // Chart 5 — Service Tickets Bar
    const serviceChartData = {
        labels: last6Months.map(m => m.label),
        datasets: [{
            data: last6Months.map(({ month, year }) =>
                serviceCallList.filter((s: any) => {
                    const d = new Date(s.createdAt || s.date);
                    const isMine = isAdmin ? true : (s.senderId === currentUser?.id || s.senderId === currentUser?.uid);
                    return isMine && d.getMonth() === month && d.getFullYear() === year;
                }).length
            )
        }]
    };

    const hasSalesData = salesChartData.datasets[0].data.some((v: number) => v > 0);
    const hasCollectionData = collectionChartData.datasets[0].data.some((v: number) => v > 0);
    const hasServiceData = serviceChartData.datasets[0].data.some((v: number) => v > 0);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.welcomeText}>{isAdmin ? 'Admin Dashboard' : 'Employee Dashboard'}</Text>
                        <View style={[styles.statusPill, { backgroundColor: todayStatusColor + '30', borderColor: todayStatusColor }]}>
                            <Ionicons name={todayStatusIcon as any} size={10} color={todayStatusColor} />
                            <Text style={[styles.statusPillText, { color: todayStatusColor }]}>{todayStatusText}</Text>
                        </View>
                    </View>
                    <Text style={styles.headerTitle}>Hello, {currentUser?.name || 'User'}</Text>
                </View>
                <TouchableOpacity style={styles.notifBtn} onPress={() => router.push('/notifications' as any)}>
                    <Ionicons name="notifications" size={22} color="white" />
                    <View style={styles.badge} />
                </TouchableOpacity>
            </View>

            {subDaysLeft !== null && subDaysLeft <= 30 && (
                <TouchableOpacity
                    onPress={() => router.push('/SubscriptionScreen' as any)}
                    style={[styles.subWarning, { backgroundColor: subDaysLeft <= 7 ? '#fdecea' : '#fff3cd', borderColor: subDaysLeft <= 7 ? '#d32f2f' : '#f57c00' }]}
                >
                    <Ionicons name="warning" size={18} color={subDaysLeft <= 7 ? '#d32f2f' : '#f57c00'} />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.subWarningText, { color: subDaysLeft <= 7 ? '#d32f2f' : '#856404' }]}>
                            {subDaysLeft <= 0 ? '⚠️ Plan Expired! Renew Now' : `⏳ Plan expires in ${subDaysLeft} day${subDaysLeft === 1 ? '' : 's'}`}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Tap here to renew →</Text>
                    </View>
                </TouchableOpacity>
            )}

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* SMART REMINDERS */}
                <View style={styles.actionCardsRow}>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#ffebee', borderColor: '#d32f2f', borderWidth: 1 }]} onPress={() => router.push('/leads' as any)}>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#d32f2f' }}>{leadActionCounts.overdue}</Text>
                        <Text style={{ fontSize: 10, color: '#d32f2f', fontWeight: 'bold', marginTop: 2 }}>OVERDUE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#fff3e0', borderColor: '#f57c00', borderWidth: 1 }]} onPress={() => router.push('/leads' as any)}>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#f57c00' }}>{leadActionCounts.dueToday}</Text>
                        <Text style={{ fontSize: 10, color: '#f57c00', fontWeight: 'bold', marginTop: 2 }}>DUE TODAY</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#e8f5e9', borderColor: '#2e7d32', borderWidth: 1 }]} onPress={() => router.push('/leads' as any)}>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2e7d32' }}>{leadActionCounts.hot}</Text>
                        <Text style={{ fontSize: 10, color: '#2e7d32', fontWeight: 'bold', marginTop: 2 }}>HOT DEALS</Text>
                    </TouchableOpacity>
                </View>

                {/* SALES TARGET */}
                {!isAdmin && (
                    <TouchableOpacity style={styles.progressCard} onPress={() => router.push('/sales_team_report' as any)}>
                        <View style={styles.progressHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.progressLabel}>My Sales Target ({fyLabel})</Text>
                                <Ionicons name="chevron-forward" size={14} color="#555" style={{ marginLeft: 5 }} />
                            </View>
                            <Text style={styles.progressValue}>{progress.toFixed(1)}%</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: progress >= 100 ? '#2E7D32' : '#1A237E' }]} />
                        </View>
                        <Text style={styles.targetText}>
                            Achieved: ₹{(totalSale / 100000).toFixed(2)}L / Target: ₹{(displayTarget / 100000).toFixed(2)}L
                        </Text>
                        <Text style={{ fontSize: 10, color: '#3b5998', marginTop: 5, textAlign: 'right', fontWeight: 'bold' }}>View My Incentive & Details →</Text>
                    </TouchableOpacity>
                )}

                {/* FINANCIAL STATS */}
                <View style={styles.mainStatsRow}>
                    <TouchableOpacity style={[styles.statCardFull, { backgroundColor: '#1A237E' }]} onPress={() => router.push('/orders' as any)}>
                        <View style={styles.statCardContent}>
                            <View>
                                <Text style={styles.statLabelLight}>{isAdmin ? 'Total Sales' : 'My Sales'} ({fyLabel})</Text>
                                <Text style={styles.statValueLarge}>₹{totalSale.toLocaleString('en-IN')}</Text>
                            </View>
                            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 10 }}>
                                <Ionicons name="cart" size={28} color="white" />
                            </View>
                        </View>
                    </TouchableOpacity>

                    {isAdmin && (
                        <TouchableOpacity style={styles.adminReportBtn} onPress={() => router.push('/sales_team_report' as any)}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 6, borderRadius: 8, marginRight: 10 }}>
                                    <Ionicons name="podium" size={20} color="white" />
                                </View>
                                <View>
                                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>Sales Team Report</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>Performance & Incentives</Text>
                                </View>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="white" />
                        </TouchableOpacity>
                    )}

                    <View style={styles.statsGrid}>
                        <TouchableOpacity style={[styles.statCardSmall, { backgroundColor: '#D32F2F' }]} onPress={() => router.push({ pathname: '/payment_duelist', params: { activeTab: 'Pending' } } as any)}>
                            <Text style={styles.statLabelLight}>Market Outstanding</Text>
                            <Text style={styles.statValueSmall}>₹{totalMarketOutstanding.toLocaleString('en-IN')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.statCardSmall, { backgroundColor: '#2E7D32' }]} onPress={() => router.push('/payment_collection' as any)}>
                            <Text style={styles.statLabelLight}>Coll. (This Month)</Text>
                            <Text style={styles.statValueSmall}>₹{totalRecoveryThisMonth.toLocaleString('en-IN')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* QUICK ACTIONS */}
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <View style={styles.quickGrid}>
                    <QuickLink icon="trending-up" label="Sales Report" count={totalSalesFollowUps} color="#00897B" showBadge={totalSalesFollowUps > 0} onPress={() => router.push('/sales' as any)} />
                    <QuickLink icon="checkbox" label="Tasks" count={totalPendingTasks} color="#F57C00" showBadge={true} onPress={() => router.push('/tasks' as any)} />
                    <QuickLink icon="time" label="Attendance" count={todayAttendanceCount} color="#673AB7" onPress={() => router.push('/dayin' as any)} />
                    <QuickLink icon="people" label="Leads" count={activeLeads} color="#1976D2" onPress={() => router.push('/leads' as any)} />
                    <QuickLink icon="construct" label="Service" count={openServiceCount} color="#5D4037" showBadge={openServiceCount > 0} onPress={() => router.push('/service_call' as any)} />
                    <QuickLink icon="cube" label="Courier" count={pendingCourierCount} color="#D32F2F" showBadge={pendingCourierCount > 0} onPress={() => router.push('/courier' as any)} />
                </View>

                {/* TOP DUES */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitleSmall}>Priority Follow-ups</Text>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/payment_duelist', params: { activeTab: 'Pending' } } as any)}>
                            <Text style={styles.viewAll}>View All</Text>
                        </TouchableOpacity>
                    </View>
                    {topDues.length > 0 ? topDues.map((item, index) => (
                        <View key={index} style={styles.dueItem}>
                            <View style={styles.dueIcon}><Ionicons name="alert-circle" size={18} color="#D32F2F" /></View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.dueOrg} numberOfLines={1}>{item.orgName}</Text>
                                <Text style={styles.dueDate}>Due: {item.dueDate}</Text>
                            </View>
                            <Text style={styles.dueAmount}>₹{Number(item.amount).toLocaleString()}</Text>
                        </View>
                    )) : <Text style={styles.emptyText}>{isDbLoading ? 'Loading...' : 'No pending dues.'}</Text>}
                </View>

                {/* =========================================================
                    📊 CHARTS TOGGLE BUTTON
                ========================================================= */}
                <TouchableOpacity style={styles.chartsToggle} onPress={() => setChartsVisible(p => !p)} activeOpacity={0.8}>
                    <Ionicons name="bar-chart" size={18} color="#1A237E" />
                    <Text style={styles.chartsToggleText}>{chartsVisible ? 'Hide Charts' : 'View Analytics Charts'}</Text>
                    <Ionicons name={chartsVisible ? 'chevron-up' : 'chevron-down'} size={16} color="#1A237E" />
                </TouchableOpacity>

                {chartsVisible && (
                    <View style={styles.chartsContainer}>

                        {/* CHART 1 — Monthly Sales */}
                        <View style={styles.chartCard}>
                            <View style={styles.chartHeader}>
                                <Ionicons name="bar-chart" size={16} color="#1A237E" />
                                <Text style={styles.chartTitle}>Monthly Sales (₹K)</Text>
                            </View>
                            <Text style={styles.chartSubtitle}>Last 6 months — confirmed orders</Text>
                            {!hasSalesData ? (
                                <EmptyChart message="No sales data yet" />
                            ) : (
                                <BarChart
                                    data={salesChartData}
                                    width={SCREEN_WIDTH - 32}
                                    height={180}
                                    chartConfig={{
                                        ...CHART_CONFIG,
                                        color: (opacity = 1) => `rgba(26, 35, 126, ${opacity})`,
                                    }}
                                    style={{ borderRadius: 12, marginTop: 8 }}
                                    showValuesOnTopOfBars
                                    fromZero
                                    yAxisSuffix="K"
                                    yAxisLabel="₹"
                                    withInnerLines={false}
                                />
                            )}
                        </View>

                        {/* CHART 2 — Monthly Collection */}
                        <View style={styles.chartCard}>
                            <View style={styles.chartHeader}>
                                <Ionicons name="bar-chart" size={16} color="#2E7D32" />
                                <Text style={styles.chartTitle}>Monthly Collection (₹K)</Text>
                            </View>
                            <Text style={styles.chartSubtitle}>Last 6 months — payments received</Text>
                            {!hasCollectionData ? (
                                <EmptyChart message="No collection data yet" />
                            ) : (
                                <BarChart
                                    data={collectionChartData}
                                    width={SCREEN_WIDTH - 32}
                                    height={180}
                                    chartConfig={{
                                        ...CHART_CONFIG,
                                        color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
                                    }}
                                    style={{ borderRadius: 12, marginTop: 8 }}
                                    showValuesOnTopOfBars
                                    fromZero
                                    yAxisSuffix="K"
                                    yAxisLabel="₹"
                                    withInnerLines={false}
                                />
                            )}
                        </View>

                        {/* CHART 3 — Order Status Pie */}
                        {orderPieData.length > 0 && (
                            <View style={styles.chartCard}>
                                <View style={styles.chartHeader}>
                                    <Ionicons name="pie-chart" size={16} color="#1A237E" />
                                    <Text style={styles.chartTitle}>Order Status Breakdown</Text>
                                </View>
                                <PieChart
                                    data={orderPieData}
                                    width={SCREEN_WIDTH - 32}
                                    height={160}
                                    chartConfig={CHART_CONFIG}
                                    accessor="population"
                                    backgroundColor="transparent"
                                    paddingLeft="10"
                                    absolute
                                />
                            </View>
                        )}

                        {/* CHART 4 — Lead Status Pie */}
                        {leadPieData.length > 0 && (
                            <View style={styles.chartCard}>
                                <View style={styles.chartHeader}>
                                    <Ionicons name="pie-chart" size={16} color="#1976D2" />
                                    <Text style={styles.chartTitle}>Lead Status Breakdown</Text>
                                </View>
                                <PieChart
                                    data={leadPieData}
                                    width={SCREEN_WIDTH - 32}
                                    height={160}
                                    chartConfig={{
                                        ...CHART_CONFIG,
                                        color: (opacity = 1) => `rgba(25, 118, 210, ${opacity})`,
                                    }}
                                    accessor="population"
                                    backgroundColor="transparent"
                                    paddingLeft="10"
                                    absolute
                                />
                            </View>
                        )}

                        {/* CHART 5 — Service Tickets */}
                        <View style={styles.chartCard}>
                            <View style={styles.chartHeader}>
                                <Ionicons name="construct" size={16} color="#5D4037" />
                                <Text style={styles.chartTitle}>Service Tickets</Text>
                            </View>
                            <Text style={styles.chartSubtitle}>Total tickets per month — last 6 months</Text>
                            {!hasServiceData ? (
                                <EmptyChart message="No service data yet" />
                            ) : (
                                <BarChart
                                    data={serviceChartData}
                                    width={SCREEN_WIDTH - 32}
                                    height={180}
                                    chartConfig={{
                                        ...CHART_CONFIG,
                                        color: (opacity = 1) => `rgba(93, 64, 55, ${opacity})`,
                                    }}
                                    style={{ borderRadius: 12, marginTop: 8 }}
                                    showValuesOnTopOfBars
                                    fromZero
                                    withInnerLines={false}
                                    yAxisLabel=""
                                    yAxisSuffix=""
                                />
                            )}
                        </View>

                    </View>
                )}

                <View style={{ height: 80 }} />
            </ScrollView>
        </View>
    );
}

const EmptyChart = ({ message }: { message: string }) => (
    <View style={styles.emptyChart}>
        <Ionicons name="bar-chart-outline" size={32} color="#ddd" />
        <Text style={styles.emptyChartText}>{message}</Text>
    </View>
);

const QuickLink = ({ icon, label, count, color, onPress, showBadge }: any) => (
    <TouchableOpacity style={styles.qlItem} onPress={onPress}>
        <View style={[styles.qlIcon, { backgroundColor: color + '15' }]}>
            <Ionicons name={icon} size={22} color={color} />
            {(showBadge && count > 0) ? (
                <View style={styles.iconBadge}>
                    <Text style={styles.iconBadgeText}>{count}</Text>
                </View>
            ) : null}
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.qlLabel}>{label}</Text>
            {(count > 0 && !showBadge) ? <Text style={[styles.qlCount, { color }]}>{count} Active</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={14} color="#CCC" />
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0F2F5' },
    header: { backgroundColor: '#1A237E', padding: 20, paddingTop: 60, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 10 },
    welcomeText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
    headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
    statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 10, borderWidth: 1 },
    statusPillText: { fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
    notifBtn: { backgroundColor: 'rgba(255,255,255,0.15)', padding: 10, borderRadius: 12 },
    badge: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252', position: 'absolute', right: 10, top: 10, borderWidth: 1.5, borderColor: '#1A237E' },
    subWarning: { borderWidth: 1, borderRadius: 10, marginHorizontal: 18, marginTop: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
    subWarningText: { fontWeight: 'bold', fontSize: 13 },
    scrollContent: { padding: 18 },
    actionCardsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
    actionCard: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, marginHorizontal: 4, elevation: 2 },
    progressCard: { backgroundColor: 'white', padding: 18, borderRadius: 20, elevation: 3, marginBottom: 18 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    progressLabel: { fontWeight: 'bold', color: '#555', fontSize: 13 },
    progressValue: { fontWeight: 'bold', color: '#1A237E' },
    progressBarBg: { height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#1A237E' },
    targetText: { fontSize: 10, color: '#888', marginTop: 8, textAlign: 'center' },
    mainStatsRow: { marginBottom: 20 },
    statCardFull: { width: '100%', padding: 20, borderRadius: 20, elevation: 5, marginBottom: 12 },
    statCardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statValueLarge: { color: 'white', fontSize: 26, fontWeight: 'bold' },
    statLabelLight: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2 },
    statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
    statCardSmall: { width: '48.5%', padding: 15, borderRadius: 18, elevation: 4 },
    statValueSmall: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15, marginTop: 10 },
    sectionTitleSmall: { fontSize: 15, fontWeight: 'bold', color: '#333' },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    qlItem: { width: '48.5%', backgroundColor: 'white', padding: 12, borderRadius: 15, marginBottom: 12, flexDirection: 'row', alignItems: 'center', elevation: 1 },
    qlIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', position: 'relative' },
    qlLabel: { fontWeight: 'bold', color: '#444', fontSize: 12 },
    qlCount: { fontSize: 10, fontWeight: 'bold' },
    iconBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: '#D32F2F', borderRadius: 12, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white', zIndex: 10, paddingHorizontal: 4 },
    iconBadgeText: { color: 'white', fontSize: 9, fontWeight: 'bold', textAlign: 'center' },
    section: { backgroundColor: 'white', padding: 18, borderRadius: 22, marginBottom: 20, elevation: 2 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center' },
    viewAll: { color: '#1A237E', fontWeight: 'bold', fontSize: 11 },
    dueItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
    dueIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center' },
    dueOrg: { fontWeight: 'bold', fontSize: 13, color: '#333' },
    dueDate: { fontSize: 10, color: '#999' },
    dueAmount: { fontWeight: 'bold', color: '#D32F2F', fontSize: 14 },
    emptyText: { textAlign: 'center', color: '#AAA', fontSize: 12, marginVertical: 10 },
    adminReportBtn: { backgroundColor: '#00897B', padding: 10, borderRadius: 15, marginBottom: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
    chartsToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'white', padding: 14, borderRadius: 14, marginBottom: 12, elevation: 2, borderWidth: 1.5, borderColor: '#e8eaf6' },
    chartsToggleText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1A237E' },
    chartsContainer: { gap: 14, marginBottom: 10 },
    chartCard: { backgroundColor: 'white', borderRadius: 18, padding: 16, elevation: 2 },
    chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    chartTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
    chartSubtitle: { fontSize: 11, color: '#aaa', marginBottom: 4 },
    emptyChart: { height: 120, alignItems: 'center', justifyContent: 'center', gap: 8 },
    emptyChartText: { fontSize: 12, color: '#bbb', textAlign: 'center' },
});