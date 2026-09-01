import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

// 🔥 SAAS IMPORTS (users still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 4: this screen is now FULLY migrated — all four data sources
// (service calls, PMS, demos, installations) come from the new backend API.
// demos was already migrated in Phase 2; the other three complete in Phase 4.
import { listServiceCalls } from '../services/api/serviceCalls';
import { listPmsReports } from '../services/api/pmsReports';
import { listDemos } from '../services/api/demos';
import { listInstallations } from '../services/api/installations';

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
    const router = useRouter();
    
    const { currentUser } = useData(); 
    const { fetchSaaSData, isDbLoading } = useSaaSDB();

    const [serviceList, setServiceList] = useState<any[]>([]);
    const [pmsList, setPmsList] = useState<any[]>([]);
    const [demoList, setDemoList] = useState<any[]>([]);
    const [installationList, setInstallationList] = useState<any[]>([]);
    const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const [reportType, setReportType] = useState('All'); 
    const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY'); 
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [searchText, setSearchText] = useState('');

    const [filteredData, setFilteredData] = useState<any[]>([]);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);

    const [selectedEmployee, setSelectedEmployee] = useState('All'); 
    const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
    const [showEmployeePicker, setShowEmployeePicker] = useState(false);

    const [visibleCount, setVisibleCount] = useState(20);

    const userRole = currentUser?.role ? currentUser.role.toLowerCase() : 'unknown';
    const isAdmin = ['admin', 'manager', 'account', 'superadmin'].includes(userRole);

    useEffect(() => {
        if (viewMode === 'Day') setVisibleCount(500);
        else setVisibleCount(20);
    }, [reportType, viewMode, selectedDate, searchText, selectedEmployee]);

    // 🔥 LOAD DATA — service calls, PMS, demos, installations all via new API; users via Firestore
    const loadAllData = async () => {
        if (currentUser?.companyId) {
            const [services, pms, demos, installs, users] = await Promise.all([
                listServiceCalls(),   // was: fetchSaaSData("service_calls")
                listPmsReports(),     // was: fetchSaaSData("pms_reports")
                listDemos(),          // was: fetchSaaSData("demos")
                listInstallations(),  // was: fetchSaaSData("installations")
                fetchSaaSData("users")
            ]);
            
            setServiceList(services);
            setPmsList(pms);
            setDemoList(demos);
            setInstallationList(installs);

            if (isAdmin) {
                const mappedUsers = users.map((u: any) => ({
                    id: u.id,
                    name: u.name || 'Unknown User'
                }));
                setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
            }
        }
    };

    useEffect(() => {
        loadAllData();
    }, [currentUser]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadAllData();
        setRefreshing(false);
    };

    useEffect(() => {
        let allData: any[] = [];

        if (Array.isArray(installationList)) {
            allData = [...allData, ...installationList.map((i:any) => ({
                ...i,
                reportType: 'Installation',
                displayDate: i.dateIso || i.date || i.installationDate || i.createdAt,
                hospital: i.hospital || i.orgName || i.hospitalName || "Unknown Client",
                orgId: i.orgId || '', 
                engineer: i.engineer || i.senderName || i.userName || "Admin",
                engineerId: i.senderId || i.userId || i.uid, 
                details: `Model: ${i.model || '-'} (${i.product || '-'})`,
                machineDisplay: i.productName || i.product || i.model || '-',
                serialDisplay: i.serialNo || '-',
                status: i.status || 'Installed'
            }))];
        }

        if (Array.isArray(pmsList)) {
            allData = [...allData, ...pmsList.map((i:any) => ({
                ...i,
                reportType: 'PMS',
                displayDate: i.status === 'Done' || i.status === 'Completed' ? (i.dateIso || i.date || i.createdAt) : (i.nextServiceDate || i.scheduledDate || i.dueDate || i.computedDueDate),
                hospital: i.hospitalName || i.hospital || "Unknown", 
                orgId: i.orgId || '', 
                engineer: i.userName || i.engineer || "Admin",
                engineerId: i.userId || i.engineerId || i.uid || i.senderId, 
                details: `Cycle: ${i.currentPmsNumber || '-'}/${i.totalPms || '-'}`,
                machineDisplay: i.machineName || i.machine || '-',
                serialDisplay: i.serialNo || '-',
                status: i.status || 'Pending'
            }))];
        }

        if (Array.isArray(serviceList)) {
            allData = [...allData, ...serviceList.map((i:any) => ({
                ...i,
                reportType: 'Breakdown',
                displayDate: i.dateIso || i.date || i.ticketDate || i.createdAt,
                hospital: i.hospitalName || i.customerName || "Unknown",
                orgId: i.orgId || '', 
                engineer: i.resolvedBy || i.userName || i.assignedTo || "Admin",
                engineerId: i.resolvedById || i.userId || i.assignedToId || i.senderId, 
                details: i.remark || i.complaint || i.issue || "No Issue Listed", 
                status: i.status || 'Pending',
                machineDisplay: i.machine || i.product || '-',
                serialDisplay: i.serialNo || '-'
            }))];
        }

        if (Array.isArray(demoList)) {
            allData = [...allData, ...demoList.map((i:any) => ({
                ...i,
                reportType: 'Demo',
                displayDate: i.dateIso || i.demoDate || i.date || i.createdAt,
                hospital: i.hospitalName || i.doctorName || i.hospital || "Unknown",
                orgId: i.orgId || '', 
                engineer: i.demonstrator || i.userName || i.senderName || "Admin",
                engineerId: i.demonstratorId || i.userId || i.senderId || i.uid, 
                details: `Result: ${i.result || 'Pending'}`,
                machineDisplay: i.product || i.machineName || i.machine || '-',
                serialDisplay: '-',
                status: i.status || 'Pending'
            }))];
        }

        if (isAdmin && selectedEmployee !== 'All') {
            const targetName = selectedEmployeeName.toLowerCase().trim();
            allData = allData.filter(i => 
                (i.engineerId === selectedEmployee) || 
                (i.senderId === selectedEmployee) ||
                ((i.engineer || '').toLowerCase().trim() === targetName) || 
                ((i.senderName || '').toLowerCase().trim() === targetName)
            );
        } else if (!isAdmin) {
            const myId = currentUser?.id || currentUser?.uid;
            allData = allData.filter(i => 
                i.engineerId === myId || 
                i.senderId === myId ||
                ((i.engineer || '').toLowerCase() === (currentUser?.name || '').toLowerCase())
            ); 
        }

        if (reportType !== 'All') {
            allData = allData.filter(i => i.reportType === reportType);
        }

        if (searchText) {
            const lower = searchText.toLowerCase();
            allData = allData.filter(i => {
                const dateStr = (i.displayDate || '').toLowerCase();
                const row = `${dateStr} ${i.hospital || ''} ${i.engineer || ''} ${i.status || ''} ${i.reportType || ''} ${i.details || ''} ${i.serialDisplay || ''} ${i.machineDisplay || ''}`.toLowerCase();
                return row.includes(lower);
            });
        }

        if (viewMode !== 'All') {
            const targetYear = selectedDate.getFullYear();
            const targetMonth = selectedDate.getMonth();
            const targetDay = selectedDate.getDate();

            const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
            let fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
            const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); 

            const APP_LAUNCH_DATE = new Date(2026, 0, 1).getTime();
            if (fyStartDate < APP_LAUNCH_DATE) {
                fyStartDate = APP_LAUNCH_DATE;
            }

            allData = allData.filter(item => {
                const ts = parseDateOnly(item.displayDate);
                if (!ts) return false; 

                const d = new Date(ts);
                const itemTime = d.getTime();
                
                if (viewMode === 'Month') return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
                if (viewMode === 'Day') return d.getFullYear() === targetYear && d.getMonth() === targetMonth && d.getDate() === targetDay;
                if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
                
                return true;
            });
        }

        allData.sort((a, b) => parseDateOnly(b.displayDate) - parseDateOnly(a.displayDate));
        
        setFilteredData(allData);

    }, [serviceList, installationList, pmsList, demoList, searchText, viewMode, selectedDate, reportType, selectedEmployee]);


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

    const renderedList = filteredData.slice(0, visibleCount);

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
            <View style={styles.header}>
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
                    <View style={styles.toggleRow}>
                        {['Day', 'Month', 'FY', 'All'].map((m) => (
                            <TouchableOpacity key={m} style={[styles.toggleBtn, viewMode === m && styles.activeToggle]} onPress={() => setViewMode(m as any)}>
                                <Text style={[styles.toggleText, viewMode === m && {color:'#333', fontWeight:'bold'}]}>{m}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {isAdmin && (
                        <TouchableOpacity 
                            style={styles.employeeFilterBtn} 
                            onPress={() => setShowEmployeePicker(true)}
                        >
                            <Ionicons name="people" size={18} color="#2e7d32" />
                            <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                                {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:'auto'}}/>
                        </TouchableOpacity>
                    )}

                    {viewMode !== 'All' && (
                        <View style={styles.dateNav}>
                            <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={20} color="#555" /></TouchableOpacity>
                            <Text style={styles.dateNavText}>{getHeaderDate()}</Text>
                            <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={20} color="#555" /></TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.searchBox}>
                        {isDbLoading ? <ActivityIndicator size="small" color="#1565c0" /> : <Ionicons name="search" size={18} color="gray" />}
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
                    <Text style={{color:'gray', fontSize:12}}>Total Records: <Text style={{fontWeight:'bold', color:'#333'}}>{filteredData.length}</Text></Text>
                </View>

                <FlatList 
                    data={renderedList}
                    keyExtractor={(item, index) => item.id || index.toString()}
                    contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 50 }}>
                            {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                                <>
                                    <Ionicons name="folder-open-outline" size={40} color="#ccc" />
                                    <Text style={{ color: 'gray', marginTop: 10 }}>No reports found.</Text>
                                </>
                            )}
                        </View>
                    }
                    ListFooterComponent={
                        <View style={{ paddingBottom: 80 }}>
                            {visibleCount < filteredData.length ? (
                                <TouchableOpacity 
                                    onPress={() => setVisibleCount(prev => prev + 20)} 
                                    style={{
                                        padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', elevation: 1
                                    }}
                                >
                                    <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                                        👇 Load More Records ({filteredData.length - visibleCount} remaining)
                                    </Text>
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
    header: { backgroundColor: '#3b5998', paddingTop: 50, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },

    filterContainer: { backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 10, elevation: 2 },
    typeBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0f0f0', marginRight: 8, borderWidth:1, borderColor:'#eee' },
    typeBtnText: { fontWeight: 'bold', fontSize: 13, color: '#555' },

    controlsContainer: { padding: 15, backgroundColor: 'white' },
    toggleRow: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 3, marginBottom: 10 },
    toggleBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
    activeToggle: { backgroundColor: 'white', elevation: 2 },
    toggleText: { color: 'gray', fontSize: 12, fontWeight: '600' },

    employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#2e7d32', marginBottom:10 },

    dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#ddd' },
    dateNavText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

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
