import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { AutomationSettings, fetchAutomationSettings, saveAutomationSettings, sendTestEmail } from '../services/api/automationSettings';
import { useData } from './context/DataContext';
import { useHeaderTop } from '../hooks/useHeaderTop';
import WhatsAppStatusWebhookCard from '../components/WhatsAppStatusWebhookCard';

type WaProvider = 'meta_cloud' | 'aisensy' | 'wati';
const WHATSAPP_PROVIDERS: { label: string; value: WaProvider; hint: string; keyLabel: string; idLabel?: string; idPlaceholder?: string }[] = [
    {
        label: 'Meta Cloud API', value: 'meta_cloud', keyLabel: 'Access Token',
        idLabel: 'Phone Number ID', idPlaceholder: 'From Meta → WhatsApp → API Setup',
        hint: 'Template name and language must match the template approved on Meta.',
    },
    {
        label: 'AiSensy', value: 'aisensy', keyLabel: 'API Key',
        hint: 'In AiSensy create an API campaign for each template, named exactly like the template here (e.g. order_confirmed), and set it Live. Values go in the order they appear in the template.',
    },
    {
        label: 'Wati', value: 'wati', keyLabel: 'Access Token',
        idLabel: 'API Endpoint URL', idPlaceholder: 'https://live-mt-server.wati.io/123456',
        hint: 'Token and API Endpoint are in Wati → API Docs. Use the same variable names in the Wati template, e.g. {{customer_name}}.',
    },
];

// All three send over HTTPS with the company's own API key. The From address
// must be a sender / domain verified in that provider's dashboard.
const EMAIL_PROVIDERS = [
    { label: 'Brevo', value: 'brevo', hint: 'Free: 300 emails a day. Brevo → SMTP & API → API Keys. Verify your sender in Brevo → Senders & Domains.' },
    { label: 'Resend', value: 'resend', hint: 'Free: 100 emails a day (3,000 a month). Resend → API Keys. Verify your domain in Resend → Domains.' },
    { label: 'SendGrid', value: 'sendgrid', hint: 'SendGrid → Settings → API Keys (Mail Send). Verify your sender in Sender Authentication.' },
];

