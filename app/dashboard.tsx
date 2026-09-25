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

import { DashboardSummary, fetchDashboardSummary } from '../services/api/dashboard';
import { useData } from './context/DataContext';
// 🔥 Cache-first dashboard summary (see hooks/useCachedObject.ts) — this
// screen previously had NO caching at all, a plain fetch-on-mount every
// single time it was opened, which is why it visibly went blank for a
// couple of seconds on every visit (unlike the rest of the app, which
// already had this pattern applied everywhere else).
import { useCachedObject } from '../hooks/useCachedObject';
import { buildCacheKey } from '../utils/listCache';

const SCREEN_WIDTH = Dimensions.get('window').width - 36;

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

const PIE_COLORS_ORDER = ['#1A237E', '#2E7D32', '#F57C00', '#D32F2F', '#607D8B'];
const PIE_COLORS_LEAD = ['#1976D2', '#F57C00', '#2E7D32', '#D32F2F', '#9C27B0'];

export default function UpdatedDashboard() {
    const router = useRouter();
    const { currentUser, companyProfile } = useData();

    // 🔥 Cache-first — instant from AsyncStorage on every visit, then
    // silently refreshed in the background. Distinct cache key from
    // index.tsx's older 'home_summary' (different endpoint/shape).
    const {
        data: summary,
        loading,
        refreshing,
        refresh: refreshSummary,
    } = useCachedObject<DashboardSummary>({
        cacheKey: buildCacheKey('dashboard_summary', currentUser?.companyId),
        enabled: !!currentUser?.companyId,
        fetcher: fetchDashboardSummary,
    });
    const [subDaysLeft, setSubDaysLeft] = useState<number | null>(null);
    const [chartsVisible, setChartsVisible] = useState(false);

    // companyProfile already comes from DataContext (fetched once at
    // login, no need for this screen to fetch it again separately) — just
    // derive the subscription-expiry countdown from it.
    useEffect(() => {
        if (companyProfile?.expiryDate) {
            const diff = Math.ceil((new Date(companyProfile.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            setSubDaysLeft(diff);
        }
    }, [companyProfile]);

    const onRefresh = useCallback(async () => {
        await refreshSummary();
    }, [refreshSummary]);

    const isAdmin = summary?.isAdmin ?? false;
    const userTarget = Number(currentUser?.salesTarget) || 0;
    const totalSale = summary?.financials.totalSales ?? 0;
    const displayTarget = isAdmin ? 0 : userTarget;
    const progress = !isAdmin && userTarget > 0 ? Math.min((totalSale / userTarget) * 100, 100) : isAdmin ? 100 : 0;
    const fyLabel = summary?.financials.fyLabel ?? '';

    const todayStatusMap: Record<string, { text: string; color: string; icon: string }> = {
        not_marked: { text: 'Mark Attendance', color: '#FF9800', icon: 'time-outline' },
        checked_in: { text: 'Logged In', color: '#4CAF50', icon: 'ellipse' },
        checked_out: { text: 'Logged Out', color: '#757575', icon: 'checkmark-circle' },
    };
    const todayStatus = todayStatusMap[summary?.attendance.myStatus ?? 'not_marked'];

    const orderPieData = (summary?.charts.orderStatusBreakdown ?? []).map((row, i) => ({
        name: row.status.length > 10 ? row.status.slice(0, 10) + '...' : row.status,
        population: row.count,
        color: PIE_COLORS_ORDER[i % PIE_COLORS_ORDER.length],
        legendFontColor: '#555',
        legendFontSize: 11,
    }));

    const leadPieData = (summary?.charts.leadStatusBreakdown ?? []).map((row, i) => ({
        name: row.status.length > 10 ? row.status.slice(0, 10) + '...' : row.status,
        population: row.count,
        color: PIE_COLORS_LEAD[i % PIE_COLORS_LEAD.length],
        legendFontColor: '#555',
        legendFontSize: 11,
    }));

    const monthLabels = summary?.charts.monthLabels ?? [];
    const salesChartData = { labels: monthLabels, datasets: [{ data: summary?.charts.monthlySales ?? [0, 0, 0, 0, 0, 0] }] };
    const collectionChartData = { labels: monthLabels, datasets: [{ data: summary?.charts.monthlyCollection ?? [0, 0, 0, 0, 0, 0] }] };
    const serviceChartData = { labels: monthLabels, datasets: [{ data: summary?.charts.monthlyServiceTickets ?? [0, 0, 0, 0, 0, 0] }] };

    const hasSalesData = salesChartData.datasets[0].data.some((v) => v > 0);
    const hasCollectionData = collectionChartData.datasets[0].data.some((v) => v > 0);
    const hasServiceData = serviceChartData.datasets[0].data.some((v) => v > 0);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.welcomeText}>{isAdmin ? 'Admin Dashboard' : 'Employee Dashboard'}</Text>
                        <View style={[styles.statusPill, { backgroundColor: todayStatus.color + '30', borderColor: todayStatus.color }]}>
                            <Ionicons name={todayStatus.icon as any} size={10} color={todayStatus.color} />
                            <Text style={[styles.statusPillText, { color: todayStatus.color }]}>{todayStatus.text}</Text>
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
                <View style={styles.actionCardsRow}>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#ffebee', borderColor: '#d32f2f', borderWidth: 1 }]} onPress={() => router.push('/leads' as any)}>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#d32f2f' }}>{summary?.leadActionCounts.overdue ?? 0}</Text>
                        <Text style={{ fontSize: 10, color: '#d32f2f', fontWeight: 'bold', marginTop: 2 }}>OVERDUE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#fff3e0', borderColor: '#f57c00', borderWidth: 1 }]} onPress={() => router.push('/leads' as any)}>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#f57c00' }}>{summary?.leadActionCounts.dueToday ?? 0}</Text>
                        <Text style={{ fontSize: 10, color: '#f57c00', fontWeight: 'bold', marginTop: 2 }}>DUE TODAY</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#e8f5e9', borderColor: '#2e7d32', borderWidth: 1 }]} onPress={() => router.push('/leads' as any)}>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2e7d32' }}>{summary?.leadActionCounts.hot ?? 0}</Text>
                        <Text style={{ fontSize: 10, color: '#2e7d32', fontWeight: 'bold', marginTop: 2 }}>HOT DEALS</Text>
                    </TouchableOpacity>
                </View>

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
                            <Text style={styles.statValueSmall}>₹{(summary?.financials.marketOutstanding ?? 0).toLocaleString('en-IN')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.statCardSmall, { backgroundColor: '#2E7D32' }]} onPress={() => router.push('/payment_collection' as any)}>
                            <Text style={styles.statLabelLight}>Coll. (This Month)</Text>
                            <Text style={styles.statValueSmall}>₹{(summary?.financials.recoveryThisMonth ?? 0).toLocaleString('en-IN')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <View style={styles.quickGrid}>
                    <QuickLink icon="trending-up" label="Sales Report" count={summary?.followUps.total ?? 0} color="#00897B" showBadge={(summary?.followUps.total ?? 0) > 0} onPress={() => router.push('/sales' as any)} />
                    <QuickLink icon="checkbox" label="Tasks" count={summary?.tasks.total ?? 0} color="#F57C00" showBadge={true} onPress={() => router.push('/tasks' as any)} />
                    <QuickLink icon="time" label="Attendance" count={summary?.attendance.todayCount ?? 0} color="#673AB7" onPress={() => router.push('/dayin' as any)} />
                    <QuickLink icon="people" label="Leads" count={summary?.followUps.activeLeads ?? 0} color="#1976D2" onPress={() => router.push('/leads' as any)} />
                    <QuickLink icon="construct" label="Service" count={summary?.ops.openService ?? 0} color="#5D4037" showBadge={(summary?.ops.openService ?? 0) > 0} onPress={() => router.push('/service_call' as any)} />
                    <QuickLink icon="cube" label="Courier" count={summary?.ops.pendingCourier ?? 0} color="#D32F2F" showBadge={(summary?.ops.pendingCourier ?? 0) > 0} onPress={() => router.push('/courier' as any)} />
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitleSmall}>Priority Follow-ups</Text>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/payment_duelist', params: { activeTab: 'Pending' } } as any)}>
                            <Text style={styles.viewAll}>View All</Text>
                        </TouchableOpacity>
                    </View>
                    {(summary?.topDues.length ?? 0) > 0 ? summary!.topDues.map((item, index) => (
                        <View key={index} style={styles.dueItem}>
                            <View style={styles.dueIcon}><Ionicons name="alert-circle" size={18} color="#D32F2F" /></View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.dueOrg} numberOfLines={1}>{item.orgName}</Text>
                                <Text style={styles.dueDate}>Due: {item.dueDate}</Text>
                            </View>
                            <Text style={styles.dueAmount}>₹{Number(item.amount).toLocaleString()}</Text>
                        </View>
                    )) : <Text style={styles.emptyText}>{loading ? 'Loading...' : 'No pending dues.'}</Text>}
                </View>

                <TouchableOpacity style={styles.chartsToggle} onPress={() => setChartsVisible(p => !p)} activeOpacity={0.8}>
                    <Ionicons name="bar-chart" size={18} color="#1A237E" />
                    <Text style={styles.chartsToggleText}>{chartsVisible ? 'Hide Charts' : 'View Analytics Charts'}</Text>
                    <Ionicons name={chartsVisible ? 'chevron-up' : 'chevron-down'} size={16} color="#1A237E" />
                </TouchableOpacity>

                {chartsVisible && (
                    <View style={styles.chartsContainer}>

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
                                    chartConfig={{ ...CHART_CONFIG, color: (opacity = 1) => `rgba(26, 35, 126, ${opacity})` }}
                                    style={{ borderRadius: 12, marginTop: 8 }}
                                    showValuesOnTopOfBars
                                    fromZero
                                    yAxisSuffix="K"
                                    yAxisLabel="₹"
                                    withInnerLines={false}
                                />
                            )}
                        </View>

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
                                    chartConfig={{ ...CHART_CONFIG, color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})` }}
                                    style={{ borderRadius: 12, marginTop: 8 }}
                                    showValuesOnTopOfBars
                                    fromZero
                                    yAxisSuffix="K"
                                    yAxisLabel="₹"
                                    withInnerLines={false}
                                />
                            )}
                        </View>

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
                                    chartConfig={{ ...CHART_CONFIG, color: (opacity = 1) => `rgba(25, 118, 210, ${opacity})` }}
                                    accessor="population"
                                    backgroundColor="transparent"
                                    paddingLeft="10"
                                    absolute
                                />
                            </View>
                        )}

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
                                    chartConfig={{ ...CHART_CONFIG, color: (opacity = 1) => `rgba(93, 64, 55, ${opacity})` }}
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
