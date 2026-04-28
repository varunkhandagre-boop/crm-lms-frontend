import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import * as XLSX from 'xlsx';

// 🔥 SAAS IMPORTS (Direct Firebase DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

export default function DownloadDetailsScreen() {
    const router = useRouter();
    
    // 🔥 1. Context se sirf logged in User
    const { currentUser } = useData();
    
    // 🔥 2. Naya SaaS Engine
    const { fetchSaaSData } = useSaaSDB();

    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState('');

    // 🔥 3. Lazy Loaded Employee List
    const [userList, setUserList] = useState<any[]>([]);

    // Filters
    const [selectedMonth, setSelectedMonth] = useState(-1); // -1 means "All Months"
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedUser, setSelectedUser] = useState('All');

    // Modals
    const [showYearModal, setShowYearModal] = useState(false);
    const [showMonthModal, setShowMonthModal] = useState(false);

    // Modules Selection
    const [modules, setModules] = useState({
        orders: true,
        collections: true,
        expenses: true,
        leads: true,
        attendance: true,
        installations: false,
        pms: false,
        service: false,
        demos: false,
        couriers: false,
        tasks: false,
        advances: false,
        travel: false,
        leaves: false,
        projects: false
    });

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const currentYearVal = new Date().getFullYear(); 
    const startYear = 2024; 
    const years = Array.from({length: (currentYearVal - startYear) + 2}, (_, i) => startYear + i);

    // 🔥 4. LOAD USERS ON MOUNT
    useEffect(() => {
        const loadUsers = async () => {
            if (currentUser?.companyId) {
                const users = await fetchSaaSData("users");
                setUserList(users);
            }
        };
        loadUsers();
    }, [currentUser]);

    // Helper to filter data by date & user
    const filterData = (data: any[], dateField: string, userField: string) => {
        return data.filter(item => {
            // Date Logic
            const val = item[dateField] || item.dateIso || item.createdAt || item.date;
            if(!val) return false;
            
            const d = new Date(val);
            const isYearMatch = d.getFullYear() === selectedYear;
            
            // If selectedMonth is -1, we want ALL months (ignore month check)
            const isMonthMatch = selectedMonth === -1 ? true : d.getMonth() === selectedMonth;
            
            // User Logic
            let isUserMatch = true;
            if (selectedUser !== 'All') {
                const uId = item[userField] || item.userId || item.senderId || item.uid;
                const uName = item.userName || item.senderName || item.name;
                isUserMatch = (uId === selectedUser) || (uName === selectedUser);
            }

            return isYearMatch && isMonthMatch && isUserMatch;
        });
    };

    // 🔥 5. SAAS DATA FETCH ENGINE FOR EXCEL
    const fetchAndAddSheet = async (wb: any, colName: string, sheetName: string, dateField: string, userField: string) => {
        if (!modules[sheetName.toLowerCase() as keyof typeof modules] && !modules[colName as keyof typeof modules]) return false;
        
        setProgress(`Fetching ${sheetName}...`);
        
        try {
            // SAAS MAGIC: Automatically fetches only current company's data
            const rawData = await fetchSaaSData(colName);
            
            // 🔥 FIX: Added (d: any) to tell TypeScript to accept dynamic properties
            const cleanRawData = rawData.map((d: any) => {
                const { location, items, history, outLocation, partsUsed, ...cleanData } = d; 
                return cleanData;
            });

            const filtered = filterData(cleanRawData, dateField, userField);

            if (filtered.length > 0) {
                const ws = XLSX.utils.json_to_sheet(filtered);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
                return true;
            }
        } catch (e) {
            console.log(`Error in ${sheetName}:`, e);
        }
        return false;
    };

    const generateExcel = async () => {
        setLoading(true);
        setProgress("Preparing...");
        
        try {
            const wb = XLSX.utils.book_new(); 
            let hasData = false;

            // Fetch Modules dynamically through SaaS Engine
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

            if (!hasData) {
                Alert.alert("No Data", "No records found for the selected period.");
                setLoading(false);
                setProgress('');
                return;
            }

            setProgress("Generating File...");
            
            // Dynamic Filename
            const timeLabel = selectedMonth === -1 ? "FullYear" : months[selectedMonth];
            const fileName = `Report_${timeLabel}_${selectedYear}.xlsx`;
            
            const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const uri = FileSystem.cacheDirectory + fileName;

            await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });

            await Sharing.shareAsync(uri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: `Download Report: ${fileName}`
            });

        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
            setProgress('');
        }
    };

    const ToggleRow = ({label, field}: {label: string, field: keyof typeof modules}) => (
        <TouchableOpacity 
            style={styles.row} 
            onPress={() => setModules({...modules, [field]: !modules[field]})}
        >
            <Text style={styles.label}>{label}</Text>
            <Switch 
                value={modules[field]} 
                onValueChange={(val) => setModules({...modules, [field]: val})} 
                trackColor={{false: "#767577", true: "#81b0ff"}}
                thumbColor={modules[field] ? "#3b5998" : "#f4f3f4"}
            />
        </TouchableOpacity>
    );

    return (
        <View style={{flex:1, backgroundColor:'#f4f6f8'}}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Download Reports 📊</Text>
                <View style={{width:24}}/>
            </View>

            <ScrollView contentContainerStyle={styles.container}>
                
                {/* 1. COMPACT DATE FILTER */}
                <View style={styles.card}>
                    <Text style={styles.cardHeader}>1. Select Period</Text>
                    <View style={styles.filterRow}>
                        {/* Year Selector */}
                        <TouchableOpacity style={styles.dropdown} onPress={() => setShowYearModal(true)}>
                            <Ionicons name="calendar" size={20} color="#3b5998" />
                            <Text style={styles.dropdownText}>{selectedYear}</Text>
                            <Ionicons name="chevron-down" size={16} color="gray" />
                        </TouchableOpacity>

                        {/* Month Selector */}
                        <TouchableOpacity style={styles.dropdown} onPress={() => setShowMonthModal(true)}>
                            <Ionicons name="calendar-outline" size={20} color="#3b5998" />
                            <Text style={styles.dropdownText}>
                                {selectedMonth === -1 ? "All Months (Full Year)" : months[selectedMonth]}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color="gray" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 2. EMPLOYEE FILTER */}
                <View style={styles.card}>
                    <Text style={styles.cardHeader}>2. Select Staff (Optional)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{marginTop:10}}>
                        <TouchableOpacity style={[styles.chip, selectedUser === 'All' && styles.activeChip]} onPress={() => setSelectedUser('All')}>
                            <Text style={[styles.chipText, selectedUser === 'All' && {color:'white'}]}>All Staff</Text>
                        </TouchableOpacity>
                        {userList.map((u: any) => (
                             u.companyId === currentUser?.companyId && (
                                <TouchableOpacity key={u.id} style={[styles.chip, selectedUser === u.id && styles.activeChip]} onPress={() => setSelectedUser(u.id)}>
                                    <Text style={[styles.chipText, selectedUser === u.id && {color:'white'}]}>{u.name}</Text>
                                </TouchableOpacity>
                             )
                        ))}
                    </ScrollView>
                </View>

                {/* 3. MODULES FILTER */}
                <View style={styles.card}>
                    <Text style={styles.cardHeader}>3. Select Data to Download</Text>
                    <Text style={{fontSize:10, color:'gray', marginBottom:10}}>Toggle On to include in Excel</Text>
                    
                    <View style={styles.grid}>
                        <View style={styles.col}>
                            <ToggleRow label="Orders" field="orders" />
                            <ToggleRow label="Collections" field="collections" />
                            <ToggleRow label="Expenses" field="expenses" />
                            <ToggleRow label="Leads" field="leads" />
                            <ToggleRow label="Attendance" field="attendance" />
                        </View>
                        <View style={styles.col}>
                            <ToggleRow label="Service Calls" field="service" />
                            <ToggleRow label="PMS Reports" field="pms" />
                            <ToggleRow label="Installations" field="installations" />
                            <ToggleRow label="Travel" field="travel" />
                            <ToggleRow label="Leaves" field="leaves" />
                        </View>
                    </View>
                    <View style={styles.grid}>
                        <View style={styles.col}><ToggleRow label="Couriers" field="couriers" /></View>
                        <View style={styles.col}><ToggleRow label="Demos" field="demos" /></View>
                    </View>
                    <View style={styles.grid}>
                        <View style={styles.col}><ToggleRow label="Tasks" field="tasks" /></View>
                        <View style={styles.col}><ToggleRow label="Advances" field="advances" /></View>
                    </View>
                    <View style={styles.grid}><View style={styles.col}><ToggleRow label="Projects" field="projects" /></View></View>
                </View>

                <TouchableOpacity style={styles.downloadBtn} onPress={generateExcel} disabled={loading}>
                    {loading ? (
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <ActivityIndicator color="white" />
                            <Text style={[styles.btnText, {fontSize:14, marginLeft:10}]}>{progress}</Text>
                        </View>
                    ) : (
                        <>
                            <Ionicons name="cloud-download-outline" size={24} color="white" />
                            <Text style={styles.btnText}>Generate Excel</Text>
                        </>
                    )}
                </TouchableOpacity>
                <View style={{height:50}}/>
            </ScrollView>

            {/* YEAR MODAL */}
            <Modal visible={showYearModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Year</Text>
                        {years.map(y => (
                            <TouchableOpacity key={y} style={styles.modalItem} onPress={() => { setSelectedYear(y); setShowYearModal(false); }}>
                                <Text style={[styles.modalText, selectedYear === y && {color:'#3b5998', fontWeight:'bold'}]}>{y}</Text>
                                {selectedYear === y && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowYearModal(false)}>
                            <Text style={{color:'red'}}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* MONTH MODAL */}
            <Modal visible={showMonthModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, {maxHeight: 500}]}>
                        <Text style={styles.modalTitle}>Select Month</Text>
                        <ScrollView>
                            {/* Option for ALL YEAR */}
                            <TouchableOpacity style={styles.modalItem} onPress={() => { setSelectedMonth(-1); setShowMonthModal(false); }}>
                                <Text style={[styles.modalText, selectedMonth === -1 && {color:'#3b5998', fontWeight:'bold'}]}>All Months (Full Year)</Text>
                                {selectedMonth === -1 && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                            </TouchableOpacity>
                            
                            {/* Individual Months */}
                            {months.map((m, i) => (
                                <TouchableOpacity key={m} style={styles.modalItem} onPress={() => { setSelectedMonth(i); setShowMonthModal(false); }}>
                                    <Text style={[styles.modalText, selectedMonth === i && {color:'#3b5998', fontWeight:'bold'}]}>{m}</Text>
                                    {selectedMonth === i && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowMonthModal(false)}>
                            <Text style={{color:'red'}}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { padding: 15 },
    header: { flexDirection:'row', justifyContent:'space-between', padding:15, paddingTop:50, backgroundColor:'white', alignItems:'center', elevation:2 },
    headerTitle: { fontSize:18, fontWeight:'bold', color:'#3b5998' },
    card: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 1 },
    cardHeader: { fontSize: 14, fontWeight: 'bold', color: '#555', borderBottomWidth:1, borderBottomColor:'#eee', paddingBottom:5 },
    
    filterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 10 },
    dropdown: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f4ff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d1d9ff', justifyContent: 'space-between' },
    dropdownText: { fontSize: 14, fontWeight: 'bold', color: '#333' },

    chip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f0f0f0', borderRadius: 20, marginRight: 5, marginBottom: 5 },
    activeChip: { backgroundColor: '#3b5998' },
    chipText: { fontSize: 12, fontWeight: '600', color: '#555' },
    
    grid: { flexDirection: 'row', justifyContent: 'space-between' },
    col: { width: '48%' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, paddingVertical: 5, borderBottomWidth: 1, borderColor: '#f9f9f9' },
    label: { fontSize: 13, color: '#333' },
    
    downloadBtn: { backgroundColor: '#2e7d32', padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, elevation: 3 },
    btnText: { color: 'white', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '90%', backgroundColor: 'white', borderRadius: 12, padding: 20, elevation: 5 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
    modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
    modalText: { fontSize: 16, color: '#333' },
    closeBtn: { marginTop: 15, alignItems: 'center', padding: 10 }
});