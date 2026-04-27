import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
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

export default function SuperAdminDashboard() {
    const router = useRouter();
    const [companies, setCompanies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal State
    const [selectedCompany, setSelectedCompany] = useState<any>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [editEmployeeLimit, setEditEmployeeLimit] = useState('');

    useEffect(() => {
        fetchCompanies();
    }, []);

    const fetchCompanies = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "companies"));
            const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort: Newest first
            list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setCompanies(list);
        } catch (error) {
            Alert.alert("Error", "Could not fetch companies");
        }
        setLoading(false);
    };

    const handleCardClick = (company: any) => {
        setSelectedCompany(company);
        setEditEmployeeLimit(String(company.maxEmployees || 10));
        setModalVisible(true);
    };

    // 🔥 NEW: Toggle Active/Inactive without changing Date
    const toggleCompanyStatus = async (value: boolean) => {
        if (!selectedCompany) return;
        
        try {
            // Update Firestore
            await updateDoc(doc(db, "companies", selectedCompany.id), {
                isActive: value,
                plan: value ? (selectedCompany.plan === 'Pending Approval' ? 'Trial Active' : selectedCompany.plan) : 'Disabled by Admin'
            });

            // Update Local State immediately for UI
            setSelectedCompany({ ...selectedCompany, isActive: value });
            
            // Update List in background
            fetchCompanies();
            
            Alert.alert("Success", `Company is now ${value ? "ACTIVE ✅" : "DISABLED 🚫"}`);
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

            // Only update date if days > 0
            if (daysToAdd > 0) {
                const currentExpiry = new Date(selectedCompany.expiryDate);
                // Agar expiry nikal gayi hai, to aaj se add karo
                const baseDate = currentExpiry < new Date() ? new Date() : currentExpiry;
                
                const newExpiry = new Date(baseDate);
                newExpiry.setDate(newExpiry.getDate() + daysToAdd);
                
                updates.expiryDate = newExpiry.toISOString();
                
                // 🔥 Auto-Activate if date extended
                updates.isActive = true; 
                updates.plan = daysToAdd === 7 ? 'Trial Extended' : 'Paid Plan';
            }

            await updateDoc(doc(db, "companies", selectedCompany.id), updates);
            
            Alert.alert("Success ✅", "Company settings updated!");
            setModalVisible(false);
            fetchCompanies(); // Refresh List

        } catch (error) {
            Alert.alert("Error", "Update failed");
        }
    };

    const renderCompany = ({ item }: any) => {
        const isExpired = new Date(item.expiryDate) < new Date();
        const isActive = item.isActive; // Firestore Status

        // 🔥 LOGIC: Badge Color & Text
        let badgeColor = '#e8f5e9'; // Green (Active)
        let textColor = 'green';
        let statusText = 'ACTIVE';

        if (!isActive) {
            badgeColor = '#ffebee'; // Red (Disabled/Pending)
            textColor = '#d32f2f';
            statusText = 'PENDING / DISABLED';
        } else if (isExpired) {
            badgeColor = '#fff3e0'; // Orange (Expired)
            textColor = '#e67e22';
            statusText = 'EXPIRED';
        }

        return (
            <TouchableOpacity style={[styles.card, !isActive && {borderLeftWidth: 5, borderLeftColor: '#d32f2f'}]} onPress={() => handleCardClick(item)}>
                <View style={styles.row}>
                    <Text style={styles.compName}>{item.companyName}</Text>
                    <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                        <Text style={{ color: textColor, fontWeight: 'bold', fontSize: 10 }}>
                            {statusText}
                        </Text>
                    </View>
                </View>
                <Text style={styles.subText}>Owner: {item.ownerName} | {item.city}</Text>
                <Text style={styles.subText}>Users: {item.maxEmployees || 10} Allowed</Text>
                <Text style={[styles.subText, { fontWeight: 'bold', marginTop: 5, color: isExpired ? '#e67e22' : '#333' }]}>
                    Expires: {new Date(item.expiryDate).toDateString()}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.replace('/')}>
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
                />
            }

            {/* 🔥 POPUP MODAL */}
            <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                                <Text style={styles.modalTitle}>{selectedCompany?.companyName}</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)}>
                                    <Ionicons name="close-circle" size={30} color="#d32f2f" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            {/* 🔥 NEW: MASTER TOGGLE SWITCH */}
                            <View style={styles.statusRow}>
                                <View>
                                    <Text style={styles.label}>Account Status</Text>
                                    <Text style={{
                                        fontSize: 16, 
                                        fontWeight: 'bold', 
                                        color: selectedCompany?.isActive ? 'green' : 'red'
                                    }}>
                                        {selectedCompany?.isActive ? 'Active & Approved ✅' : 'Inactive / Disabled 🚫'}
                                    </Text>
                                </View>
                                <Switch
                                    trackColor={{ false: "#767577", true: "#81b0ff" }}
                                    thumbColor={selectedCompany?.isActive ? "#2e7d32" : "#f4f3f4"}
                                    onValueChange={toggleCompanyStatus}
                                    value={selectedCompany?.isActive}
                                />
                            </View>

                            <View style={styles.divider} />

                            <Text style={styles.label}>Details:</Text>
                            <Text style={styles.value}>{selectedCompany?.ownerName} ({selectedCompany?.ownerMobile})</Text>
                            <Text style={styles.value}>{selectedCompany?.ownerEmail}</Text>
                            <Text style={styles.value}>{selectedCompany?.address}, {selectedCompany?.city}</Text>
                            <Text style={styles.value}>Plan: {selectedCompany?.plan}</Text>

                            <View style={styles.divider} />

                            {/* 🔥 CONTROLS */}
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
    
    // 🔥 New Status Row Style
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#eee' },

    inputBox: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, width: 80, textAlign: 'center', fontSize: 16, fontWeight:'bold' },
    btnUpdate: { backgroundColor: '#333', padding: 10, borderRadius: 8, justifyContent:'center', flex:1, alignItems:'center' },
    
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom:20 },
    btnAction: { flex: 1, backgroundColor: '#3b5998', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    btnText: { color: 'white', fontSize: 12, fontWeight: 'bold' }
});