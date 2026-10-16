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
import { openRazorpay, RazorpaySuccess } from '../utils/razorpay';
import InvoicesCard from '../components/InvoicesCard';

import { ActivePlan, listActivePlans } from '../services/api/plans';
import { fetchPublicBillingSettings, fetchPublicGatewayConfig, PublicGatewayConfig } from '../services/api/settings';
import { createRenewalOrder, RenewalOrder, submitSubscriptionRequest, verifyRenewal } from '../services/api/subscriptionRequests';
import { fetchCompanyProfile } from '../services/api/companies';
import { useData } from './context/DataContext';
import { useHeaderTop } from '../hooks/useHeaderTop';

const DEFAULT_AUTOMATION_ADDON_PRICE = 3000;

// App Store rule 3.1.1: on iPhone the app may not sell the plan with an outside
// payment (Razorpay / UPI) or point to one. iOS shows the current plan only.
const PURCHASE_ALLOWED = Platform.OS !== 'ios';

// Razorpay's native SDK hands the failure back as a raw JSON string inside
// `description` ({"error":{code,description,source,step,reason,metadata}}), which
// is what users were seeing verbatim. Turn it into a readable message. When the
// SDK gives no text (description is the literal string "undefined"), fall back to
// what source/step tell us.
function friendlyRazorpayError(error: any): string {
    let inner: any = null;
    try {
        const parsed = typeof error?.description === 'string' ? JSON.parse(error.description) : null;
        inner = parsed?.error ?? null;
    } catch { /* description wasn't JSON — fall through */ }

    const text = String(inner?.description ?? error?.description ?? '').trim();
    if (text && text !== 'undefined' && !text.startsWith('{')) return text;

    if (inner?.source === 'customer' && inner?.step === 'payment_authentication') {
        return 'The payment could not be authenticated. This usually means it was cancelled, the OTP / UPI PIN was wrong or expired, or the bank declined it. Please try again or use another payment method.';
    }
    return 'Payment could not be completed. Please try again, or use the UPI QR option below.';
}

