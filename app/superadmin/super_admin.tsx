import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
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
import { db } from '../../firebaseConfig';
import { useSaaSDB } from '../../hooks/useSaaSDB';

// 🔥 Module-level cache
let companiesCache: any[] | null = null;
let companiesCacheTime = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000;

type FilterKey = 'all' | 'active' | 'expiringSoon' | 'expired' | 'automation';
type MainTab = 'companies' | 'analytics';

const isCompanyExpired = (c: any) => {
    if (!c.expiryDate) return false;
    return new Date(c.expiryDate) < new Date();
};

// ─── Current month key helper ─────────────────────────────
const getMonthKey = (date: Date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getPrevMonthKey = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return getMonthKey(d);
};

const formatMonthLabel = (key: string) => {
    const [year, month] = key.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(month) - 1]} ${year}`;
};

export default function SuperAdminDashboard() {
    const router = useRouter();
    const { updateSaaSData } = useSaaSDB();

    const [companies, setCompanies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
    const [mainTab, setMainTab] = useState<MainTab>('companies');

    // Analytics state
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(getMonthKey());

    const [selectedCompany, setSelectedCompany] = useState<any>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [editEmployeeLimit, setEditEmployeeLimit] = useState('');

    useEffect(() => {
        const now = Date.now();
        if (companiesCache && (now - companiesCacheTime) < CACHE_DURATION_MS) {
            setCompanies(companiesCache);
            setLoading(false);
        } else {
            loadCompanies();
        }
    }, []);

    const loadCompanies = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "companies"));
            const data = querySnapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
            data.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            companiesCache = data;
            companiesCacheTime = Date.now();
            setCompanies(data);
        } catch (error) {
            console.error("Super Admin Fetch Error:", error);
            Alert.alert("Error", "Could not fetch companies");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        companiesCache = null;
        loadCompanies();
    };

    // ─── Analytics computed data ───────────────────────────
    const analyticsData = useMemo(() => {
        if (!companies.length) return [];

        return companies
            .map((c: any) => {
                const monthlyUsage = c.monthlyUsage || {};
                const thisMonth = monthlyUsage[selectedMonth] || 0;
                const prevMonth = monthlyUsage[getPrevMonthKey()] || 0;
                const totalOpens = c.appOpenCount || 0;
                const lastActive = c.lastActiveAt ? new Date(c.lastActiveAt) : null;
                const daysSinceActive = lastActive
                    ? Math.floor((Date.now() - lastActive.getTime()) / 86400000)
                    : null;

                return {
                    id: c.id,
                    name: c.companyName || c.name || 'Unknown',
                    city: c.city || '',
                    isActive: c.isActive === true && !isCompanyExpired(c),
                    thisMonth,
                    prevMonth,
                    totalOpens,
                    lastActive,
                    daysSinceActive,
                    trend: thisMonth > prevMonth ? 'up' : thisMonth < prevMonth ? 'down' : 'same',
                };
            })
            .filter((c: any) => c.isActive) // sirf active companies
            .sort((a: any, b: any) => b.thisMonth - a.thisMonth); // highest usage first
    }, [companies, selectedMonth]);

    // Total stats for analytics header
    const analyticsStats = useMemo(() => {
        const totalOpens = analyticsData.reduce((sum: number, c: any) => sum + c.thisMonth, 0);
        const activeToday = analyticsData.filter((c: any) => c.daysSinceActive === 0).length;
        const activeThisWeek = analyticsData.filter((c: any) => c.daysSinceActive !== null && c.daysSinceActive <= 7).length;
        const mostActive = analyticsData[0] || null;
        return { totalOpens, activeToday, activeThisWeek, mostActive };
    }, [analyticsData]);

    // Max opens for bar chart scaling
    const maxOpens = useMemo(() =>
        Math.max(...analyticsData.map((c: any) => c.thisMonth), 1),
        [analyticsData]
    );

    // ─── Month selector options ────────────────────────────
    const monthOptions = useMemo(() => {
        const opts = [];
        for (let i = 0; i < 4; i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            opts.push(getMonthKey(d));
        }
        return opts;
    }, []);

    const stats = useMemo(() => {
        const now = new Date();
        const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        let active = 0, expiringSoon = 0, expired = 0, automationActive = 0;

        companies.forEach((c: any) => {
            const isExpiredFlag = isCompanyExpired(c);
            if (c.isActive === true && !isExpiredFlag) {
                active++;
                if (c.expiryDate) {
                    const exp = new Date(c.expiryDate);
                    if (exp > now && exp <= sevenDaysLater) expiringSoon++;
                }
            }
            if (isExpiredFlag) expired++;
            if (c.automationAddonEnabled === true) automationActive++;
        });

        return { total: companies.length, active, expiringSoon, expired, automationActive };
    }, [companies]);

    const filteredCompanies = useMemo(() => {
        let list = companies;
        const now = new Date();
        const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        if (activeFilter === 'active') {
            list = list.filter((c: any) => c.isActive === true && !isCompanyExpired(c));
        } else if (activeFilter === 'expiringSoon') {
            list = list.filter((c: any) => {
                if (c.isActive !== true || !c.expiryDate) return false;
                const exp = new Date(c.expiryDate);
                return exp > now && exp <= sevenDaysLater;
            });
        } else if (activeFilter === 'expired') {
            list = list.filter((c: any) => isCompanyExpired(c));
        } else if (activeFilter === 'automation') {
            list = list.filter((c: any) => c.automationAddonEnabled === true);
        }

        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase().trim();
        return list.filter((c: any) => {
            const haystack = [
                c.companyName, c.name, c.ownerName, c.contactPerson,
                c.city, c.ownerMobile, c.mobile, c.ownerEmail, c.email,
                c.gstNumber, c.website
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [companies, searchQuery, activeFilter]);

    const toggleFilter = (key: FilterKey) => {
        setActiveFilter(prev => (prev === key ? 'all' : key));
    };

    const filterLabels: Record<FilterKey, string> = {
        all: 'All', active: 'Active companies only',
        expiringSoon: 'Expiring within 7 days',
        expired: 'Expired companies only', automation: 'Automation companies only',
    };

    const escapeCSV = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const handleExport = async () => {
        try {
            if (filteredCompanies.length === 0) { Alert.alert("No Data", "No companies found to export."); return; }
            const headers = ['Company Name', 'Owner/Contact', 'Mobile', 'Email', 'City', 'GST Number', 'Website', 'Plan', 'Max Employees', 'Status', 'Automation', 'Expiry Date'];
            const rows = filteredCompanies.map((c: any) => {
                const isExpired = isCompanyExpired(c);
                const isActive = c.isActive === true;
                const isPending = c.isActive === undefined || c.isActive === null;
                let status = 'ACTIVE';
                if (isPending) status = 'PENDING';
                else if (isExpired) status = 'EXPIRED';
                else if (!isActive) status = 'DISABLED';
                return [
                    c.companyName || c.name || '', c.ownerName || c.contactPerson || '',
                    c.ownerMobile || c.mobile || '', c.ownerEmail || c.email || '',
                    c.city || '', c.gstNumber || '', c.website || '', c.plan || '',
                    c.maxEmployees || 10, status, c.automationAddonEnabled ? 'Yes' : 'No',
                    c.expiryDate ? new Date(c.expiryDate).toDateString() : 'Not Set'
                ].map(escapeCSV).join(',');
            });
            const csvContent = [headers.map(escapeCSV).join(','), ...rows].join('\n');
            const fileName = `Companies_Export_${new Date().toISOString().slice(0, 10)}.csv`;
            const fileUri = FileSystem.documentDirectory + fileName;
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Companies List', UTI: 'public.comma-separated-values-text' });
            } else {
                Alert.alert("Saved", `File saved at: ${fileUri}`);
            }
        } catch (e) { Alert.alert("Error", "Could not export companies list."); }
    };

    const handleCardClick = (company: any) => {
        setSelectedCompany(company);
        setEditEmployeeLimit(String(company.maxEmployees || 10));
        setModalVisible(true);
    };

    const handleApproveCompany = async () => {
        if (!selectedCompany) return;
        Alert.alert("Approve Company", `Are you sure you want to approve ${selectedCompany.companyName} for a 7-Day Trial?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Approve", onPress: async () => {
                    try {
                        const updates = {
                            isActive: true, plan: 'Trial Active',
                            approvedAt: new Date().toISOString(),
                            expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                            maxEmployees: 10
                        };
                        const res = await updateSaaSData("companies", selectedCompany.id, updates);
                        if (res.success) {
                            Alert.alert("Success ✅", "Company Approved! The admin can now login.");
                            setModalVisible(false);
                            companiesCache = null;
                            await loadCompanies();
                        } else {
                            Alert.alert("Error", "Could not approve the company.");
                        }
                    } catch (error) { Alert.alert("Error", "An error occurred during approval."); }
                }
            }
        ]);
    };

    const toggleCompanyStatus = async (value: boolean) => {
        if (!selectedCompany) return;
        try {
            const updates = {
                isActive: value,
                plan: value ? (selectedCompany.plan === 'Pending Approval' || !selectedCompany.plan ? 'Trial Active' : selectedCompany.plan) : 'Disabled by Admin'
            };
            const res = await updateSaaSData("companies", selectedCompany.id, updates);
            if (res.success) {
                setSelectedCompany({ ...selectedCompany, ...updates });
                setCompanies(prev => prev.map(c => c.id === selectedCompany.id ? { ...c, ...updates } : c));
                companiesCache = null;
                Alert.alert("Success", `Company is now ${value ? "ACTIVE ✅" : "DISABLED 🚫"}`);
            } else { Alert.alert("Error", "Could not update status"); }
        } catch (e) { Alert.alert("Error", "Could not update status"); }
    };

    const toggleAutomationAddon = async (value: boolean) => {
        if (!selectedCompany) return;
        try {
            const updates = { automationAddonEnabled: value };
            const res = await updateSaaSData("companies", selectedCompany.id, updates);
            if (res.success) {
                setSelectedCompany({ ...selectedCompany, ...updates });
                setCompanies(prev => prev.map(c => c.id === selectedCompany.id ? { ...c, ...updates } : c));
                companiesCache = null;
                Alert.alert("Success", `Automation Add-on ${value ? "ENABLED ✅" : "DISABLED 🚫"}`);
            } else { Alert.alert("Error", "Could not update automation status"); }
        } catch (e) { Alert.alert("Error", "Could not update automation status"); }
    };

    const updateCompanySettings = async (daysToAdd: number = 0) => {
        if (!selectedCompany) return;
        try {
            const updates: any = { maxEmployees: Number(editEmployeeLimit) };
            if (daysToAdd > 0) {
                const currentExpiry = selectedCompany.expiryDate ? new Date(selectedCompany.expiryDate) : new Date();
                const baseDate = currentExpiry < new Date() ? new Date() : currentExpiry;
                const newExpiry = new Date(baseDate);
                newExpiry.setDate(newExpiry.getDate() + daysToAdd);
                updates.expiryDate = newExpiry.toISOString();
                updates.isActive = true;
                updates.plan = daysToAdd === 7 ? 'Trial Extended' : 'Paid Plan';
            }
            const res = await updateSaaSData("companies", selectedCompany.id, updates);
            if (res.success) {
                Alert.alert("Success ✅", "Company settings updated!");
                setModalVisible(false);
                companiesCache = null;
                await loadCompanies();
            } else { Alert.alert("Error", "Update failed"); }
        } catch (error) { Alert.alert("Error", "Update failed"); }
    };

    const renderCompany = ({ item }: any) => {
        const isExpired = isCompanyExpired(item);
        const isActive = item.isActive === true;
        const isPending = item.isActive === undefined || item.isActive === null;

        let badgeColor = '#e8f5e9', textColor = '#2e7d32', statusText = 'ACTIVE';
        if (isPending) { badgeColor = '#e3f2fd'; textColor = '#1565c0'; statusText = 'NEW (PENDING)'; }
        else if (isExpired) { badgeColor = '#fff3e0'; textColor = '#e67e22'; statusText = 'EXPIRED'; }
        else if (!isActive) { badgeColor = '#ffebee'; textColor = '#d32f2f'; statusText = 'DISABLED'; }

        const cardBorderStyle = isPending ? { borderLeftWidth: 5, borderLeftColor: '#1976d2' }
            : isExpired ? { borderLeftWidth: 5, borderLeftColor: '#e67e22' }
            : !isActive ? { borderLeftWidth: 5, borderLeftColor: '#d32f2f' }
            : item.automationAddonEnabled ? { borderLeftWidth: 5, borderLeftColor: '#2e7d32' }
            : {};

        return (
            <TouchableOpacity style={[styles.card, cardBorderStyle]} onPress={() => handleCardClick(item)}>
                <View style={styles.row}>
                    <Text style={styles.compName}>{item.companyName || item.name || 'Unknown Company'}</Text>
                    <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                        <Text style={{ color: textColor, fontWeight: 'bold', fontSize: 10 }}>{statusText}</Text>
                    </View>
                </View>
                <Text style={styles.subText}>Owner: {item.ownerName || item.contactPerson || 'N/A'} | {item.city || 'N/A'}</Text>
                {(item.ownerMobile || item.mobile) ? <Text style={styles.subText}>📞 {item.ownerMobile || item.mobile}</Text> : null}
                {(item.ownerEmail || item.email) ? <Text style={styles.subText}>✉️ {item.ownerEmail || item.email}</Text> : null}
                {item.website ? <Text style={styles.subText}>🌐 {item.website}</Text> : null}
                {item.gstNumber ? <Text style={styles.subText}>GST: {item.gstNumber}</Text> : null}
                <Text style={styles.subText}>Users: {item.maxEmployees || 10} Allowed</Text>
                {item.automationAddonEnabled && (
                    <View style={styles.automationBadge}>
                        <Ionicons name="chatbubbles" size={12} color="#2e7d32" />
                        <Text style={styles.automationBadgeText}>Automation Active</Text>
                    </View>
                )}
                {item.lastPaymentAmount ? (
                    <Text style={styles.subText}>Last Payment: ₹{item.lastPaymentAmount} {item.lastPaymentDate ? `on ${new Date(item.lastPaymentDate).toDateString()}` : ''}</Text>
                ) : null}
                <Text style={[styles.subText, { fontWeight: 'bold', marginTop: 5, color: isExpired ? '#e67e22' : '#333' }]}>
                    Expires: {item.expiryDate ? new Date(item.expiryDate).toDateString() : 'Not Set (Pending)'}
                </Text>
            </TouchableOpacity>
        );
    };

    // ─── Analytics row renderer ────────────────────────────
    const renderAnalyticsRow = ({ item, index }: any) => {
        const barWidth = maxOpens > 0 ? (item.thisMonth / maxOpens) * 100 : 0;
        const trendIcon = item.trend === 'up' ? 'trending-up' : item.trend === 'down' ? 'trending-down' : 'remove';
        const trendColor = item.trend === 'up' ? '#2e7d32' : item.trend === 'down' ? '#d32f2f' : '#999';
        const rankColors = ['#f5c518', '#b0b0b0', '#cd7f32']; // gold, silver, bronze

        return (
            <View style={styles.analyticsRow}>
                {/* Rank */}
                <View style={[styles.rankBadge, index < 3 ? { backgroundColor: rankColors[index] } : { backgroundColor: '#eee' }]}>
                    <Text style={[styles.rankText, index < 3 ? { color: 'white' } : { color: '#555' }]}>
                        {index + 1}
                    </Text>
                </View>

                {/* Company info + bar */}
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={styles.analyticsCompName} numberOfLines={1}>{item.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name={trendIcon as any} size={14} color={trendColor} />
                            <Text style={[styles.analyticsCount, { color: item.thisMonth > 0 ? '#333' : '#bbb' }]}>
                                {item.thisMonth} opens
                            </Text>
                        </View>
                    </View>

                    {/* Bar */}
                    <View style={styles.barBg}>
                        <View style={[styles.barFill, {
                            width: `${barWidth}%`,
                            backgroundColor: index === 0 ? '#f5c518' : index === 1 ? '#3b5998' : index === 2 ? '#cd7f32' : '#81c784'
                        }]} />
                    </View>

                    {/* Last active */}
                    <Text style={styles.analyticsSubText}>
                        {item.daysSinceActive === 0 ? '🟢 Active today'
                            : item.daysSinceActive === 1 ? '🟡 Active yesterday'
                            : item.daysSinceActive !== null && item.daysSinceActive <= 7 ? `🟡 Active ${item.daysSinceActive}d ago`
                            : item.daysSinceActive !== null ? `🔴 Last active ${item.daysSinceActive}d ago`
                            : '⚪ No activity recorded'}
                        {item.prevMonth > 0 ? `  •  prev: ${item.prevMonth}` : ''}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* HEADER */}
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
                    <TouchableOpacity
        style={styles.paymentsBtn}
        onPress={() => router.push('/superadmin/superadmin-payment-gateway' as any)}
    >
        <Ionicons name="card" size={18} color="white" />
        <Text style={styles.paymentsBtnText}>Gateway</Text>
    </TouchableOpacity>
                </View>

                {/* MAIN TABS */}
                <View style={styles.mainTabRow}>
                    <TouchableOpacity
                        style={[styles.mainTab, mainTab === 'companies' && styles.mainTabActive]}
                        onPress={() => setMainTab('companies')}
                    >
                        <Ionicons name="business" size={15} color={mainTab === 'companies' ? '#d32f2f' : 'rgba(255,255,255,0.7)'} />
                        <Text style={[styles.mainTabText, mainTab === 'companies' && styles.mainTabTextActive]}>
                            Companies
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.mainTab, mainTab === 'analytics' && styles.mainTabActive]}
                        onPress={() => setMainTab('analytics')}
                    >
                        <Ionicons name="bar-chart" size={15} color={mainTab === 'analytics' ? '#d32f2f' : 'rgba(255,255,255,0.7)'} />
                        <Text style={[styles.mainTabText, mainTab === 'analytics' && styles.mainTabTextActive]}>
                            Analytics
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── COMPANIES TAB ── */}
            {mainTab === 'companies' && (
                <>
                    {!loading && (
                        <View style={styles.statsWrap}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 15 }}>
                                <TouchableOpacity style={[styles.statCard, activeFilter === 'all' && styles.statCardActiveNeutral]} onPress={() => toggleFilter('all')}>
                                    <Text style={[styles.statNum, activeFilter === 'all' && { color: 'white' }]}>{stats.total}</Text>
                                    <Text style={[styles.statLabel, activeFilter === 'all' && { color: 'white' }]}>Total</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.statCard, { backgroundColor: activeFilter === 'active' ? '#2e7d32' : '#e8f5e9' }]} onPress={() => toggleFilter('active')}>
                                    <Text style={[styles.statNum, { color: activeFilter === 'active' ? 'white' : '#2e7d32' }]}>{stats.active}</Text>
                                    <Text style={[styles.statLabel, activeFilter === 'active' && { color: 'white' }]}>Active</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.statCard, { backgroundColor: activeFilter === 'expiringSoon' ? '#e67e22' : '#fff3e0' }]} onPress={() => toggleFilter('expiringSoon')}>
                                    <Text style={[styles.statNum, { color: activeFilter === 'expiringSoon' ? 'white' : '#e67e22' }]}>{stats.expiringSoon}</Text>
                                    <Text style={[styles.statLabel, activeFilter === 'expiringSoon' && { color: 'white' }]}>Expiring Soon</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.statCard, { backgroundColor: activeFilter === 'expired' ? '#d32f2f' : '#ffebee' }]} onPress={() => toggleFilter('expired')}>
                                    <Text style={[styles.statNum, { color: activeFilter === 'expired' ? 'white' : '#d32f2f' }]}>{stats.expired}</Text>
                                    <Text style={[styles.statLabel, activeFilter === 'expired' && { color: 'white' }]}>Expired</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.statCard, { backgroundColor: activeFilter === 'automation' ? '#2e7d32' : '#e8f5e9', borderWidth: activeFilter === 'automation' ? 0 : 1, borderColor: '#c8e6c9' }]} onPress={() => toggleFilter('automation')}>
                                    <Text style={[styles.statNum, { color: activeFilter === 'automation' ? 'white' : '#2e7d32' }]}>{stats.automationActive}</Text>
                                    <Text style={[styles.statLabel, activeFilter === 'automation' && { color: 'white' }]}>💬 Automation</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    )}

                    {activeFilter !== 'all' && (
                        <TouchableOpacity style={styles.filterChip} onPress={() => setActiveFilter('all')}>
                            <Text style={styles.filterChipText}>Showing: {filterLabels[activeFilter]}</Text>
                            <Ionicons name="close-circle" size={16} color="white" />
                        </TouchableOpacity>
                    )}

                    <View style={styles.searchWrap}>
                        <Ionicons name="search" size={20} color="#3b5998" style={{ marginRight: 10 }} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search by company, owner, city, mobile, email, GST..."
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
                            data={filteredCompanies}
                            keyExtractor={item => item.id}
                            renderItem={renderCompany}
                            contentContainerStyle={{ padding: 15 }}
                            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                            keyboardShouldPersistTaps="handled"
                            ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20, color: '#999' }}>No companies found.</Text>}
                        />
                    }
                </>
            )}

            {/* ── ANALYTICS TAB ── */}
            {mainTab === 'analytics' && (
                <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 40 }} showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

                    {/* Month selector */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {monthOptions.map(m => (
                                <TouchableOpacity
                                    key={m}
                                    style={[styles.monthChip, selectedMonth === m && styles.monthChipActive]}
                                    onPress={() => setSelectedMonth(m)}
                                >
                                    <Text style={[styles.monthChipText, selectedMonth === m && { color: 'white' }]}>
                                        {formatMonthLabel(m)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>

                    {/* Summary cards */}
                    <View style={styles.analyticsSummaryRow}>
                        <View style={[styles.analyticsSummaryCard, { backgroundColor: '#e3f2fd' }]}>
                            <Text style={styles.analyticsSummaryNum}>{analyticsStats.totalOpens}</Text>
                            <Text style={styles.analyticsSummaryLabel}>Total Opens{'\n'}{formatMonthLabel(selectedMonth)}</Text>
                        </View>
                        <View style={[styles.analyticsSummaryCard, { backgroundColor: '#e8f5e9' }]}>
                            <Text style={[styles.analyticsSummaryNum, { color: '#2e7d32' }]}>{analyticsStats.activeToday}</Text>
                            <Text style={styles.analyticsSummaryLabel}>Active{'\n'}Today</Text>
                        </View>
                        <View style={[styles.analyticsSummaryCard, { backgroundColor: '#fff3e0' }]}>
                            <Text style={[styles.analyticsSummaryNum, { color: '#e67e22' }]}>{analyticsStats.activeThisWeek}</Text>
                            <Text style={styles.analyticsSummaryLabel}>Active{'\n'}This Week</Text>
                        </View>
                    </View>

                    {/* Most active company highlight */}
                    {analyticsStats.mostActive && (
                        <View style={styles.topCompanyCard}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ fontSize: 24 }}>🏆</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.topCompanyLabel}>Most Active Company</Text>
                                    <Text style={styles.topCompanyName}>{analyticsStats.mostActive.name}</Text>
                                    <Text style={styles.topCompanyCity}>{analyticsStats.mostActive.city}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.topCompanyCount}>{analyticsStats.mostActive.thisMonth}</Text>
                                    <Text style={{ fontSize: 10, color: '#888' }}>app opens</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Ranking list */}
                    <Text style={styles.analyticsTitle}>
                        Company Usage Ranking — {formatMonthLabel(selectedMonth)}
                    </Text>

                    {analyticsData.length === 0 ? (
                        <View style={{ alignItems: 'center', marginTop: 40 }}>
                            <Ionicons name="bar-chart-outline" size={48} color="#ccc" />
                            <Text style={{ color: '#999', marginTop: 12 }}>No usage data yet for this month.</Text>
                            <Text style={{ color: '#bbb', fontSize: 12, marginTop: 6, textAlign: 'center', paddingHorizontal: 30 }}>
                                Usage tracking starts automatically when employees login. Make sure trackUsage() is called in DataContext.
                            </Text>
                        </View>
                    ) : (
                        analyticsData.map((item: any, index: number) => (
                            <View key={item.id}>
                                {renderAnalyticsRow({ item, index })}
                            </View>
                        ))
                    )}

                    {/* Inactive companies */}
                    {companies.filter((c: any) => c.isActive === true && !isCompanyExpired(c) && !(c.monthlyUsage?.[selectedMonth])).length > 0 && (
                        <>
                            <Text style={[styles.analyticsTitle, { marginTop: 20, color: '#999' }]}>
                                No Activity This Month
                            </Text>
                            {companies
                                .filter((c: any) => c.isActive === true && !isCompanyExpired(c) && !(c.monthlyUsage?.[selectedMonth]))
                                .map((c: any) => (
                                    <View key={c.id} style={[styles.analyticsRow, { opacity: 0.6 }]}>
                                        <View style={[styles.rankBadge, { backgroundColor: '#eee' }]}>
                                            <Ionicons name="moon-outline" size={14} color="#999" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.analyticsCompName}>{c.companyName || c.name}</Text>
                                            <Text style={styles.analyticsSubText}>
                                                {c.lastActiveAt
                                                    ? `Last seen: ${new Date(c.lastActiveAt).toDateString()}`
                                                    : 'Never tracked — update DataContext trackUsage fix'}
                                            </Text>
                                        </View>
                                        <Text style={{ fontSize: 12, color: '#bbb' }}>0 opens</Text>
                                    </View>
                                ))}
                        </>
                    )}
                </ScrollView>
            )}

            {/* POPUP MODAL */}
            <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={styles.modalTitle}>{selectedCompany?.companyName || selectedCompany?.name}</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)}>
                                    <Ionicons name="close-circle" size={30} color="#d32f2f" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            {selectedCompany && (
                                selectedCompany.isActive === undefined || selectedCompany.isActive === null ||
                                (!selectedCompany.isActive && (!selectedCompany.plan || selectedCompany.plan === 'Pending Approval'))
                            ) && (
                                <TouchableOpacity style={styles.approveBtn} onPress={handleApproveCompany}>
                                    <Ionicons name="checkmark-circle" size={24} color="white" style={{ marginRight: 8 }} />
                                    <Text style={styles.approveBtnText}>Approve & Start 7-Day Trial</Text>
                                </TouchableOpacity>
                            )}

                            {selectedCompany && isCompanyExpired(selectedCompany) && (
                                <View style={styles.expiredWarning}>
                                    <Ionicons name="warning" size={18} color="#e67e22" />
                                    <Text style={styles.expiredWarningText}>
                                        Plan expired on {new Date(selectedCompany.expiryDate).toDateString()}. Extend validity below.
                                    </Text>
                                </View>
                            )}

                            <View style={styles.statusRow}>
                                <View>
                                    <Text style={styles.label}>Account Status</Text>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: selectedCompany?.isActive ? 'green' : (selectedCompany?.isActive === undefined ? '#1565c0' : 'red') }}>
                                        {selectedCompany?.isActive
                                            ? (isCompanyExpired(selectedCompany) ? 'Expired ⏳' : 'Active & Approved ✅')
                                            : (selectedCompany?.isActive === undefined ? 'New (Pending)' : 'Inactive / Disabled 🚫')}
                                    </Text>
                                </View>
                                <Switch trackColor={{ false: "#767577", true: "#81b0ff" }} thumbColor={selectedCompany?.isActive ? "#2e7d32" : "#f4f3f4"} onValueChange={toggleCompanyStatus} value={selectedCompany?.isActive === true} />
                            </View>

                            <View style={[styles.statusRow, { marginTop: 10 }]}>
                                <View>
                                    <Text style={styles.label}>Automation Add-on</Text>
                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: selectedCompany?.automationAddonEnabled ? '#2e7d32' : '#888' }}>
                                        {selectedCompany?.automationAddonEnabled ? 'WhatsApp/Email Enabled ✅' : 'Not Enabled'}
                                    </Text>
                                </View>
                                <Switch trackColor={{ false: "#767577", true: "#81b0ff" }} thumbColor={selectedCompany?.automationAddonEnabled ? "#2e7d32" : "#f4f3f4"} onValueChange={toggleAutomationAddon} value={selectedCompany?.automationAddonEnabled === true} />
                            </View>

                            <View style={styles.divider} />

                            <Text style={styles.label}>Details:</Text>
                            <Text style={styles.value}>{selectedCompany?.ownerName || selectedCompany?.contactPerson} ({selectedCompany?.ownerMobile || selectedCompany?.mobile})</Text>
                            <Text style={styles.value}>{selectedCompany?.ownerEmail || selectedCompany?.email}</Text>
                            {selectedCompany?.website ? <Text style={styles.value}>🌐 {selectedCompany.website}</Text> : null}
                            {selectedCompany?.gstNumber ? <Text style={styles.value}>GST: {selectedCompany.gstNumber}</Text> : null}
                            <Text style={styles.value}>{selectedCompany?.address || ''}{selectedCompany?.city ? `, ${selectedCompany.city}` : ''}</Text>
                            <Text style={styles.value}>Plan: {selectedCompany?.plan || 'Pending Approval'}</Text>
                            {selectedCompany?.lastPaymentAmount ? (
                                <Text style={styles.value}>Last Payment: ₹{selectedCompany.lastPaymentAmount} {selectedCompany.lastPaymentDate ? `(${new Date(selectedCompany.lastPaymentDate).toDateString()})` : ''}</Text>
                            ) : null}

                            {/* Usage stats in modal */}
                            {(selectedCompany?.appOpenCount || selectedCompany?.lastActiveAt) && (
                                <>
                                    <View style={styles.divider} />
                                    <Text style={styles.label}>Usage Stats</Text>
                                    {selectedCompany?.appOpenCount ? <Text style={styles.value}>Total App Opens: {selectedCompany.appOpenCount}</Text> : null}
                                    {selectedCompany?.lastActiveAt ? <Text style={styles.value}>Last Active: {new Date(selectedCompany.lastActiveAt).toLocaleString()}</Text> : null}
                                    {selectedCompany?.monthlyUsage?.[getMonthKey()] !== undefined ? (
                                        <Text style={styles.value}>This Month Opens: {selectedCompany.monthlyUsage[getMonthKey()]}</Text>
                                    ) : null}
                                </>
                            )}

                            <View style={styles.divider} />

                            <Text style={styles.sectionHeader}>Subscription Controls</Text>
                            <Text style={styles.label}>Max Employees:</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                <TextInput style={styles.inputBox} value={editEmployeeLimit} onChangeText={setEditEmployeeLimit} keyboardType="numeric" />
                                <TouchableOpacity style={styles.btnUpdate} onPress={() => updateCompanySettings(0)}>
                                    <Text style={{ color: 'white', fontWeight: 'bold' }}>Save Limit</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.label}>Add Validity (Auto Activates):</Text>
                            <View style={styles.actionRow}>
                                <TouchableOpacity style={styles.btnAction} onPress={() => updateCompanySettings(7)}><Text style={styles.btnText}>+7 Days</Text></TouchableOpacity>
                                <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#2e7d32' }]} onPress={() => updateCompanySettings(30)}><Text style={styles.btnText}>+1 Month</Text></TouchableOpacity>
                                <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#f57c00' }]} onPress={() => updateCompanySettings(365)}><Text style={styles.btnText}>+1 Year</Text></TouchableOpacity>
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

    // Main Tabs
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

    filterChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3b5998', marginHorizontal: 15, marginTop: 10, paddingVertical: 8, borderRadius: 8 },
    filterChipText: { color: 'white', fontSize: 12, fontWeight: 'bold' },

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

    // Analytics
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

    approveBtn: { flexDirection: 'row', backgroundColor: '#2e7d32', padding: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 20, elevation: 3 },
    approveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#eee' },
    inputBox: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, width: 80, textAlign: 'center', fontSize: 16, fontWeight: 'bold' },
    btnUpdate: { backgroundColor: '#333', padding: 10, borderRadius: 8, justifyContent: 'center', flex: 1, alignItems: 'center' },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 20 },
    btnAction: { flex: 1, backgroundColor: '#3b5998', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    btnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
});