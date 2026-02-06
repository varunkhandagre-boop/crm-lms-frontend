import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
import { useData } from './context/DataContext';

// 🔥🔥 1. FIREBASE IMPORTS ADDED
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig'; // ⚠️ Path check karein

export default function AddPaymentDue() {
    const router = useRouter();
    // ✅ Change 1: use 'addDue' instead of 'addWithMeta'
    const { addDue, orgList, currentUser } = useData();

    const [loading, setLoading] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState<any>(null);
    const [showOrgModal, setShowOrgModal] = useState(false);
    const [searchOrg, setSearchOrg] = useState('');

    const [amount, setAmount] = useState('');
    const [billNo, setBillNo] = useState('');
    const [dueDate, setDueDate] = useState(new Date());
    const [notes, setNotes] = useState('');
    const [showPicker, setShowPicker] = useState(false);

    const handleSubmit = async () => {
        if (!selectedOrg || !amount || !billNo) {
            Alert.alert("Missing Fields", "Please Select Customer, Amount and Bill Number.");
            return;
        }

        setLoading(true);
        try {
            // ✅ Change 2: Calling the simple addDue function
            await addDue({
                orgId: selectedOrg.id,
                orgName: selectedOrg.name,
                amount: parseFloat(amount),
                billNo,
                dueDate: dueDate.toISOString().split('T')[0],
                notes,
                status: 'Pending',
                type: 'Due',
                // Tracking who added it
                addedByUid: currentUser?.uid || 'unknown',
                addedByName: currentUser?.name || 'Admin'
            });

            // 🔥🔥 2. NOTIFICATION TRIGGER ADDED 🔥🔥
            try {
                await addDoc(collection(db, "notifications"), {
                    title: "New Payment Due 💰",
                    message: `${currentUser?.name} added a due of ₹${amount} for ${selectedOrg.name}.`,
                    to: "Admin",
                    route: "/payment_duelist",
                    read: false,
                    createdAt: new Date().toISOString(),
                    type: "alert"
                });
            } catch (e) {
                console.log("Notification Error:", e);
            }

            Alert.alert("Success", "Payment Due added & Admin Notified!");
            router.back();
            
        } catch (error: any) {
            // ✅ Change 3: Better Error Message
            console.log("Submit Error:", error);
            Alert.alert("Error", "Failed: " + (error.message || "Unknown Error"));
        } finally {
            setLoading(false);
        }
    };

    const onChangeDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowPicker(false);
        }
        if (selectedDate) {
            setDueDate(selectedDate);
        }
    };

    const filteredOrgs = orgList.filter((o:any) => o.name.toLowerCase().includes(searchOrg.toLowerCase()));

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add New Payment Due</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* 🔥 Added KeyboardAvoidingView wrapper */}
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={{flex: 1}}
            >
                <ScrollView 
                    contentContainerStyle={styles.scrollContainer} 
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.formCard}>
                        
                        <Text style={styles.label}>Customer / Organization Name *</Text>
                        <TouchableOpacity style={styles.selector} onPress={() => setShowOrgModal(true)}>
                            <Text style={[styles.selectorValue, !selectedOrg && {color:'#999'}]}>
                                {selectedOrg ? selectedOrg.name : "Select Customer..."}
                            </Text>
                            <Ionicons name="caret-down" size={20} color="#3b5998" />
                        </TouchableOpacity>

                        <Text style={styles.label}>Pending Amount (₹) *</Text>
                        <TextInput 
                            style={styles.input} 
                            placeholder="0.00" 
                            keyboardType="numeric"
                            value={amount}
                            onChangeText={setAmount}
                        />

                        <Text style={styles.label}>Invoice / Bill Number *</Text>
                        <TextInput 
                            style={styles.input} 
                            placeholder="INV-2025-001" 
                            value={billNo}
                            onChangeText={setBillNo}
                        />

                        <Text style={styles.label}>Due Date *</Text>
                        <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowPicker(true)}>
                            <Text style={styles.dateText}>{dueDate.toDateString()}</Text>
                            <Ionicons name="calendar-outline" size={20} color="#3b5998" />
                        </TouchableOpacity>

                        {showPicker && Platform.OS === 'ios' && (
                            <DateTimePicker
                                value={dueDate}
                                mode="date"
                                display="spinner"
                                onChange={onChangeDate}
                                style={{height: 120, marginTop: 10}}
                            />
                        )}

                        <Text style={styles.label}>Additional Notes (Optional)</Text>
                        <TextInput 
                            style={[styles.input, styles.textArea]} 
                            placeholder="Any specific instruction..." 
                            multiline
                            numberOfLines={4}
                            value={notes}
                            onChangeText={setNotes}
                        />

                        <TouchableOpacity 
                            style={[styles.submitBtn, loading && { backgroundColor: '#ccc' }]} 
                            onPress={handleSubmit}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <>
                                    <Ionicons name="save-outline" size={20} color="white" style={{ marginRight: 10 }} />
                                    <Text style={styles.submitBtnText}>Save Payment Due</Text>
                                </>
                            )}
                        </TouchableOpacity>

                    </View>
                    <View style={{height: 50}} />
                </ScrollView>
            </KeyboardAvoidingView>

            {showPicker && Platform.OS === 'android' && (
                <DateTimePicker
                    value={dueDate}
                    mode="date"
                    display="default"
                    onChange={onChangeDate}
                />
            )}

            <Modal visible={showOrgModal} animationType="slide">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Customer</Text>
                        <TouchableOpacity onPress={() => setShowOrgModal(false)}>
                            <Ionicons name="close-circle" size={30} color="#d32f2f"/>
                        </TouchableOpacity>
                    </View>
                    
                    <View style={styles.searchBox}>
                        <Ionicons name="search" size={20} color="gray" />
                        <TextInput 
                            style={styles.modalSearchInput} 
                            placeholder="Search Customer..." 
                            value={searchOrg} 
                            onChangeText={setSearchOrg} 
                            autoFocus 
                        />
                    </View>

                    <FlatList
                        data={filteredOrgs}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{paddingBottom: 50}}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.orgItem} onPress={() => { setSelectedOrg(item); setShowOrgModal(false); }}>
                                <Text style={styles.orgName}>{item.name}</Text>
                                <Text style={styles.orgCity}>{item.city}</Text>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            <Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No customers found.</Text>
                        }
                    />
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        padding: 15, 
        paddingTop: 50, 
        backgroundColor: 'white', 
        elevation: 2, 
        alignItems: 'center' 
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    scrollContainer: { padding: 20 },
    formCard: { 
        backgroundColor: 'white', 
        padding: 20, 
        borderRadius: 15, 
        elevation: 3, 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 2 }, 
        shadowOpacity: 0.1, 
        shadowRadius: 4 
    },
    label: { fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 8, marginTop: 10 },
    input: { 
        backgroundColor: '#f9f9f9', 
        borderWidth: 1, 
        borderColor: '#eee', 
        borderRadius: 10, 
        padding: 12, 
        fontSize: 15, 
        color: '#333' 
    },
    selector: { 
        backgroundColor: '#f0f4ff', 
        borderWidth: 1, 
        borderColor: '#d1d9ff', 
        borderRadius: 10, 
        padding: 12, 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
    },
    selectorValue: { fontSize: 15, fontWeight: 'bold', color: '#3b5998' },
    textArea: { height: 100, textAlignVertical: 'top' },
    datePickerBtn: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        backgroundColor: '#f9f9f9', 
        borderWidth: 1, 
        borderColor: '#eee', 
        borderRadius: 10, 
        padding: 12 
    },
    dateText: { fontSize: 15, color: '#333' },
    submitBtn: { 
        backgroundColor: '#3b5998', 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: 15, 
        borderRadius: 12, 
        marginTop: 30, 
        elevation: 2 
    },
    submitBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    modalContainer: { flex: 1, backgroundColor: 'white', padding: 20, paddingTop: 50 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    searchBox: { 
        flexDirection:'row', 
        alignItems:'center', 
        backgroundColor: '#f0f2f5', 
        paddingHorizontal: 12, 
        borderRadius: 10, 
        marginBottom: 20,
        height: 50
    },
    modalSearchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
    orgItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    orgName: { fontWeight: 'bold', fontSize: 16, color: '#333' },
    orgCity: { color: 'gray', fontSize: 12 }
});