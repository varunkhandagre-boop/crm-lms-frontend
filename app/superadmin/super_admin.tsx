import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import {
    Company,
    CompanyStats,
    extendCompany,
    fetchCompaniesExportCsv,
    getCompanyStats,
    getUsageAnalytics,
    listCompanies,
    StatusFilter,
    updateAutomationAddon,
    updateCompanyStatus,
    updateEmployeeLimit,
    UsageAnalyticsResponse,
    UsageAnalyticsRow,
} from '../../services/api/superadminCompanies';

type MainTab = 'companies' | 'analytics';

const getMonthKey = (date: Date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const formatMonthLabel = (key: string) => {
    const [year, month] = key.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(month) - 1]} ${year}`;
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'TRIAL', label: 'Trial' },
    { key: 'ACTIVE', label: 'Active' },
    { key: 'EXPIRING_SOON', label: 'Expiring Soon' },
    { key: 'EXPIRED', label: 'Expired' },
    { key: 'SUSPENDED', label: 'Suspended' },
];

const PAGE_LIMIT = 30;

export default function SuperAdminDashboard() {
    const router = useRouter();

    const [companies, setCompanies] = useState<Company[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [automationOnly, setAutomationOnly] = useState(false);
    const [mainTab, setMainTab] = useState<MainTab>('companies');
    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [stats, setStats] = useState<CompanyStats | null>(null);

    // Analytics
    const [selectedMonth, setSelectedMonth] = useState(getMonthKey());
    const [analytics, setAnalytics] = useState<UsageAnalyticsResponse | null>(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [editEmployeeLimit, setEditEmployeeLimit] = useState('');
    const [savingModal, setSavingModal] = useState(false);

    const requestSeq = useRef(0);

    const loadCompanies = useCallback(async (targetPage: number, append: boolean) => {
        const mySeq = ++requestSeq.current;
        if (append) setLoadingMore(true); else setLoading(true);
        try {
            const result = await listCompanies({
                page: targetPage,
                limit: PAGE_LIMIT,
                search: searchQuery.trim() || undefined,
                status: statusFilter === 'ALL' ? undefined : statusFilter,
                automationOnly: automationOnly || undefined,
                sort: 'createdAt_desc',
            });
            // A newer request has started since this one was fired — its
            // response will apply instead, so drop this stale result rather
            // than let it overwrite the list with out-of-date data.
            if (mySeq !== requestSeq.current) return;
            setCompanies(prev => (append ? [...prev, ...result.data] : result.data));
            setPage(result.meta.page);
            setTotalPages(result.meta.totalPages);
        } catch (e: any) {
            if (mySeq !== requestSeq.current) return;
            Alert.alert('Error', e.message || 'Could not fetch companies.');
        } finally {
            if (mySeq === requestSeq.current) {
                setLoading(false);
                setLoadingMore(false);
                setRefreshing(false);
            }
        }
    }, [searchQuery, statusFilter, automationOnly]);

    const loadStats = useCallback(async () => {
        try {
            setStats(await getCompanyStats());
        } catch (e) {
            // Non-fatal — stat cards just stay hidden if this fails.
        }
    }, []);

    // Re-fetch from page 1 whenever filters/search change (debounced for search).
    useEffect(() => {
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        searchDebounce.current = setTimeout(() => {
            loadCompanies(1, false);
        }, searchQuery ? 350 : 0);
        return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, statusFilter, automationOnly]);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    useEffect(() => {
        if (mainTab === 'analytics') loadAnalytics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mainTab, selectedMonth]);

    const loadAnalytics = async () => {
        setAnalyticsLoading(true);
        try {
            setAnalytics(await getUsageAnalytics(selectedMonth));
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not load usage analytics.');
        } finally {
            setAnalyticsLoading(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadCompanies(1, false);
        loadStats();
    };

    const loadMore = () => {
        if (loadingMore || loading || page >= totalPages) return;
        loadCompanies(page + 1, true);
    };

    const analyticsData = analytics?.companies ?? [];
    const maxOpens = useMemo(() => Math.max(...analyticsData.map(r => r.thisMonth), 1), [analyticsData]);

    const monthOptions = useMemo(() => {
        const opts = [];
        for (let i = 0; i < 4; i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            opts.push(getMonthKey(d));
        }
        return opts;
    }, []);

    const handleExport = async () => {
        try {
            const csvContent = await fetchCompaniesExportCsv({
                search: searchQuery.trim() || undefined,
                status: statusFilter === 'ALL' ? undefined : statusFilter,
                automationOnly: automationOnly || undefined,
            });
            const fileName = `Companies_Export_${new Date().toISOString().slice(0, 10)}.csv`;
            const fileUri = FileSystem.documentDirectory + fileName;
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Companies List', UTI: 'public.comma-separated-values-text' });
            } else {
                Alert.alert('Saved', `File saved at: ${fileUri}`);
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not export companies list.');
        }
    };

    const handleCardClick = (company: Company) => {
        setSelectedCompany(company);
        setEditEmployeeLimit(String(company.employeeLimit || 10));
        setModalVisible(true);
    };

    const refreshSelectedInList = (updated: Company) => {
        setSelectedCompany(updated);
        setCompanies(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    };

    const toggleCompanyStatus = async (value: boolean) => {
        if (!selectedCompany) return;
        try {
            const updated = await updateCompanyStatus(selectedCompany.id, value ? 'ACTIVE' : 'SUSPENDED');
            refreshSelectedInList(updated);
            loadStats();
            Alert.alert('Success', `Company is now ${value ? 'ACTIVE ✅' : 'SUSPENDED 🚫'}`);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not update status.');
        }
    };

    const toggleAutomationAddon = async (value: boolean) => {
        if (!selectedCompany) return;
        try {
            const updated = await updateAutomationAddon(selectedCompany.id, value);
            refreshSelectedInList(updated);
            loadStats();
            Alert.alert('Success', `Automation Add-on ${value ? 'ENABLED ✅' : 'DISABLED 🚫'}`);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not update automation status.');
        }
    };

    const saveEmployeeLimit = async () => {
        if (!selectedCompany) return;
        const limit = Number(editEmployeeLimit);
        if (!limit || limit <= 0) { Alert.alert('Invalid', 'Enter a valid employee limit.'); return; }
        setSavingModal(true);
        try {
            const updated = await updateEmployeeLimit(selectedCompany.id, limit);
            refreshSelectedInList(updated);
            Alert.alert('Success ✅', 'Employee limit updated!');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Update failed.');
        } finally {
            setSavingModal(false);
        }
    };

    const handleExtend = async (days: 7 | 30 | 365) => {
        if (!selectedCompany) return;
        setSavingModal(true);
        try {
            const updated = await extendCompany(selectedCompany.id, days);
            refreshSelectedInList(updated);
            loadStats();
            Alert.alert('Success ✅', 'Validity extended!');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not extend validity.');
        } finally {
            setSavingModal(false);
        }
    };

    const getStatusBadge = (status: Company['subscriptionStatus']) => {
        switch (status) {
            case 'ACTIVE': return { bg: '#e8f5e9', color: '#2e7d32', label: 'ACTIVE' };
            case 'TRIAL': return { bg: '#e3f2fd', color: '#1565c0', label: 'TRIAL' };
            case 'EXPIRED': return { bg: '#fff3e0', color: '#e67e22', label: 'EXPIRED' };
            case 'SUSPENDED': return { bg: '#ffebee', color: '#d32f2f', label: 'SUSPENDED' };
            default: return { bg: '#eee', color: '#666', label: status };
        }
    };

    const renderCompany = ({ item }: { item: Company }) => {
        const badge = getStatusBadge(item.subscriptionStatus);
        const borderColor = item.subscriptionStatus === 'SUSPENDED' ? '#d32f2f'
            : item.subscriptionStatus === 'EXPIRED' ? '#e67e22'
            : item.automationAddonEnabled ? '#2e7d32' : undefined;

        return (
            <TouchableOpacity style={[styles.card, borderColor && { borderLeftWidth: 5, borderLeftColor: borderColor }]} onPress={() => handleCardClick(item)}>
                <View style={styles.row}>
                    <Text style={styles.compName}>{item.name || 'Unknown Company'}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                        <Text style={{ color: badge.color, fontWeight: 'bold', fontSize: 10 }}>{badge.label}</Text>
                    </View>
                </View>
                <Text style={styles.subText}>Owner: {item.ownerName || 'N/A'} | {item.city || 'N/A'}</Text>
                {item.contactPhone ? <Text style={styles.subText}>📞 {item.contactPhone}</Text> : null}
                {item.contactEmail ? <Text style={styles.subText}>✉️ {item.contactEmail}</Text> : null}
                {item.website ? <Text style={styles.subText}>🌐 {item.website}</Text> : null}
                {item.gstNumber ? <Text style={styles.subText}>GST: {item.gstNumber}</Text> : null}
                <Text style={styles.subText}>Users: {item.employeeLimit || 10} Allowed</Text>
                {item.automationAddonEnabled && (
                    <View style={styles.automationBadge}>
                        <Ionicons name="chatbubbles" size={12} color="#2e7d32" />
                        <Text style={styles.automationBadgeText}>Automation Active</Text>
                    </View>
                )}
                <Text style={[styles.subText, { fontWeight: 'bold', marginTop: 5, color: item.subscriptionStatus === 'EXPIRED' ? '#e67e22' : '#333' }]}>
                    Expires: {item.expiryDate ? new Date(item.expiryDate).toDateString() : 'Not Set'}
                </Text>
            </TouchableOpacity>
        );
    };

    const renderAnalyticsRow = (item: UsageAnalyticsRow, index: number) => {
        const barWidth = maxOpens > 0 ? (item.thisMonth / maxOpens) * 100 : 0;
        const trend = item.thisMonth > item.prevMonth ? 'up' : item.thisMonth < item.prevMonth ? 'down' : 'same';
        const trendIcon = trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove';
        const trendColor = trend === 'up' ? '#2e7d32' : trend === 'down' ? '#d32f2f' : '#999';
        const rankColors = ['#f5c518', '#b0b0b0', '#cd7f32'];

        return (
            <View style={styles.analyticsRow} key={item.companyId}>
                <View style={[styles.rankBadge, index < 3 ? { backgroundColor: rankColors[index] } : { backgroundColor: '#eee' }]}>
                    <Text style={[styles.rankText, index < 3 ? { color: 'white' } : { color: '#555' }]}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={styles.analyticsCompName} numberOfLines={1}>{item.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name={trendIcon as any} size={14} color={trendColor} />
                            <Text style={[styles.analyticsCount, { color: item.thisMonth > 0 ? '#333' : '#bbb' }]}>{item.thisMonth} opens</Text>
                        </View>
                    </View>
                    <View style={styles.barBg}>
                        <View style={[styles.barFill, { width: `${barWidth}%`, backgroundColor: index === 0 ? '#f5c518' : index === 1 ? '#3b5998' : index === 2 ? '#cd7f32' : '#81c784' }]} />
                    </View>
                    <Text style={styles.analyticsSubText}>{item.city || ''}{item.prevMonth > 0 ? `  •  prev: ${item.prevMonth}` : ''}</Text>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => router.replace('/' as any)}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Super Admin Panel</Text>
                </View>

                <View style={styles.headerBottom}>
                    <TouchableOpacity style={styles.iconBtn} onPress={handleExport}>
                        <Ionicons name="download-outline" size={20} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.paymentsBtn} onPress={() => router.push('/superadmin/superadmin-payments' as any)}>
                        <Ionicons name="wallet" size={18} color="white" />
                        <Text style={styles.paymentsBtnText}>Payments</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.paymentsBtn} onPress={() => router.push('/superadmin/manage-plans' as any)}>
                        <Ionicons name="pricetags" size={18} color="white" />
                        <Text style={styles.paymentsBtnText}>Plans</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.paymentsBtn} onPress={() => router.push('/superadmin/superadmin-support-settings' as any)}>
                        <Ionicons name="headset" size={18} color="white" />
                        <Text style={styles.paymentsBtnText}>Support</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.paymentsBtn} onPress={() => router.push('/superadmin/superadmin-payment-gateway' as any)}>
                        <Ionicons name="card" size={18} color="white" />
                        <Text style={styles.paymentsBtnText}>Gateway</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.mainTabRow}>
                    <TouchableOpacity style={[styles.mainTab, mainTab === 'companies' && styles.mainTabActive]} onPress={() => setMainTab('companies')}>
                        <Ionicons name="business" size={15} color={mainTab === 'companies' ? '#d32f2f' : 'rgba(255,255,255,0.7)'} />
                        <Text style={[styles.mainTabText, mainTab === 'companies' && styles.mainTabTextActive]}>Companies</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.mainTab, mainTab === 'analytics' && styles.mainTabActive]} onPress={() => setMainTab('analytics')}>
                        <Ionicons name="bar-chart" size={15} color={mainTab === 'analytics' ? '#d32f2f' : 'rgba(255,255,255,0.7)'} />
                        <Text style={[styles.mainTabText, mainTab === 'analytics' && styles.mainTabTextActive]}>Analytics</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {mainTab === 'companies' && (
                <>
                    {stats && (
                        <View style={styles.statsWrap}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 15 }}>
                                <TouchableOpacity style={[styles.statCard, statusFilter === 'ALL' && styles.statCardActiveNeutral]} onPress={() => setStatusFilter('ALL')}>
                                    <Text style={[styles.statNum, statusFilter === 'ALL' && { color: 'white' }]}>{stats.total}</Text>
                                    <Text style={[styles.statLabel, statusFilter === 'ALL' && { color: 'white' }]}>Total</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.statCard, { backgroundColor: statusFilter === 'ACTIVE' ? '#2e7d32' : '#e8f5e9' }]} onPress={() => setStatusFilter('ACTIVE')}>
                                    <Text style={[styles.statNum, { color: statusFilter === 'ACTIVE' ? 'white' : '#2e7d32' }]}>{stats.active}</Text>
                                    <Text style={[styles.statLabel, statusFilter === 'ACTIVE' && { color: 'white' }]}>Active</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.statCard, { backgroundColor: statusFilter === 'EXPIRING_SOON' ? '#e67e22' : '#fff3e0' }]} onPress={() => setStatusFilter('EXPIRING_SOON')}>
                                    <Text style={[styles.statNum, { color: statusFilter === 'EXPIRING_SOON' ? 'white' : '#e67e22' }]}>{stats.expiringSoon}</Text>
                                    <Text style={[styles.statLabel, statusFilter === 'EXPIRING_SOON' && { color: 'white' }]}>Expiring Soon</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.statCard, { backgroundColor: statusFilter === 'EXPIRED' ? '#d32f2f' : '#ffebee' }]} onPress={() => setStatusFilter('EXPIRED')}>
                                    <Text style={[styles.statNum, { color: statusFilter === 'EXPIRED' ? 'white' : '#d32f2f' }]}>{stats.expired}</Text>
                                    <Text style={[styles.statLabel, statusFilter === 'EXPIRED' && { color: 'white' }]}>Expired</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.statCard, { backgroundColor: automationOnly ? '#2e7d32' : '#e8f5e9', borderWidth: automationOnly ? 0 : 1, borderColor: '#c8e6c9' }]} onPress={() => setAutomationOnly(p => !p)}>
                                    <Text style={[styles.statNum, { color: automationOnly ? 'white' : '#2e7d32' }]}>{stats.automationActive}</Text>
                                    <Text style={[styles.statLabel, automationOnly && { color: 'white' }]}>💬 Automation</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    )}

                    {/* Status filter chips row (Trial/Suspended not covered by stat cards above) */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 15, marginTop: 8 }}>
                        {STATUS_FILTERS.map(f => (
                            <TouchableOpacity key={f.key} style={[styles.filterPill, statusFilter === f.key && styles.filterPillActive]} onPress={() => setStatusFilter(f.key)}>
                                <Text style={[styles.filterPillText, statusFilter === f.key && { color: 'white' }]}>{f.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <View style={styles.searchWrap}>
                        <Ionicons name="search" size={20} color="#3b5998" style={{ marginRight: 10 }} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search by company, owner, city, GST..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholderTextColor="#999"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
                                <Ionicons name="close" size={16} color="#fff" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {loading
                        ? <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 50 }} />
                        : <FlatList
                            data={companies}
                            keyExtractor={item => item.id}
                            renderItem={renderCompany}
                            contentContainerStyle={{ padding: 15 }}
                            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                            keyboardShouldPersistTaps="handled"
                            onEndReachedThreshold={0.4}
                            onEndReached={loadMore}
                            ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 15 }} /> : null}
                            ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20, color: '#999' }}>No companies found.</Text>}
                        />
                    }
                </>
            )}

            {mainTab === 'analytics' && (
                <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {monthOptions.map(m => (
                                <TouchableOpacity key={m} style={[styles.monthChip, selectedMonth === m && styles.monthChipActive]} onPress={() => setSelectedMonth(m)}>
                                    <Text style={[styles.monthChipText, selectedMonth === m && { color: 'white' }]}>{formatMonthLabel(m)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>

                    {analyticsLoading ? (
                        <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 40 }} />
                    ) : (
                        <>
                            <View style={styles.analyticsSummaryRow}>
                                <View style={[styles.analyticsSummaryCard, { backgroundColor: '#e3f2fd' }]}>
                                    <Text style={styles.analyticsSummaryNum}>{analytics?.totalOpens ?? 0}</Text>
                                    <Text style={styles.analyticsSummaryLabel}>Total Opens{'\n'}{formatMonthLabel(selectedMonth)}</Text>
                                </View>
                                <View style={[styles.analyticsSummaryCard, { backgroundColor: '#e8f5e9' }]}>
                                    <Text style={[styles.analyticsSummaryNum, { color: '#2e7d32' }]}>{analytics?.activeToday ?? 0}</Text>
                                    <Text style={styles.analyticsSummaryLabel}>Active{'\n'}Today</Text>
                                </View>
                                <View style={[styles.analyticsSummaryCard, { backgroundColor: '#fff3e0' }]}>
                                    <Text style={[styles.analyticsSummaryNum, { color: '#e67e22' }]}>{analytics?.activeThisWeek ?? 0}</Text>
                                    <Text style={styles.analyticsSummaryLabel}>Active{'\n'}This Week</Text>
                                </View>
                            </View>

                            {analytics?.mostActive && (
                                <View style={styles.topCompanyCard}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <Text style={{ fontSize: 24 }}>🏆</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.topCompanyLabel}>Most Active Company</Text>
                                            <Text style={styles.topCompanyName}>{analytics.mostActive.name}</Text>
                                            <Text style={styles.topCompanyCity}>{analytics.mostActive.city}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={styles.topCompanyCount}>{analytics.mostActive.thisMonth}</Text>
                                            <Text style={{ fontSize: 10, color: '#888' }}>app opens</Text>
                                        </View>
                                    </View>
                                </View>
                            )}

                            <Text style={styles.analyticsTitle}>Company Usage Ranking — {formatMonthLabel(selectedMonth)}</Text>

                            {analyticsData.length === 0 ? (
                                <View style={{ alignItems: 'center', marginTop: 40 }}>
                                    <Ionicons name="bar-chart-outline" size={48} color="#ccc" />
                                    <Text style={{ color: '#999', marginTop: 12 }}>No usage data yet for this month.</Text>
                                </View>
                            ) : (
                                analyticsData.map((item, index) => renderAnalyticsRow(item, index))
                            )}
                        </>
                    )}
                </ScrollView>
            )}

            <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={styles.modalTitle}>{selectedCompany?.name}</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)}>
                                    <Ionicons name="close-circle" size={30} color="#d32f2f" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            {selectedCompany?.subscriptionStatus === 'EXPIRED' && (
                                <View style={styles.expiredWarning}>
                                    <Ionicons name="warning" size={18} color="#e67e22" />
                                    <Text style={styles.expiredWarningText}>
                                        Plan expired on {selectedCompany.expiryDate ? new Date(selectedCompany.expiryDate).toDateString() : '—'}. Extend validity below.
                                    </Text>
                                </View>
                            )}

                            <View style={styles.statusRow}>
                                <View>
                                    <Text style={styles.label}>Account Status</Text>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: getStatusBadge(selectedCompany?.subscriptionStatus ?? 'TRIAL').color }}>
                                        {getStatusBadge(selectedCompany?.subscriptionStatus ?? 'TRIAL').label}
                                    </Text>
                                </View>
                                <Switch
                                    trackColor={{ false: '#767577', true: '#81b0ff' }}
                                    thumbColor={selectedCompany?.subscriptionStatus === 'ACTIVE' ? '#2e7d32' : '#f4f3f4'}
                                    onValueChange={toggleCompanyStatus}
                                    value={selectedCompany?.subscriptionStatus === 'ACTIVE' || selectedCompany?.subscriptionStatus === 'TRIAL'}
                                />
                            </View>
                            <Text style={styles.switchHint}>Toggling sets status to ACTIVE or SUSPENDED. TRIAL/EXPIRED are managed automatically.</Text>

                            <View style={[styles.statusRow, { marginTop: 10 }]}>
                                <View>
                                    <Text style={styles.label}>Automation Add-on</Text>
                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: selectedCompany?.automationAddonEnabled ? '#2e7d32' : '#888' }}>
                                        {selectedCompany?.automationAddonEnabled ? 'WhatsApp/Email Enabled ✅' : 'Not Enabled'}
                                    </Text>
                                </View>
                                <Switch trackColor={{ false: '#767577', true: '#81b0ff' }} thumbColor={selectedCompany?.automationAddonEnabled ? '#2e7d32' : '#f4f3f4'} onValueChange={toggleAutomationAddon} value={selectedCompany?.automationAddonEnabled === true} />
                            </View>

                            <View style={styles.divider} />

                            <Text style={styles.label}>Details:</Text>
                            <Text style={styles.value}>{selectedCompany?.ownerName} ({selectedCompany?.contactPhone || 'N/A'})</Text>
                            <Text style={styles.value}>{selectedCompany?.contactEmail}</Text>
                            {selectedCompany?.website ? <Text style={styles.value}>🌐 {selectedCompany.website}</Text> : null}
                            {selectedCompany?.gstNumber ? <Text style={styles.value}>GST: {selectedCompany.gstNumber}</Text> : null}
                            <Text style={styles.value}>{selectedCompany?.city}{selectedCompany?.state ? `, ${selectedCompany.state}` : ''}</Text>
                            <Text style={styles.value}>Plan: {selectedCompany?.planName || 'Free Trial'}</Text>

                            <View style={styles.divider} />

                            <Text style={styles.sectionHeader}>Subscription Controls</Text>
                            <Text style={styles.label}>Employee Limit:</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                <TextInput style={styles.inputBox} value={editEmployeeLimit} onChangeText={setEditEmployeeLimit} keyboardType="numeric" />
                                <TouchableOpacity style={styles.btnUpdate} onPress={saveEmployeeLimit} disabled={savingModal}>
                                    {savingModal ? <ActivityIndicator color="white" size="small" /> : <Text style={{ color: 'white', fontWeight: 'bold' }}>Save Limit</Text>}
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.label}>Extend Validity:</Text>
                            <View style={styles.actionRow}>
                                <TouchableOpacity style={styles.btnAction} onPress={() => handleExtend(7)} disabled={savingModal}><Text style={styles.btnText}>+7 Days</Text></TouchableOpacity>
                                <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#2e7d32' }]} onPress={() => handleExtend(30)} disabled={savingModal}><Text style={styles.btnText}>+1 Month</Text></TouchableOpacity>
                                <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#f57c00' }]} onPress={() => handleExtend(365)} disabled={savingModal}><Text style={styles.btnText}>+1 Year</Text></TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { backgroundColor: '#d32f2f', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 0 },
    headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    headerBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', flex: 1 },
    iconBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8 },
    paymentsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
    paymentsBtnText: { color: 'white', marginLeft: 4, fontWeight: 'bold', fontSize: 11 },
    mainTabRow: { flexDirection: 'row', gap: 0, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
    mainTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
    mainTabActive: { borderBottomWidth: 3, borderBottomColor: 'white', backgroundColor: 'rgba(255,255,255,0.1)' },
    mainTabText: { color: 'rgba(255,255,255,0.7)', fontWeight: '600', fontSize: 13 },
    mainTabTextActive: { color: 'white' },
    statsWrap: { height: 84, paddingTop: 12 },
    statCard: { width: 96, height: 62, backgroundColor: '#fff', borderRadius: 10, alignItems: 'center', justifyContent: 'center', elevation: 2 },
    statCardActiveNeutral: { backgroundColor: '#3b5998' },
    statNum: { fontSize: 19, fontWeight: 'bold', color: '#333' },
    statLabel: { fontSize: 10, color: '#666', marginTop: 2, textAlign: 'center' },
    filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'white', borderWidth: 1.5, borderColor: '#ddd' },
    filterPillActive: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
    filterPillText: { fontSize: 12, fontWeight: '700', color: '#555' },
    searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 15, marginTop: 16, marginBottom: 6, paddingHorizontal: 16, borderRadius: 14, height: 52, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    searchInput: { flex: 1, fontSize: 15, color: '#333' },
    searchClearBtn: { backgroundColor: '#999', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
    card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    compName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
    subText: { color: '#666', fontSize: 13, marginBottom: 2 },
    automationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4, marginBottom: 4, alignSelf: 'flex-start', gap: 4 },
    automationBadgeText: { color: '#2e7d32', fontSize: 11, fontWeight: 'bold' },
    monthChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'white', borderWidth: 1.5, borderColor: '#ddd' },
    monthChipActive: { backgroundColor: '#d32f2f', borderColor: '#d32f2f' },
    monthChipText: { fontSize: 12, fontWeight: '700', color: '#555' },
    analyticsSummaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    analyticsSummaryCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', elevation: 1 },
    analyticsSummaryNum: { fontSize: 22, fontWeight: 'bold', color: '#1565c0' },
    analyticsSummaryLabel: { fontSize: 10, color: '#666', textAlign: 'center', marginTop: 4, lineHeight: 14 },
    topCompanyCard: { backgroundColor: '#fff8e1', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: '#f5c518', elevation: 2 },
    topCompanyLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
    topCompanyName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 2 },
    topCompanyCity: { fontSize: 12, color: '#888' },
    topCompanyCount: { fontSize: 28, fontWeight: 'bold', color: '#f5c518' },
    analyticsTitle: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    analyticsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 8, elevation: 1 },
    rankBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    rankText: { fontSize: 13, fontWeight: 'bold' },
    analyticsCompName: { fontSize: 13, fontWeight: '700', color: '#333', flex: 1 },
    analyticsCount: { fontSize: 12, fontWeight: 'bold' },
    analyticsSubText: { fontSize: 11, color: '#888', marginTop: 4 },
    barBg: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, marginTop: 4, overflow: 'hidden' },
    barFill: { height: 6, borderRadius: 3 },
    expiredWarning: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff3e0', padding: 12, borderRadius: 10, marginBottom: 12 },
    expiredWarningText: { flex: 1, fontSize: 13, color: '#e67e22', fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '90%' },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', flex: 1 },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
    label: { fontSize: 12, color: '#888', marginTop: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    value: { fontSize: 16, color: '#333', fontWeight: '500' },
    sectionHeader: { fontSize: 18, fontWeight: 'bold', color: '#d32f2f', marginVertical: 10 },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#eee' },
    switchHint: { fontSize: 11, color: '#aaa', marginTop: 6, lineHeight: 15 },
    inputBox: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, width: 80, textAlign: 'center', fontSize: 16, fontWeight: 'bold' },
    btnUpdate: { backgroundColor: '#333', padding: 10, borderRadius: 8, justifyContent: 'center', flex: 1, alignItems: 'center' },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 20 },
    btnAction: { flex: 1, backgroundColor: '#3b5998', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    btnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
});