export default function SubscriptionScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    const { currentUser, refreshCompanyProfile } = useData();

    const [loading, setLoading] = useState(false);
    const [alreadySubmitted, setAlreadySubmitted] = useState(false);
    const [fetchingRates, setFetchingRates] = useState(true);

    const [plans, setPlans] = useState<ActivePlan[]>([]);
    // Current plan card (was at the top of Company Profile).
    const [current, setCurrent] = useState<{ plan: string; expiry: string; daysLeft: number | null; used: number; max: number; active: boolean } | null>(null);
    useEffect(() => {
        if (!currentUser?.companyId) return;
        fetchCompanyProfile()
            .then((cp: any) => {
                const exp = cp.expiryDate ? new Date(cp.expiryDate) : null;
                setCurrent({
                    plan: cp.plan || 'Free Trial',
                    expiry: exp ? exp.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-',
                    daysLeft: exp ? Math.ceil((exp.getTime() - Date.now()) / 86400000) : null,
                    used: cp.currentEmployees || 0,
                    max: cp.maxEmployees || 0,
                    active: !!cp.isActive,
                });
            })
            .catch(() => { /* card just stays hidden */ });
    }, [currentUser?.companyId]);
    const [upiId, setUpiId] = useState('');
    const [upiPayeeName, setUpiPayeeName] = useState('Company');
    const [gatewayConfig, setGatewayConfig] = useState<PublicGatewayConfig | null>(null);

    const [selectedPlanId, setSelectedPlanId] = useState<string>('');
    // The landing page's "Buy now" passes ?plan=<id>&team=<n> through registration.
    const params = useLocalSearchParams<{ planId?: string; team?: string }>();
    const wantedPlanId = typeof params.planId === 'string' ? params.planId : '';
    const wantedTeam = typeof params.team === 'string' && /^\d{1,4}$/.test(params.team) && Number(params.team) > 0 ? params.team : '';
    const [employeeCount, setEmployeeCount] = useState(wantedTeam || '10');
    const [totalPrice, setTotalPrice] = useState(0);
    const [wantsAutomation, setWantsAutomation] = useState(false);
    const [automationAddonPrice, setAutomationAddonPrice] = useState(DEFAULT_AUTOMATION_ADDON_PRICE);
    const [gstPercent, setGstPercent] = useState(0);
    const [price, setPrice] = useState({ planAmount: 0, subtotal: 0, gstAmount: 0 });

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
                if (activePlans.length > 0) setSelectedPlanId(activePlans.some(p => p.id === wantedPlanId) ? wantedPlanId : activePlans[0].id);

                if (billing) {
                    setUpiId(billing.upiId || '');
                    setUpiPayeeName(billing.upiPayeeName || 'Company');
                    setAutomationAddonPrice(Number(billing.automationAddonPrice) || DEFAULT_AUTOMATION_ADDON_PRICE);
                    setGstPercent(Number(billing.gstPercent) || 0);
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
        if (!plan) { setTotalPrice(0); setPrice({ planAmount: 0, subtotal: 0, gstAmount: 0 }); return; }

        // Same formula as the server checkout (checkoutAmount): plan after discount + add-on, then GST.
        const empCount = Number(employeeCount) || 0;
        const yearsInPlan = plan.durationMonths / 12;
        const baseCost = empCount * Number(plan.pricePerEmployee) * yearsInPlan;
        const planAmount = Math.round(baseCost - (baseCost * (Number(plan.discountPercent) || 0)) / 100);
        const subtotal = planAmount + (wantsAutomation ? automationAddonPrice : 0);
        const gstAmount = Math.round((subtotal * gstPercent) / 100);
        setPrice({ planAmount, subtotal, gstAmount });
        setTotalPrice(subtotal + gstAmount);
    }, [selectedPlanId, employeeCount, plans, wantsAutomation, automationAddonPrice, gstPercent]);

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
        let order: RenewalOrder;
        try {
            // The server prices the plan and opens a Razorpay order for it.
            order = await createRenewalOrder({
                planId: selectedPlan!.id,
                employeesRequested: Number(employeeCount),
                automationRequested: wantsAutomation,
            });
        } catch (e: any) {
            setLoading(false);
            Alert.alert('Could not start payment', e?.message || 'Please try again, or use the UPI QR option below.');
            return;
        }

        let paymentData: RazorpaySuccess;
        try {
            paymentData = await openRazorpay({
                key: order.razorpay.keyId,
                order_id: order.razorpay.orderId,
                amount: order.razorpay.amount,
                currency: order.razorpay.currency,
                name: order.razorpay.name,
                image: order.razorpay.image || gatewayConfig.companyLogo || '',
                description: order.razorpay.description,
                prefill: order.razorpay.prefill,
                theme: { color: order.razorpay.color || gatewayConfig.companyColor || '#d32f2f' },
            });
        } catch (error: any) {
            setLoading(false);
            if (error?.code === 2) {
                console.log('Payment cancelled by user');
            } else {
                console.log('Razorpay error (raw):', error?.message || JSON.stringify(error));
                Alert.alert('Payment Failed', friendlyRazorpayError(error));
            }
            return;
        }

        const paymentId = paymentData.razorpay_payment_id;
        try {
            const result = await verifyRenewal({
                renewalId: order.renewalId,
                razorpayOrderId: paymentData.razorpay_order_id || order.razorpay.orderId,
                razorpayPaymentId: paymentId,
                razorpaySignature: paymentData.razorpay_signature || '',
            });
            setAlreadySubmitted(true);
            await refreshCompanyProfile?.().catch(() => {});
            const till = result.expiryDate
                ? new Date(result.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : '';
            Alert.alert(
                'Plan activated ✅',
                `${result.planName || selectedPlan?.label} for ${result.employeeLimit} employees is active${till ? ` till ${till}` : ''}.\n\nPayment ID: ${paymentId}`,
                [{ text: 'OK', onPress: () => router.replace(currentUser ? '/' : '/login' as any) }]
            );
        } catch (e: any) {
            // Money was taken; Razorpay also tells our server directly, which
            // activates the plan within a few minutes.
            setAlreadySubmitted(true);
            Alert.alert(
                'Payment received',
                `Payment ID: ${paymentId}\n\n${e?.message ? e.message + '\n\n' : ''}Your plan will be activated within a few minutes. If it is not active in 30 minutes, contact support with this Payment ID.`,
                [{ text: 'OK', onPress: () => router.replace(currentUser ? '/' : '/login' as any) }]
            );
        } finally {
            setLoading(false);
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

    if (PURCHASE_ALLOWED && plans.length === 0) {
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
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.replace('/' as any)} style={{ position: 'absolute', left: 20, bottom: 15 }}>
                    <Ionicons name="arrow-back" size={24} color="#3b5998" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Plan & Renewal</Text>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                    {current && (
                        <View style={styles.currentCard}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.currentLabel}>CURRENT PLAN</Text>
                                    <Text style={styles.currentPlan}>{current.plan}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.currentLabel}>VALID TILL</Text>
                                    <Text style={[styles.currentPlan, { color: current.active && (current.daysLeft ?? 1) > 0 ? '#2e7d32' : '#d32f2f' }]}>{current.expiry}</Text>
                                    {current.daysLeft !== null && (
                                        <Text style={{ fontSize: 11, color: current.daysLeft <= 7 ? '#d32f2f' : '#666' }}>
                                            {current.daysLeft > 0 ? `${current.daysLeft} days left` : 'Expired'}
                                        </Text>
                                    )}
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 5 }}>
                                <Text style={styles.currentLabel}>EMPLOYEES USED</Text>
                                <Text style={{ fontSize: 12, color: '#333', fontWeight: 'bold' }}>{current.used} / {current.max}</Text>
                            </View>
                            <View style={{ height: 8, backgroundColor: '#ddd', borderRadius: 4, overflow: 'hidden' }}>
                                <View style={{ height: '100%', width: `${Math.min(current.max > 0 ? (current.used / current.max) * 100 : 0, 100)}%`, backgroundColor: current.max > 0 && current.used >= current.max ? '#d32f2f' : '#4caf50' }} />
                            </View>
                            {PURCHASE_ALLOWED && <Text style={{ fontSize: 11, color: '#666', marginTop: 8 }}>Choose a plan below to renew, add employees or change modules.</Text>}
                        </View>
                    )}

                    {currentUser?.role === 'Admin' && <InvoicesCard />}

                    {!PURCHASE_ALLOWED ? (
                        <View style={styles.noPaymentCard}>
                            <Ionicons name="information-circle-outline" size={32} color="#3b5998" />
                            <Text style={styles.noPaymentText}>Plan changes are not available in the iPhone app.</Text>
                        </View>
                    ) : (<>
                    <Text style={styles.sectionTitle}>Select Plan</Text>
                    <View style={styles.planContainer}>
                        {plans.map((plan) => {
                            const mods = plan.modules || [];
                            const tone = planTone(mods);
                            const selected = selectedPlanId === plan.id;
                            const yearly = Math.round(plan.pricePerEmployee * (1 - (plan.discountPercent || 0) / 100));
                            const years = plan.durationMonths % 12 === 0 ? plan.durationMonths / 12 : 0;
                            return (
                            <TouchableOpacity
                                key={plan.id}
                                style={[styles.planCard, { borderColor: selected ? tone.color : tone.soft, backgroundColor: selected ? tone.bg : '#fff' }, selected && styles.selectedCard, !!selectedPlanId && !selected && styles.unselectedCard]}
                                onPress={() => setSelectedPlanId(plan.id)}
                            >
                                <View style={[styles.planBand, { backgroundColor: tone.color }]}>
                                    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={18} color="white" />
                                    <Text style={styles.planBandText} numberOfLines={1}>{years ? `${years} YEAR${years > 1 ? 'S' : ''}` : `${plan.durationMonths} MONTHS`}</Text>
                                    {plan.discountPercent > 0 && (
                                        <View style={styles.discountBadge}>
                                            <Text style={styles.badgeText}>{plan.discountPercent}% OFF</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={{ padding: 12, paddingBottom: 34 }}>
                                    <Text style={styles.planTitle}>{plan.label}</Text>
                                    <Text style={[styles.planPriceBig, { color: tone.color }]}>₹{yearly.toLocaleString('en-IN')}</Text>
                                    <Text style={styles.planPrice}>per employee / year{gstPercent > 0 ? ' + GST' : ''}</Text>
                                    {plan.discountPercent > 0 && (
                                        <Text style={styles.planWas}>₹{Number(plan.pricePerEmployee).toLocaleString('en-IN')}</Text>
                                    )}
                                    <View style={styles.modRow}>
                                        {(['hr', 'sales', 'service'] as const).filter((m) => mods.includes(m)).map((m) => (
                                            <Text key={m} style={[styles.modChip, { color: MODULE_STYLE[m].color, backgroundColor: MODULE_STYLE[m].bg }]}>{MODULE_STYLE[m].label}</Text>
                                        ))}
                                    </View>
                                </View>
                                {selected && (
                                    <View style={[styles.selectedTag, { backgroundColor: tone.color }]}>
                                        <Ionicons name="checkmark" size={12} color="white" />
                                        <Text style={styles.selectedTagText}>SELECTED</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            );
                        })}
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
                                Order, payment and service updates sent to your customers automatically.
                            </Text>
                            <Text style={styles.addonNote}>
                                • One price for the whole company — not per employee.{'\n'}
                                • Covers setup and connection by our team.{'\n'}
                                • You buy your own WhatsApp Business API (e.g. AiSensy, Wati) and email service; their message charges are paid by you.
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.addonPrice}>+₹{automationAddonPrice.toLocaleString('en-IN')}</Text>
                            <Text style={styles.addonPer}>per company</Text>
                            <Ionicons
                                name={wantsAutomation ? 'checkbox' : 'square-outline'}
                                size={24}
                                color={wantsAutomation ? '#2e7d32' : '#999'}
                            />
                        </View>
                    </TouchableOpacity>

                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryTitle}>Order Summary</Text>
                        <SummaryRow label="Plan" value={selectedPlan?.label || '—'} />
                        <SummaryRow label="Price per employee / year" value={selectedPlan ? `₹${Number(selectedPlan.pricePerEmployee).toLocaleString('en-IN')}` : '—'} />
                        <SummaryRow label="Employees" value={`${Number(employeeCount) || 0}`} />
                        <SummaryRow label="Duration" value={selectedPlan ? (selectedPlan.durationMonths % 12 === 0 ? `${selectedPlan.durationMonths / 12} year${selectedPlan.durationMonths > 12 ? 's' : ''}` : `${selectedPlan.durationMonths} months`) : '—'} />
                        {selectedPlan && selectedPlan.discountPercent > 0 && (
                            <SummaryRow label="Discount" value={`${selectedPlan.discountPercent}% off`} valueColor="#2e7d32" />
                        )}
                        <SummaryRow label="Plan amount" value={`₹${price.planAmount.toLocaleString('en-IN')}`} />
                        {wantsAutomation && (
                            <SummaryRow label="Automation (per company)" value={`₹${automationAddonPrice.toLocaleString('en-IN')}`} />
                        )}
                        <View style={styles.summaryDivider} />
                        <SummaryRow label="Subtotal" value={`₹${price.subtotal.toLocaleString('en-IN')}`} />
                        {gstPercent > 0 && (
                            <SummaryRow label={`GST (${gstPercent}%)`} value={`₹${price.gstAmount.toLocaleString('en-IN')}`} />
                        )}
                        <View style={[styles.summaryRow, styles.totalRow]}>
                            <Text style={styles.totalLabel}>Total payable</Text>
                            <Text style={styles.totalValue}>₹{totalPrice.toLocaleString('en-IN')}</Text>
                        </View>
                        {gstPercent > 0 && <Text style={styles.gstNote}>Includes {gstPercent}% GST</Text>}
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
                                            Card • UPI • Net Banking • Wallet — plan active instantly
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
                    </>)}

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
        <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
        </View>
    );
}

