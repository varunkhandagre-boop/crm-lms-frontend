import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import RazorpayCheckout from 'react-native-razorpay';

import { ActivePlan, listActivePlans } from '../services/api/plans';
import { fetchPublicBillingSettings, fetchPublicGatewayConfig, PublicGatewayConfig } from '../services/api/settings';
import { submitSubscriptionRequest } from '../services/api/subscriptionRequests';
import { useData } from './context/DataContext';

const DEFAULT_AUTOMATION_ADDON_PRICE = 3000;

export default function SubscriptionScreen() {
    const router = useRouter();
    const { currentUser } = useData();

    const [loading, setLoading] = useState(false);
    const [alreadySubmitted, setAlreadySubmitted] = useState(false);
    const [fetchingRates, setFetchingRates] = useState(true);

    const [plans, setPlans] = useState<ActivePlan[]>([]);
    const [upiId, setUpiId] = useState('');
    const [upiPayeeName, setUpiPayeeName] = useState('Company');
    const [gatewayConfig, setGatewayConfig] = useState<PublicGatewayConfig | null>(null);

    const [selectedPlanId, setSelectedPlanId] = useState<string>('');
    const [employeeCount, setEmployeeCount] = useState('10');
    const [totalPrice, setTotalPrice] = useState(0);
    const [wantsAutomation, setWantsAutomation] = useState(false);
    const [automationAddonPrice, setAutomationAddonPrice] = useState(DEFAULT_AUTOMATION_ADDON_PRICE);

    // =========================================================
    // 1. LOAD PLANS + BILLING + GATEWAY CONFIG
    // =========================================================
    useEffect(() => {
        const loadAllConfig = async () => {
            try {
                const [activePlans, billing, gateway] = await Promise.all([
                    listActivePlans(),
                    fetchPublicBillingSettings().catch(() => null),
                    fetchPublicGatewayConfig().catch(() => null),
                ]);

                setPlans(activePlans);
                if (activePlans.length > 0) setSelectedPlanId(activePlans[0].id);

                if (billing) {
                    setUpiId(billing.upiId || '');
                    setUpiPayeeName(billing.upiPayeeName || 'Company');
                    setAutomationAddonPrice(Number(billing.automationAddonPrice) || DEFAULT_AUTOMATION_ADDON_PRICE);
                }
                if (gateway) setGatewayConfig(gateway);
            } catch (e: any) {
                Alert.alert('Error', e.message || 'Could not load plans. Please check your internet connection.');
            } finally {
                setFetchingRates(false);
            }
        };
        loadAllConfig();
    }, []);

    // =========================================================
    // 2. AUTOMATIC PRICE CALCULATION
    // =========================================================
    useEffect(() => {
        const plan = plans.find(p => p.id === selectedPlanId);
        if (!plan) { setTotalPrice(0); return; }

        const empCount = Number(employeeCount) || 0;
        const yearsInPlan = plan.durationMonths / 12;
        let baseCost = empCount * plan.pricePerEmployee * yearsInPlan;
        const discountAmount = (baseCost * (plan.discountPercent || 0)) / 100;
        let finalPrice = Math.round(baseCost - discountAmount);
        if (wantsAutomation) finalPrice += automationAddonPrice;
        setTotalPrice(finalPrice);
    }, [selectedPlanId, employeeCount, plans, wantsAutomation]);

    const selectedPlan = plans.find(p => p.id === selectedPlanId);

    // =========================================================
    // 3. COMMON — submit the request (companyId comes from the auth
    //    token server-side, not passed here)
    // =========================================================
    const saveSubscriptionRequest = async () => {
        return submitSubscriptionRequest({
            planId: selectedPlan!.id,
            employeesRequested: Number(employeeCount),
            automationRequested: wantsAutomation,
            amountPaid: totalPrice,
        });
    };

    // =========================================================
    // 4. VALIDATE FORM
    // =========================================================
    const validateForm = (): string | null => {
        if (!employeeCount || Number(employeeCount) <= 0)
            return 'Please enter a valid number of employees.';
        if (!selectedPlan)
            return 'Please select a plan.';
        return null;
    };

    // =========================================================
    // 5. RAZORPAY PAYMENT
    // =========================================================
    const handleRazorpayPayment = async () => {
        const err = validateForm();
        if (err) { Alert.alert('Invalid Input', err); return; }

        if (!gatewayConfig || !gatewayConfig.isEnabled || !gatewayConfig.keyId) {
            Alert.alert('Not Available', 'Online payment is not available right now. Please use UPI QR below.');
            return;
        }

        setLoading(true);
        try {
            const options = {
                key: gatewayConfig.keyId,
                amount: totalPrice * 100, // Razorpay paisa mein leta hai
                currency: gatewayConfig.currency || 'INR',
                name: gatewayConfig.companyName || 'CRM Subscription',
                image: gatewayConfig.companyLogo || '',
                description: `${selectedPlan?.label} — ${employeeCount} Users${wantsAutomation ? ' + Automation' : ''}`,
                prefill: {
                    name: currentUser?.name || '',
                    email: currentUser?.email || '',
                    contact: currentUser?.mobile || '',
                },
                theme: {
                    color: gatewayConfig.companyColor || '#d32f2f',
                },
            };

            RazorpayCheckout.open(options)
                .then(async (paymentData: any) => {
                    console.log('✅ Razorpay Payment:', paymentData.razorpay_payment_id);
                    try {
                        await saveSubscriptionRequest();
                        setAlreadySubmitted(true);
                        Alert.alert(
                            'Payment Successful ✅',
                            `Payment ID: ${paymentData.razorpay_payment_id}\n\nYour plan will be activated within 1 hour.`,
                            [{ text: 'OK', onPress: () => router.replace(currentUser ? '/' : '/login' as any) }]
                        );
                    } catch (e: any) {
                        Alert.alert('Error', e.message || 'Payment succeeded but we could not record the request. Please contact support with your Payment ID.');
                    } finally {
                        setLoading(false);
                    }
                })
                .catch((error: any) => {
                    setLoading(false);
                    if (error.code === 2) {
                        console.log('Payment cancelled by user');
                    } else {
                        Alert.alert('Payment Failed', error.description || 'Payment could not be completed. Try again or use UPI QR.');
                    }
                });
        } catch (e) {
            setLoading(false);
            Alert.alert('Error', 'Could not initiate payment. Please try again.');
        }
    };

    // =========================================================
    // 6. MANUAL UPI PAYMENT
    // =========================================================
    const handleManualUpiSubmit = async () => {
        const err = validateForm();
        if (err) { Alert.alert('Invalid Input', err); return; }

        setLoading(true);
        try {
            await saveSubscriptionRequest();
            setAlreadySubmitted(true);
            Alert.alert(
                'Payment Submitted ⏳',
                'We are verifying your payment. Once confirmed by the Admin, your plan will be activated within 1 hour.',
                [{ text: 'OK', onPress: () => router.replace(currentUser ? '/' : '/login' as any) }]
            );
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    // =========================================================
    // LOADING STATE
    // =========================================================
    if (fetchingRates) {
        return (
            <View style={[styles.container, { justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color="#3b5998" />
                <Text style={{ marginTop: 10, color: '#666', textAlign: 'center' }}>Fetching latest plans...</Text>
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

    const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiPayeeName)}&am=${totalPrice}&cu=INR`;
    const razorpayEnabled = gatewayConfig?.isEnabled === true && !!gatewayConfig.keyId;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.replace('/' as any)} style={{ position: 'absolute', left: 20, bottom: 15 }}>
                    <Ionicons name="arrow-back" size={24} color="#3b5998" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Subscription & Renewal</Text>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                    <Text style={styles.sectionTitle}>Select Plan</Text>
                    <View style={styles.planContainer}>
                        {plans.map((plan) => (
                            <TouchableOpacity
                                key={plan.id}
                                style={[styles.planCard, selectedPlanId === plan.id && styles.selectedCard]}
                                onPress={() => setSelectedPlanId(plan.id)}
                            >
                                {plan.discountPercent > 0 && (
                                    <View style={styles.discountBadge}>
                                        <Text style={styles.badgeText}>Save {plan.discountPercent}%</Text>
                                    </View>
                                )}
                                <Ionicons
                                    name={selectedPlanId === plan.id ? 'radio-button-on' : 'radio-button-off'}
                                    size={22}
                                    color="#3b5998"
                                />
                                <Text style={styles.planTitle}>{plan.label}</Text>
                                <Text style={styles.planPrice}>₹{plan.pricePerEmployee} / Emp / Year</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={styles.sectionTitle}>Number of Employees</Text>
                    <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={employeeCount}
                        onChangeText={setEmployeeCount}
                        placeholder="Enter number of team members..."
                    />

                    <Text style={styles.sectionTitle}>Add-ons</Text>
                    <TouchableOpacity
                        style={[styles.addonCard, wantsAutomation && styles.addonCardActive]}
                        onPress={() => setWantsAutomation(!wantsAutomation)}
                        activeOpacity={0.8}
                    >
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={styles.addonTitle}>WhatsApp / Email Automation</Text>
                            <Text style={styles.addonSubtitle}>
                                Order, payment, and service updates sent to customers automatically
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.addonPrice}>+₹{automationAddonPrice}</Text>
                            <Ionicons
                                name={wantsAutomation ? 'checkbox' : 'square-outline'}
                                size={24}
                                color={wantsAutomation ? '#2e7d32' : '#999'}
                            />
                        </View>
                    </TouchableOpacity>

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
                        {selectedPlan && selectedPlan.discountPercent > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Discount:</Text>
                                <Text style={[styles.summaryValue, { color: '#2e7d32' }]}>
                                    -{selectedPlan.discountPercent}% applied
                                </Text>
                            </View>
                        )}
                        {wantsAutomation && (
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Automation Add-on:</Text>
                                <Text style={styles.summaryValue}>+₹{automationAddonPrice}</Text>
                            </View>
                        )}
                        <View style={[styles.summaryRow, styles.totalRow]}>
                            <Text style={styles.totalLabel}>Total Amount:</Text>
                            <Text style={styles.totalValue}>₹{totalPrice.toLocaleString('en-IN')}</Text>
                        </View>
                    </View>

                    <Text style={styles.sectionTitle}>Payment Options</Text>

                    {razorpayEnabled && (
                        <TouchableOpacity
                            style={[styles.razorpayBtn, (loading || alreadySubmitted) && { opacity: 0.6 }]}
                            onPress={handleRazorpayPayment}
                            disabled={loading || alreadySubmitted}
                            activeOpacity={0.85}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <>
                                    <Ionicons name="card" size={22} color="white" />
                                    <View style={{ marginLeft: 10 }}>
                                        <Text style={styles.razorpayBtnText}>
                                            Pay ₹{totalPrice.toLocaleString('en-IN')} Online
                                        </Text>
                                        <Text style={styles.razorpayBtnSub}>
                                            Card • UPI • Net Banking • Wallet
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" style={{ marginLeft: 'auto' }} />
                                </>
                            )}
                        </TouchableOpacity>
                    )}

                    {razorpayEnabled && upiId && (
                        <View style={styles.orDivider}>
                            <View style={styles.orLine} />
                            <Text style={styles.orText}>OR</Text>
                            <View style={styles.orLine} />
                        </View>
                    )}

                    {upiId ? (
                        <View style={styles.qrCard}>
                            <Text style={styles.qrTitle}>👉 Scan & Pay via UPI QR</Text>
                            <View style={styles.qrCodeWrapper}>
                                <QRCode value={upiString} size={180} />
                            </View>
                            <Text style={styles.upiId}>UPI ID: {upiId}</Text>
                            <Text style={styles.qrNote}>
                                Complete the payment using any UPI app (PhonePe, GPay, Paytm), then tap the button below.
                            </Text>

                            <TouchableOpacity
                                style={[styles.manualBtn, (loading || alreadySubmitted) && { opacity: 0.6 }]}
                                onPress={handleManualUpiSubmit}
                                disabled={loading || alreadySubmitted}
                            >
                                {loading ? (
                                    <ActivityIndicator color="white" />
                                ) : alreadySubmitted ? (
                                    <Text style={styles.manualBtnText}>Request Sent — Awaiting Approval ⏳</Text>
                                ) : (
                                    <Text style={styles.manualBtnText}>I Have Paid — Submit Request</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : !razorpayEnabled ? (
                        <View style={styles.noPaymentCard}>
                            <Ionicons name="warning-outline" size={32} color="#e67e22" />
                            <Text style={styles.noPaymentText}>
                                Payment options are not configured yet.{'\n'}Please contact support to renew your plan.
                            </Text>
                        </View>
                    ) : null}

                    {razorpayEnabled && gatewayConfig?.isTestMode && (
                        <View style={styles.testModeBanner}>
                            <Ionicons name="flask" size={14} color="#1565c0" />
                            <Text style={styles.testModeText}>
                                Payment gateway is in Test Mode — no real money will be charged.
                            </Text>
                        </View>
                    )}

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9f9f9' },
    header: { padding: 20, backgroundColor: '#fff', paddingTop: 50, elevation: 2, alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
    scroll: { padding: 20, paddingBottom: 60 },
    sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginTop: 18, marginBottom: 10 },
    planContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    planCard: { flexBasis: '47%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 15, position: 'relative' },
    selectedCard: { borderColor: '#3b5998', backgroundColor: '#f0f4f8', borderWidth: 2 },
    planTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginTop: 10 },
    planPrice: { fontSize: 12, color: '#666', marginTop: 4 },
    discountBadge: { position: 'absolute', top: -10, right: 10, backgroundColor: 'orange', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, fontSize: 16, backgroundColor: '#fff', marginBottom: 10 },
    addonCard: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 15, marginBottom: 10, alignItems: 'center' },
    addonCardActive: { borderColor: '#2e7d32', borderWidth: 2, backgroundColor: '#f0f8f0' },
    addonTitle: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    addonSubtitle: { fontSize: 12, color: '#666', marginTop: 3 },
    addonPrice: { fontSize: 14, fontWeight: 'bold', color: '#2e7d32', marginBottom: 4 },
    summaryCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 18, marginBottom: 10 },
    summaryTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 14 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    totalRow: { borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 12, marginTop: 8 },
    summaryLabel: { color: '#666', fontSize: 14 },
    summaryValue: { fontWeight: 'bold', color: '#333', fontSize: 14 },
    totalLabel: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    totalValue: { fontSize: 20, fontWeight: 'bold', color: '#d32f2f' },
    razorpayBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b5998', padding: 18, borderRadius: 14, marginBottom: 10, elevation: 3 },
    razorpayBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    razorpayBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
    orDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
    orLine: { flex: 1, height: 1, backgroundColor: '#ddd' },
    orText: { fontSize: 12, fontWeight: 'bold', color: '#aaa' },
    qrCard: { backgroundColor: '#fff3cd', borderColor: '#ffeeba', borderWidth: 1, padding: 16, borderRadius: 12, marginBottom: 10 },
    qrTitle: { fontWeight: 'bold', color: '#856404', fontSize: 15, marginBottom: 5 },
    qrCodeWrapper: { alignSelf: 'center', marginVertical: 14, backgroundColor: 'white', padding: 12, borderRadius: 10, elevation: 2 },
    upiId: { fontWeight: 'bold', color: '#3b5998', fontSize: 15, textAlign: 'center', marginBottom: 8 },
    qrNote: { fontSize: 12, color: '#856404', lineHeight: 18 },
    manualBtn: { backgroundColor: '#2e7d32', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 14 },
    manualBtnText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
    noPaymentCard: { backgroundColor: '#fff3e0', borderRadius: 12, padding: 20, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#ffe0b2' },
    noPaymentText: { color: '#e67e22', fontSize: 13, textAlign: 'center', lineHeight: 20 },
    testModeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e3f2fd', padding: 10, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: '#bbdefb' },
    testModeText: { flex: 1, fontSize: 12, color: '#1565c0', lineHeight: 18 },
});
