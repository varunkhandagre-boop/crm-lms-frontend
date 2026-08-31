import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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

import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

const WHATSAPP_PROVIDERS = [
    { label: 'AiSensy', value: 'aisensy' },
    { label: 'Meta Cloud API', value: 'meta_cloud' },
    { label: 'Gupshup', value: 'gupshup' },
];

const EMAIL_PROVIDERS = [
    { label: 'SendGrid', value: 'sendgrid' },
];

export default function AutomationSettingsScreen() {
    const router = useRouter();
    const { currentUser } = useData();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // 🔒 Ye naya state - SuperAdmin ne is company ke liye Automation
    // Add-on enable kiya hai ya nahi, `companies/{companyId}` se check hota hai
    const [addonEnabled, setAddonEnabled] = useState(false);

    const [whatsappEnabled, setWhatsappEnabled] = useState(false);
    const [whatsappProvider, setWhatsappProvider] = useState('aisensy');
    const [whatsappApiKey, setWhatsappApiKey] = useState('');
    const [whatsappSenderId, setWhatsappSenderId] = useState('');

    const [emailEnabled, setEmailEnabled] = useState(false);
    const [emailProvider, setEmailProvider] = useState('sendgrid');
    const [emailApiKey, setEmailApiKey] = useState('');
    const [emailFromAddress, setEmailFromAddress] = useState('');

    const isAllowed = ['Admin', 'SuperAdmin'].includes(currentUser?.role || '');

    useEffect(() => {
        const loadSettings = async () => {
            if (!currentUser?.companyId) { setLoading(false); return; }
            try {
                // 🔒 Sabse pehle entitlement check karo
                const companyRef = doc(db, 'companies', currentUser.companyId);
                const companySnap = await getDoc(companyRef);
                const isEnabled = companySnap.exists() && companySnap.data()?.automationAddonEnabled === true;
                setAddonEnabled(isEnabled);

                // Agar entitled nahi hai, to settings load karne ki zaroorat nahi
                if (!isEnabled) { setLoading(false); return; }

                const ref = doc(db, 'tenants', currentUser.companyId, 'settings', 'notifications');
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    const data = snap.data();
                    setWhatsappEnabled(!!data.whatsappEnabled);
                    setWhatsappProvider(data.whatsappProvider || 'aisensy');
                    setWhatsappApiKey(data.whatsappApiKey || '');
                    setWhatsappSenderId(data.whatsappSenderId || '');
                    setEmailEnabled(!!data.emailEnabled);
                    setEmailProvider(data.emailProvider || 'sendgrid');
                    setEmailApiKey(data.emailApiKey || '');
                    setEmailFromAddress(data.emailFromAddress || '');
                }
            } catch (e) {
                console.log('Settings load error:', e);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, [currentUser]);

    const handleSave = async () => {
        if (!currentUser?.companyId) return;

        if (whatsappEnabled && !whatsappApiKey.trim()) {
            Alert.alert('Missing API Key', 'An API key is required to enable WhatsApp.');
            return;
        }
        if (emailEnabled && !emailApiKey.trim()) {
            Alert.alert('Missing API Key', 'An API key is required to enable Email.');
            return;
        }

        setSaving(true);
        try {
            const ref = doc(db, 'tenants', currentUser.companyId, 'settings', 'notifications');
            await setDoc(ref, {
                whatsappEnabled,
                whatsappProvider,
                whatsappApiKey: whatsappApiKey.trim(),
                whatsappSenderId: whatsappSenderId.trim(),
                emailEnabled,
                emailProvider,
                emailApiKey: emailApiKey.trim(),
                emailFromAddress: emailFromAddress.trim(),
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser?.name || 'Admin',
            }, { merge: true });

            Alert.alert('Saved', 'Automation settings saved successfully.');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not save, please try again.');
        } finally {
            setSaving(false);
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

    // 🔒 SuperAdmin ne is company ke liye add-on enable nahi kiya - locked screen
    if (!addonEnabled) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Automation Settings</Text>
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
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Automation Settings</Text>
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

                    <Text style={styles.label}>API Key</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Provider dashboard se copy karein"
                        value={whatsappApiKey}
                        onChangeText={setWhatsappApiKey}
                        secureTextEntry
                        autoCapitalize="none"
                    />

                    {whatsappProvider === 'meta_cloud' && (
                        <>
                            <Text style={styles.label}>Phone Number ID (Meta Cloud only)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Meta Business Manager se milega"
                                value={whatsappSenderId}
                                onChangeText={setWhatsappSenderId}
                                autoCapitalize="none"
                            />
                        </>
                    )}
                </View>

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
                                onPress={() => setEmailProvider(p.value)}
                            >
                                <Text style={[styles.pillText, emailProvider === p.value && styles.pillTextActive]}>
                                    {p.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={styles.label}>API Key</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="SendGrid dashboard se copy karein"
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
                </View>

                <TouchableOpacity
                    style={[styles.saveBtn, saving && { backgroundColor: '#ccc' }]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Save Settings</Text>}
                </TouchableOpacity>

                <Text style={styles.footNote}>
                    Note: Templates must be approved on the provider's dashboard first — messages will fail without approval.
                </Text>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white', padding: 30 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
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
    footNote: { textAlign: 'center', color: 'gray', fontSize: 11, marginTop: 15, paddingHorizontal: 10 },
    lockedTitle: { fontSize: 17, fontWeight: 'bold', color: '#333', marginTop: 15, textAlign: 'center' },
    lockedSubtitle: { fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center', lineHeight: 20 },
});