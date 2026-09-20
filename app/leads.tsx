import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
// 🔥 Phase 1: leads now go through the new backend API
import { listLeads } from '../services/api/leads';
import { fetchTeamMembers } from '../services/api/users';
// 🔥 Cache-first list loading pilot (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

export default function LeadsScreen() {
    const router = useRouter();
    
    // 🔥 1. Context se sirf user
    const { currentUser } = useData();

    // 🔥 2. SaaS Engine — only isDbLoading (search-icon spinner) still used here;
    // leads no longer go through this (see useCachedList below)
    const { isDbLoading } = useSaaSDB();

    // 🔥 3. Lazy Loaded States
    // leadsList now comes from useCachedList below (cache-first pilot)
    const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);

    // --- STATES ---
    const [activeFilter, setActiveFilter] = useState('All');
    const [activeStageFilter, setActiveStageFilter] = useState('All'); 
    const [quickFilter, setQuickFilter] = useState('');
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
    
    const [visibleCount, setVisibleCount] = useState(20);

    const userRole = currentUser?.role ? currentUser.role.toLowerCase() : 'employee';
    const canViewEmployeeFilter = ['admin', 'manager', 'accountant', 'hr'].includes(userRole);
    const isMaster = ['admin', 'manager', 'accountant', 'hr', 'store', 'superadmin'].includes(userRole);

    useEffect(() => {
        if (viewMode === 'Day' && !quickFilter && !searchText) setVisibleCount(500); 
        else setVisibleCount(20); 
    }, [viewMode, currentDate, activeFilter, activeStageFilter, quickFilter, searchText, selectedEmployee]);

    // OPTIONS
    const leadStatuses = ['All', 'Interested', 'Follow Up', 'Demo Planned', 'Order Expected', 'Converted (Win)', 'Lost'];
    const leadStages = ['All', 'New', 'Introduction', 'Technical Review', 'Quotation', 'Negotiation', 'Order Closed'];

    // 🔥 4. LEADS — cache-first (instant from AsyncStorage, then background
    // refresh from the API). See hooks/useCachedList.ts for how this works
    // and why the cache key must include companyId.
    const leadsCacheKey = buildCacheKey('leads', currentUser?.companyId);
    const {
        data: leadsList,
        loading: leadsLoading,
        refreshing: leadsRefreshing,
        refresh: refreshLeads,
    } = useCachedList({
        cacheKey: leadsCacheKey,
        enabled: !!currentUser?.companyId,
        fetcher: listLeads, // was: fetchSaaSData("leads")
    });

    // 🔥 Team members — cache-first, shares the SAME 'team_members' cache
    // key as manage_team.tsx/employee_timeline.tsx.
    const { data: teamMembersForLeads } = useCachedList({
        cacheKey: buildCacheKey('team_members', currentUser?.companyId),
        enabled: !!currentUser?.companyId && canViewEmployeeFilter,
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

    const getFilteredData = () => {
        let data = Array.isArray(leadsList) ? [...leadsList] : [];

        if (!isMaster) {
            const myId = currentUser?.id || currentUser?.uid;
            data = data.filter((item: any) => 
                item.userId === myId || item.assignedTo === myId || item.senderId === myId || item.senderUid === myId
            );
        }

        if (isMaster && selectedEmployee !== 'All') {
            data = data.filter((item: any) =>
                (item.senderUid === selectedEmployee) || (item.uid === selectedEmployee) || (item.userId === selectedEmployee) || 
                (item.assignedTo === selectedEmployee) || (item.senderName === selectedEmployeeName) || (item.ownerName === selectedEmployeeName)
            );
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (quickFilter === 'overdue') {
            data = data.filter((item: any) => {
                if (!item.nextDate) return false;
                const d = parseDate(item.nextDate);
                return d < today && item.status !== 'Converted (Win)' && item.status !== 'Lost' && item.status !== 'Order Closed';
            });
        } else if (quickFilter === 'today') {
            data = data.filter((item: any) => {
                if (!item.nextDate) return false;
                const d = parseDate(item.nextDate);
                return d.getTime() === today.getTime() && item.status !== 'Converted (Win)' && item.status !== 'Lost';
            });
        } else if (quickFilter === 'hot') {
            data = data.filter((item: any) => (item.isHot === true || item.type === 'Hot') && item.status !== 'Converted (Win)' && item.status !== 'Lost');
        }

        if (!quickFilter) {
            if (activeFilter === 'All') {
                data = data.filter((item: any) => {
                    const s = (item.status || '').toLowerCase().trim();
                    return s !== 'converted (win)' && s !== 'lost' && s !== 'plan drop' && s !== 'order closed';
                });
            } else {
                data = data.filter((item: any) => {
                    const dbStatus = (item.status || 'open').toLowerCase().trim();
                    const filterStatus = activeFilter.toLowerCase().trim();
                    return dbStatus === filterStatus || (filterStatus === 'open' && dbStatus === 'new');
                });
            }

            if (activeStageFilter !== 'All') {
                data = data.filter((item: any) => {
                    return (item.stage || '').toLowerCase().trim() === activeStageFilter.toLowerCase().trim();
                });
            }
        }

        if (searchText) {
            const lowerText = searchText.toLowerCase();
            data = data.filter((item: any) => {
                const fullString = `${item.org || ''} ${item.contactPerson || ''} ${item.status || ''} ${item.stage || ''} ${item.requirements || item.product || ''}`.toLowerCase();
                return fullString.includes(lowerText);
            });
        } 
        else if (viewMode !== 'All' && !quickFilter) {
            const targetYear = currentDate.getFullYear();
            const targetMonth = currentDate.getMonth();
            const targetDay = currentDate.getDate();

            const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
            let fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
            const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); 

            data = data.filter((item: any) => {
                const dateToCheck = item.nextDate || item.dateIso || item.createdAt || item.date;
                if (!dateToCheck) return false;
                const itemDate = parseDate(dateToCheck);
                const itemTime = itemDate.getTime();
                if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
                if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
                if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
                return true;
            });
        }

        data.sort((a: any, b: any) => {
            const dateA = a.nextDate ? parseDate(a.nextDate).getTime() : 0;
            const dateB = b.nextDate ? parseDate(b.nextDate).getTime() : 0;
            if (dateA === 0) return 1;
            if (dateB === 0) return -1;
            return dateA - dateB;
        });

        return data;
    };

    const fullList = getFilteredData(); 
    const renderedList = fullList.slice(0, visibleCount);

    const getActionCounts = () => {
        let baseData = Array.isArray(leadsList) ? [...leadsList] : [];
        
        if (!isMaster) {
            const myId = currentUser?.id || currentUser?.uid;
            baseData = baseData.filter((item: any) => item.userId === myId || item.assignedTo === myId || item.senderId === myId);
        }
        if (isMaster && selectedEmployee !== 'All') {
            baseData = baseData.filter((item: any) => item.senderUid === selectedEmployee || item.userId === selectedEmployee || item.senderName === selectedEmployeeName);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const overdue = baseData.filter((i: any) => i.nextDate && parseDate(i.nextDate) < today && i.status !== 'Converted (Win)' && i.status !== 'Lost' && i.status !== 'Order Closed').length;
        const dueToday = baseData.filter((i: any) => i.nextDate && parseDate(i.nextDate).getTime() === today.getTime() && i.status !== 'Converted (Win)' && i.status !== 'Lost').length;
        const hot = baseData.filter((i: any) => (i.isHot || i.type === 'Hot') && i.status !== 'Converted (Win)' && i.status !== 'Lost').length;

        return { overdue, dueToday, hot };
    };
    const actionCounts = getActionCounts();

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
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                        <Text style={styles.headerTitle}>Leads Pipeline</Text>
                    </View>
                    <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_sales' as any)}>
                        <Ionicons name="add" size={20} color="white" />
                        <Text style={{ color: 'white', fontWeight: 'bold', marginLeft: 2 }}>Cold Call</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={{ backgroundColor: 'white', paddingBottom: 5 }}>
                <View style={styles.actionCardsRow}>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#ffebee', borderColor: quickFilter === 'overdue' ? '#d32f2f' : 'transparent', borderWidth: 1 }]} onPress={() => setQuickFilter(quickFilter === 'overdue' ? '' : 'overdue')}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#d32f2f' }}>{actionCounts.overdue}</Text>
                        <Text style={{ fontSize: 10, color: '#d32f2f', fontWeight: '600' }}>OVERDUE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#fff3e0', borderColor: quickFilter === 'today' ? '#f57c00' : 'transparent', borderWidth: 1 }]} onPress={() => setQuickFilter(quickFilter === 'today' ? '' : 'today')}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#f57c00' }}>{actionCounts.dueToday}</Text>
                        <Text style={{ fontSize: 10, color: '#f57c00', fontWeight: '600' }}>DUE TODAY</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#e8f5e9', borderColor: quickFilter === 'hot' ? '#2e7d32' : 'transparent', borderWidth: 1 }]} onPress={() => setQuickFilter(quickFilter === 'hot' ? '' : 'hot')}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32' }}>{actionCounts.hot}</Text>
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
                <Text style={{ textAlign:'right', fontSize: 12, color: 'gray', paddingHorizontal:15, paddingBottom:5 }}>Total Leads: <Text style={{ fontWeight: 'bold', color: '#3b5998' }}>{fullList.length}</Text></Text>
            </View>

            <FlatList
                data={renderedList}
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
                                    </View>
                                    
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
                                        <Ionicons name="person-circle-outline" size={14} color="gray" />
                                        <Text style={styles.subText}>{item.contactPerson} • {item.city}</Text>
                                    </View>
                                </View>
                            </View>
                            
                            <View style={styles.divider} />
                            
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
                        {visibleCount < fullList.length ? (
                            <TouchableOpacity onPress={() => setVisibleCount(prev => prev + 20)} style={styles.loadMoreBtn}>
                                <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({fullList.length - visibleCount} remaining)</Text>
                            </TouchableOpacity>
                        ) : (
                            fullList.length > 0 ? <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>--- End of Leads ---</Text> : null
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

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { backgroundColor: 'white', paddingTop: 55, paddingBottom: 2, elevation: 2 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, marginBottom: 5 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
    addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b5998', borderRadius: 5, paddingHorizontal: 10, paddingVertical: 6 },

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
