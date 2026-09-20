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

import { useData } from './context/DataContext';
import { fetchTeamMembers } from '../services/api/users';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

// 🔥 New Postgres backend adapters replacing fetchSaaSData() per module
import { listAdvances } from '../services/api/advances';
import { fetchAttendance } from '../services/api/attendance';
import { fetchCouriers } from '../services/api/couriers';
import { listDemos } from '../services/api/demos';
import { listExpenses } from '../services/api/expenses';
import { listInstallations } from '../services/api/installations';
import { listLeads } from '../services/api/leads';
import { fetchLeaves } from '../services/api/leaves';
import { listOrders } from '../services/api/orders';
import { listPaymentCollections } from '../services/api/paymentCollections';
import { listPmsReports } from '../services/api/pmsReports';
import { listProjects } from '../services/api/projects';
import { listServiceCalls } from '../services/api/serviceCalls';
import { fetchTasks } from '../services/api/tasks';
import { fetchTravelNotes } from '../services/api/travelNotes';

export default function DownloadDetailsScreen() {
    const router = useRouter();

    const { currentUser } = useData();

    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState('');

    // userList now comes from useCachedList below (cache-first, shared 'team_members' key)

    const [selectedMonth, setSelectedMonth] = useState(-1); // -1 = All Months
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedUser, setSelectedUser] = useState('All');

    const [showYearModal, setShowYearModal] = useState(false);
    const [showMonthModal, setShowMonthModal] = useState(false);

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
    const years = Array.from({ length: (currentYearVal - startYear) + 2 }, (_, i) => startYear + i);

    const userRole = (currentUser?.role || '').toLowerCase();
    const isAdmin = userRole.includes('admin') || userRole.includes('manager') || userRole.includes('superadmin');

    // 🔥 Team members — cache-first, shares the SAME 'team_members' cache
    // key as manage_team.tsx/employee_timeline.tsx. Was previously calling
    // fetchSaaSData("users") — a stale Firestore reference from before this
    // project migrated users to Postgres.
    const { data: userList } = useCachedList({
        cacheKey: buildCacheKey('team_members', currentUser?.companyId),
        enabled: !!currentUser?.companyId,
        fetcher: fetchTeamMembers,
    });

    // Native date-range params for the adapters that support them
    // (attendance/couriers/tasks/travel/leaves) — the rest filter client-side
    // over whatever the adapter's default page returns.
    const getDateRangeParams = () => {
        if (selectedMonth === -1) {
            return { fromDate: `${selectedYear}-01-01`, toDate: `${selectedYear}-12-31` };
        }
        const mm = String(selectedMonth + 1).padStart(2, '0');
        const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        return { fromDate: `${selectedYear}-${mm}-01`, toDate: `${selectedYear}-${mm}-${lastDay}` };
    };

    // Client-side filter for modules whose adapters don't accept date/user
    // params directly (orders, collections, expenses, leads, installations,
    // pms, service, demos, advances, projects).
    const filterData = (data: any[]) => {
        return data.filter(item => {
            const val = item.dateIso || item.date || item.createdAt;
            if (!val) return false;

            const d = new Date(val);
            const isYearMatch = d.getFullYear() === selectedYear;
            const isMonthMatch = selectedMonth === -1 ? true : d.getMonth() === selectedMonth;

            let isUserMatch = true;
            if (selectedUser !== 'All') {
                isUserMatch = item.senderId === selectedUser || item.userId === selectedUser;
            }

            return isYearMatch && isMonthMatch && isUserMatch;
        });
    };

    const addSheetIfData = (wb: any, data: any[], sheetName: string): boolean => {
        if (!data || data.length === 0) return false;
        const cleanData = data.map((d: any) => {
            const { location, items, history, checkInLocation, checkOutLocation, ...clean } = d;
            return clean;
        });
        const ws = XLSX.utils.json_to_sheet(cleanData);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        return true;
    };

    const generateExcel = async () => {
        setLoading(true);
        setProgress("Preparing...");

        try {
            const wb = XLSX.utils.book_new();
            let hasData = false;
            const { fromDate, toDate } = getDateRangeParams();
            const scopeUserId = selectedUser !== 'All' ? selectedUser : (isAdmin ? 'all' : undefined);

            if (modules.orders) {
                setProgress("Fetching Orders...");
                try {
                    const data = filterData(await listOrders());
                    if (addSheetIfData(wb, data, "Orders")) hasData = true;
                } catch (e) { console.log("Orders fetch error:", e); }
            }

            if (modules.collections) {
                setProgress("Fetching Collections...");
                try {
                    const data = filterData(await listPaymentCollections());
                    if (addSheetIfData(wb, data, "Collections")) hasData = true;
                } catch (e) { console.log("Collections fetch error:", e); }
            }

            if (modules.expenses) {
                setProgress("Fetching Expenses...");
                try {
                    const data = filterData(await listExpenses());
                    if (addSheetIfData(wb, data, "Expenses")) hasData = true;
                } catch (e) { console.log("Expenses fetch error:", e); }
            }

            if (modules.leads) {
                setProgress("Fetching Leads...");
                try {
                    const data = filterData(await listLeads());
                    if (addSheetIfData(wb, data, "Leads")) hasData = true;
                } catch (e) { console.log("Leads fetch error:", e); }
            }

            if (modules.attendance) {
                setProgress("Fetching Attendance...");
                try {
                    const data = await fetchAttendance({ userId: scopeUserId, fromDate, toDate, limit: 2000 });
                    if (addSheetIfData(wb, data, "Attendance")) hasData = true;
                } catch (e) { console.log("Attendance fetch error:", e); }
            }

            if (modules.installations) {
                setProgress("Fetching Installations...");
                try {
                    const data = filterData(await listInstallations());
                    if (addSheetIfData(wb, data, "Installations")) hasData = true;
                } catch (e) { console.log("Installations fetch error:", e); }
            }

            if (modules.pms) {
                setProgress("Fetching PMS...");
                try {
                    const data = filterData(await listPmsReports());
                    if (addSheetIfData(wb, data, "PMS")) hasData = true;
                } catch (e) { console.log("PMS fetch error:", e); }
            }

            if (modules.service) {
                setProgress("Fetching Service Calls...");
                try {
                    const data = filterData(await listServiceCalls());
                    if (addSheetIfData(wb, data, "ServiceCalls")) hasData = true;
                } catch (e) { console.log("Service fetch error:", e); }
            }

            if (modules.demos) {
                setProgress("Fetching Demos...");
                try {
                    const data = filterData(await listDemos());
                    if (addSheetIfData(wb, data, "Demos")) hasData = true;
                } catch (e) { console.log("Demos fetch error:", e); }
            }

            if (modules.couriers) {
                setProgress("Fetching Couriers...");
                try {
                    const data = filterData(await fetchCouriers({ fromDate, toDate, limit: 2000 }));
                    if (addSheetIfData(wb, data, "Couriers")) hasData = true;
                } catch (e) { console.log("Couriers fetch error:", e); }
            }

            if (modules.tasks) {
                setProgress("Fetching Tasks...");
                try {
                    const [given, received] = await Promise.all([
                        fetchTasks({ direction: 'given', userId: scopeUserId, fromDate, toDate, limit: 2000 }),
                        fetchTasks({ direction: 'received', userId: scopeUserId, fromDate, toDate, limit: 2000 }),
                    ]);
                    const merged = Array.from(new Map([...given, ...received].map((t: any) => [t.id, t])).values());
                    if (addSheetIfData(wb, merged, "Tasks")) hasData = true;
                } catch (e) { console.log("Tasks fetch error:", e); }
            }

            if (modules.advances) {
                setProgress("Fetching Advances...");
                try {
                    const data = filterData(await listAdvances());
                    if (addSheetIfData(wb, data, "Advances")) hasData = true;
                } catch (e) { console.log("Advances fetch error:", e); }
            }

            if (modules.travel) {
                setProgress("Fetching Travel...");
                try {
                    const data = await fetchTravelNotes({ userId: scopeUserId, fromDate, toDate, limit: 2000 });
                    if (addSheetIfData(wb, data, "Travel")) hasData = true;
                } catch (e) { console.log("Travel fetch error:", e); }
            }

            if (modules.leaves) {
                setProgress("Fetching Leaves...");
                try {
                    const data = await fetchLeaves({ userId: scopeUserId, fromDate, toDate, limit: 2000 });
                    if (addSheetIfData(wb, data, "Leaves")) hasData = true;
                } catch (e) { console.log("Leaves fetch error:", e); }
            }

            if (modules.projects) {
                setProgress("Fetching Projects...");
                try {
                    const data = filterData(await listProjects());
                    if (addSheetIfData(wb, data, "Projects")) hasData = true;
                } catch (e) { console.log("Projects fetch error:", e); }
            }

            if (!hasData) {
                Alert.alert("No Data", "No records found for the selected period.");
                setLoading(false);
                setProgress('');
                return;
            }

            setProgress("Generating File...");

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

    const ToggleRow = ({ label, field }: { label: string, field: keyof typeof modules }) => (
        <TouchableOpacity
            style={styles.row}
            onPress={() => setModules({ ...modules, [field]: !modules[field] })}
        >
            <Text style={styles.label}>{label}</Text>
            <Switch
                value={modules[field]}
                onValueChange={(val) => setModules({ ...modules, [field]: val })}
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={modules[field] ? "#3b5998" : "#f4f3f4"}
            />
        </TouchableOpacity>
    );

    return (
        <View style={{ flex: 1, backgroundColor: '#f4f6f8' }}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Download Reports 📊</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.container}>

                <View style={styles.card}>
                    <Text style={styles.cardHeader}>1. Select Period</Text>
                    <View style={styles.filterRow}>
                        <TouchableOpacity style={styles.dropdown} onPress={() => setShowYearModal(true)}>
                            <Ionicons name="calendar" size={20} color="#3b5998" />
                            <Text style={styles.dropdownText}>{selectedYear}</Text>
                            <Ionicons name="chevron-down" size={16} color="gray" />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.dropdown} onPress={() => setShowMonthModal(true)}>
                            <Ionicons name="calendar-outline" size={20} color="#3b5998" />
                            <Text style={styles.dropdownText}>
                                {selectedMonth === -1 ? "All Months (Full Year)" : months[selectedMonth]}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color="gray" />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardHeader}>2. Select Staff (Optional)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginTop: 10 }}>
                        <TouchableOpacity style={[styles.chip, selectedUser === 'All' && styles.activeChip]} onPress={() => setSelectedUser('All')}>
                            <Text style={[styles.chipText, selectedUser === 'All' && { color: 'white' }]}>All Staff</Text>
                        </TouchableOpacity>
                        {userList.map((u: any) => (
                            u.companyId === currentUser?.companyId && (
                                <TouchableOpacity key={u.id} style={[styles.chip, selectedUser === u.id && styles.activeChip]} onPress={() => setSelectedUser(u.id)}>
                                    <Text style={[styles.chipText, selectedUser === u.id && { color: 'white' }]}>{u.name}</Text>
                                </TouchableOpacity>
                            )
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardHeader}>3. Select Data to Download</Text>
                    <Text style={{ fontSize: 10, color: 'gray', marginBottom: 10 }}>Toggle On to include in Excel</Text>

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
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <ActivityIndicator color="white" />
                            <Text style={[styles.btnText, { fontSize: 14, marginLeft: 10 }]}>{progress}</Text>
                        </View>
                    ) : (
                        <>
                            <Ionicons name="cloud-download-outline" size={24} color="white" />
                            <Text style={styles.btnText}>Generate Excel</Text>
                        </>
                    )}
                </TouchableOpacity>
                <View style={{ height: 50 }} />
            </ScrollView>

            <Modal visible={showYearModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Year</Text>
                        {years.map(y => (
                            <TouchableOpacity key={y} style={styles.modalItem} onPress={() => { setSelectedYear(y); setShowYearModal(false); }}>
                                <Text style={[styles.modalText, selectedYear === y && { color: '#3b5998', fontWeight: 'bold' }]}>{y}</Text>
                                {selectedYear === y && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowYearModal(false)}>
                            <Text style={{ color: 'red' }}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showMonthModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: 500 }]}>
                        <Text style={styles.modalTitle}>Select Month</Text>
                        <ScrollView>
                            <TouchableOpacity style={styles.modalItem} onPress={() => { setSelectedMonth(-1); setShowMonthModal(false); }}>
                                <Text style={[styles.modalText, selectedMonth === -1 && { color: '#3b5998', fontWeight: 'bold' }]}>All Months (Full Year)</Text>
                                {selectedMonth === -1 && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                            </TouchableOpacity>

                            {months.map((m, i) => (
                                <TouchableOpacity key={m} style={styles.modalItem} onPress={() => { setSelectedMonth(i); setShowMonthModal(false); }}>
                                    <Text style={[styles.modalText, selectedMonth === i && { color: '#3b5998', fontWeight: 'bold' }]}>{m}</Text>
                                    {selectedMonth === i && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowMonthModal(false)}>
                            <Text style={{ color: 'red' }}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { padding: 15 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', alignItems: 'center', elevation: 2 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    card: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 1 },
    cardHeader: { fontSize: 14, fontWeight: 'bold', color: '#555', borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },

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