const MODULE_STYLE: Record<'hr' | 'sales' | 'service', { label: string; color: string; bg: string }> = {
    hr: { label: 'HR', color: '#2e7d32', bg: '#e8f5e9' },
    sales: { label: 'Sales', color: '#1565c0', bg: '#e3f2fd' },
    service: { label: 'Service', color: '#6a1b9a', bg: '#f3e5f5' },
};

// Card colour follows the richest module in the plan (same as SuperAdmin → Manage Plans).
function planTone(mods: string[]) {
    if (mods.includes('service')) return { color: '#6a1b9a', bg: '#f8f1fb', soft: '#e1bee7' };
    if (mods.includes('sales')) return { color: '#1565c0', bg: '#f0f6fd', soft: '#bbdefb' };
    return { color: '#2e7d32', bg: '#f1f8f1', soft: '#c8e6c9' };
}

const styles = StyleSheet.create({
    currentCard: { backgroundColor: '#f0f4ff', borderColor: '#d0d9ff', borderWidth: 1, borderRadius: 12, padding: 15, marginBottom: 18 },
    currentLabel: { fontSize: 12, color: '#555', fontWeight: 'bold' },
    currentPlan: { fontSize: 17, color: '#3b5998', fontWeight: 'bold', marginTop: 2 },
    container: { flex: 1, backgroundColor: '#f9f9f9' },
    header: { padding: 20, backgroundColor: '#fff', elevation: 2, alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
    scroll: { padding: 20, paddingBottom: 60 },
    sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginTop: 18, marginBottom: 10 },
    planContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    planCard: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#fff', borderWidth: 1.5, borderRadius: 14, overflow: 'hidden' },
    selectedCard: { borderWidth: 3, elevation: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, transform: [{ scale: 1.03 }] },
    unselectedCard: { opacity: 0.72 },
    selectedTag: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    selectedTagText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
    planBand: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
    planBandText: { color: 'white', fontWeight: 'bold', fontSize: 12, flex: 1 },
    planTitle: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    planPriceBig: { fontSize: 26, fontWeight: 'bold', marginTop: 6 },
    planPrice: { fontSize: 12, color: '#555', marginTop: -2 },
    planWas: { fontSize: 12, color: '#999', textDecorationLine: 'line-through', marginTop: 2 },
    modRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
    modChip: { fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
    discountBadge: { backgroundColor: '#ff9800', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10 },
    badgeText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, fontSize: 16, backgroundColor: '#fff', marginBottom: 10 },
    addonCard: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 15, marginBottom: 10, alignItems: 'center' },
    addonCardActive: { borderColor: '#2e7d32', borderWidth: 2, backgroundColor: '#f0f8f0' },
    addonTitle: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    addonSubtitle: { fontSize: 12, color: '#666', marginTop: 3 },
    addonPrice: { fontSize: 14, fontWeight: 'bold', color: '#2e7d32', marginBottom: 4 },
    summaryCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 18, marginBottom: 10 },
    summaryTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 14 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, gap: 12 },
    summaryDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 6 },
    totalRow: { backgroundColor: '#eef3ff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginTop: 8 },
    summaryLabel: { color: '#444', fontSize: 14, fontWeight: '600', flexShrink: 1 },
    summaryValue: { fontWeight: 'bold', color: '#111', fontSize: 15, textAlign: 'right', flexShrink: 1 },
    totalLabel: { fontSize: 17, fontWeight: 'bold', color: '#1f3a8a' },
    totalValue: { fontSize: 24, fontWeight: 'bold', color: '#1f3a8a' },
    gstNote: { fontSize: 12, color: '#666', textAlign: 'right', marginTop: 4 },
    addonNote: { fontSize: 12, color: '#7a4b00', backgroundColor: '#fff8e1', borderRadius: 8, padding: 8, marginTop: 8, lineHeight: 18 },
    addonPer: { fontSize: 11, color: '#2e7d32', fontWeight: '600', marginBottom: 4 },
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