export default function AutomationSettingsScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    const { currentUser } = useData();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [addonEnabled, setAddonEnabled] = useState(false);

    const [whatsappEnabled, setWhatsappEnabled] = useState(false);
    const [whatsappProvider, setWhatsappProvider] = useState<WaProvider>('meta_cloud');
    const waInfo = WHATSAPP_PROVIDERS.find((p) => p.value === whatsappProvider) ?? WHATSAPP_PROVIDERS[0];
    const [whatsappApiKey, setWhatsappApiKey] = useState('');
    const [whatsappSenderId, setWhatsappSenderId] = useState('');

    const [emailEnabled, setEmailEnabled] = useState(false);
    const [emailProvider, setEmailProvider] = useState<'brevo' | 'resend' | 'sendgrid'>('brevo');
    const [emailApiKey, setEmailApiKey] = useState('');
    const [emailFromAddress, setEmailFromAddress] = useState('');
    const [testTo, setTestTo] = useState('');
    const [testing, setTesting] = useState(false);

    const isAllowed = ['Admin', 'SuperAdmin'].includes(currentUser?.role || '');

    useEffect(() => {
        const loadSettings = async () => {
            if (!isAllowed) { setLoading(false); return; }
            try {
                const { entitled, settings } = await fetchAutomationSettings();
                setAddonEnabled(entitled);
                if (!entitled) { setLoading(false); return; }

                setWhatsappEnabled(settings.whatsappEnabled);
                setWhatsappProvider(settings.whatsappProvider === 'gupshup' ? 'meta_cloud' : settings.whatsappProvider);
                setWhatsappApiKey(settings.whatsappApiKey || '');
                setWhatsappSenderId(settings.whatsappSenderId || '');
                setEmailEnabled(settings.emailEnabled);
                setEmailProvider(settings.emailProvider);
                setEmailApiKey(settings.emailApiKey || '');
                setEmailFromAddress(settings.emailFromAddress || '');
                setTestTo(currentUser?.email || '');
            } catch (e: any) {
                console.log('Settings load error:', e);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        if (whatsappEnabled && !whatsappApiKey.trim()) {
            Alert.alert('Missing API Key', `${waInfo.keyLabel} is required to enable WhatsApp.`);
            return;
        }
        if (whatsappEnabled && waInfo.idLabel && !whatsappSenderId.trim()) {
            Alert.alert('Missing details', `${waInfo.idLabel} is required for ${waInfo.label}.`);
            return;
        }
        if (emailEnabled && !emailApiKey.trim()) {
            Alert.alert('Missing API Key', 'An API key is required to enable Email.');
            return;
        }
        if (emailEnabled && !emailFromAddress.trim()) {
            Alert.alert('Missing From Address', 'Enter the From email address (verified in your email provider).');
            return;
        }

        setSaving(true);
        try {
            const payload: AutomationSettings = {
                whatsappEnabled,
                whatsappProvider,
                whatsappApiKey: whatsappApiKey.trim() || null,
                whatsappSenderId: whatsappSenderId.trim() || null,
                emailEnabled,
                emailProvider,
                emailApiKey: emailApiKey.trim() || null,
                emailFromAddress: emailFromAddress.trim() || null,
            };
            await saveAutomationSettings(payload);
            Alert.alert('Saved', 'Automation settings saved successfully.');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not save, please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleTestEmail = async () => {
        if (!testTo.trim()) { Alert.alert('Email needed', 'Enter the email address to send the test to.'); return; }
        setTesting(true);
        try {
            const r = await sendTestEmail(testTo.trim());
            Alert.alert('Test email sent ✅', `Sent to ${r.to}. Check the inbox (and the spam folder).`);
        } catch (e: any) {
            Alert.alert('Test failed', e.message || 'Could not send the test email.');
        } finally {
            setTesting(false);
        }
    };

    if (!isAllowed) {
        return (
            <View style={styles.centerBox}>
                <Ionicons name="lock-closed" size={40} color="gray" />
                <Text style={{ marginTop: 10, color: 'gray' }}>Only Admins can view this screen.</Text>
            </View>
        );
    }

    if (loading) {
        return (
            <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#3b5998" />
            </View>
        );
    }

    if (!addonEnabled) {
        return (
            <View style={styles.container}>
                <View style={[styles.header, { paddingTop: headerTop }]}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>WhatsApp & Email Settings</Text>
                    <View style={{ width: 24 }} />
                </View>
                <View style={styles.centerBox}>
                    <Ionicons name="lock-closed" size={48} color="#f57c00" />
                    <Text style={styles.lockedTitle}>Automation Add-on Not Active</Text>
                    <Text style={styles.lockedSubtitle}>
                        WhatsApp/Email automation is a paid add-on. Contact your
                        CRM provider to get it activated.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>WhatsApp & Email Settings</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                <View style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                            <Text style={styles.cardTitle}>WhatsApp Automation</Text>
                        </View>
                        <Switch value={whatsappEnabled} onValueChange={setWhatsappEnabled} />
                    </View>

                    <Text style={styles.label}>Provider</Text>
                    <View style={styles.pillRow}>
                        {WHATSAPP_PROVIDERS.map((p) => (
                            <TouchableOpacity
                                key={p.value}
                                style={[styles.pill, whatsappProvider === p.value && styles.pillActive]}
                                onPress={() => setWhatsappProvider(p.value)}
                            >
                                <Text style={[styles.pillText, whatsappProvider === p.value && styles.pillTextActive]}>
                                    {p.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={styles.hint}>{waInfo.hint}</Text>

                    <Text style={styles.label}>{waInfo.keyLabel}</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Copy it from your provider's dashboard"
                        value={whatsappApiKey}
                        onChangeText={setWhatsappApiKey}
                        secureTextEntry
                        autoCapitalize="none"
                    />

                    {waInfo.idLabel && (
                        <>
                            <Text style={styles.label}>{waInfo.idLabel}</Text>
                            <TextInput
                                style={styles.input}
                                placeholder={waInfo.idPlaceholder}
                                value={whatsappSenderId}
                                onChangeText={setWhatsappSenderId}
                                autoCapitalize="none"
                            />
                        </>
                    )}
                </View>

                <WhatsAppStatusWebhookCard provider={whatsappProvider} />

                <View style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="mail" size={22} color="#1565c0" />
                            <Text style={styles.cardTitle}>Email Automation</Text>
                        </View>
                        <Switch value={emailEnabled} onValueChange={setEmailEnabled} />
                    </View>

                    <Text style={styles.label}>Provider</Text>
                    <View style={styles.pillRow}>
                        {EMAIL_PROVIDERS.map((p) => (
                            <TouchableOpacity
                                key={p.value}
                                style={[styles.pill, emailProvider === p.value && styles.pillActive]}
                                onPress={() => setEmailProvider(p.value as any)}
                            >
                                <Text style={[styles.pillText, emailProvider === p.value && styles.pillTextActive]}>
                                    {p.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={styles.hint}>{EMAIL_PROVIDERS.find((p) => p.value === emailProvider)?.hint}</Text>

                    <Text style={styles.label}>API Key</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Copy it from your email provider's dashboard"
                        value={emailApiKey}
                        onChangeText={setEmailApiKey}
                        secureTextEntry
                        autoCapitalize="none"
                    />

                    <Text style={styles.label}>From Email Address</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="orders@yourcompany.com"
                        value={emailFromAddress}
                        onChangeText={setEmailFromAddress}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />
                    <Text style={styles.hint}>Must be a sender verified in your email provider. Customer replies go to the email in Company Profile.</Text>

                    <Text style={styles.label}>Send a test email (save first)</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                            style={[styles.input, { flex: 1 }]}
                            placeholder="you@yourcompany.com"
                            value={testTo}
                            onChangeText={setTestTo}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <TouchableOpacity style={[styles.testBtn, testing && { opacity: 0.6 }]} onPress={handleTestEmail} disabled={testing}>
                            {testing ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.testBtnText}>Send test</Text>}
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.saveBtn, saving && { backgroundColor: '#ccc' }]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Save Settings</Text>}
                </TouchableOpacity>

                <Text style={styles.footNote}>
                    WhatsApp templates must be approved (on Meta, AiSensy or Wati) before they can be sent. Emails use your Email templates and go out automatically; if sending fails they wait in Pending Emails.
                </Text>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white', padding: 30 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', elevation: 2 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    content: { padding: 20, paddingBottom: 60 },
    card: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#eee' },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginLeft: 8 },
    label: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 6, marginTop: 10 },
    input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 14 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd' },
    pillActive: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
    pillText: { fontSize: 13, color: '#555', fontWeight: '600' },
    pillTextActive: { color: 'white' },
    saveBtn: { backgroundColor: '#4caf50', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, elevation: 2 },
    saveText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    hint: { fontSize: 11, color: '#777', marginTop: 6, lineHeight: 16 },
    testBtn: { backgroundColor: '#1565c0', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
    testBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
    footNote: { textAlign: 'center', color: 'gray', fontSize: 11, marginTop: 15, paddingHorizontal: 10 },
    lockedTitle: { fontSize: 17, fontWeight: 'bold', color: '#333', marginTop: 15, textAlign: 'center' },
    lockedSubtitle: { fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
