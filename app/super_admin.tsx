import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
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

export default function SuperAdminDashboard() {
    const router = useRouter();
    
    // 🔥 Naya SaaS Engine
    const { updateSaaSData } = useSaaSDB();
    
    const [companies, setCompanies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal State
    const [selectedCompany, setSelectedCompany] = useState<any>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [editEmployeeLimit, setEditEmployeeLimit] = useState('');

    useEffect(() => {
        loadCompanies();
    }, []);

    const loadCompanies = async () => {
        setLoading(true);
        try {
            // Bulletproof Direct Fetch for SuperAdmin (Reads raw collection)
            const querySnapshot = await getDocs(collection(db, "companies")); // Make sure your collection is "companies"
            
            const data = querySnapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
            
            // Sort: Newest first
            data.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            
            console.log("Fetched Companies:", data.length); 
            setCompanies(data);
        } catch (error) {
            console.error("Super Admin Fetch Error:", error);
            Alert.alert("Error", "Could not fetch companies");
        } finally {
            setLoading(false);
        }
    };

    const handleCardClick = (company: any) => {
        setSelectedCompany(company);
        setEditEmployeeLimit(String(company.maxEmployees || 10));
        setModalVisible(true);
    };

    // 🔥 NEW: DEDICATED APPROVAL LOGIC
    const handleApproveCompany = async () => {
        if (!selectedCompany) return;
        
        Alert.alert("Approve Company", `Are you sure you want to approve ${selectedCompany.companyName} for a 7-Day Trial?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Approve", onPress: async () => {
                try {
                    const updates = {
                        isActive: true,
                        plan: 'Trial Active',
                        approvedAt: new Date().toISOString(),
                        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 Days from now
                        maxEmployees: 10 // Default limit
                    };

                    // Note: Update directly in 'companies' collection. Ensure your SaaSDB handles this or use raw updateDoc
                    const res = await updateSaaSData("companies", selectedCompany.id, updates);

                    if (res.success) {
                        Alert.alert("Success ✅", "Company Approved! The admin can now login.");
                        setModalVisible(false);
                        await loadCompanies(); // Refresh list
                    } else {
                        Alert.alert("Error", "Could not approve the company. Check database permissions.");
                    }
                } catch (error) {
                    Alert.alert("Error", "An error occurred during approval.");
                }
            }}
        ]);
    };

    // 🔥 SAAS UPDATE: Toggle Active/Inactive
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

    // 🔥 SAAS UPDATE: Save Limits and Dates
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
        // Safe check for missing fields
        const isExpired = item.expiryDate ? new Date(item.expiryDate) < new Date() : false;
        const isActive = item.isActive === true; // Strict check for boolean true
        const isPending = item.isActive === undefined || item.isActive === null; // If field doesn't exist, it's pending

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
            <TouchableOpacity style={[styles.card, !isActive && !isPending && {borderLeftWidth: 5, borderLeftColor: '#d32f2f'}, isPending && {borderLeftWidth: 5, borderLeftColor: '#1976d2'}]} onPress={() => handleCardClick(item)}>
                <View style={styles.row}>
                    <Text style={styles.compName}>{item.companyName || item.name || 'Unknown Company'}</Text>
                    <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                        <Text style={{ color: textColor, fontWeight: 'bold', fontSize: 10 }}>
                            {statusText}
                        </Text>
                    </View>
                </View>
                <Text style={styles.subText}>Owner: {item.ownerName || item.contactPerson || 'N/A'} | {item.city || 'N/A'}</Text>
                <Text style={styles.subText}>Users: {item.maxEmployees || 10} Allowed</Text>
                <Text style={[styles.subText, { fontWeight: 'bold', marginTop: 5, color: isExpired ? '#e67e22' : '#333' }]}>
                    Expires: {item.expiryDate ? new Date(item.expiryDate).toDateString() : 'Not Set (Pending)'}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.replace('/' as any)}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Super Admin Panel</Text>
            </View>

            {loading ? <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 50 }} /> :
                <FlatList
                    data={companies}
                    keyExtractor={item => item.id}
                    renderItem={renderCompany}
                    contentContainerStyle={{ padding: 15 }}
                    ListEmptyComponent={<Text style={{textAlign:'center', marginTop: 20}}>No companies found.</Text>}
                />
            }

            {/* 🔥 POPUP MODAL */}
            <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                                <Text style={styles.modalTitle}>{selectedCompany?.companyName || selectedCompany?.name}</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)}>
                                    <Ionicons name="close-circle" size={30} color="#d32f2f" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            {/* 🔥 NEW DEDICATED APPROVAL BUTTON FOR PENDING COMPANIES */}
                            {selectedCompany && (selectedCompany.isActive === undefined || selectedCompany.isActive === null || (!selectedCompany.isActive && (!selectedCompany.plan || selectedCompany.plan === 'Pending Approval'))) && (
                                <TouchableOpacity style={styles.approveBtn} onPress={handleApproveCompany}>
                                    <Ionicons name="checkmark-circle" size={24} color="white" style={{marginRight: 8}} />
                                    <Text style={styles.approveBtnText}>Approve & Start 7-Day Trial</Text>
                                </TouchableOpacity>
                            )}

                            {/* MASTER TOGGLE SWITCH */}
                            <View style={styles.statusRow}>
                                <View>
                                    <Text style={styles.label}>Account Status</Text>
                                    <Text style={{
                                        fontSize: 16, 
                                        fontWeight: 'bold', 
                                        color: selectedCompany?.isActive ? 'green' : (selectedCompany?.isActive === undefined ? '#1565c0' : 'red')
                                    }}>
                                        {selectedCompany?.isActive ? 'Active & Approved ✅' : (selectedCompany?.isActive === undefined ? 'New (Pending)' : 'Inactive / Disabled 🚫')}
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
                            <Text style={styles.value}>{selectedCompany?.address || ''} {selectedCompany?.city ? `, ${selectedCompany.city}` : ''}</Text>
                            <Text style={styles.value}>Plan: {selectedCompany?.plan || 'Pending Approval'}</Text>

                            <View style={styles.divider} />

                            {/* CONTROLS */}
                            <Text style={styles.sectionHeader}>Subscription Controls</Text>
                            
                            <Text style={styles.label}>Max Employees:</Text>
                            <View style={{flexDirection:'row', gap:10, marginBottom:20}}>
                                <TextInput 
                                    style={styles.inputBox} 
                                    value={editEmployeeLimit} 
                                    onChangeText={setEditEmployeeLimit} 
                                    keyboardType="numeric"
                                />
                                <TouchableOpacity style={styles.btnUpdate} onPress={() => updateCompanySettings(0)}>
                                    <Text style={{color:'white', fontWeight:'bold'}}>Save Limit</Text>
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
    header: { backgroundColor: '#d32f2f', padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', gap: 15 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    compName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
    subText: { color: '#666', fontSize: 13, marginBottom: 2 },
    
    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '90%' },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', flex:1 },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
    label: { fontSize: 12, color: '#888', marginTop: 10, fontWeight:'bold', textTransform:'uppercase' },
    value: { fontSize: 16, color: '#333', fontWeight: '500' },
    sectionHeader: { fontSize: 18, fontWeight:'bold', color:'#d32f2f', marginVertical: 10 },
    
    // NEW Approve Button
    approveBtn: { flexDirection: 'row', backgroundColor: '#2e7d32', padding: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 20, elevation: 3 },
    approveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // Status Row Style
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#eee' },

    inputBox: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, width: 80, textAlign: 'center', fontSize: 16, fontWeight:'bold' },
    btnUpdate: { backgroundColor: '#333', padding: 10, borderRadius: 8, justifyContent:'center', flex:1, alignItems:'center' },
    
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom:20 },
    btnAction: { flex: 1, backgroundColor: '#3b5998', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    btnText: { color: 'white', fontSize: 12, fontWeight: 'bold' }
});