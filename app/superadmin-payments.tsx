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
import { db } from '../firebaseConfig';
import { useSaaSDB } from '../hooks/useSaaSDB';

export default function SuperAdminPayments() {
    const router = useRouter();
    const { updateSaaSData } = useSaaSDB();

    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadRequests();
    }, []);

    const loadRequests = async () => {
        setLoading(true);
        try {
            // 1. Pending requests uthao (ye dataset naturally chhota rehta hai kyunki sirf "Pending" filter hai)
            const q = query(collection(db, "subscription_requests"), where("status", "==", "Pending Verification"));
            const snap = await getDocs(q);
            const data = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
            data.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

            // 2. Saari companies ek baar me uthao, taaki har request ke saath naam/city/GST match kar sake
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

    // SEARCH — company name, city, GST, owner/customer name se search
    const filteredRequests = useMemo(() => {
        if (!searchQuery.trim()) return requests;
        const q = searchQuery.toLowerCase().trim();
        return requests.filter((item: any) => {
            const cd = item.companyDetails || {};
            const haystack = [
                cd.companyName, cd.name,
                cd.ownerName, cd.contactPerson,
                cd.city,
                cd.gstNumber,
                cd.ownerMobile, cd.mobile,
                item.companyId
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [requests, searchQuery]);

    // 🔥 NEW: CSV EXPORT / DOWNLOAD
    const escapeCSV = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const handleExport = async () => {
        try {
            if (filteredRequests.length === 0) {
                Alert.alert("No Data", "Export karne ke liye koi pending request nahi mili.");
                return;
            }

            const headers = ['Company Name', 'Owner/Contact', 'City', 'GST Number', 'Mobile', 'Plan', 'Employees Requested', 'Amount', 'Requested On'];
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
                    item.amountPaid || 0,
                    item.createdAt ? new Date(item.createdAt).toLocaleString() : ''
                ].map(escapeCSV).join(',');
            });

            const csvContent = [headers.map(escapeCSV).join(','), ...rows].join('\n');
            const fileName = `Payment_Requests_${new Date().toISOString().slice(0, 10)}.csv`;
            const fileUri = FileSystem.documentDirectory + fileName;

            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'text/csv',
                    dialogTitle: 'Export Payment Requests',
                    UTI: 'public.comma-separated-values-text'
                });
            } else {
                Alert.alert("Saved", `File saved at: ${fileUri}`);
            }
        } catch (e) {
            console.error("Export Error:", e);
            Alert.alert("Error", "Could not export payment requests.");
        }
    };

    // Company ka document find karo companyId field se
    const findCompanyDocId = async (companyId: string) => {
        const q = query(collection(db, "companies"), where("companyId", "==", companyId));
        const snap = await getDocs(q);
        if (!snap.empty) return snap.docs[0].id;
        return companyId;
    };

    const handleApprove = async (item: any) => {
        const companyLabel = item.companyDetails?.companyName || item.companyDetails?.name || item.companyId;
        Alert.alert(
            "Approve Payment",
            `Confirm karein ki payment mil gaya hai?\n\nCompany: ${companyLabel}\nPlan: ${item.planChosen}\nAmount: ₹${item.amountPaid}\nEmployees: ${item.employeesRequested}`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Approve & Activate", onPress: async () => {
                        setProcessingId(item.id);
                        try {
                            const companyDocId = await findCompanyDocId(item.companyId);

                            const companyUpdates = {
                                isActive: true,
                                plan: item.planChosen,
                                maxEmployees: item.employeesRequested,
                                expiryDate: item.requestedExpiryDate,
                                lastPaymentAmount: item.amountPaid,
                                lastPaymentDate: new Date().toISOString(),
                            };
                            const res = await updateSaaSData("companies", companyDocId, companyUpdates);

                            if (res.success) {
                                await updateDoc(doc(db, "subscription_requests", item.id), {
                                    status: "Approved",
                                    approvedAt: new Date().toISOString()
                                });

                                Alert.alert("Success ✅", "Payment approved aur company plan activate ho gaya!");
                                setRequests(prev => prev.filter(r => r.id !== item.id));
                            } else {
                                Alert.alert("Error", "Company update nahi ho paya. Check karein companyId sahi hai ya nahi.");
                            }
                        } catch (e) {
                            console.error(e);
                            Alert.alert("Error", "Kuch galat ho gaya.");
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
            "Is payment ko 'Not Received' mark karna hai? Ye request list se hat jayegi lekin record safe rahega.",
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
                            setRequests(prev => prev.filter(r => r.id !== item.id));
                        } catch (e) {
                            Alert.alert("Error", "Update nahi ho paya.");
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
            "Ye request permanently delete ho jayegi, wapas nahi aayegi. Sure?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete", style: "destructive", onPress: async () => {
                        setProcessingId(item.id);
                        try {
                            await deleteDoc(doc(db, "subscription_requests", item.id));
                            setRequests(prev => prev.filter(r => r.id !== item.id));
                        } catch (e) {
                            Alert.alert("Error", "Delete nahi ho paya.");
                        } finally {
                            setProcessingId(null);
                        }
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }: any) => {
        const cd = item.companyDetails;

        return (
            <View style={styles.card}>
                <View style={styles.row}>
                    <Text style={styles.companyName}>
                        {cd?.companyName || cd?.name || `Unknown (ID: ${item.companyId})`}
                    </Text>
                    <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>PENDING</Text>
                    </View>
                </View>

                {cd ? (
                    <>
                        <Text style={styles.detail}>Owner/Contact: <Text style={styles.bold}>{cd.ownerName || cd.contactPerson || 'N/A'}</Text></Text>
                        <Text style={styles.detail}>City: <Text style={styles.bold}>{cd.city || 'N/A'}</Text></Text>
                        {cd.gstNumber ? <Text style={styles.detail}>GST: <Text style={styles.bold}>{cd.gstNumber}</Text></Text> : null}
                        {(cd.ownerMobile || cd.mobile) ? <Text style={styles.detail}>📞 {cd.ownerMobile || cd.mobile}</Text> : null}
                    </>
                ) : (
                    <Text style={[styles.detail, { color: '#d32f2f' }]}>⚠️ Company record not found for ID: {item.companyId}</Text>
                )}

                <View style={styles.divider} />

                <Text style={styles.detail}>Plan: <Text style={styles.bold}>{item.planChosen}</Text></Text>
                <Text style={styles.detail}>Employees Requested: <Text style={styles.bold}>{item.employeesRequested}</Text></Text>
                <Text style={styles.detail}>Amount: <Text style={[styles.bold, { color: '#2e7d32' }]}>₹{item.amountPaid?.toLocaleString('en-IN')}</Text></Text>
                <Text style={styles.detail}>Requested On: {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'}</Text>

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
                            : <Text style={styles.actionText}>Approve</Text>
                        }
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Payment Requests</Text>

                {/* 🔥 NEW: Export button */}
                <TouchableOpacity style={styles.iconBtn} onPress={handleExport}>
                    <Ionicons name="download-outline" size={20} color="white" />
                </TouchableOpacity>
            </View>

            {/* SEARCH BAR */}
            <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by company, city, GST, owner name..."
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
                    ListEmptyComponent={
                        <Text style={{ textAlign: 'center', marginTop: 40, color: '#666' }}>
                            No pending payment requests. 🎉
                        </Text>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { backgroundColor: '#2e7d32', padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', flex: 1 },
    iconBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8 },

    searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 15, marginTop: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', height: 44 },
    searchInput: { flex: 1, fontSize: 14, color: '#333' },

    card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    companyName: { fontSize: 16, fontWeight: 'bold', color: '#333', flex: 1, marginRight: 8 },
    pendingBadge: { backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
    pendingText: { color: '#e67e22', fontWeight: 'bold', fontSize: 10 },
    detail: { color: '#666', fontSize: 13, marginBottom: 3 },
    bold: { fontWeight: 'bold', color: '#333' },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
    actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: 'white', fontWeight: 'bold', fontSize: 13 }
});