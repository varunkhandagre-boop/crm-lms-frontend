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
import { db } from '../firebaseConfig';

// 🔥 SAAS IMPORTS
import { useSaaSDB } from '../hooks/useSaaSDB';

// 🔥 Module-level cache
let companiesCache: any[] | null = null;
let companiesCacheTime = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export default function SuperAdminDashboard() {
    const router = useRouter();

    const { updateSaaSData } = useSaaSDB();

    const [companies, setCompanies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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
            console.log("Fetched Companies:", data.length);
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
        loadCompanies();
    };

    const stats = useMemo(() => {
        const now = new Date();
        const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        let active = 0;
        let expiringSoon = 0;
        companies.forEach((c: any) => {
            if (c.isActive === true) {
                active++;
                if (c.expiryDate) {
                    const exp = new Date(c.expiryDate);
                    if (exp > now && exp <= sevenDaysLater) {
                        expiringSoon++;
                    }
                }
            }
        });
        return { total: companies.length, active, expiringSoon };
    }, [companies]);

    const filteredCompanies = useMemo(() => {
        if (!searchQuery.trim()) return companies;
        const q = searchQuery.toLowerCase().trim();
        return companies.filter((c: any) => {
            const haystack = [
                c.companyName, c.name,
                c.ownerName, c.contactPerson,
                c.city,
                c.ownerMobile, c.mobile,
                c.ownerEmail, c.email,
                c.gstNumber,
                c.website
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [companies, searchQuery]);

    const escapeCSV = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const handleExport = async () => {
        try {
            if (filteredCompanies.length === 0) {
                Alert.alert("No Data", "Export karne ke liye koi company nahi mili.");
                return;
            }
            const headers = ['Company Name', 'Owner/Contact', 'Mobile', 'Email', 'City', 'GST Number', 'Website', 'Plan', 'Max Employees', 'Status', 'Expiry Date'];
            const rows = filteredCompanies.map((c: any) => {
                const isExpired = c.expiryDate ? new Date(c.expiryDate) < new Date() : false;
                const isActive = c.isActive === true;
                const isPending = c.isActive === undefined || c.isActive === null;
                let status = 'ACTIVE';
                if (isPending) status = 'PENDING';
                else if (!isActive) status = 'DISABLED';
                else if (isExpired) status = 'EXPIRED';
                return [
                    c.companyName || c.name || '',
                    c.ownerName || c.contactPerson || '',
                    c.ownerMobile || c.mobile || '',
                    c.ownerEmail || c.email || '',
                    c.city || '',
                    c.gstNumber || '',
                    c.website || '',
                    c.plan || '',
                    c.maxEmployees || 10,
                    status,
                    c.expiryDate ? new Date(c.expiryDate).toDateString() : 'Not Set'
                ].map(escapeCSV).join(',');
            });
            const csvContent = [headers.map(escapeCSV).join(','), ...rows].join('\n');
            const fileName = `Companies_Export_${new Date().toISOString().slice(0, 10)}.csv`;
            const fileUri = FileSystem.documentDirectory + fileName;
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'text/csv',
                    dialogTitle: 'Export Companies List',
                    UTI: 'public.comma-separated-values-text'
                });
            } else {
                Alert.alert("Saved", `File saved at: ${fileUri}`);
            }
        } catch (e) {
            console.error("Export Error:", e);
            Alert.alert("Error", "Could not export companies list.");
        }
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
                            isActive: true,
                            plan: 'Trial Active',
                            approvedAt: new Date().toISOString(),
                            expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                            maxEmployees: 10
                        };
                        const res = await updateSaaSData("companies", selectedCompany.id, updates);
                        if (res.success) {
                            Alert.alert("Success ✅", "Company Approved! The admin can now login.");
                            setModalVisible(false);
                            await loadCompanies();
                        } else {
                            Alert.alert("Error", "Could not approve the company. Check database permissions.");
                        }
                    } catch (error) {
                        Alert.alert("Error", "An error occurred during approval.");
                    }
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
                Alert.alert("Success", `Company is now ${value ? "ACTIVE ✅" : "DISABLED 🚫"}`);
            } else {
                Alert.alert("Error", "Could not update status");
            }
        } catch (e) {
            Alert.alert("Error", "Could not update status");
        }
    };

    const updateCompanySettings = async (daysToAdd: number = 0) => {
        if (!selectedCompany) return;
        try {
            const updates: any = {
                maxEmployees: Number(editEmployeeLimit)
            };
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
                await loadCompanies();
            } else {
                Alert.alert("Error", "Update failed");
            }
        } catch (error) {
            Alert.alert("Error", "Update failed");
        }
    };

    const renderCompany = ({ item }: any) => {
        const isExpired = item.expiryDate ? new Date(item.expiryDate) < new Date() : false;
        const isActive = item.isActive === true;
        const isPending = item.isActive === undefined || item.isActive === null;

        let badgeColor = '#e8f5e9';
        let textColor = 'green';
        let statusText = 'ACTIVE';

        if (isPending) {
            badgeColor = '#e3f2fd';
            textColor = '#1565c0';
            statusText = 'NEW (PENDING)';
        } else if (!isActive) {
            badgeColor = '#ffebee';
            textColor = '#d32f2f';
            statusText = 'DISABLED';
        } else if (isExpired) {
            badgeColor = '#fff3e0';
            textColor = '#e67e22';
            statusText = 'EXPIRED';
        }

        return (
            <TouchableOpacity
                style={[
                    styles.card,
                    !isActive && !isPending && { borderLeftWidth: 5, borderLeftColor: '#d32f2f' },
                    isPending && { borderLeftWidth: 5, borderLeftColor: '#1976d2' }
                ]}
                onPress={() => handleCardClick(item)}
            >
                <View style={styles.row}>
                    <Text style={styles.compName}>{item.companyName || item.name || 'Unknown Company'}</Text>
                    <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                        <Text style={{ color: textColor, fontWeight: 'bold', fontSize: 10 }}>
                            {statusText}
                        </Text>
                    </View>
                </View>
                <Text style={styles.subText}>Owner: {item.ownerName || item.contactPerson || 'N/A'} | {item.city || 'N/A'}</Text>
                {(item.ownerMobile || item.mobile) ? <Text style={styles.subText}>📞 {item.ownerMobile || item.mobile}</Text> : null}
                {(item.ownerEmail || item.email) ? <Text style={styles.subText}>✉️ {item.ownerEmail || item.email}</Text> : null}
                {item.website ? <Text style={styles.subText}>🌐 {item.website}</Text> : null}
                {item.gstNumber ? <Text style={styles.subText}>GST: {item.gstNumber}</Text> : null}
                <Text style={styles.subText}>Users: {item.maxEmployees || 10} Allowed</Text>
                {item.lastPaymentAmount ? (
                    <Text style={styles.subText}>Last Payment: ₹{item.lastPaymentAmount} {item.lastPaymentDate ? `on ${new Date(item.lastPaymentDate).toDateString()}` : ''}</Text>
                ) : null}
                <Text style={[styles.subText, { fontWeight: 'bold', marginTop: 5, color: isExpired ? '#e67e22' : '#333' }]}>
                    Expires: {item.expiryDate ? new Date(item.expiryDate).toDateString() : 'Not Set (Pending)'}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>

            {/* ✅ FIXED HEADER — 2 rows mein */}
            <View style={styles.header}>
                {/* Row 1: Back arrow + Title */}
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => router.replace('/' as any)}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Super Admin Panel</Text>
                </View>

                {/* Row 2: Action Buttons */}
                <View style={styles.headerBottom}>
                    <TouchableOpacity style={styles.iconBtn} onPress={handleExport}>
                        <Ionicons name="download-outline" size={20} color="white" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.paymentsBtn}
                        onPress={() => router.push('/superadmin-payments' as any)}
                    >
                        <Ionicons name="wallet" size={18} color="white" />
                        <Text style={styles.paymentsBtnText}>Payments</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.paymentsBtn}
                        onPress={() => router.push('/manage-plans' as any)}
                    >
                        <Ionicons name="pricetags" size={18} color="white" />
                        <Text style={styles.paymentsBtnText}>Manage Plans</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* STATS CARDS */}
            {!loading && (
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statNum}>{stats.total}</Text>
                        <Text style={styles.statLabel}>Total</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: '#e8f5e9' }]}>
                        <Text style={[styles.statNum, { color: '#2e7d32' }]}>{stats.active}</Text>
                        <Text style={styles.statLabel}>Active</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: '#fff3e0' }]}>
                        <Text style={[styles.statNum, { color: '#e67e22' }]}>{stats.expiringSoon}</Text>
                        <Text style={styles.statLabel}>Expiring Soon</Text>
                    </View>
                </View>
            )}

            {/* SEARCH BAR */}
            <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by company, owner, city, mobile, email, GST..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholderTextColor="#999"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={18} color="#999" />
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
                    ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>No companies found.</Text>}
                />
            }

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
                                selectedCompany.isActive === undefined ||
                                selectedCompany.isActive === null ||
                                (!selectedCompany.isActive && (!selectedCompany.plan || selectedCompany.plan === 'Pending Approval'))
                            ) && (
                                <TouchableOpacity style={styles.approveBtn} onPress={handleApproveCompany}>
                                    <Ionicons name="checkmark-circle" size={24} color="white" style={{ marginRight: 8 }} />
                                    <Text style={styles.approveBtnText}>Approve & Start 7-Day Trial</Text>
                                </TouchableOpacity>
                            )}

                            <View style={styles.statusRow}>
                                <View>
                                    <Text style={styles.label}>Account Status</Text>
                                    <Text style={{
                                        fontSize: 16,
                                        fontWeight: 'bold',
                                        color: selectedCompany?.isActive ? 'green' : (selectedCompany?.isActive === undefined ? '#1565c0' : 'red')
                                    }}>
                                        {selectedCompany?.isActive
                                            ? 'Active & Approved ✅'
                                            : (selectedCompany?.isActive === undefined ? 'New (Pending)' : 'Inactive / Disabled 🚫')}
                                    </Text>
                                </View>
                                <Switch
                                    trackColor={{ false: "#767577", true: "#81b0ff" }}
                                    thumbColor={selectedCompany?.isActive ? "#2e7d32" : "#f4f3f4"}
                                    onValueChange={toggleCompanyStatus}
                                    value={selectedCompany?.isActive === true}
                                />
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
                                <Text style={styles.value}>
                                    Last Payment: ₹{selectedCompany.lastPaymentAmount} {selectedCompany.lastPaymentDate ? `(${new Date(selectedCompany.lastPaymentDate).toDateString()})` : ''}
                                </Text>
                            ) : null}

                            <View style={styles.divider} />

                            <Text style={styles.sectionHeader}>Subscription Controls</Text>

                            <Text style={styles.label}>Max Employees:</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                <TextInput
                                    style={styles.inputBox}
                                    value={editEmployeeLimit}
                                    onChangeText={setEditEmployeeLimit}
                                    keyboardType="numeric"
                                />
                                <TouchableOpacity style={styles.btnUpdate} onPress={() => updateCompanySettings(0)}>
                                    <Text style={{ color: 'white', fontWeight: 'bold' }}>Save Limit</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.label}>Add Validity (Auto Activates):</Text>
                            <View style={styles.actionRow}>
                                <TouchableOpacity style={styles.btnAction} onPress={() => updateCompanySettings(7)}>
                                    <Text style={styles.btnText}>+7 Days</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#2e7d32' }]} onPress={() => updateCompanySettings(30)}>
                                    <Text style={styles.btnText}>+1 Month</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#f57c00' }]} onPress={() => updateCompanySettings(365)}>
                                    <Text style={styles.btnText}>+1 Year</Text>
                                </TouchableOpacity>
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

    // ✅ FIXED: Sirf ek header, no flexDirection
    header: {
        backgroundColor: '#d32f2f',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 15,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    headerBottom: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', flex: 1 },

    iconBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8 },

    paymentsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    paymentsBtnText: { color: 'white', marginLeft: 5, fontWeight: 'bold', fontSize: 12 },

    statsRow: { flexDirection: 'row', paddingHorizontal: 15, paddingTop: 15, gap: 10 },
    statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center', elevation: 2 },
    statNum: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    statLabel: { fontSize: 11, color: '#666', marginTop: 2 },

    searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 15, marginTop: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', height: 44 },
    searchInput: { flex: 1, fontSize: 14, color: '#333' },

    card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    compName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
    subText: { color: '#666', fontSize: 13, marginBottom: 2 },

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
    btnText: { color: 'white', fontSize: 12, fontWeight: 'bold' }
});