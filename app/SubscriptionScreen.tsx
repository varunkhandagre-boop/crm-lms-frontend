import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

// 🔥 FIREBASE IMPORTS
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

type PlanConfig = {
    id: string;
    label: string;
    durationMonths: number;
    pricePerEmployee: number;
    discountPercent: number;
    active: boolean;
};

export default function SubscriptionScreen() {
    const router = useRouter();
    const { companyId } = useLocalSearchParams();
    const { addSaaSData } = useSaaSDB();
    const { currentUser } = useData(); 
    const effectiveCompanyId = companyId || currentUser?.companyId || null;

    const [loading, setLoading] = useState(false);
    const [alreadySubmitted, setAlreadySubmitted] = useState(false);
    const [fetchingRates, setFetchingRates] = useState(true);

    // --- DYNAMIC CONFIG FROM FIREBASE ---
    const [plans, setPlans] = useState<PlanConfig[]>([]);
    const [upiId, setUpiId] = useState('');
    const [upiPayeeName, setUpiPayeeName] = useState('Company');

    // --- FORM STATE ---
    const [selectedPlanId, setSelectedPlanId] = useState<string>('');
    const [employeeCount, setEmployeeCount] = useState('10');
    const [totalPrice, setTotalPrice] = useState(0);

    // 🔥 1. LOAD PRICING CONFIG FROM FIREBASE
    useEffect(() => {
        const loadPricing = async () => {
            try {
                const docRef = doc(db, "settings", "pricing");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const activePlans: PlanConfig[] = (data.plans || [])
    .filter((p: any) => p.active !== false && p.active !== "false")
    .map((p: any) => ({
        id: String(p.id),
        label: String(p.label),
        durationMonths: Number(p.durationMonths),
        pricePerEmployee: Number(p.pricePerEmployee),
        discountPercent: Number(p.discountPercent),
        active: true,
    }));
                    setPlans(activePlans);
                    if (activePlans.length > 0) setSelectedPlanId(activePlans[0].id);
                    setUpiId(data.upiId || '');
                    setUpiPayeeName(data.upiPayeeName || 'Company');
                }
            } catch (e) {
                console.log("Error loading pricing from Firebase:", e);
                Alert.alert("Error", "Could not load plans. Please check your internet connection.");
            } finally {
                setFetchingRates(false);
            }
        };
        loadPricing();
    }, []);

    // 🔥 2. AUTOMATIC PRICE CALCULATION
    useEffect(() => {
        const plan = plans.find(p => p.id === selectedPlanId);
        if (!plan) { setTotalPrice(0); return; }

        const empCount = Number(employeeCount) || 0;
        const yearsInPlan = plan.durationMonths / 12;
        let baseCost = empCount * plan.pricePerEmployee * yearsInPlan;

        const discountAmount = (baseCost * (plan.discountPercent || 0)) / 100;
        setTotalPrice(Math.round(baseCost - discountAmount));
    }, [selectedPlanId, employeeCount, plans]);

    const selectedPlan = plans.find(p => p.id === selectedPlanId);

    // 🔥 3. HANDLE PAYMENT SUBMISSION
    const handlePaymentSubmit = async () => {
        if (!employeeCount || Number(employeeCount) <= 0) {
            Alert.alert("Invalid Input", "Please enter a valid number of employees.");
            return;
        }
        if (!selectedPlan) {
            Alert.alert("Error", "Please select a plan.");
            return;
        }
        if (!effectiveCompanyId) {
    Alert.alert("Error", "Company ID not found. Please login again and retry.");
    return;
}

        setLoading(true);
        try {
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + selectedPlan.durationMonths);

            const subscriptionRequest = {
                companyId: effectiveCompanyId,
                planChosen: selectedPlan.label,
                planId: selectedPlan.id,
                employeesRequested: Number(employeeCount),
                amountPaid: totalPrice,
                status: 'Pending Verification',
                requestedExpiryDate: expiryDate.toISOString(),
                createdAt: new Date().toISOString()
            };

            const res = await addSaaSData("subscription_requests", subscriptionRequest, true);
            if (res.success) {
                setAlreadySubmitted(true);
                Alert.alert(
    "Payment Submitted ⏳",
    "We are verifying your payment. Once confirmed by the Admin, your plan will be activated within 1 hour.",
    [{
        text: "OK", onPress: () => {
            if (currentUser) {
                router.replace('/' as any); // existing company → apne dashboard/home pe bhejo
            } else {
                router.replace('/login' as any); // naya registration → login pe bhejo
            }
        }
    }]
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

    if (plans.length === 0) {
        return (
            <View style={[styles.container, { justifyContent: 'center', padding: 20 }]}>
                <Text style={{ textAlign: 'center', color: '#666' }}>
                    No active plans available right now. Please contact support.
                </Text>
            </View>
        );
    }

    // UPI Deep Link with dynamic amount — QR is generated at runtime, no Storage needed
    const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiPayeeName)}&am=${totalPrice}&cu=INR`;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{ position: 'absolute', left: 20, bottom: 15 }}>
                    <Ionicons name="arrow-back" size={24} color="#3b5998" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Subscription & Renewal</Text>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                    {/* PLAN CARDS - DYNAMIC FROM FIRESTORE */}
                    <Text style={styles.sectionTitle}>Select Plan</Text>
                    <View style={styles.planContainer}>
                        {plans.map((plan) => (
                            <TouchableOpacity
                                key={plan.id}
                                style={[styles.planCard, selectedPlanId === plan.id && styles.selectedCard]}
                                onPress={() => setSelectedPlanId(plan.id)}
                            >
                                {plan.discountPercent > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>Save {plan.discountPercent}%</Text>
                                    </View>
                                )}
                                <Ionicons
                                    name={selectedPlanId === plan.id ? "radio-button-on" : "radio-button-off"}
                                    size={22}
                                    color="#3b5998"
                                />
                                <Text style={styles.planTitle}>{plan.label}</Text>
                                <Text style={styles.planPrice}>₹{plan.pricePerEmployee} / Emp / Year</Text>
                            </TouchableOpacity>
                        ))}
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
                            <Text style={styles.summaryLabel}>Plan:</Text>
                            <Text style={styles.summaryValue}>{selectedPlan?.label}</Text>
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

                    {/* MANUAL UPI PAYMENT - QR GENERATED AT RUNTIME, NO STORAGE NEEDED */}
                    <View style={styles.qrCard}>
                        <Text style={styles.qrTitle}>👉 Scan & Pay via UPI QR</Text>

                        {upiId ? (
                            <View style={{ alignSelf: 'center', marginVertical: 15, backgroundColor: 'white', padding: 12, borderRadius: 10 }}>
                                <QRCode value={upiString} size={180} />
                            </View>
                        ) : (
                            <Text style={{ textAlign: 'center', color: '#d32f2f', marginVertical: 15 }}>
                                UPI ID not configured. Please contact support.
                            </Text>
                        )}

                        <Text style={styles.upiId}>UPI ID: {upiId || 'Not Set'}</Text>

                        <Text style={styles.qrNote}>
                            Please complete the payment on this UPI ID using any app (PhonePe, GPay, Paytm) and click the submit button below.
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.btn, alreadySubmitted && { backgroundColor: '#ccc' }]}
                        onPress={handlePaymentSubmit}
                        disabled={loading || alreadySubmitted}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : alreadySubmitted ? (
                            <Text style={styles.btnText}>Request Sent — Awaiting Approval ⏳</Text>
                        ) : (
                            <Text style={styles.btnText}>I Have Paid — Submit Request</Text>
                        )}
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
    planContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
    planCard: { flexBasis: '47%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, position: 'relative' },
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
    upiId: { fontWeight: 'bold', color: '#3b5998', fontSize: 16, marginTop: 5, textAlign: 'center' },
    qrNote: { fontSize: 12, color: '#856404', marginTop: 5 },
    btn: { backgroundColor: '#3b5998', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10 },
    btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});