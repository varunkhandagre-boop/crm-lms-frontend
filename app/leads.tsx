import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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

// 🔥 SAAS IMPORTS (users still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// Leads are filtered + paginated on the server (hooks/useServerLeads.ts)
import { getLeadCounts, LeadCounts } from '../services/api/leads';
import { buildLeadFilters, LeadSortMode, useServerLeads } from '../hooks/useServerLeads';
import { fetchTeamMembers } from '../services/api/users';
// 🔥 Cache-first list loading pilot (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';
import ReassignLeadsModal from '../components/ReassignLeadsModal';
import CloseStaleLeadsModal from '../components/CloseStaleLeadsModal';
import WebsiteLeadSettingsModal from '../components/WebsiteLeadSettingsModal';
import { isWebsiteLead } from '../services/api/websiteLeads';
import { formatInr } from '../constants/leadStatus';
import { useHeaderTop } from '../hooks/useHeaderTop';

export default function LeadsScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    
    // 🔥 1. Context se sirf user
    const { currentUser } = useData();

    // 🔥 2. SaaS Engine — only isDbLoading (search-icon spinner) still used here;
    // leads no longer go through this (see useCachedList below)
    const { isDbLoading } = useSaaSDB();

    // 🔥 3. Lazy Loaded States
    // Leads come from useServerLeads below (server-side filtered pages)
    const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);

    // --- STATES ---
    const [activeFilter, setActiveFilter] = useState('All');
    const [activeStageFilter, setActiveStageFilter] = useState('All'); 
    const [quickFilter, setQuickFilter] = useState<'' | 'overdue' | 'today' | 'hot'>('');
    const [websiteOnly, setWebsiteOnly] = useState(false);
    const [sortMode, setSortMode] = useState<LeadSortMode>('newest');
    const [showWebsiteSettings, setShowWebsiteSettings] = useState(false);

    // Opened from the morning follow-up reminder push (/leads?quick=today)
    const { quick } = useLocalSearchParams<{ quick?: string }>();
    useEffect(() => {
        if (quick === 'today' || quick === 'overdue' || quick === 'hot') setQuickFilter(quick);
    }, [quick]);
    const [searchText, setSearchText] = useState('');
    const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
    const [currentDate, setCurrentDate] = useState(new Date());

    // EMPLOYEE FILTER
    const [selectedEmployee, setSelectedEmployee] = useState('All');
    const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
    const [showEmployeePicker, setShowEmployeePicker] = useState(false);

    // MODAL STATES
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [stageFilterModalVisible, setStageFilterModalVisible] = useState(false); 
    

    const userRole = currentUser?.role ? currentUser.role.toLowerCase() : 'employee';
    const canViewEmployeeFilter = ['admin', 'manager', 'accountant', 'hr'].includes(userRole);
    const isMaster = ['admin', 'manager', 'accountant', 'hr', 'store', 'superadmin'].includes(userRole);
    // Matches the backend's REASSIGN_ROLES on /leads/bulk-reassign
    const canBulkReassign = ['admin', 'manager', 'superadmin'].includes(userRole);
    const [showReassign, setShowReassign] = useState(false);
    const [showCloseStale, setShowCloseStale] = useState(false);
    const [showAdminMenu, setShowAdminMenu] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);


    // OPTIONS
    const leadStatuses = ['All', 'Interested', 'Follow Up', 'Demo Planned', 'Order Expected', 'Converted (Win)', 'Lost'];
    const leadStages = ['All', 'New', 'Introduction', 'Technical Review', 'Quotation', 'Negotiation', 'Order Closed'];

    // 🔥 4. LEADS — filtered, sorted and paginated on the server; only the
    // current page is ever on the phone. Search is debounced so typing
    // doesn't fire a request per keystroke.
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchText), 400);
        return () => clearTimeout(t);
    }, [searchText]);

    const employeeFilterId = canViewEmployeeFilter && selectedEmployee !== 'All' ? selectedEmployee : undefined;
    const leadFilters = useMemo(() => buildLeadFilters({
        quickFilter,
        status: activeFilter,
        stage: activeStageFilter,
        search: debouncedSearch,
        viewMode,
        currentDate,
        employeeId: employeeFilterId,
        websiteOnly,
        sortMode,
    }), [quickFilter, activeFilter, activeStageFilter, debouncedSearch, viewMode, currentDate, employeeFilterId, websiteOnly, sortMode]);

    // Only the screen's default view (this FY, open leads, no filters) is
    // cached, so the screen still opens instantly without storing every
    // filter combination on the device.
    const isDefaultView = !quickFilter && !websiteOnly && sortMode === 'newest' && activeFilter === 'All' && activeStageFilter === 'All' && !debouncedSearch
        && viewMode === 'FY' && !employeeFilterId && buildLeadFilters({ quickFilter: '', status: 'All', stage: 'All', search: '', viewMode: 'FY', currentDate: new Date() }).from === leadFilters.from;
    const {
        items: leadItems,
        total: leadsTotal,
        loading: leadsLoading,
        loadingMore: leadsLoadingMore,
        refreshing: leadsRefreshing,
        hasMore: leadsHasMore,
        loadMore: loadMoreLeads,
        refresh: refreshLeadPage,
        reload: reloadLeadPage,
    } = useServerLeads({
        filters: leadFilters,
        enabled: !!currentUser?.companyId,
        cacheKey: isDefaultView ? buildCacheKey('leads_first_page_v2', currentUser?.companyId) : null,
    });

    // Overdue / Due Today / Hot cards — server-side counts.
    const [counts, setCounts] = useState<LeadCounts>({ open: 0, overdue: 0, today: 0, hot: 0 });
    const loadCounts = useCallback(() => {
        getLeadCounts(employeeFilterId).then(setCounts).catch(() => {});
    }, [employeeFilterId]);
    useEffect(() => { if (currentUser?.companyId) loadCounts(); }, [loadCounts, currentUser?.companyId]);

    const refreshLeads = useCallback(async () => {
        loadCounts();
        await refreshLeadPage();
    }, [loadCounts, refreshLeadPage]);

    // Coming back from Lead Details / Board / Add Lead: re-fetch the current
    // page so edits show up. Skips the first focus (the initial load above
    // already covers it). One small page request — not the whole table.
    const hasFocusedOnce = useRef(false);
    useFocusEffect(useCallback(() => {
        if (!hasFocusedOnce.current) { hasFocusedOnce.current = true; return; }
        loadCounts();
        reloadLeadPage();
    }, [loadCounts, reloadLeadPage]));

    // 🔥 Team members — cache-first, shares the SAME 'team_members' cache
    // key as manage_team.tsx/employee_timeline.tsx. Fetched regardless of
    // canViewEmployeeFilter now — every role needs it for the senderName
    // enrichment below, not just managers building the filter dropdown.
    const { data: teamMembersForLeads } = useCachedList({
        cacheKey: buildCacheKey('team_members', currentUser?.companyId),
        enabled: !!currentUser?.companyId,
        fetcher: fetchTeamMembers,
    });
    useEffect(() => {
        if (canViewEmployeeFilter) {
            const mappedUsers = teamMembersForLeads.map((u: any) => ({
                id: u.id,
                name: u.name || 'Unknown User'
            }));
            setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
        }
    }, [teamMembersForLeads, canViewEmployeeFilter]);

    // The API only returns createdById; show the creator's name from the team list.
    const nameById = useMemo(
        () => new Map(teamMembersForLeads.map((u: any) => [u.id, u.name || 'Unknown'])),
        [teamMembersForLeads]
    );

    const parseDate = (dateStr: any) => {
        if (!dateStr) return new Date(0);
        if (typeof dateStr === 'number') return new Date(dateStr);
        if (dateStr instanceof Date) return dateStr;
        if (typeof dateStr === 'string') {
            if (dateStr.includes('T')) return new Date(dateStr);
            if (dateStr.includes('-')) return new Date(dateStr);
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
        }
        return new Date(0);
    };

    const getFollowUpStatus = (dateStr: string) => {
        if (!dateStr) return { color: '#757575', label: 'No Date', icon: 'calendar-outline', bg: '#eeeeee' };
        const targetDate = parseDate(dateStr);
        const today = new Date();
        targetDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const diff = targetDate.getTime() - today.getTime();

        if (diff < 0) return { color: '#d32f2f', label: 'Overdue', icon: 'alert-circle', bg: '#ffebee' };
        else if (diff === 0) return { color: '#f57c00', label: 'Today', icon: 'alarm', bg: '#fff3e0' };
        else return { color: '#388e3c', label: 'Upcoming', icon: 'calendar', bg: '#e8f5e9' };
    };

    const changeDate = (dir: number) => {
        const d = new Date(currentDate);
        if (viewMode === 'Day') d.setDate(d.getDate() + dir);
        else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
        else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
        setCurrentDate(d);
    };

    const getHeaderDate = () => {
        if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (viewMode === 'FY') {
            const m = currentDate.getMonth(); 
            const y = currentDate.getFullYear();
            const startY = m >= 3 ? y : y - 1;
            return `FY ${startY.toString().slice(-2)}-${(startY + 1).toString().slice(-2)}`;
        }
        return "All Time";
    };

    const getStageColor = (stage: string) => {
        switch (stage) {
            case 'New': return '#2196f3';
            case 'Introduction': return '#03a9f4';
            case 'Technical Review': return '#9c27b0';
            case 'Quotation': return '#673ab7';
            case 'Negotiation': return '#ff9800';
            case 'Order Closed': return '#4caf50';
            case 'Lost': return '#f44336';
            default: return '#607d8b';
        }
    };

    const openWhatsApp = (item: any) => {
        const mobile = item.mobile || item.contactNumber || '';
        if (!mobile) return Alert.alert("Error", "No mobile number found.");
        const name = item.contactPerson;
        const org = item.org || item.orgName;
        const product = item.requirements || item.product || 'your inquiry';
        let msg = `Hello ${name},\n\nGreetings from our Sales Team.\nWe are following up regarding requirements for *${product}* at *${org}*.\n\nRegards,\n*LMS Team*`;
        Linking.openURL(`whatsapp://send?phone=91${mobile}&text=${encodeURIComponent(msg)}`).catch(() => Alert.alert("Error", "WhatsApp not installed"));
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <View style={styles.headerTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                        <Text style={styles.headerTitle}>Leads</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity style={styles.reassignBtn} onPress={() => router.push('/leads_board' as any)}>
                            <Ionicons name="grid-outline" size={16} color="#3b5998" />
                            <Text style={{ color: '#3b5998', fontWeight: 'bold', marginLeft: 3, fontSize: 12 }}>Board</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.reassignBtn} onPress={() => router.push('/nearby_leads' as any)} accessibilityLabel="Nearby leads">
                            <Ionicons name="navigate-outline" size={16} color="#3b5998" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.reassignBtn} onPress={() => router.push('/lead_insights' as any)} accessibilityLabel="Lead insights">
                            <Ionicons name="stats-chart" size={16} color="#3b5998" />
                        </TouchableOpacity>
                        {canBulkReassign && (
                            <TouchableOpacity style={styles.reassignBtn} onPress={() => setShowAdminMenu(true)} accessibilityLabel="Lead management">
                                <Ionicons name="ellipsis-vertical" size={18} color="#3b5998" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddMenu(true)}>
                            <Ionicons name="add" size={18} color="white" />
                            <Text style={{ color: 'white', fontWeight: 'bold', marginLeft: 1, fontSize: 13 }}>Lead</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <View style={{ backgroundColor: 'white', paddingBottom: 5 }}>
                <View style={styles.actionCardsRow}>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#ffebee', borderColor: quickFilter === 'overdue' ? '#d32f2f' : 'transparent', borderWidth: 1 }]} onPress={() => setQuickFilter(quickFilter === 'overdue' ? '' : 'overdue')}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#d32f2f' }}>{counts.overdue}</Text>
                        <Text style={{ fontSize: 10, color: '#d32f2f', fontWeight: '600' }}>OVERDUE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#fff3e0', borderColor: quickFilter === 'today' ? '#f57c00' : 'transparent', borderWidth: 1 }]} onPress={() => setQuickFilter(quickFilter === 'today' ? '' : 'today')}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#f57c00' }}>{counts.today}</Text>
                        <Text style={{ fontSize: 10, color: '#f57c00', fontWeight: '600' }}>DUE TODAY</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#e8f5e9', borderColor: quickFilter === 'hot' ? '#2e7d32' : 'transparent', borderWidth: 1 }]} onPress={() => setQuickFilter(quickFilter === 'hot' ? '' : 'hot')}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32' }}>{counts.hot}</Text>
                        <Text style={{ fontSize: 10, color: '#2e7d32', fontWeight: '600' }}>HOT LEADS</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.searchBar}>
                    {isDbLoading ? <ActivityIndicator size="small" color="#1565c0" /> : <Ionicons name="search" size={20} color="#1565c0" />}
                    <TextInput style={styles.input} placeholder="Search Leads..." value={searchText} onChangeText={setSearchText} />
                    {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="#d32f2f" /></TouchableOpacity>}
                </View>

                {!searchText && !quickFilter && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: 15, marginBottom: 10 }}>
                        <TouchableOpacity style={styles.smartFilterChip} onPress={() => setFilterModalVisible(true)}>
                            <Text style={styles.smartFilterText}>Status: {activeFilter}</Text>
                            <Ionicons name="caret-down" size={14} color="#3b5998" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.smartFilterChip} onPress={() => setStageFilterModalVisible(true)}>
                            <Text style={styles.smartFilterText}>Stage: {activeStageFilter}</Text>
                            <Ionicons name="caret-down" size={14} color="#3b5998" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.smartFilterChip, websiteOnly && { backgroundColor: '#e0f7fa', borderColor: '#00838f' }]}
                            onPress={() => setWebsiteOnly(!websiteOnly)}
                        >
                            <Text style={[styles.smartFilterText, websiteOnly && { color: '#00838f' }]}>🌐 Website</Text>
                            {websiteOnly && <Ionicons name="close" size={14} color="#00838f" />}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.smartFilterChip}
                            onPress={() => setSortMode(sortMode === 'newest' ? 'followup' : 'newest')}
                        >
                            <Ionicons name="swap-vertical" size={12} color="#3b5998" style={{ marginRight: 4 }} />
                            <Text style={styles.smartFilterText}>{sortMode === 'newest' ? 'Newest first' : 'Follow-up date'}</Text>
                        </TouchableOpacity>
                        {canViewEmployeeFilter && (
                            <TouchableOpacity style={[styles.smartFilterChip, {backgroundColor: '#e8f5e9', borderColor: '#a5d6a7'}]} onPress={() => setShowEmployeePicker(true)}>
                                <Ionicons name="person" size={12} color="#2e7d32" style={{marginRight: 4}} />
                                <Text style={[styles.smartFilterText, {color: '#2e7d32'}]}>{selectedEmployeeName}</Text>
                                <Ionicons name="caret-down" size={14} color="#2e7d32" />
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                )}

                {!searchText && !quickFilter && (
                    <>
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
                    </>
                )}
                {websiteOnly && (searchText || quickFilter) ? (
                    <TouchableOpacity onPress={() => setWebsiteOnly(false)} style={{ alignSelf: 'flex-start', marginLeft: 15, marginBottom: 4, flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#00838f', fontWeight: 'bold' }}>🌐 Website leads only </Text>
                        <Ionicons name="close-circle" size={14} color="#00838f" />
                    </TouchableOpacity>
                ) : null}
                <Text style={{ textAlign:'right', fontSize: 12, color: 'gray', paddingHorizontal:15, paddingBottom:5 }}>Total Leads: <Text style={{ fontWeight: 'bold', color: '#3b5998' }}>{leadsTotal}</Text>{leadsLoading && leadItems.length > 0 ? '  ⏳' : ''}</Text>
            </View>

            <FlatList
                data={leadItems}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.contentContainer}
                refreshControl={
                    <RefreshControl refreshing={leadsRefreshing} onRefresh={refreshLeads} colors={['#3b5998']} tintColor="#3b5998" />
                }
                ListEmptyComponent={
                    <View style={{ alignItems: 'center', marginTop: 50 }}>
                        {leadsLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                            <Text style={{ textAlign: 'center', color: 'gray' }}>No Leads Found</Text>
                        )}
                    </View>
                }
                renderItem={({ item }) => {
                    const dateStatus = getFollowUpStatus(item.nextDate);
                    const productInfo = item.requirements || item.product || null;
                    const leadType = item.type || (item.isHot ? 'Hot' : 'Warm');
                    const badgeColor = leadType === 'Hot' ? '#d32f2f' : leadType === 'Warm' ? '#f57c00' : '#1976d2';

                    return (
                        <TouchableOpacity 
                            style={[styles.card, { borderLeftColor: getStageColor(item.stage), borderLeftWidth: 4 }]} 
                            onPress={() => router.push({ pathname: '/lead_details', params: { id: item.id } } as any)}
                        >
                            <View style={styles.cardHeader}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={styles.hospitalName} numberOfLines={1}>{item.org || item.orgName}</Text>
                                        <View style={{ flexDirection: 'row' }}>
                                            {item.mobile ? (
                                                <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.mobile}`)} style={{ marginRight: 15 }}>
                                                    <Ionicons name="call" size={20} color="#3b5998" />
                                                </TouchableOpacity>
                                            ) : null}
                                            {item.mobile ? (
                                                <TouchableOpacity onPress={() => openWhatsApp(item)} style={{ marginRight: 5 }}>
                                                    <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                                                </TouchableOpacity>
                                            ) : null}
                                        </View>
                                    </View>
                                    
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 5 }}>
                                        {productInfo && <View style={styles.tag}><Text style={styles.tagText}>{productInfo}</Text></View>}
                                        <Text style={[styles.hotBadge, {color: badgeColor}]}>
                                            {leadType === 'Hot' ? '🔥' : leadType === 'Warm' ? '🌤️' : '❄️'} {leadType.toUpperCase()}
                                        </Text>
                                        {item.dealValue ? <Text style={[styles.hotBadge, { color: '#2e7d32' }]}>💰 {formatInr(item.dealValue)}</Text> : null}
                                        {isWebsiteLead(item.source) ? <Text style={[styles.hotBadge, { color: '#00838f' }]}>🌐 WEBSITE</Text> : null}
                                    </View>
                                    
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
                                        <Ionicons name="person-circle-outline" size={14} color="gray" />
                                        <Text style={styles.subText}>{item.contactPerson} • {item.city}</Text>
                                    </View>
                                </View>
                            </View>
                            
                            <View style={styles.divider} />

                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                <Ionicons name="person-outline" size={12} color="#3b5998" />
                                <Text style={{ fontSize: 11, color: '#3b5998', marginLeft: 4 }}>Added by: {nameById.get(item.senderId) || 'Unknown'}</Text>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View>
                                    <Text style={{ fontSize: 11, color: '#777', marginBottom: 3 }}>Next Follow-up:</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: dateStatus.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                                        <Ionicons name={dateStatus.icon as any} size={12} color={dateStatus.color} style={{ marginRight: 3 }} />
                                        <Text style={{ fontSize: 11, color: dateStatus.color, fontWeight: 'bold' }}>{dateStatus.label} {item.nextDate ? `(${new Date(item.nextDate).toLocaleDateString('en-GB').slice(0, 5)})` : ''}</Text>
                                    </View>
                                </View>

                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ fontSize: 11, color: '#777', marginBottom: 3 }}>Pipeline Stage:</Text>
                                    <View style={[styles.statusBadge, { backgroundColor: getStageColor(item.stage) + '20' }]}>
                                        <Text style={{ color: getStageColor(item.stage), fontSize: 11, fontWeight: 'bold' }}>{item.stage}</Text>
                                    </View>
                                </View>
                            </View>
                            <Text style={{textAlign:'center', fontSize:10, color:'#ccc', marginTop:8, fontStyle:'italic'}}>Tap to Log Visit & Details</Text>
                        </TouchableOpacity>
                    );
                }}
                ListFooterComponent={
                    <View style={{ paddingBottom: 80 }}> 
                        {leadsHasMore ? (
                            <TouchableOpacity onPress={loadMoreLeads} style={styles.loadMoreBtn} disabled={leadsLoadingMore}>
                                {leadsLoadingMore
                                    ? <ActivityIndicator color="#3b5998" />
                                    : <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({leadsTotal - leadItems.length} remaining)</Text>}
                            </TouchableOpacity>
                        ) : (
                            leadItems.length > 0 ? <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>--- End of Leads ---</Text> : null
                        )}
                    </View>
                }
            />

            {/* PICKERS */}
            <Modal visible={showEmployeePicker} transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowEmployeePicker(false)} />
                    <View style={styles.pickerContainer}>
                        <FlatList data={employees} keyExtractor={item => item.id} renderItem={({ item }) => (
                            <TouchableOpacity style={styles.pickerItem} onPress={() => { setSelectedEmployee(item.id); setSelectedEmployeeName(item.name); setShowEmployeePicker(false); }}>
                                <Text style={{ fontSize: 16, color: '#333' }}>{item.name}</Text>
                                {selectedEmployee === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                            </TouchableOpacity>
                        )} />
                    </View>
                </View>
            </Modal>

            <Modal visible={filterModalVisible} transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setFilterModalVisible(false)} />
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerHeader}>Filter by Status</Text>
                        <FlatList data={leadStatuses} keyExtractor={item => item} renderItem={({ item }) => (
                            <TouchableOpacity style={styles.pickerItem} onPress={() => { setActiveFilter(item); setFilterModalVisible(false); }}>
                                <Text style={{ fontSize: 16, color: '#333' }}>{item}</Text>
                                {activeFilter === item && <Ionicons name="checkmark" size={18} color="green" />}
                            </TouchableOpacity>
                        )} />
                    </View>
                </View>
            </Modal>

            <Modal visible={stageFilterModalVisible} transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setStageFilterModalVisible(false)} />
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerHeader}>Filter by Stage</Text>
                        <FlatList data={leadStages} keyExtractor={item => item} renderItem={({ item }) => (
                            <TouchableOpacity style={styles.pickerItem} onPress={() => { setActiveStageFilter(item); setStageFilterModalVisible(false); }}>
                                <Text style={{ fontSize: 16, color: '#333' }}>{item}</Text>
                                {activeStageFilter === item && <Ionicons name="checkmark" size={18} color="green" />}
                            </TouchableOpacity>
                        )} />
                    </View>
                </View>
            </Modal>

            {/* "+ Lead" — both ways a lead gets created */}
            <Modal visible={showAddMenu} transparent animationType="fade" onRequestClose={() => setShowAddMenu(false)}>
                <TouchableOpacity style={[styles.menuOverlay, { paddingTop: headerTop + 35 }]} activeOpacity={1} onPress={() => setShowAddMenu(false)}>
                    <View style={styles.menuBox}>
                        <TouchableOpacity style={styles.menuItem} onPress={() => { setShowAddMenu(false); router.push('/add_sales' as any); }}>
                            <Ionicons name="location-outline" size={20} color="#3b5998" />
                            <View style={{ marginLeft: 12, flex: 1 }}>
                                <Text style={styles.menuTitle}>Cold Call / Visit</Text>
                                <Text style={styles.menuSub}>Log a visit — interested hospitals become leads</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => { setShowAddMenu(false); router.push('/add_lead' as any); }}>
                            <Ionicons name="create-outline" size={20} color="#2e7d32" />
                            <View style={{ marginLeft: 12, flex: 1 }}>
                                <Text style={styles.menuTitle}>Add Lead Directly</Text>
                                <Text style={styles.menuSub}>Enquiry by phone, reference, website…</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {canBulkReassign && (
                <Modal visible={showAdminMenu} transparent animationType="fade" onRequestClose={() => setShowAdminMenu(false)}>
                    <TouchableOpacity style={[styles.menuOverlay, { paddingTop: headerTop + 35 }]} activeOpacity={1} onPress={() => setShowAdminMenu(false)}>
                        <View style={styles.menuBox}>
                            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowAdminMenu(false); setShowReassign(true); }}>
                                <Ionicons name="swap-horizontal" size={20} color="#3b5998" />
                                <View style={{ marginLeft: 12, flex: 1 }}>
                                    <Text style={styles.menuTitle}>Reassign Leads</Text>
                                    <Text style={styles.menuSub}>Move an employee's leads to someone else</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowAdminMenu(false); setShowCloseStale(true); }}>
                                <Ionicons name="archive-outline" size={20} color="#c62828" />
                                <View style={{ marginLeft: 12, flex: 1 }}>
                                    <Text style={styles.menuTitle}>Close Stale Leads</Text>
                                    <Text style={styles.menuSub}>Mark old, untouched leads as Lost</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => { setShowAdminMenu(false); setShowWebsiteSettings(true); }}>
                                <Ionicons name="globe-outline" size={20} color="#00838f" />
                                <View style={{ marginLeft: 12, flex: 1 }}>
                                    <Text style={styles.menuTitle}>Website Leads</Text>
                                    <Text style={styles.menuSub}>Choose who gets leads from the website</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>
            )}

            {canBulkReassign && (
                <CloseStaleLeadsModal
                    visible={showCloseStale}
                    onClose={() => setShowCloseStale(false)}
                    onDone={() => { refreshLeads(); }}
                    teamMembers={teamMembersForLeads}
                />
            )}

            {canBulkReassign && (
                <WebsiteLeadSettingsModal
                    visible={showWebsiteSettings}
                    onClose={() => setShowWebsiteSettings(false)}
                    teamMembers={teamMembersForLeads}
                    canEdit={['admin', 'superadmin'].includes(userRole)}
                />
            )}

            {canBulkReassign && (
                <ReassignLeadsModal
                    visible={showReassign}
                    onClose={() => setShowReassign(false)}
                    onDone={() => { refreshLeads(); }}
                    teamMembers={teamMembersForLeads}
                    initialFromUserId={selectedEmployee}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { backgroundColor: 'white', paddingBottom: 2, elevation: 2 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, marginBottom: 5 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
    addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b5998', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 6 },
    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingRight: 12 },
    menuBox: { width: 270, backgroundColor: 'white', borderRadius: 10, elevation: 8, paddingVertical: 4 },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    menuTitle: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    menuSub: { fontSize: 11, color: 'gray', marginTop: 1 },
    reassignBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8eaf6', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 6 },

    actionCardsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, marginBottom: 10, marginTop: 10 },
    actionCard: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: 8, marginHorizontal: 3, elevation: 1 },

    searchBar: { backgroundColor: '#e3f2fd', borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 45, marginHorizontal: 15, marginBottom: 10, borderWidth: 1, borderColor: '#90caf9', elevation: 1 },
    input: { flex: 1, marginLeft: 10, fontSize: 15, color: '#1565c0', fontWeight: '500' },
    
    smartFilterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#bbdefb' },
    smartFilterText: { fontSize: 12, color: '#1565c0', fontWeight: 'bold', marginRight: 4 },

    contentContainer: { padding: 15, paddingBottom: 100 },
    card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
    hospitalName: { fontWeight: 'bold', fontSize: 16, color: '#333', maxWidth: '70%' },
    hotBadge: { fontSize: 11, marginLeft: 8, fontWeight: 'bold' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
    subText: { color: 'gray', fontSize: 12, marginLeft: 5 },
    tag: { backgroundColor: '#e8eaf6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginRight: 6, marginBottom: 4, borderWidth: 1, borderColor: '#b2ebf2' },
    tagText: { fontSize: 10, color: '#006064', fontWeight: 'bold' },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },

    tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', marginHorizontal: 15, borderRadius: 8, padding: 2, marginBottom: 5 },
    tab: { flex: 1, paddingVertical: 5, alignItems: 'center', borderRadius: 6 },
    activeTab: { backgroundColor: 'white', elevation: 2 },
    tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
    activeTabText: { color: '#3b5998', fontWeight: 'bold' },
    dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 5, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#eee' },
    monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

    loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
    pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation: 10 },
    pickerHeader: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#3b5998', textAlign: 'center' },
    pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
