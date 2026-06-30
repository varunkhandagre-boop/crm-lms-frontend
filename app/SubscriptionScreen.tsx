import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 FIREBASE IMPORTS
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useSaaSDB } from '../hooks/useSaaSDB';

export default function SubscriptionScreen() {
    const router = useRouter();
    const { companyId } = useLocalSearchParams(); // Registration page se companyId aayegi
    const { addSaaSData } = useSaaSDB();

    const [loading, setLoading] = useState(false);
    const [fetchingRates, setFetchingRates] = useState(true);

    // --- PRICING CONFIG FROM FIREBASE (Fallback rates agar internet na ho) ---
    const [rates, setRates] = useState({
        basePricePerEmployeePerYear: 1000,
        discountTwoYear: 15 // 15% Discount
    });

    // --- FORM STATE ---
    const [selectedPlan, setSelectedPlan] = useState<'1_year' | '2_year'>('1_year');
    const [employeeCount, setEmployeeCount] = useState('10');
    const [totalPrice, setTotalPrice] = useState(10000);

    // 🔥 1. LOAD PRICING FROM FIREBASE ON MOUNT
    useEffect(() => {
        const loadPricing = async () => {
            try {
                const docRef = doc(db, "settings", "pricing");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setRates({
                        basePricePerEmployeePerYear: Number(data.basePricePerEmployeePerYear) || 1000,
                        discountTwoYear: Number(data.discountTwoYear) || 15
                    });
                }
            } catch (e) {
                console.log("Error loading pricing from Firebase:", e);
            } finally {
                setFetchingRates(false);
            }
        };
        loadPricing();
    }, []);

    // 🔥 2. AUTOMATIC PRICE CALCULATION LOGIC
    useEffect(() => {
        const empCount = Number(employeeCount) || 0;
        let baseCost = empCount * rates.basePricePerEmployeePerYear;

        if (selectedPlan === '1_year') {
            setTotalPrice(baseCost);
        } else {
            // 2 Years Plan with Discount Logic
            let twoYearCost = baseCost * 2;
            let discountAmount = (twoYearCost * rates.discountTwoYear) / 100;
            setTotalPrice(twoYearCost - discountAmount);
        }
    }, [selectedPlan, employeeCount, rates]);

    // 🔥 3. HANDLE PAYMENT SUBMISSION (MANUAL UPI / QR FLOW)
    const handlePaymentSubmit = async () => {
        if (!employeeCount || Number(employeeCount) <= 0) {
            Alert.alert("Invalid Input", "Please enter a valid number of employees.");
            return;
        }

        setLoading(true);
        try {
            const expiryDate = new Date();
            if (selectedPlan === '1_year') {
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            } else {
                expiryDate.setFullYear(expiryDate.getFullYear() + 2);
            }

            // Create a pending subscription request for Admin to verify
            const subscriptionRequest = {
                companyId: companyId || 'MANUAL',
                planChosen: selectedPlan === '1_year' ? '1 Year Paid Plan' : '2 Year Paid Plan',
                employeesRequested: Number(employeeCount),
                amountPaid: totalPrice,
                status: 'Pending Verification',
                requestedExpiryDate: expiryDate.toISOString(),
                createdAt: new Date().toISOString()
            };

            const res = await addSaaSData("subscription_requests", subscriptionRequest, true);
            if (res.success) {
                Alert.alert(
                    "Payment Submitted ⏳",
                    "We are verifying your payment. Once confirmed by the Admin, your plan will be activated within 1 hour.",
                    [{ text: "OK", onPress: () => router.replace('/login' as any) }]
                );
            } else {
                Alert.alert("Error", "Could not process request.");
            }
        } catch (error) {
            Alert.alert("Error", "Something went wrong.");
        } finally {
            setLoading(false);
        }
    };

    if (fetchingRates) {
        return (
            <View style={[styles.container, { justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color="#3b5998" />
                <Text style={{ marginTop: 10, color: '#666' }}>Fetching latest plans...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Choose Subscription Plan</Text>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                    
                    {/* PLAN CARDS */}
                    <Text style={styles.sectionTitle}>Select Duration</Text>
                    <View style={styles.planContainer}>
                        {/* 1 YEAR PLAN */}
                        <TouchableOpacity 
                            style={[styles.planCard, selectedPlan === '1_year' && styles.selectedCard]} 
                            onPress={() => setSelectedPlan('1_year')}
                        >
                            <Ionicons name={selectedPlan === '1_year' ? "radio-button-on" : "radio-button-off"} size={22} color="#3b5998" />
                            <Text style={styles.planTitle}>1 Year Plan</Text>
                            <Text style={styles.planPrice}>₹{rates.basePricePerEmployeePerYear} / Emp / Year</Text>
                        </TouchableOpacity>

                        {/* 2 YEAR PLAN */}
                        <TouchableOpacity 
                            style={[styles.planCard, selectedPlan === '2_year' && styles.selectedCard]} 
                            onPress={() => setSelectedPlan('2_year')}
                        >
                            <View style={styles.badge}><Text style={styles.badgeText}>Save {rates.discountTwoYear}%</Text></View>
                            <Ionicons name={selectedPlan === '2_year' ? "radio-button-on" : "radio-button-off"} size={22} color="#3b5998" />
                            <Text style={styles.planTitle}>2 Year Plan</Text>
                            <Text style={styles.planPrice}>Best value for long-term</Text>
                        </TouchableOpacity>
                    </View>

                    {/* EMPLOYEE INPUT */}
                    <Text style={styles.sectionTitle}>Number of Employees</Text>
                    <TextInput 
                        style={styles.input}
                        keyboardType="numeric"
                        value={employeeCount}
                        onChangeText={setEmployeeCount}
                        placeholder="Enter number of team members..."
                    />

                    {/* BILLING SUMMARY CARD */}
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryTitle}>Order Summary</Text>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Plan Duration:</Text>
                            <Text style={styles.summaryValue}>{selectedPlan === '1_year' ? '1 Year' : '2 Years'}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Total Employees:</Text>
                            <Text style={styles.summaryValue}>{employeeCount || 0} Users</Text>
                        </View>
                        <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 10, marginTop: 10 }]}>
                            <Text style={styles.totalLabel}>Total Amount:</Text>
                            <Text style={styles.totalValue}>₹{totalPrice.toLocaleString('en-IN')}</Text>
                        </View>
                    </View>

                    {/* MANUAL UPI PAYMENT SCANNER METHOD */}
                    <View style={styles.qrCard}>
                        <Text style={styles.qrTitle}>👉 Scan & Pay via UPI QR</Text>
                        
                        {/* 🔥 Yahan Aapka Asli QR Code Aayega */}
                        <Image 
                            source={require('../assets/images/payment-qr.jpeg')} 
                            style={{ width: 180, height: 180, alignSelf: 'center', marginVertical: 15, borderRadius: 10 }}
                            resizeMode="contain"
                        />
                        
                        {/* 🔥 Apna Asli UPI ID Yahan Likhein */}
                        <Text style={styles.upiId}>UPI ID: aapka-number@ybl</Text>
                        
                        <Text style={styles.qrNote}>Please complete the payment on this UPI ID using any app (PhonePe, GPay, Paytm) and click the submit button below.</Text>
                    </View>

                    <TouchableOpacity style={styles.btn} onPress={handlePaymentSubmit} disabled={loading}>
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>I Have Paid — Submit Request</Text>}
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9f9f9' },
    header: { padding: 20, backgroundColor: '#fff', paddingTop: 50, elevation: 2, alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
    scroll: { padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 10 },
    planContainer: { flexDirection: 'row', gap: 10, marginBottom: 15 },
    planCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, position: 'relative' },
    selectedCard: { borderColor: '#3b5998', backgroundColor: '#f0f4f8', borderWidth: 2 },
    planTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 10 },
    planPrice: { fontSize: 12, color: '#666', marginTop: 5 },
    badge: { position: 'absolute', top: -10, right: 10, backgroundColor: 'orange', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, fontSize: 16, backgroundColor: '#fff', marginBottom: 20 },
    summaryCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 20, marginBottom: 20 },
    summaryTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryLabel: { color: '#666' },
    summaryValue: { fontWeight: 'bold', color: '#333' },
    totalLabel: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    totalValue: { fontSize: 18, fontWeight: 'bold', color: '#d32f2f' },
    qrCard: { backgroundColor: '#fff3cd', borderColor: '#ffeeba', borderWidth: 1, padding: 15, borderRadius: 10, marginBottom: 20 },
    qrTitle: { fontWeight: 'bold', color: '#856404', fontSize: 15 },
    upiId: { fontWeight: 'bold', color: '#3b5998', fontSize: 16, marginTop: 5 },
    qrNote: { fontSize: 12, color: '#856404', marginTop: 5 },
    btn: { backgroundColor: '#3b5998', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10 },
    btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});