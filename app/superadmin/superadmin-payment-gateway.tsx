import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { db } from '../../firebaseConfig';

// ─── Firestore path: settings/payment_gateway ─────────────
const GATEWAY_DOC = doc(db, 'settings', 'payment_gateway');

type GatewayConfig = {
    isEnabled: boolean;
    isTestMode: boolean;
    provider: string;
    keyId: string;
    keySecret: string;
    webhookSecret: string;
    currency: string;
    companyName: string;
    companyLogo: string;
    companyColor: string;
    description: string;
};

const EMPTY_CONFIG: GatewayConfig = {
    isEnabled: false,
    isTestMode: true,
    provider: 'razorpay',
    keyId: '',
    keySecret: '',
    webhookSecret: '',
    currency: 'INR',
    companyName: '',
    companyLogo: '',
    companyColor: '#d32f2f',
    description: 'CRM/LMS Subscription Payment',
};

export default function PaymentGatewaySettings() {
    const router = useRouter();
    const [config, setConfig] = useState<GatewayConfig>(EMPTY_CONFIG);
    const [original, setOriginal] = useState<GatewayConfig>(EMPTY_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSecret, setShowSecret] = useState(false);
    const [showWebhook, setShowWebhook] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const snap = await getDoc(GATEWAY_DOC);
            if (snap.exists()) {
                const data = snap.data() as GatewayConfig;
                setConfig({ ...EMPTY_CONFIG, ...data });
                setOriginal({ ...EMPTY_CONFIG, ...data });
            }
        } catch (e) {
            Alert.alert('Error', 'Could not load payment gateway settings.');
        } finally {
            setLoading(false);
        }
    };

    const isDirty = JSON.stringify(config) !== JSON.stringify(original);

    const validate = (): string | null => {
        if (!config.keyId.trim()) return 'Razorpay Key ID is required.';
        if (!config.keySecret.trim()) return 'Razorpay Key Secret is required.';
        if (!config.companyName.trim()) return 'Company Name is required for checkout display.';

        // Key ID format check
        const prefix = config.isTestMode ? 'rzp_test_' : 'rzp_live_';
        if (!config.keyId.startsWith(prefix)) {
            return `Key ID must start with "${prefix}" for ${config.isTestMode ? 'Test' : 'Live'} mode.`;
        }
        return null;
    };

    const handleSave = async () => {
        const err = validate();
        if (err) { Alert.alert('Validation Error', err); return; }

        const modeLabel = config.isTestMode ? 'TEST MODE' : '⚠️ LIVE MODE';
        Alert.alert(
            'Save Payment Settings',
            `Saving in ${modeLabel}.\n\n${config.isEnabled ? 'Payments will be ACTIVE after saving.' : 'Gateway is currently DISABLED — users cannot pay until you enable it.'}\n\nContinue?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: async () => {
                        setSaving(true);
                        try {
                            const toSave: GatewayConfig = {
                                ...config,
                                keyId: config.keyId.trim(),
                                keySecret: config.keySecret.trim(),
                                webhookSecret: config.webhookSecret.trim(),
                                companyName: config.companyName.trim(),
                                companyLogo: config.companyLogo.trim(),
                                description: config.description.trim(),
                            };
                            await setDoc(GATEWAY_DOC, {
                                ...toSave,
                                updatedAt: new Date().toISOString(),
                            }, { merge: true });
                            setConfig(toSave);
                            setOriginal(toSave);
                            Alert.alert(
                                'Saved ✅',
                                `Payment gateway settings saved.\n\nStatus: ${config.isEnabled ? 'ACTIVE — payments enabled' : 'DISABLED — activate when ready'}`
                            );
                        } catch (e) {
                            Alert.alert('Error', 'Could not save settings. Check Firestore permissions.');
                        } finally {
                            setSaving(false);
                        }
                    },
                },
            ]
        );
    };

    const update = (key: keyof GatewayConfig, value: any) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleModeToggle = (isTest: boolean) => {
        if (!isTest) {
            Alert.alert(
                '⚠️ Switch to Live Mode?',
                'Live mode will charge real money from users. Make sure:\n\n• You have verified your Razorpay account\n• You have entered LIVE keys (rzp_live_...)\n• You have tested everything in Test mode first',
                [
                    { text: 'Stay in Test Mode', style: 'cancel' },
                    {
                        text: 'Switch to Live', style: 'destructive',
                        onPress: () => update('isTestMode', false)
                    }
                ]
            );
        } else {
            update('isTestMode', true);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#d32f2f" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Payment Gateway</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                {/* STATUS BANNER */}
                <View style={[
                    styles.statusBanner,
                    config.isEnabled
                        ? { backgroundColor: '#e8f5e9', borderColor: '#2e7d32' }
                        : { backgroundColor: '#fff3e0', borderColor: '#e67e22' }
                ]}>
                    <Ionicons
                        name={config.isEnabled ? 'checkmark-circle' : 'pause-circle'}
                        size={22}
                        color={config.isEnabled ? '#2e7d32' : '#e67e22'}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.statusTitle, { color: config.isEnabled ? '#2e7d32' : '#e67e22' }]}>
                            {config.isEnabled ? 'Payment Gateway ACTIVE' : 'Payment Gateway DISABLED'}
                        </Text>
                        <Text style={styles.statusSubtitle}>
                            {config.isEnabled
                                ? `Running in ${config.isTestMode ? 'TEST' : 'LIVE'} mode`
                                : 'Configure and enable to accept payments'}
                        </Text>
                    </View>
                    <Switch
                        value={config.isEnabled}
                        onValueChange={v => update('isEnabled', v)}
                        trackColor={{ false: '#ddd', true: '#a5d6a7' }}
                        thumbColor={config.isEnabled ? '#2e7d32' : '#f4f3f4'}
                    />
                </View>

                {/* INFO BANNER */}
                <View style={styles.infoBanner}>
                    <Ionicons name="information-circle" size={18} color="#1565c0" />
                    <Text style={styles.infoText}>
                        These settings are saved to Firestore. The app reads them at checkout time. Keep your Key Secret safe — never share it publicly.
                    </Text>
                </View>

                {/* ── MODE ── */}
                <Text style={styles.sectionTitle}>Mode</Text>
                <View style={styles.modeRow}>
                    <TouchableOpacity
                        style={[styles.modeBtn, config.isTestMode && styles.modeBtnActive]}
                        onPress={() => handleModeToggle(true)}
                    >
                        <Ionicons name="flask" size={18} color={config.isTestMode ? 'white' : '#555'} />
                        <Text style={[styles.modeBtnText, config.isTestMode && { color: 'white' }]}>Test Mode</Text>
                        {config.isTestMode && <View style={styles.activeChip}><Text style={styles.activeChipText}>ACTIVE</Text></View>}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeBtn, !config.isTestMode && styles.modeBtnLive]}
                        onPress={() => handleModeToggle(false)}
                    >
                        <Ionicons name="flash" size={18} color={!config.isTestMode ? 'white' : '#555'} />
                        <Text style={[styles.modeBtnText, !config.isTestMode && { color: 'white' }]}>Live Mode</Text>
                        {!config.isTestMode && <View style={[styles.activeChip, { backgroundColor: 'rgba(255,255,255,0.3)' }]}><Text style={styles.activeChipText}>ACTIVE</Text></View>}
                    </TouchableOpacity>
                </View>
                {config.isTestMode ? (
                    <Text style={styles.modeHint}>
                        🧪 Test mode: Use test cards — no real money is charged. Get test keys from Razorpay Dashboard → Settings → API Keys → Test Keys.
                    </Text>
                ) : (
                    <Text style={[styles.modeHint, { color: '#d32f2f' }]}>
                        ⚠️ Live mode: Real money will be charged. Make sure your Razorpay account is fully verified before going live.
                    </Text>
                )}

                {/* ── RAZORPAY KEYS ── */}
                <Text style={styles.sectionTitle}>Razorpay API Keys</Text>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="key" size={18} color="#d32f2f" />
                        <Text style={styles.fieldLabel}>Key ID</Text>
                        <Text style={styles.fieldRequired}>required</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.keyId}
                        onChangeText={v => update('keyId', v)}
                        placeholder={config.isTestMode ? 'rzp_test_xxxxxxxxxx' : 'rzp_live_xxxxxxxxxx'}
                        placeholderTextColor="#bbb"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <Text style={styles.hint}>
                        {config.isTestMode ? 'Must start with rzp_test_' : 'Must start with rzp_live_'}
                    </Text>
                </View>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="lock-closed" size={18} color="#d32f2f" />
                        <Text style={styles.fieldLabel}>Key Secret</Text>
                        <Text style={styles.fieldRequired}>required</Text>
                        <TouchableOpacity onPress={() => setShowSecret(p => !p)} style={{ marginLeft: 'auto' }}>
                            <Ionicons name={showSecret ? 'eye-off' : 'eye'} size={18} color="#888" />
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.keySecret}
                        onChangeText={v => update('keySecret', v)}
                        placeholder="Your Razorpay Key Secret"
                        placeholderTextColor="#bbb"
                        secureTextEntry={!showSecret}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <Text style={styles.hint}>
                        Never share this. Razorpay Dashboard → Settings → API Keys → Copy Secret.
                    </Text>
                </View>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="git-network" size={18} color="#607d8b" />
                        <Text style={styles.fieldLabel}>Webhook Secret</Text>
                        <Text style={[styles.fieldRequired, { color: '#888' }]}>optional</Text>
                        <TouchableOpacity onPress={() => setShowWebhook(p => !p)} style={{ marginLeft: 'auto' }}>
                            <Ionicons name={showWebhook ? 'eye-off' : 'eye'} size={18} color="#888" />
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.webhookSecret}
                        onChangeText={v => update('webhookSecret', v)}
                        placeholder="Webhook secret (for server-side verification)"
                        placeholderTextColor="#bbb"
                        secureTextEntry={!showWebhook}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <Text style={styles.hint}>
                        Only needed if you set up a webhook endpoint for payment verification.
                    </Text>
                </View>

                {/* ── CHECKOUT DISPLAY ── */}
                <Text style={styles.sectionTitle}>Checkout Display</Text>
                <Text style={styles.sectionSubtitle}>These appear on the Razorpay payment popup shown to your customers.</Text>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="business" size={18} color="#3b5998" />
                        <Text style={styles.fieldLabel}>Company Name</Text>
                        <Text style={styles.fieldRequired}>required</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.companyName}
                        onChangeText={v => update('companyName', v)}
                        placeholder="e.g. TechCRM Solutions"
                        placeholderTextColor="#bbb"
                    />
                    <Text style={styles.hint}>Shown at the top of the Razorpay payment popup.</Text>
                </View>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="image" size={18} color="#3b5998" />
                        <Text style={styles.fieldLabel}>Company Logo URL</Text>
                        <Text style={[styles.fieldRequired, { color: '#888' }]}>optional</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.companyLogo}
                        onChangeText={v => update('companyLogo', v)}
                        placeholder="https://your-logo-url.png"
                        placeholderTextColor="#bbb"
                        keyboardType="url"
                        autoCapitalize="none"
                    />
                    <Text style={styles.hint}>Logo shown in Razorpay popup. Upload to Firebase Storage and paste URL.</Text>
                </View>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="document-text" size={18} color="#3b5998" />
                        <Text style={styles.fieldLabel}>Payment Description</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.description}
                        onChangeText={v => update('description', v)}
                        placeholder="e.g. CRM/LMS Subscription Payment"
                        placeholderTextColor="#bbb"
                    />
                </View>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="cash" size={18} color="#2e7d32" />
                        <Text style={styles.fieldLabel}>Currency</Text>
                    </View>
                    <View style={styles.currencyRow}>
                        {['INR', 'USD', 'EUR'].map(c => (
                            <TouchableOpacity
                                key={c}
                                style={[styles.currencyChip, config.currency === c && styles.currencyChipActive]}
                                onPress={() => update('currency', c)}
                            >
                                <Text style={[styles.currencyChipText, config.currency === c && { color: 'white' }]}>{c}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* ── PREVIEW ── */}
                <Text style={styles.sectionTitle}>Preview</Text>
                <View style={styles.previewCard}>
                    <PreviewRow icon="key" color="#d32f2f" label="Key ID" value={config.keyId ? `${config.keyId.slice(0, 12)}...` : '— Not set'} />
                    <PreviewRow icon="lock-closed" color="#d32f2f" label="Key Secret" value={config.keySecret ? '••••••••••••' : '— Not set'} />
                    <PreviewRow icon="flask" color="#607d8b" label="Mode" value={config.isTestMode ? 'Test Mode 🧪' : 'Live Mode ⚡'} />
                    <PreviewRow icon="business" color="#3b5998" label="Company" value={config.companyName || '— Not set'} />
                    <PreviewRow icon="cash" color="#2e7d32" label="Currency" value={config.currency} />
                    <PreviewRow
                        icon={config.isEnabled ? 'checkmark-circle' : 'pause-circle'}
                        color={config.isEnabled ? '#2e7d32' : '#e67e22'}
                        label="Status"
                        value={config.isEnabled ? 'ENABLED ✅' : 'DISABLED'}
                    />
                </View>

                {/* ── HOW TO USE ── */}
                <View style={styles.howToCard}>
                    <Text style={styles.howToTitle}>📋 How to get Razorpay Keys</Text>
                    <Text style={styles.howToStep}>1. Go to razorpay.com → Create Account</Text>
                    <Text style={styles.howToStep}>2. Dashboard → Settings → API Keys</Text>
                    <Text style={styles.howToStep}>3. Click "Generate Test Key" for test keys</Text>
                    <Text style={styles.howToStep}>4. Copy Key ID and Key Secret here</Text>
                    <Text style={styles.howToStep}>5. For live keys, complete KYC verification first</Text>
                    <TouchableOpacity
                        style={styles.razorpayLink}
                        onPress={() => Linking.openURL('https://dashboard.razorpay.com/app/keys')}
                    >
                        <Ionicons name="open-outline" size={14} color="#3b5998" />
                        <Text style={styles.razorpayLinkText}>Open Razorpay Dashboard</Text>
                    </TouchableOpacity>
                </View>

                {/* SAVE BUTTON */}
                <TouchableOpacity
                    style={[styles.saveBtn, (!isDirty || saving) && styles.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={!isDirty || saving}
                >
                    {saving
                        ? <ActivityIndicator color="white" size="small" />
                        : <Ionicons name="save" size={20} color="white" style={{ marginRight: 8 }} />
                    }
                    <Text style={styles.saveBtnText}>
                        {saving ? 'Saving...' : isDirty ? 'Save Settings' : 'No Changes'}
                    </Text>
                </TouchableOpacity>

                {!isDirty && !saving && (
                    <Text style={styles.noChangeHint}>Make a change above to enable saving.</Text>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function PreviewRow({ icon, color, label, value }: { icon: any; color: string; label: string; value: string }) {
    return (
        <View style={styles.previewRow}>
            <Ionicons name={icon} size={15} color={color} style={{ marginRight: 8 }} />
            <Text style={styles.previewLabel}>{label}:</Text>
            <Text style={styles.previewValue} numberOfLines={1}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },

    header: {
        backgroundColor: '#d32f2f',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 16,
    },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },

    content: { padding: 16 },

    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1.5,
        marginBottom: 12,
    },
    statusTitle: { fontSize: 14, fontWeight: 'bold' },
    statusSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },

    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#e3f2fd',
        borderRadius: 12,
        padding: 12,
        gap: 8,
        marginBottom: 6,
    },
    infoText: { flex: 1, fontSize: 12, color: '#1565c0', lineHeight: 18 },

    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#999',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginTop: 20,
        marginBottom: 6,
    },
    sectionSubtitle: { fontSize: 12, color: '#aaa', marginBottom: 10, marginTop: -4 },

    // Mode selector
    modeRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    modeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'white',
        borderWidth: 1.5,
        borderColor: '#ddd',
        elevation: 1,
    },
    modeBtnActive: { backgroundColor: '#2196f3', borderColor: '#2196f3' },
    modeBtnLive: { backgroundColor: '#d32f2f', borderColor: '#d32f2f' },
    modeBtnText: { fontSize: 13, fontWeight: '700', color: '#555' },
    activeChip: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    activeChipText: { fontSize: 9, fontWeight: 'bold', color: 'white' },
    modeHint: { fontSize: 12, color: '#666', lineHeight: 18, marginBottom: 4, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8 },

    // Field cards
    fieldCard: {
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
    },
    fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    fieldLabel: { fontSize: 14, fontWeight: '700', color: '#333', flex: 1 },
    fieldRequired: { fontSize: 10, color: '#d32f2f', fontWeight: '600', textTransform: 'uppercase' },
    input: {
        borderWidth: 1.5,
        borderColor: '#e0e0e0',
        borderRadius: 10,
        paddingHorizontal: 13,
        paddingVertical: 11,
        fontSize: 14,
        color: '#222',
        backgroundColor: '#fafafa',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    hint: { fontSize: 11, color: '#aaa', marginTop: 7, lineHeight: 16 },

    // Currency
    currencyRow: { flexDirection: 'row', gap: 10 },
    currencyChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f5f6fa', borderWidth: 1.5, borderColor: '#ddd' },
    currencyChipActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
    currencyChipText: { fontSize: 14, fontWeight: 'bold', color: '#555' },

    // Preview
    previewCard: {
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 14,
        gap: 10,
        elevation: 1,
    },
    previewRow: { flexDirection: 'row', alignItems: 'center' },
    previewLabel: { fontSize: 12, color: '#888', marginRight: 6, minWidth: 90 },
    previewValue: { fontSize: 13, fontWeight: '600', color: '#333', flex: 1 },

    // How to
    howToCard: {
        backgroundColor: '#f0f3ff',
        borderRadius: 14,
        padding: 14,
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#dde3f5',
    },
    howToTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 10 },
    howToStep: { fontSize: 13, color: '#555', marginBottom: 5, lineHeight: 20 },
    razorpayLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 10,
        backgroundColor: 'white',
        padding: 10,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    razorpayLinkText: { fontSize: 13, color: '#3b5998', fontWeight: '600' },

    // Save
    saveBtn: {
        flexDirection: 'row',
        backgroundColor: '#d32f2f',
        padding: 16,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        elevation: 3,
    },
    saveBtnDisabled: { backgroundColor: '#bbb' },
    saveBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    noChangeHint: { textAlign: 'center', fontSize: 12, color: '#aaa', marginTop: 8 },
});