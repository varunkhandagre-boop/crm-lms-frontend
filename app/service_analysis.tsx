import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
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

import { useData } from './context/DataContext';
// 🔥 Phase 4: this screen is now FULLY migrated — all four data sources
// (service calls, PMS, demos, installations) come from the new backend API.
// demos was already migrated in Phase 2; the other three complete in Phase 4.
import { listServiceAnalysisPage, ServiceAnalysisFilters, ServiceReportType } from '../services/api/serviceAnalysis';
import { useServerPagedList } from '../hooks/useServerPagedList';
import { isCurrentFy, periodRange, useDebounced } from '../utils/periodRange';
import { fetchTeamMembers } from '../services/api/users';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { PeriodTabs, StaffPeriodRow } from '../components/compact';
import { Pill, TableColumn, TableHeader, TableRow, TwoLine } from '../components/DesktopTable';
import { useIsDesktop } from '../hooks/useIsDesktop';

const parseDateOnly = (dateStr: any) => {
    if (!dateStr) return 0;
    if (typeof dateStr === 'number') return dateStr; 
    if (dateStr instanceof Date) return dateStr.getTime();

    if (typeof dateStr === 'string') {
        let cleanStr = dateStr.replace(/[\.\-]/g, '/');
        const parts = cleanStr.split('/');
        
        if (parts.length === 3) {
           if (parts[0].length === 4) {
               return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
           }
           if (parts[2].length === 4) {
               return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
           }
        }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
};

export default function AnalysisScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    
    const { currentUser } = useData(); 

    // below, sharing cache keys with service_call.tsx / pms_schedule.tsx /
    // demo.tsx / installation.tsx respectively.
    const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);

    const [reportType, setReportType] = useState('All'); 
    const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY'); 
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [searchText, setSearchText] = useState('');

    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);

    const [selectedEmployee, setSelectedEmployee] = useState('All'); 
    const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
    const [showEmployeePicker, setShowEmployeePicker] = useState(false);


    const userRole = currentUser?.role ? currentUser.role.toLowerCase() : 'unknown';
    const isAdmin = ['admin', 'manager', 'account', 'superadmin'].includes(userRole);


    // 🔥 INSTALLATIONS + PMS + BREAKDOWNS + DEMOS — merged, filtered and paged on
    // the server (20 at a time), with the engineer's name on each record.
    const debouncedSearch = useDebounced(searchText.trim());
    const analysisFilters = useMemo<ServiceAnalysisFilters>(() => ({
        type: reportType as ServiceReportType,
        ...periodRange(viewMode, selectedDate),
        userId: isAdmin && selectedEmployee !== 'All' ? selectedEmployee : undefined,
        search: debouncedSearch || undefined,
    }), [reportType, viewMode, selectedDate, isAdmin, selectedEmployee, debouncedSearch]);
    const isDefaultView = reportType === 'All' && isCurrentFy(viewMode, selectedDate) && selectedEmployee === 'All' && !debouncedSearch;
    const {
        items: filteredData,
        total: analysisTotal,
        loading: isAnalysisLoading,
        loadingMore: analysisLoadingMore,
        hasMore: analysisHasMore,
        loadMore: loadMoreAnalysis,
        refreshing,
        refresh: onRefresh,
        error: analysisError,
    } = useServerPagedList<ServiceAnalysisFilters, any>({
        fetchPage: listServiceAnalysisPage,
        filters: analysisFilters,
        enabled: !!currentUser?.companyId,
        cacheKey: isDefaultView ? buildCacheKey('service_analysis_page1_v1', currentUser?.companyId) : null,
    });

    // 🔥 Team members — cache-first, shares the SAME 'team_members' cache
    // key as manage_team.tsx/employee_timeline.tsx. Was previously calling
    // fetchSaaSData("users") — a stale Firestore collection reference from
    // before this project migrated users to Postgres — which is why this
    // screen's employee picker was coming back empty.
    const { data: teamMembersForServiceAnalysis } = useCachedList({
        cacheKey: buildCacheKey('team_members', currentUser?.companyId),
        enabled: !!currentUser?.companyId,
        fetcher: fetchTeamMembers,
    });
    useEffect(() => {
        if (isAdmin) {
            const mappedUsers = teamMembersForServiceAnalysis.map((u: any) => ({
                id: u.id,
                name: u.name || 'Unknown User'
            }));
            setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
        }
    }, [teamMembersForServiceAnalysis, isAdmin]);



    const changeDate = (dir: number) => {
        const d = new Date(selectedDate);
        if (viewMode === 'Day') d.setDate(d.getDate() + dir);
        else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
        else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
        setSelectedDate(d);
    };

    const formatDate = (dateStr: any) => {
        if (!dateStr) return "-";
        const ts = parseDateOnly(dateStr); 
        if(!ts) return dateStr;
        return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    const getHeaderDate = () => {
        if (viewMode === 'Day') return selectedDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
        if (viewMode === 'Month') return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (viewMode === 'FY') {
            const m = selectedDate.getMonth(); 
            const y = selectedDate.getFullYear();
            const startY = m >= 3 ? y : y - 1;
            return `FY ${startY.toString().slice(-2)}-${(startY + 1).toString().slice(-2)}`;
        }
        return "All Records";
    };

    const getColor = (type: string) => {
        switch (type) {
            case 'PMS': return '#8e44ad'; 
            case 'Installation': return '#27ae60'; 
            case 'Breakdown': return '#c0392b'; 
            case 'Demo': return '#00acc1'; 
            default: return '#333';
        }
    };

    const handleItemClick = (item: any) => {
        setSelectedItem(item);
        setDetailModalVisible(true);
    };


    const isDesktop = useIsDesktop();
    const DONE = ['Done', 'Completed', 'Closed', 'Installed', 'Successful', 'Resolved'];
    const columns: TableColumn<any>[] = [
        { key: 'date', label: 'Date', width: 110, render: (i) => formatDate(i.displayDate) },
        { key: 'type', label: 'Type', width: 130, render: (i) => <Pill text={i.reportType || '-'} color="#fff" bg={getColor(i.reportType)} /> },
        { key: 'party', label: 'Hospital / Client', flex: 2, render: (i) => i.hospital || '-' },
        { key: 'machine', label: 'Machine / Serial', flex: 2, render: (i) => <TwoLine main={i.machineDisplay || '-'} sub={i.serialDisplay && i.serialDisplay !== '-' ? i.serialDisplay : undefined} /> },
        { key: 'details', label: 'Details', flex: 2, render: (i) => i.details || '-' },
        { key: 'engineer', label: 'Engineer', flex: 1, render: (i) => i.engineer || '-' },
        { key: 'status', label: 'Status', width: 120, render: (i) => DONE.includes(i.status)
            ? <Pill text={i.status} color="#2e7d32" bg="#e8f5e9" />
            : <Pill text={i.status || '-'} color="#e65100" bg="#fff3e0" /> },
    ];

    const renderItem = ({ item }: any) => {
        const isDone = ['Done', 'Completed', 'Closed', 'Installed', 'Successful', 'Resolved'].includes(item.status);
        const color = getColor(item.reportType);

        return (
            <TouchableOpacity onPress={() => handleItemClick(item)} style={[styles.card, { borderLeftColor: color }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{item.hospital}</Text>
                        
                        <View style={{flexDirection:'row', alignItems:'center', marginTop:2}}>
                             <Ionicons name="cube-outline" size={12} color="#666" />
                             <Text style={{fontSize:12, color:'#444', marginLeft:4, fontWeight:'500'}} numberOfLines={1}>
                                {item.machineDisplay} {item.serialDisplay !== '-' ? `(${item.serialDisplay})` : ''}
                             </Text>
                        </View>

                        <Text style={styles.cardSub} numberOfLines={1}>{item.details}</Text>
                        
                        <View style={{flexDirection:'row', alignItems:'center', marginTop:5}}>
                            <View style={[styles.tag, {backgroundColor: color}]}>
                                <Text style={styles.tagText}>{item.reportType}</Text>
                            </View>
                            <Text style={styles.dateText}>📅 {formatDate(item.displayDate)}</Text>
                        </View>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.statusText, { color: isDone ? 'green' : 'orange' }]}>{item.status}</Text>
                        <Text style={styles.engName}>👷 {item.engineer?.split(' ')[0]}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Master Reports</Text>
                <View style={{width:24}} /> 
            </View>

            <View style={{ flex: 1 }}>
                
                <View style={styles.filterContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:20}}>
                        {['All', 'PMS', 'Installation', 'Breakdown', 'Demo'].map((type) => (
                            <TouchableOpacity 
                                key={type} 
                                style={[styles.typeBtn, reportType === type && { backgroundColor: getColor(type), borderColor: getColor(type) }]} 
                                onPress={() => setReportType(type)}
                            >
                                <Text style={[styles.typeBtnText, reportType === type && { color: 'white' }]}>{type}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.controlsContainer}>
                    <PeriodTabs value={viewMode} onChange={setViewMode} style={{ marginHorizontal: 0, marginTop: 0 }} />
                    <View style={{ marginHorizontal: -12 }}>
                        <StaffPeriodRow
                            showStaff={isAdmin}
                            staffLabel={selectedEmployee === 'All' ? 'All Staff' : selectedEmployeeName}
                            onStaffPress={() => setShowEmployeePicker(true)}
                            periodLabel={viewMode !== 'All' ? getHeaderDate() : undefined}
                            onPrev={() => changeDate(-1)}
                            onNext={() => changeDate(1)}
                        />
                    </View>

                    <View style={styles.searchBox}>
                        {isAnalysisLoading ? <ActivityIndicator size="small" color="#1565c0" /> : <Ionicons name="search" size={18} color="gray" />}
                        <TextInput 
                            style={styles.input} 
                            placeholder="Search Hospital, Serial..." 
                            value={searchText} 
                            onChangeText={setSearchText} 
                        />
                        {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close" size={18} color="gray" /></TouchableOpacity>}
                    </View>
                </View>

                <View style={styles.countStrip}>
                    <Text style={{color:'gray', fontSize:12}}>Total Records: <Text style={{fontWeight:'bold', color:'#333'}}>{analysisTotal}</Text></Text>
                </View>

                <FlatList 
                    data={filteredData}
                    keyExtractor={(item, index) => item.rowKey || item.id || index.toString()}
                    contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
                    renderItem={isDesktop
                        ? ({ item, index }) => <TableRow columns={columns} item={item} index={index} tint={getColor(item.reportType)} onPress={() => handleItemClick(item)} />
                        : renderItem}
                    ListHeaderComponent={isDesktop && filteredData.length > 0 ? <TableHeader columns={columns} /> : null}
                    stickyHeaderIndices={isDesktop && filteredData.length > 0 ? [0] : undefined}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 50 }}>
                            {isAnalysisLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                                <>
                                    <Ionicons name="folder-open-outline" size={40} color="#ccc" />
                                    <Text style={{ color: 'gray', marginTop: 10 }}>{analysisError ? 'Could not load reports — pull down to retry.' : 'No reports found.'}</Text>
                                </>
                            )}
                        </View>
                    }
                    ListFooterComponent={
                        <View style={{ paddingBottom: 80 }}>
                            {analysisHasMore ? (
                                <TouchableOpacity
                                    onPress={loadMoreAnalysis}
                                    disabled={analysisLoadingMore}
                                    style={{
                                        padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', elevation: 1
                                    }}
                                >
                                    {analysisLoadingMore ? <ActivityIndicator color="#3b5998" /> : (
                            <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({analysisTotal - filteredData.length} remaining)</Text>
                        )}
                                </TouchableOpacity>
                            ) : (
                                filteredData.length > 0 ? (
                                    <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                                        --- End of List ---
                                    </Text>
                                ) : null
                            )}
                        </View>
                    }
                />

            </View>

            <Modal visible={detailModalVisible} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.detailCard}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15, borderBottomWidth:1, borderColor:'#eee', paddingBottom:10}}>
                            <Text style={{fontSize:18, fontWeight:'bold', color: selectedItem ? getColor(selectedItem.reportType) : '#333'}}>
                                {selectedItem?.reportType} Details
                            </Text>
                            <TouchableOpacity onPress={() => setDetailModalVisible(false)}><Ionicons name="close-circle" size={28} color="#d32f2f" /></TouchableOpacity>
                        </View>

                        {selectedItem && (
                            <ScrollView style={{maxHeight: 400}} showsVerticalScrollIndicator={false}>
                                <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}>
                                    <Text style={{fontWeight:'bold', fontSize:16}}>{formatDate(selectedItem.displayDate)}</Text>
                                    <Text style={{fontWeight:'bold', color: 'green'}}>{selectedItem.status}</Text>
                                </View>

                                <DetailRow label="Hospital" value={selectedItem.hospital} />
                                <DetailRow label="Engineer" value={selectedItem.engineer} />
                                <DetailRow label="Machine" value={selectedItem.machineDisplay} />
                                <DetailRow label="Serial No" value={selectedItem.serialDisplay} />

                                {selectedItem.reportType === 'Installation' && (
                                    <View style={[styles.infoBox, {backgroundColor:'#e8f5e9'}]}>
                                        <Text style={{fontWeight:'bold', color:'#27ae60', marginBottom:5}}>⚙️ Installation Data</Text>
                                        <Text>Warranty Exp: {selectedItem.warrantyExpiry ? formatDate(selectedItem.warrantyExpiry) : '-'}</Text>
                                        <Text>Dept: {selectedItem.department || '-'}</Text>
                                        <Text>Note: {selectedItem.note || '-'}</Text>
                                    </View>
                                )}

                                {selectedItem.reportType === 'PMS' && (
                                    <View style={[styles.infoBox, {backgroundColor:'#f3e5f5'}]}>
                                        <Text style={{fontWeight:'bold', color:'#8e44ad', marginBottom:5}}>🔄 PMS Cycle</Text>
                                        <Text>Cycle: {selectedItem.currentPmsNumber} / {selectedItem.totalPms}</Text>
                                        <Text>Next Due: {formatDate(selectedItem.nextServiceDate || selectedItem.computedDueDate)}</Text>
                                    </View>
                                )}

                                {selectedItem.reportType === 'Breakdown' && (
                                    <View style={[styles.infoBox, {backgroundColor:'#ffebee'}]}>
                                        <Text style={{fontWeight:'bold', color:'#c0392b', marginBottom:5}}>⚠️ Issue Report</Text>
                                        <Text style={{fontWeight:'bold', fontSize:12, color:'#555'}}>Complaint:</Text>
                                        <Text style={{color:'#333', marginBottom:8}}>{selectedItem.details}</Text>
                                        <Text style={{fontWeight:'bold', fontSize:12, color:'#555'}}>Resolution:</Text>
                                        <Text style={{color:'#333'}}>{selectedItem.resolutionNote || '-'}</Text>
                                    </View>
                                )}

                                {selectedItem.reportType === 'Demo' && (
                                    <View style={[styles.infoBox, {backgroundColor:'#e0f7fa'}]}>
                                        <Text style={{fontWeight:'bold', color:'#0097a7', marginBottom:5}}>🎭 Demo Info</Text>
                                        <Text>Contact: {selectedItem.contactPerson || '-'}</Text>
                                        <Text>Result: {selectedItem.result || '-'}</Text>
                                    </View>
                                )}

                                {(selectedItem.remark || selectedItem.remarks) && (
                                    <View style={{marginTop:10}}>
                                        <Text style={{fontWeight:'bold', color:'gray'}}>Remarks:</Text>
                                        <Text style={{color:'#333'}}>{selectedItem.remark || selectedItem.remarks}</Text>
                                    </View>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal visible={showEmployeePicker} transparent animationType="fade">
                <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerHeader}>Select Employee View</Text>
                        <FlatList 
                          data={employees} 
                          keyExtractor={item => item.id} 
                          renderItem={({item}) => (
                            <TouchableOpacity 
                              style={styles.pickerItem} 
                              onPress={() => { 
                                  setSelectedEmployee(item.id); 
                                  setSelectedEmployeeName(item.name); 
                                  setShowEmployeePicker(false); 
                              }}
                            >
                                <View style={{flexDirection:'row', alignItems:'center'}}>
                                   <Ionicons name="person-circle" size={24} color="#555" style={{marginRight:10}}/>
                                   <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                                </View>
                                {selectedEmployee === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                            </TouchableOpacity>
                        )} />
                    </View>
                </TouchableOpacity>
            </Modal>

        </View>
    );
}

const DetailRow = ({label, value}: any) => (
    <View style={{marginBottom:8}}>
        <Text style={{color:'gray', fontSize:12}}>{label}</Text>
        <Text style={{fontWeight:'bold', fontSize:14, color:'#333'}}>{value || '-'}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#3b5998', padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },

    filterContainer: { backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 10, elevation: 2 },
    typeBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0f0f0', marginRight: 8, borderWidth:1, borderColor:'#eee' },
    typeBtnText: { fontWeight: 'bold', fontSize: 13, color: '#555' },

    controlsContainer: { padding: 12, backgroundColor: 'white' },



    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 8, paddingHorizontal: 10, height: 40, borderWidth:1, borderColor:'#ddd' },
    input: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

    countStrip: { flexDirection:'row', justifyContent:'flex-end', paddingHorizontal:15, paddingVertical: 5 },

    card: { backgroundColor: 'white', padding: 12, borderRadius: 10, marginBottom: 10, elevation: 2, borderLeftWidth: 5 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#333' },
    cardSub: { fontSize: 12, color: '#666', marginTop: 2 },
    tag: { paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginRight:8 },
    tagText: { color:'white', fontSize:10, fontWeight:'bold' },
    dateText: { fontSize: 11, color: 'gray' },
    statusText: { fontSize: 12, fontWeight: 'bold', textAlign:'right' },
    engName: { fontSize: 11, color: '#555', marginTop: 2, textAlign:'right' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    detailCard: { backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5, maxHeight: '80%', width:'100%' },
    infoBox: { padding: 10, borderRadius: 8, marginTop: 10 },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
    pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
    pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
    pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});
