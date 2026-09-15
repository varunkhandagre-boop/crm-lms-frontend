import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (organizations still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 6: payment dues now via new backend API
import { fetchOrganizations } from '../services/api/organizations';
import { createPaymentDue } from '../services/api/paymentDues';

export default function AddPaymentDueScreen() {
    const router = useRouter();
    
    const { currentUser, addNotification } = useData();
    const { fetchSaaSData } = useSaaSDB();

    const [orgList, setOrgList] = useState<any[]>([]);

    const [selectedOrg, setSelectedOrg] = useState<any>(null);
    const [billNo, setBillNo] = useState('');
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    
    const [billDate, setBillDate] = useState(new Date());
    const [showBillDatePicker, setShowBillDatePicker] = useState(false);

    const [dueDate, setDueDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [loading, setLoading] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filteredOrgs, setFilteredOrgs] = useState<any[]>([]);

    useEffect(() => {
        const loadData = async () => {
            if (currentUser?.companyId) {
                const orgs = await fetchOrganizations({ limit: 200 });
                setOrgList(orgs);
                setFilteredOrgs(orgs);
            }
        };
        loadData();
    }, [currentUser]);

    const handleSearch = (text: string) => {
        setSearchText(text);
        if (text) {
            const lowerText = text.toLowerCase();
            const newData = orgList.filter((item: any) => {
                const orgName = (item.orgName || item.name || '').toLowerCase();
                const city = (item.city || '').toLowerCase();
                return orgName.includes(lowerText) || city.includes(lowerText);
            });
            setFilteredOrgs(newData);
        } else {
            setFilteredOrgs(orgList);
        }
    };

    const handleSelectOrg = (org: any) => {
        setSelectedOrg(org);
        setModalVisible(false);
        setSearchText('');
    };

    // 🔥 SAVE LOGIC — via new backend API (backend generates displayId now)
    const handleSaveDue = async () => {
        if (!selectedOrg) return Alert.alert("Missing", "Please select a Client/Organization.");
        if (!amount || isNaN(Number(amount))) return Alert.alert("Missing", "Please enter a valid Amount.");
        if (!billNo) return Alert.alert("Missing", "Please enter Bill No / Ref No.");

        setLoading(true);

        try {
            const saved = await createPaymentDue({
                orgId: selectedOrg.id,
                orgName: selectedOrg.orgName || selectedOrg.name,
                billNo,
                billDate: billDate.toLocaleDateString('en-GB'),
                amount: parseFloat(amount),
                dueDate: dueDate.toLocaleDateString('en-GB'),
                notes,
            });

            if (addNotification) {
                await addNotification({
                    title: "Manual Due Added 📝",
                    message: `₹${amount} due added for ${saved.orgName} by ${currentUser?.name}.`,
                    to: "Accountant",
                    route: "/payment_duelist",
                    type: "warning"
                });
            }
            Alert.alert("Success", `New Due Added Successfully! ID: ${saved.orderId}`);
            router.back();
        } catch (error: any) {
            Alert.alert("Error", error?.message || "Something went wrong.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add Manual Due</Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">

                    <Text style={styles.label}>Select Client / Organization *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setModalVisible(true)}>
                        <View>
                            <Text style={{ fontSize: 16, fontWeight: selectedOrg ? 'bold' : 'normal', color: selectedOrg ? '#333' : 'gray' }}>
                                {selectedOrg ? (selectedOrg.orgName || selectedOrg.name) : "Tap to select Client"}
                            </Text>
                            {selectedOrg?.city ? <Text style={{ fontSize: 12, color: 'gray', marginTop: 2 }}>📍 {selectedOrg.city}</Text> : null}
                        </View>
                        <Ionicons name="search" size={20} color="#3b5998" />
                    </TouchableOpacity>

                    <Text style={styles.label}>Bill No / Invoice No *</Text>
                    <TextInput 
                        style={styles.input}
                        placeholder="e.g. INV-2024-001"
                        value={billNo}
                        onChangeText={setBillNo}
                    />

                    <Text style={styles.label}>Bill Date (Invoice Date) *</Text>
                    <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowBillDatePicker(true)}>
                        <Ionicons name="document-text-outline" size={20} color="#e67e22" />
                        <Text style={styles.dateText}>{billDate.toLocaleDateString('en-GB')}</Text>
                    </TouchableOpacity>
                    {showBillDatePicker && (
                        <DateTimePicker
                            value={billDate}
                            mode="date"
                            display="default"
                            onChange={(event, selectedDate) => {
                                setShowBillDatePicker(false);
                                if (selectedDate) setBillDate(selectedDate);
                            }}
                        />
                    )}

                    <Text style={styles.label}>Due Amount (₹) *</Text>
                    <TextInput 
                        style={styles.inputAmount}
                        placeholder="0.00"
                        keyboardType="numeric"
                        value={amount}
                        onChangeText={setAmount}
                    />

                    <Text style={styles.label}>Payment Due Date *</Text>
                    <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                        <Ionicons name="calendar-outline" size={20} color="#3b5998" />
                        <Text style={styles.dateText}>{dueDate.toLocaleDateString('en-GB')}</Text>
                    </TouchableOpacity>
                    {showDatePicker && (
                        <DateTimePicker
                            value={dueDate}
                            mode="date"
                            display="default"
                            onChange={(event, selectedDate) => {
                                setShowDatePicker(false);
                                if (selectedDate) setDueDate(selectedDate);
                            }}
                        />
                    )}

                    <Text style={styles.label}>Remarks / Notes (Optional)</Text>
                    <TextInput 
                        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                        placeholder="Enter any specific details about this pending payment..."
                        multiline
                        value={notes}
                        onChangeText={setNotes}
                    />

                    <TouchableOpacity 
                        style={[styles.submitBtn, loading && { opacity: 0.7 }]} 
                        onPress={handleSaveDue}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <Ionicons name="save-outline" size={20} color="white" style={{marginRight: 8}} />
                                <Text style={styles.submitBtnText}>Save Due Entry</Text>
                            </>
                        )}
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>

            <Modal visible={modalVisible} animationType="slide">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setModalVisible(false)}>
                            <Ionicons name="arrow-back" size={24} color="#333" />
                        </TouchableOpacity>
                        <TextInput 
                            style={styles.searchInput} 
                            placeholder="Search Hospital/Client..." 
                            value={searchText}
                            onChangeText={handleSearch}
                            autoFocus
                        />
                        {searchText.length > 0 && (
                            <TouchableOpacity onPress={() => handleSearch('')}>
                                <Ionicons name="close-circle" size={20} color="gray" />
                            </TouchableOpacity>
                        )}
                    </View>
                    
                    <FlatList 
                        data={filteredOrgs}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ paddingBottom: 20 }}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.orgItem} onPress={() => handleSelectOrg(item)}>
                                <View style={styles.orgIcon}>
                                    <Ionicons name="business" size={20} color="#3b5998" />
                                </View>
                                <View style={{flex: 1}}>
                                    <Text style={styles.orgName}>{item.orgName || item.name}</Text>
                                    <Text style={styles.orgCity}>{item.city || 'No City'} {item.contactPerson ? `• ${item.contactPerson}` : ''}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            <Text style={{textAlign:'center', marginTop:30, color:'gray'}}>No clients found.</Text>
                        }
                    />
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 4, alignItems:'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    backBtn: { paddingRight: 10 },
    
    formContainer: { padding: 20, paddingBottom: 100 },
    label: { fontSize: 13, fontWeight: 'bold', color: '#555', marginTop: 15, marginBottom: 5 },
    
    input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15, color: '#333' },
    inputAmount: { backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#ffc107', borderRadius: 8, padding: 12, fontSize: 18, fontWeight: 'bold', color: '#d32f2f' },
    
    dropdown: { backgroundColor: '#e3f2fd', borderWidth: 1, borderColor: '#90caf9', borderRadius: 8, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    
    datePickerBtn: { backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center' },
    dateText: { fontSize: 15, color: '#333', marginLeft: 10, fontWeight: 'bold' },
    
    submitBtn: { backgroundColor: '#d32f2f', padding: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30, elevation: 3 },
    submitBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    modalContainer: { flex: 1, backgroundColor: 'white', paddingTop: 40 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor:'#f9f9f9' },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16, backgroundColor: '#fff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
    orgItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    orgIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e3f2fd', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    orgName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    orgCity: { fontSize: 12, color: 'gray', marginTop: 2 }
});
