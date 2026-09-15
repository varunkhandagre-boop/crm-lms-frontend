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

// 🔥 SAAS IMPORTS (users still Firestore — not yet migrated)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 orders + payment collections now come from the new Postgres backend
import { listOrders } from '../services/api/orders';
import { listPaymentCollections } from '../services/api/paymentCollections';
import { fetchTeamMembers } from '../services/api/users';

export default function SalesTeamReport() {
    const router = useRouter();

    const { currentUser, user } = useData();
    const activeUser = currentUser || user;

    const { fetchSaaSData, isDbLoading } = useSaaSDB();

    const [userList, setUserList] = useState<any[]>([]);
    const [orderList, setOrderList] = useState<any[]>([]);
    const [paymentList, setPaymentList] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    const [viewMode, setViewMode] = useState<'Month' | 'FY'>('Month');
    const [currentDate, setCurrentDate] = useState(new Date());

    const [selectedUserId, setSelectedUserId] = useState('All');
    const [showUserPicker, setShowUserPicker] = useState(false);

    const [rules, setRules] = useState({
        baseTarget: '1000000',
        tier1Percent: '1',
        tier2Threshold: '1500000',
        tier2Percent: '2'
    });

    const [incentiveData, setIncentiveData] = useState<any[]>([]);

    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<any>(null);
    const [detailTab, setDetailTab] = useState<'Monthly' | 'Orders' | 'Collections'>('Monthly');
    const [staffOrders, setStaffOrders] = useState<any[]>([]);
    const [staffPayments, setStaffPayments] = useState<any[]>([]);
    const [monthlyStats, setMonthlyStats] = useState<any[]>([]);

    const [visibleCount, setVisibleCount] = useState(20);

    const userRole = (activeUser?.role || '').toLowerCase();
    const isAdmin = userRole.includes('admin') || userRole.includes('manager') || userRole.includes('account') || userRole.includes('hr') || userRole.includes('superadmin');

    useEffect(() => {
        setVisibleCount(20);
    }, [viewMode, currentDate, selectedUserId]);

    // 🔥 orders/payments via new API, users still via Firestore
    useEffect(() => {
        const loadData = async () => {
            if (!activeUser?.companyId) return;
            setLoadingData(true);
            try {
                const [users, orders, payments] = await Promise.all([
                    fetchTeamMembers(),
                    listOrders(),
                    listPaymentCollections(),
                ]);
                setUserList(users);
                setOrderList(orders);
                setPaymentList(payments);
            } finally {
                setLoadingData(false);
            }
        };
        loadData();
    }, [activeUser]);

    const changeDate = (dir: number) => {
        const d = new Date(currentDate);
        if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
        else d.setFullYear(d.getFullYear() + dir);
        setCurrentDate(d);
    };

    const getDateLabel = () => {
        if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
        const fyEndYear = fyStartYear + 1;
        return `FY ${fyStartYear.toString().slice(-2)}-${fyEndYear.toString().slice(-2)}`;
    };

    const formatDateShort = (dateStr: string) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    };

    // 🔥 New backend adapters already return dateIso in YYYY-MM-DD — no more
    // format-guessing across dateIso/createdAt/dd-mm-yyyy strings.
    const getValidDateStr = (obj: any) => obj.dateIso || "1970-01-01";

    useEffect(() => {
        if (!loadingData && userList.length > 0) {
            calculateIncentives();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rules, orderList, paymentList, userList, viewMode, currentDate, selectedUserId, loadingData]);

    const calculateIncentives = () => {
        const targetMonth = currentDate.getMonth();
        const targetYear = currentDate.getFullYear();

        const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
        const fyStartDateStr = `${fyStartYear}-04-01`;
        const fyEndDateStr = `${fyStartYear + 1}-03-31`;

        let eligibleStaff = [];

        if (isAdmin) {
            eligibleStaff = userList.filter((u: any) => {
                const r = (u.role || '').toLowerCase();
                return r.includes('sales') || r.includes('manager') || r.includes('admin') || r.includes('account');
            });
        } else {
            eligibleStaff = userList.filter((u: any) => u.id === activeUser?.id || u.uid === activeUser?.uid);
        }

        if (selectedUserId !== 'All') {
            eligibleStaff = eligibleStaff.filter((u: any) => (u.id === selectedUserId || u.uid === selectedUserId));
        }

        const processedData = eligibleStaff.map((u: any) => {
            let monthlyTarget = 0;
            if (u.monthlyTarget && Number(u.monthlyTarget) > 0) {
                monthlyTarget = Number(u.monthlyTarget);
            } else {
                monthlyTarget = Number(rules.baseTarget);
            }

            let monthlyTier2 = monthlyTarget * 1.5;
            let effectiveTarget = viewMode === 'FY' ? monthlyTarget * 12 : monthlyTarget;
            let effectiveTier2 = viewMode === 'FY' ? monthlyTier2 * 12 : monthlyTier2;

            const userOrders = orderList.filter((order: any) => {
                const orderDateStr = getValidDateStr(order);
                if (!orderDateStr || orderDateStr === "1970-01-01") return false;

                const d = new Date(orderDateStr);

                let dateMatch = false;
                if (viewMode === 'Month') {
                    dateMatch = d.getMonth() === targetMonth && d.getFullYear() === targetYear;
                } else {
                    dateMatch = orderDateStr >= fyStartDateStr && orderDateStr <= fyEndDateStr;
                }

                const userMatch = (order.senderId === u.id || order.senderId === u.uid);
                const statusMatch = order.status === 'Approved' || order.status === 'Completed' || order.status === 'Dispatched' || order.status === 'Billed';

                return dateMatch && userMatch && statusMatch;
            });

            const userPayments = paymentList.filter((payment: any) => {
                const payDateStr = getValidDateStr(payment);
                if (!payDateStr || payDateStr === "1970-01-01") return false;

                const d = new Date(payDateStr);

                let dateMatch = false;
                if (viewMode === 'Month') {
                    dateMatch = d.getMonth() === targetMonth && d.getFullYear() === targetYear;
                } else {
                    dateMatch = payDateStr >= fyStartDateStr && payDateStr <= fyEndDateStr;
                }

                const userMatch = (payment.senderId === u.id || payment.senderId === u.uid);
                return dateMatch && userMatch;
            });

            const totalSales = userOrders.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);

            const cashSales = userOrders.filter((o: any) => o.saleType === 'Cash').reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
            const creditSales = totalSales - cashSales;

            const totalCollected = userPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
            const incentive = getIncentiveAmount(totalSales, effectiveTarget, effectiveTier2);

            return {
                id: u.id || u.uid,
                name: u.name,
                role: u.role,
                target: effectiveTarget,
                isCustomTarget: !!(u.monthlyTarget && Number(u.monthlyTarget) > 0),
                orderCount: userOrders.length,
                totalSales: totalSales,
                cashSales: cashSales,
                creditSales: creditSales,
                collectionCount: userPayments.length,
                totalCollected: totalCollected,
                incentive: incentive,
                percentage: effectiveTarget > 0 ? (totalSales / effectiveTarget) * 100 : 0
            };
        });

        setIncentiveData(processedData.sort((a: any, b: any) => b.totalSales - a.totalSales));
    };

    const getIncentiveAmount = (amount: number, target: number, tier2Limit: number) => {
        if (amount < target) return 0;
        const t1Per = Number(rules.tier1Percent);
        const t2Per = Number(rules.tier2Percent);
        let incentive = 0;
        if (amount <= tier2Limit) incentive = (amount - target) * (t1Per / 100);
        else {
            const slab1Inc = (tier2Limit - target) * (t1Per / 100);
            const slab2Inc = (amount - tier2Limit) * (t2Per / 100);
            incentive = slab1Inc + slab2Inc;
        }
        return Math.floor(incentive);
    };

    const generateMonthlyStats = (u: any) => {
        const fyMonths = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

        const targetMonth = currentDate.getMonth();
        const targetYear = currentDate.getFullYear();
        const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;

        const stats = fyMonths.map((m, index) => {
            const actualYear = index > 8 ? fyStartYear + 1 : fyStartYear;
            const monthIndex = index > 8 ? index - 9 : index + 3;

            const monthlyOrders = orderList.filter((o: any) => {
                const dStr = getValidDateStr(o);
                const d = new Date(dStr);
                return d.getMonth() === monthIndex && d.getFullYear() === actualYear &&
                    (o.senderId === u.id || o.senderId === u.uid) &&
                    (o.status === 'Approved' || o.status === 'Completed' || o.status === 'Dispatched' || o.status === 'Billed');
            });

            const monthlySales = monthlyOrders.reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0);
            const monthlyCash = monthlyOrders.filter((o: any) => o.saleType === 'Cash').reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0);

            const monthlyColl = paymentList.filter((p: any) => {
                const dStr = getValidDateStr(p);
                const d = new Date(dStr);
                return d.getMonth() === monthIndex && d.getFullYear() === actualYear &&
                    (p.senderId === u.id || p.senderId === u.uid);
            }).reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0);

            return { month: m, sales: monthlySales, cash: monthlyCash, credit: monthlySales - monthlyCash, collection: monthlyColl };
        });

        setMonthlyStats(stats);
    };

    const handleCardClick = (item: any) => {
        setSelectedStaff(item);

        const targetMonth = currentDate.getMonth();
        const targetYear = currentDate.getFullYear();
        const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
        const fyStartDateStr = `${fyStartYear}-04-01`;
        const fyEndDateStr = `${fyStartYear + 1}-03-31`;

        const allUserOrders = orderList.filter((o: any) => {
            const isUser = (o.senderId === item.id || o.senderId === item.uid);
            const isStatus = (o.status === 'Approved' || o.status === 'Completed' || o.status === 'Dispatched' || o.status === 'Billed');
            if (!isUser || !isStatus) return false;

            const dStr = getValidDateStr(o);
            if (viewMode === 'Month') {
                const d = new Date(dStr);
                return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
            } else {
                return dStr >= fyStartDateStr && dStr <= fyEndDateStr;
            }
        });

        const allUserPayments = paymentList.filter((p: any) => {
            const isUser = (p.senderId === item.id || p.senderId === item.uid);
            if (!isUser) return false;

            const dStr = getValidDateStr(p);
            if (viewMode === 'Month') {
                const d = new Date(dStr);
                return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
            } else {
                return dStr >= fyStartDateStr && dStr <= fyEndDateStr;
            }
        });

        setStaffOrders(allUserOrders.sort((a: any, b: any) => getValidDateStr(b).localeCompare(getValidDateStr(a))));
        setStaffPayments(allUserPayments.sort((a: any, b: any) => getValidDateStr(b).localeCompare(getValidDateStr(a))));

        generateMonthlyStats(item);
        setDetailTab('Monthly');
        setDetailModalVisible(true);
    };

    const dropdownList = [
        { id: 'All', name: 'All Staff' },
        ...userList.map((u: any) => ({ ...u, id: u.id || u.uid }))
    ];

    const renderedList = incentiveData.slice(0, visibleCount);
    const isLoading = loadingData || isDbLoading;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>
                    <Text style={styles.headerTitle}>{isAdmin ? 'Team Performance' : 'My Performance'} 🚀</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {isLoading && <ActivityIndicator size="small" color="white" style={{ marginRight: 10 }} />}
                    {isAdmin && (
                        <TouchableOpacity onPress={() => setShowUserPicker(true)}><Ionicons name="filter" size={24} color="white" /></TouchableOpacity>
                    )}
                </View>
            </View>

            <View style={styles.controlBar}>
                <View style={styles.toggleContainer}>
                    <TouchableOpacity style={[styles.toggleBtn, viewMode === 'Month' && styles.activeToggle]} onPress={() => setViewMode('Month')}>
                        <Text style={[styles.toggleText, viewMode === 'Month' && { color: '#3b5998' }]}>Monthly</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.toggleBtn, viewMode === 'FY' && styles.activeToggle]} onPress={() => setViewMode('FY')}>
                        <Text style={[styles.toggleText, viewMode === 'FY' && { color: '#3b5998' }]}>FY (Yearly)</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.dateNav}>
                    <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={20} color="#555" /></TouchableOpacity>
                    <Text style={styles.dateText}>{getDateLabel()}</Text>
                    <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={20} color="#555" /></TouchableOpacity>
                </View>
            </View>

            {isAdmin && (
                <View style={styles.configBox}>
                    <Text style={styles.sectionTitle}>⚙️ Global Settings (Default)</Text>
                    <View style={styles.row}>
                        <View style={styles.inputWrap}>
                            <Text style={styles.label}>Default Target</Text>
                            <TextInput
                                style={styles.input}
                                keyboardType='numeric'
                                value={rules.baseTarget}
                                onChangeText={t => setRules({ ...rules, baseTarget: t })}
                            />
                        </View>
                        <View style={styles.inputWrap}><Text style={styles.label}>Comm (%)</Text><TextInput style={styles.input} keyboardType='numeric' value={rules.tier1Percent} onChangeText={t => setRules({ ...rules, tier1Percent: t })} /></View>
                        <View style={styles.inputWrap}><Text style={styles.label}>Boost (%)</Text><TextInput style={styles.input} keyboardType='numeric' value={rules.tier2Percent} onChangeText={t => setRules({ ...rules, tier2Percent: t })} /></View>
                    </View>
                    <Text style={{ fontSize: 9, color: 'gray', marginTop: 5 }}>* This target applies if user has no specific target in profile.</Text>
                </View>
            )}

            <FlatList
                data={renderedList}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 15, paddingBottom: 20 }}
                ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20, color: 'gray' }}>{isLoading ? 'Loading Analytics...' : 'No Data Found.'}</Text>}
                renderItem={({ item, index }) => (
                    <TouchableOpacity style={styles.card} onPress={() => handleCardClick(item)} activeOpacity={0.7}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                {isAdmin && index < 3 && (
                                    <View style={[styles.rankBadge, { backgroundColor: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32' }]}>
                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: 'white' }}>#{index + 1}</Text>
                                    </View>
                                )}
                                <View>
                                    <Text style={styles.name}>{item.name} <Ionicons name="information-circle" size={14} color="#3b5998" /></Text>
                                    <Text style={styles.roleText}>{item.role}</Text>
                                </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                {item.isCustomTarget ? (
                                    <View style={styles.customBadge}><Text style={styles.customText}>Custom Goal</Text></View>
                                ) : (
                                    <View style={[styles.customBadge, { backgroundColor: '#eee' }]}><Text style={[styles.customText, { color: 'gray' }]}>Default</Text></View>
                                )}
                                <Text style={{ fontSize: 10, color: 'gray', marginTop: 2 }}>Goal: ₹{(item.target / 1000).toFixed(0)}k</Text>
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                            <View>
                                <Text style={styles.subText}>Sales</Text>
                                <Text style={styles.salesAmount}>₹{item.totalSales.toLocaleString()}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.subText}>Incentive</Text>
                                <Text style={[styles.incentiveAmount, { color: item.incentive > 0 ? '#2e7d32' : '#d32f2f' }]}>₹{item.incentive.toLocaleString()}</Text>
                            </View>
                        </View>

                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${Math.min(item.percentage, 100)}%` as any, backgroundColor: item.percentage >= 100 ? '#4caf50' : '#1976D2' }]} />
                        </View>
                        <Text style={styles.progressText}>{item.percentage.toFixed(0)}% Achieved</Text>

                        <View style={styles.collectionStrip}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="wallet-outline" size={14} color="#555" />
                                <Text style={styles.collText}> Collection: </Text>
                                <Text style={{ fontWeight: 'bold', color: '#333' }}>₹{item.totalCollected.toLocaleString()}</Text>
                            </View>
                            <Text style={{ fontSize: 10, color: '#555' }}>Click for Report</Text>
                        </View>
                    </TouchableOpacity>
                )}

                ListFooterComponent={
                    <View style={{ paddingBottom: 80 }}>
                        {visibleCount < incentiveData.length ? (
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
                                <Text style={{ fontWeight: 'bold', color: '#3b5998' }}>
                                    👇 Load More Records ({incentiveData.length - visibleCount} remaining)
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            incentiveData.length > 0 ? (
                                <Text style={{ textAlign: 'center', padding: 20, color: '#aaa', fontSize: 12, fontStyle: 'italic' }}>
                                    --- End of List ---
                                </Text>
                            ) : null
                        )}
                    </View>
                }
            />

            <Modal visible={detailModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.detailModalContent}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>{selectedStaff?.name}</Text>
                                <Text style={styles.modalSub}>{isAdmin ? 'Performance Report' : 'My Report'}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                                <Ionicons name="close-circle" size={30} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>

                        <View style={{ flexDirection: 'row', backgroundColor: '#f0f4f8', padding: 10, borderRadius: 8, marginBottom: 15, justifyContent: 'space-between', borderWidth: 1, borderColor: '#e0e0e0' }}>
                            <View style={{ alignItems: 'center', flex: 1 }}>
                                <Text style={{ fontSize: 10, color: 'gray', marginBottom: 2 }}>💵 Cash Sales</Text>
                                <Text style={{ fontWeight: 'bold', color: '#2e7d32', fontSize: 13 }}>₹{selectedStaff?.cashSales?.toLocaleString()}</Text>
                            </View>
                            <View style={{ width: 1, backgroundColor: '#ccc' }} />
                            <View style={{ alignItems: 'center', flex: 1 }}>
                                <Text style={{ fontSize: 10, color: 'gray', marginBottom: 2 }}>📄 Credit (Billed)</Text>
                                <Text style={{ fontWeight: 'bold', color: '#1565c0', fontSize: 13 }}>₹{selectedStaff?.creditSales?.toLocaleString()}</Text>
                            </View>
                            <View style={{ width: 1, backgroundColor: '#ccc' }} />
                            <View style={{ alignItems: 'center', flex: 1 }}>
                                <Text style={{ fontSize: 10, color: 'gray', marginBottom: 2 }}>💰 Total Sales</Text>
                                <Text style={{ fontWeight: 'bold', color: '#333', fontSize: 13 }}>₹{selectedStaff?.totalSales?.toLocaleString()}</Text>
                            </View>
                        </View>

                        <View style={styles.tabContainer}>
                            <TouchableOpacity style={[styles.tab, detailTab === 'Monthly' && styles.activeTab]} onPress={() => setDetailTab('Monthly')}>
                                <Text style={[styles.tabText, detailTab === 'Monthly' && styles.activeTabText]}>Monthly 📅</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tab, detailTab === 'Orders' && styles.activeTab]} onPress={() => setDetailTab('Orders')}>
                                <Text style={[styles.tabText, detailTab === 'Orders' && styles.activeTabText]}>Orders ({staffOrders.length})</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tab, detailTab === 'Collections' && styles.activeTab]} onPress={() => setDetailTab('Collections')}>
                                <Text style={[styles.tabText, detailTab === 'Collections' && styles.activeTabText]}>Coll. ({staffPayments.length})</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
                            {detailTab === 'Monthly' && (
                                <View>
                                    <View style={[styles.monthRow, { backgroundColor: '#eee', borderRadius: 5, paddingVertical: 8 }]}>
                                        <Text style={[styles.monthText, { fontWeight: 'bold' }]}>Month</Text>
                                        <Text style={[styles.monthValue, { fontWeight: 'bold', color: '#1565c0' }]}>Sales</Text>
                                        <Text style={[styles.monthValue, { fontWeight: 'bold', color: '#2e7d32' }]}>Collection</Text>
                                    </View>
                                    {monthlyStats.map((stat, idx) => (
                                        <View key={idx} style={styles.monthRow}>
                                            <Text style={styles.monthText}>{stat.month}</Text>
                                            <Text style={styles.monthValue}>{stat.sales > 0 ? `₹${(stat.sales / 1000).toFixed(1)}k` : '-'}</Text>
                                            <Text style={styles.monthValue}>{stat.collection > 0 ? `₹${(stat.collection / 1000).toFixed(1)}k` : '-'}</Text>
                                        </View>
                                    ))}
                                    <View style={{ marginTop: 15, padding: 10, backgroundColor: '#e3f2fd', borderRadius: 8 }}>
                                        <Text style={{ textAlign: 'center', fontSize: 12, color: '#1565c0', fontWeight: 'bold', marginBottom: 4 }}>
                                            Total {viewMode === 'FY' ? 'FY' : 'Year'} Sales: ₹{monthlyStats.reduce((a, b) => a + b.sales, 0).toLocaleString()}
                                        </Text>
                                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 15 }}>
                                            <Text style={{ fontSize: 10, color: '#2e7d32' }}>Cash: ₹{monthlyStats.reduce((a, b) => a + b.cash, 0).toLocaleString()}</Text>
                                            <Text style={{ fontSize: 10, color: '#1565c0' }}>Credit: ₹{monthlyStats.reduce((a, b) => a + b.credit, 0).toLocaleString()}</Text>
                                        </View>
                                    </View>
                                </View>
                            )}

                            {detailTab === 'Orders' && (
                                staffOrders.length === 0 ? <Text style={styles.emptyText}>No Orders Found</Text> :
                                    staffOrders.map((order, index) => (
                                        <View key={index} style={styles.detailItem}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={styles.itemTitle}>{order.hospitalName || 'Unknown'}</Text>
                                                <Text style={styles.itemAmount}>₹{order.amount.toLocaleString()}</Text>
                                            </View>
                                            <Text style={styles.itemSub}>
                                                {formatDateShort(getValidDateStr(order))} • {order.status} • {order.saleType === 'Cash' ? '💵 Cash' : '📄 Credit'}
                                            </Text>
                                            {order.productDetails && <Text style={styles.itemProd}>{order.productDetails}</Text>}
                                        </View>
                                    ))
                            )}

                            {detailTab === 'Collections' && (
                                staffPayments.length === 0 ? <Text style={styles.emptyText}>No Collections Found</Text> :
                                    staffPayments.map((pay, index) => (
                                        <View key={index} style={styles.detailItem}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={styles.itemTitle}>{pay.orgName || 'Unknown'}</Text>
                                                <Text style={styles.itemAmount}>₹{pay.amount.toLocaleString()}</Text>
                                            </View>
                                            <Text style={styles.itemSub}>{formatDateShort(getValidDateStr(pay))} • {pay.mode}</Text>
                                            {pay.billRef && <Text style={{ fontSize: 10, color: '#e65100', marginTop: 2 }}>🔗 {pay.billRef}</Text>}
                                        </View>
                                    ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal visible={showUserPicker} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowUserPicker(false)}>
                    <View style={styles.pickerContent}>
                        <Text style={styles.pickerTitle}>Filter Staff</Text>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {dropdownList.map((u) => (
                                <TouchableOpacity key={u.id} style={styles.pickerItem} onPress={() => { setSelectedUserId(u.id); setShowUserPicker(false); }}>
                                    <Text style={[styles.pickerText, selectedUserId === u.id && { color: '#3b5998', fontWeight: 'bold' }]}>{u.name}</Text>
                                    {selectedUserId === u.id && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#3b5998', paddingTop: 50, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },

    controlBar: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, backgroundColor: 'white', elevation: 2 },
    toggleContainer: { flexDirection: 'row', backgroundColor: '#eee', borderRadius: 8, padding: 2 },
    toggleBtn: { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 6 },
    activeToggle: { backgroundColor: 'white', elevation: 2 },
    toggleText: { fontSize: 12, fontWeight: '600', color: 'gray' },
    dateNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: '#eee' },
    dateText: { marginHorizontal: 10, fontWeight: 'bold', color: '#333' },

    configBox: { backgroundColor: '#e3f2fd', margin: 10, padding: 10, borderRadius: 8, borderColor: '#90caf9', borderWidth: 1 },
    sectionTitle: { fontSize: 11, fontWeight: 'bold', color: '#1565c0', marginBottom: 8, textTransform: 'uppercase' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    inputWrap: { width: '30%' },
    label: { fontSize: 10, color: '#555', marginBottom: 2 },
    input: { borderWidth: 1, borderColor: '#fff', borderRadius: 5, padding: 5, fontWeight: 'bold', color: '#333', backgroundColor: 'white', textAlign: 'center' },

    card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
    rankBadge: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
    name: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    roleText: { fontSize: 12, color: 'gray' },
    customBadge: { backgroundColor: '#fff3e0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 2, alignSelf: 'flex-end' },
    customText: { fontSize: 9, color: '#e65100', fontWeight: 'bold' },

    subText: { fontSize: 12, color: 'gray' },
    salesAmount: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    incentiveAmount: { fontSize: 20, fontWeight: 'bold' },

    progressBarBg: { height: 8, backgroundColor: '#eee', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#4caf50' },
    progressText: { fontSize: 10, color: 'gray', marginTop: 4, textAlign: 'right' },

    collectionStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0f4c3', padding: 6, borderRadius: 5, marginTop: 8 },
    collText: { fontSize: 11, color: '#555' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    detailModalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    modalSub: { color: '#666', fontSize: 14 },

    tabContainer: { flexDirection: 'row', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
    activeTab: { borderBottomWidth: 3, borderBottomColor: '#3b5998' },
    tabText: { fontSize: 13, color: 'gray', fontWeight: '600' },
    activeTabText: { color: '#3b5998', fontWeight: 'bold' },

    detailItem: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
    itemTitle: { fontWeight: 'bold', fontSize: 14, color: '#333', maxWidth: '70%' },
    itemAmount: { fontWeight: 'bold', fontSize: 14, color: '#2e7d32' },
    itemSub: { fontSize: 12, color: '#666' },
    itemProd: { fontSize: 11, color: '#555', marginTop: 4, fontStyle: 'italic' },
    emptyText: { textAlign: 'center', marginTop: 30, color: 'gray' },

    monthRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
    monthText: { fontSize: 14, color: '#333', flex: 1 },
    monthValue: { fontSize: 14, color: '#555', flex: 1, textAlign: 'right' },

    pickerContent: { backgroundColor: 'white', borderRadius: 10, padding: 20 },
    pickerTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#3b5998' },
    pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
    pickerText: { fontSize: 16, color: '#333' }
});
