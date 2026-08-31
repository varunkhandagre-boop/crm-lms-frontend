import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { db } from '../../firebaseConfig';
import { useSaaSDB } from '../../hooks/useSaaSDB';

type TabKey = 'pending' | 'approved' | 'all';

export default function SuperAdminPayments() {
    const router = useRouter();
    const { updateSaaSData } = useSaaSDB();

    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<TabKey>('pending');

    useEffect(() => {
        loadRequests();
    }, []);

    const loadRequests = async () => {
        setLoading(true);
        try {
            // 🔥 Sab records fetch karo — status filter nahi, history bhi dikhega
            const snap = await getDocs(collection(db, "subscription_requests"));
            const data = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
            data.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

            const companiesSnap = await getDocs(collection(db, "companies"));
            const companyMap: Record<string, any> = {};
            companiesSnap.docs.forEach((c: any) => {
                const cData = c.data();
                if (cData.companyId) companyMap[cData.companyId] = cData;
            });

            const enriched = data.map((item: any) => ({
                ...item,
                companyDetails: companyMap[item.companyId] || null
            }));

            setRequests(enriched);
        } catch (e) {
            console.error("Error loading payment requests:", e);
            Alert.alert("Error", "Could not fetch payment requests.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadRequests();
    };

    // 🔥 Tab wise filter
    const tabFilteredRequests = useMemo(() => {
        if (activeTab === 'pending') {
            return requests.filter((r: any) => r.status === 'Pending Verification');
        } else if (activeTab === 'approved') {
            return requests.filter((r: any) => r.status === 'Approved');
        }
        return requests; // 'all'
    }, [requests, activeTab]);

    const filteredRequests = useMemo(() => {
        if (!searchQuery.trim()) return tabFilteredRequests;
        const q = searchQuery.toLowerCase().trim();
        return tabFilteredRequests.filter((item: any) => {
            const cd = item.companyDetails || {};
            const haystack = [
                cd.companyName, cd.name,
                cd.ownerName, cd.contactPerson,
                cd.city,
                cd.gstNumber,
                cd.ownerMobile, cd.mobile,
                item.companyId,
                item.status
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [tabFilteredRequests, searchQuery]);

    // Tab counts
    const counts = useMemo(() => ({
        pending: requests.filter((r: any) => r.status === 'Pending Verification').length,
        approved: requests.filter((r: any) => r.status === 'Approved').length,
        all: requests.length,
    }), [requests]);

    const escapeCSV = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const handleExport = async () => {
        try {
            if (filteredRequests.length === 0) {
                Alert.alert("No Data", "No records found to export.");
                return;
            }
            const headers = ['Company Name', 'Owner/Contact', 'City', 'GST Number', 'Mobile', 'Plan', 'Employees Requested', 'Automation', 'Amount', 'Status', 'Requested On', 'Approved On'];
            const rows = filteredRequests.map((item: any) => {
                const cd = item.companyDetails || {};
                return [
                    cd.companyName || cd.name || `Unknown (${item.companyId})`,
                    cd.ownerName || cd.contactPerson || '',
                    cd.city || '',
                    cd.gstNumber || '',
                    cd.ownerMobile || cd.mobile || '',
                    item.planChosen || '',
                    item.employeesRequested || '',
                    item.automationRequested ? 'Yes' : 'No',
                    item.amountPaid || 0,
                    item.status || '',
                    item.createdAt ? new Date(item.createdAt).toLocaleString() : '',
                    item.approvedAt ? new Date(item.approvedAt).toLocaleString() : ''
                ].map(escapeCSV).join(',');
            });
            const csvContent = [headers.map(escapeCSV).join(','), ...rows].join('\n');
            const fileName = `Payment_History_${new Date().toISOString().slice(0, 10)}.csv`;
            const fileUri = FileSystem.documentDirectory + fileName;
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Payment History', UTI: 'public.comma-separated-values-text' });
            } else {
                Alert.alert("Saved", `File saved at: ${fileUri}`);
            }
        } catch (e) {
            Alert.alert("Error", "Could not export.");
        }
    };

    const findCompanyDocId = async (companyId: string) => {
        const q = query(collection(db, "companies"), where("companyId", "==", companyId));
        const snap = await getDocs(q);
        if (!snap.empty) return snap.docs[0].id;
        return companyId;
    };

    const handleApprove = async (item: any) => {
        const companyLabel = item.companyDetails?.companyName || item.companyDetails?.name || item.companyId;
        const automationLine = item.automationRequested ? `\nAutomation Add-on: Yes (+₹${item.automationAmount || 3000})` : '';
        Alert.alert(
            "Approve Payment",
            `Payment received confirm karo?\n\nCompany: ${companyLabel}\nPlan: ${item.planChosen}\nAmount: ₹${item.amountPaid}\nEmployees: ${item.employeesRequested}${automationLine}`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Approve & Activate", onPress: async () => {
                        setProcessingId(item.id);
                        try {
                            const companyDocId = await findCompanyDocId(item.companyId);
                            const companyUpdates: any = {
                                isActive: true,
                                plan: item.planChosen,
                                maxEmployees: item.employeesRequested,
                                expiryDate: item.requestedExpiryDate,
                                lastPaymentAmount: item.amountPaid,
                                lastPaymentDate: new Date().toISOString(),
                            };
                            if (item.automationRequested) {
                                companyUpdates.automationAddonEnabled = true;
                            }
                            const res = await updateSaaSData("companies", companyDocId, companyUpdates);
                            if (res.success) {
                                await updateDoc(doc(db, "subscription_requests", item.id), {
                                    status: "Approved",
                                    approvedAt: new Date().toISOString()
                                });
                                // Local state update — list se hatao nahi, status update karo
                                setRequests(prev => prev.map(r =>
                                    r.id === item.id
                                        ? { ...r, status: 'Approved', approvedAt: new Date().toISOString() }
                                        : r
                                ));
                                Alert.alert("Success ✅", "Payment approved aur company plan activate ho gaya!");
                            } else {
                                Alert.alert("Error", "Could not update company.");
                            }
                        } catch (e) {
                            Alert.alert("Error", "Something went wrong.");
                        } finally {
                            setProcessingId(null);
                        }
                    }
                }
            ]
        );
    };

    const handleNotReceived = async (item: any) => {
        Alert.alert(
            "Mark as Not Received",
            "Payment 'Not Received' mark karo? Record safe rahega.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Confirm", style: "destructive", onPress: async () => {
                        setProcessingId(item.id);
                        try {
                            await updateDoc(doc(db, "subscription_requests", item.id), {
                                status: "Rejected",
                                rejectedAt: new Date().toISOString(),
                                rejectionReason: "Payment Not Received"
                            });
                            setRequests(prev => prev.map(r =>
                                r.id === item.id ? { ...r, status: 'Rejected' } : r
                            ));
                        } catch (e) {
                            Alert.alert("Error", "Could not update.");
                        } finally {
                            setProcessingId(null);
                        }
                    }
                }
            ]
        );
    };

    const handleDelete = async (item: any) => {
        Alert.alert(
            "Delete Request",
            "Permanently delete karo? Ye recover nahi hoga.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete", style: "destructive", onPress: async () => {
                        setProcessingId(item.id);
                        try {
                            await deleteDoc(doc(db, "subscription_requests", item.id));
                            setRequests(prev => prev.filter(r => r.id !== item.id));
                        } catch (e) {
                            Alert.alert("Error", "Could not delete.");
                        } finally {
                            setProcessingId(null);
                        }
                    }
                }
            ]
        );
    };

    // 🔥 Status badge config
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Approved':
                return { bg: '#e8f5e9', color: '#2e7d32', label: 'APPROVED ✅' };
            case 'Rejected':
                return { bg: '#ffebee', color: '#d32f2f', label: 'NOT RECEIVED' };
            default:
                return { bg: '#fff3e0', color: '#e67e22', label: 'PENDING' };
        }
    };

    const renderItem = ({ item }: any) => {
        const cd = item.companyDetails;
        const badge = getStatusBadge(item.status);
        const isPending = item.status === 'Pending Verification';
        const isApproved = item.status === 'Approved';

        return (
            <View style={[styles.card, isApproved && styles.cardApproved]}>
                <View style={styles.row}>
                    <Text style={styles.companyName} numberOfLines={1}>
                        {cd?.companyName || cd?.name || `Unknown (ID: ${item.companyId})`}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                </View>

                {cd ? (
                    <>
                        <Text style={styles.detail}>Owner: <Text style={styles.bold}>{cd.ownerName || cd.contactPerson || 'N/A'}</Text></Text>
                        <Text style={styles.detail}>City: <Text style={styles.bold}>{cd.city || 'N/A'}</Text></Text>
                        {cd.gstNumber ? <Text style={styles.detail}>GST: <Text style={styles.bold}>{cd.gstNumber}</Text></Text> : null}
                        {(cd.ownerMobile || cd.mobile) ? <Text style={styles.detail}>📞 {cd.ownerMobile || cd.mobile}</Text> : null}
                    </>
                ) : (
                    <Text style={[styles.detail, { color: '#d32f2f' }]}>⚠️ Company record not found: {item.companyId}</Text>
                )}

                <View style={styles.divider} />

                <Text style={styles.detail}>Plan: <Text style={styles.bold}>{item.planChosen}</Text></Text>
                <Text style={styles.detail}>Employees: <Text style={styles.bold}>{item.employeesRequested}</Text></Text>
                {item.automationRequested && (
                    <View style={styles.automationBadge}>
                        <Ionicons name="chatbubbles" size={13} color="#2e7d32" />
                        <Text style={styles.automationBadgeText}>Automation Add-on (+₹{item.automationAmount || 3000})</Text>
                    </View>
                )}
                <Text style={styles.detail}>Amount: <Text style={[styles.bold, { color: '#2e7d32', fontSize: 15 }]}>₹{item.amountPaid?.toLocaleString('en-IN')}</Text></Text>
                <Text style={styles.detail}>Requested: {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'}</Text>

                {/* 🔥 Approved date dikhao */}
                {item.approvedAt && (
                    <Text style={[styles.detail, { color: '#2e7d32', fontWeight: '600' }]}>
                        ✅ Approved on: {new Date(item.approvedAt).toLocaleString()}
                    </Text>
                )}
                {item.rejectedAt && (
                    <Text style={[styles.detail, { color: '#d32f2f' }]}>
                        ❌ Rejected on: {new Date(item.rejectedAt).toLocaleString()}
                    </Text>
                )}

                {/* Action buttons — sirf pending pe dikhao */}
                {isPending && (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#e67e22' }]}
                            onPress={() => handleNotReceived(item)}
                            disabled={processingId === item.id}
                        >
                            <Text style={styles.actionText}>Not Received</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#d32f2f' }]}
                            onPress={() => handleDelete(item)}
                            disabled={processingId === item.id}
                        >
                            <Ionicons name="trash" size={16} color="white" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#2e7d32', flex: 1.4 }]}
                            onPress={() => handleApprove(item)}
                            disabled={processingId === item.id}
                        >
                            {processingId === item.id
                                ? <ActivityIndicator color="white" size="small" />
                                : <Text style={styles.actionText}>Approve ✅</Text>
                            }
                        </TouchableOpacity>
                    </View>
                )}

                {/* Delete button for non-pending records */}
                {!isPending && (
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#d32f2f', marginTop: 10, flexDirection: 'row', gap: 6 }]}
                        onPress={() => handleDelete(item)}
                        disabled={processingId === item.id}
                    >
                        <Ionicons name="trash" size={14} color="white" />
                        <Text style={styles.actionText}>Delete Record</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const TABS: { key: TabKey; label: string; color: string }[] = [
        { key: 'pending', label: 'Pending', color: '#e67e22' },
        { key: 'approved', label: 'Approved', color: '#2e7d32' },
        { key: 'all', label: 'All History', color: '#3b5998' },
    ];

    return (
        <View style={styles.container}>
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Payment Requests</Text>
                <TouchableOpacity style={styles.iconBtn} onPress={handleExport}>
                    <Ionicons name="download-outline" size={20} color="white" />
                </TouchableOpacity>
            </View>

            {/* TABS */}
            <View style={styles.tabRow}>
                {TABS.map(tab => {
                    const isActive = activeTab === tab.key;
                    const count = counts[tab.key];
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, isActive && { backgroundColor: tab.color, borderColor: tab.color }]}
                            onPress={() => { setActiveTab(tab.key); setSearchQuery(''); }}
                        >
                            <Text style={[styles.tabText, isActive && { color: 'white' }]}>{tab.label}</Text>
                            <View style={[styles.tabBadge, { backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : '#eee' }]}>
                                <Text style={[styles.tabBadgeText, isActive && { color: 'white' }]}>{count}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* SEARCH */}
            <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by company, city, GST, owner..."
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

            {loading ? (
                <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={filteredRequests}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 15 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 50 }}>
                            <Ionicons name="receipt-outline" size={48} color="#ccc" />
                            <Text style={{ color: '#999', marginTop: 12, fontSize: 15 }}>
                                {activeTab === 'pending' ? 'No pending requests 🎉' : 'No records found'}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },

    header: {
        backgroundColor: '#2e7d32',
        padding: 20,
        paddingTop: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
    },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', flex: 1 },
    iconBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8 },

    // Tabs
    tabRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 15,
        paddingVertical: 12,
        backgroundColor: 'white',
        elevation: 2,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: '#ddd',
        backgroundColor: 'white',
    },
    tabText: { fontSize: 12, fontWeight: '700', color: '#666' },
    tabBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
    tabBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#555' },

    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        marginHorizontal: 15,
        marginTop: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        height: 44
    },
    searchInput: { flex: 1, fontSize: 14, color: '#333' },

    card: {
        backgroundColor: 'white',
        padding: 15,
        borderRadius: 10,
        marginBottom: 15,
        elevation: 2
    },
    cardApproved: {
        borderLeftWidth: 4,
        borderLeftColor: '#2e7d32',
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    companyName: { fontSize: 16, fontWeight: 'bold', color: '#333', flex: 1, marginRight: 8 },

    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
    statusText: { fontWeight: 'bold', fontSize: 10 },

    detail: { color: '#666', fontSize: 13, marginBottom: 3 },
    bold: { fontWeight: 'bold', color: '#333' },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },

    actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    actionText: { color: 'white', fontWeight: 'bold', fontSize: 13 },

    automationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e8f5e9',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 6,
        marginBottom: 6,
        alignSelf: 'flex-start',
        gap: 5
    },
    automationBadgeText: { color: '#2e7d32', fontSize: 11, fontWeight: 'bold' },
});