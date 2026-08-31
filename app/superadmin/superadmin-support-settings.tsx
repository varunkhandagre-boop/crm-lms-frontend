import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
    View,
} from 'react-native';
import { db } from '../../firebaseConfig';

// ─── Firestore path: settings/support_config ─────────────
const SUPPORT_DOC = doc(db, 'settings', 'support_config');

type SupportConfig = {
    supportPhone: string;
    supportEmail: string;
    userManualUrl: string;
    videoTutorialUrl: string;
};

const EMPTY_CONFIG: SupportConfig = {
    supportPhone: '',
    supportEmail: '',
    userManualUrl: '',
    videoTutorialUrl: '',
};

export default function SuperAdminSupportSettings() {
    const router = useRouter();
    const [config, setConfig] = useState<SupportConfig>(EMPTY_CONFIG);
    const [original, setOriginal] = useState<SupportConfig>(EMPTY_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const snap = await getDoc(SUPPORT_DOC);
            if (snap.exists()) {
                const data = snap.data() as SupportConfig;
                setConfig(data);
                setOriginal(data);
            }
        } catch (e) {
            Alert.alert('Error', 'Could not load support settings.');
        } finally {
            setLoading(false);
        }
    };

    const isDirty = JSON.stringify(config) !== JSON.stringify(original);

    const validate = (): string | null => {
        const { supportPhone, supportEmail } = config;

        if (!supportPhone.trim()) return 'Support phone number is required.';

        // Phone: digits only, 10–15 chars, optionally starting with country code
        const phoneClean = supportPhone.replace(/\D/g, '');
        if (phoneClean.length < 10 || phoneClean.length > 15) {
            return 'Phone must be 10–15 digits (include country code, e.g. 919876543210).';
        }

        if (!supportEmail.trim()) return 'Support email is required.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail.trim())) {
            return 'Please enter a valid email address.';
        }

        return null;
    };

    const handleSave = async () => {
        const err = validate();
        if (err) {
            Alert.alert('Validation Error', err);
            return;
        }

        Alert.alert(
            'Save Support Settings',
            'This will update the contact details visible to all users in the Help & Support screen.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Save',
                    onPress: async () => {
                        setSaving(true);
                        try {
                            const cleaned: SupportConfig = {
                                supportPhone: config.supportPhone.replace(/\D/g, ''),
                                supportEmail: config.supportEmail.trim().toLowerCase(),
                                userManualUrl: config.userManualUrl.trim(),
                                videoTutorialUrl: config.videoTutorialUrl.trim(),
                            };
                            await setDoc(SUPPORT_DOC, {
                                ...cleaned,
                                updatedAt: new Date().toISOString(),
                            }, { merge: true });
                            setConfig(cleaned);
                            setOriginal(cleaned);
                            Alert.alert('Saved ✅', 'Support settings updated successfully.\n\nAll users will see the new details immediately.');
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

    const update = (key: keyof SupportConfig, value: string) => {
        setConfig(prev => ({ ...prev, [key]: value }));
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
                <Text style={styles.headerTitle}>Support Settings</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                {/* INFO BANNER */}
                <View style={styles.infoBanner}>
                    <Ionicons name="information-circle" size={20} color="#1565c0" />
                    <Text style={styles.infoText}>
                        These details are shown to all users in the Help & Support screen.
                        Update them here anytime — no app update needed.
                    </Text>
                </View>

                {/* ── CONTACT DETAILS ── */}
                <Text style={styles.sectionTitle}>Contact Details</Text>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                        <Text style={styles.fieldLabel}>WhatsApp / Phone Number</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.supportPhone}
                        onChangeText={v => update('supportPhone', v)}
                        placeholder="e.g. 919876543210 (with country code)"
                        placeholderTextColor="#bbb"
                        keyboardType="phone-pad"
                        maxLength={15}
                    />
                    <Text style={styles.hint}>
                        Include country code without "+" (e.g. 91 for India).{'\n'}
                        This number is used for both WhatsApp and Call.
                    </Text>
                </View>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="mail" size={20} color="#e67e22" />
                        <Text style={styles.fieldLabel}>Support Email Address</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.supportEmail}
                        onChangeText={v => update('supportEmail', v)}
                        placeholder="e.g. support@yourcompany.com"
                        placeholderTextColor="#bbb"
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                </View>

                {/* ── GUIDES / LINKS ── */}
                <Text style={styles.sectionTitle}>Guide Links</Text>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="document-text" size={20} color="#d32f2f" />
                        <Text style={styles.fieldLabel}>User Manual URL (PDF)</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.userManualUrl}
                        onChangeText={v => update('userManualUrl', v)}
                        placeholder="https://example.com/manual.pdf"
                        placeholderTextColor="#bbb"
                        keyboardType="url"
                        autoCapitalize="none"
                    />
                    <Text style={styles.hint}>
                        Upload the PDF to Firebase Storage and paste the download URL here.
                    </Text>
                </View>

                <View style={styles.fieldCard}>
                    <View style={styles.fieldHeader}>
                        <Ionicons name="play-circle" size={20} color="#d32f2f" />
                        <Text style={styles.fieldLabel}>Video Tutorial URL</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={config.videoTutorialUrl}
                        onChangeText={v => update('videoTutorialUrl', v)}
                        placeholder="https://youtube.com/watch?v=..."
                        placeholderTextColor="#bbb"
                        keyboardType="url"
                        autoCapitalize="none"
                    />
                    <Text style={styles.hint}>
                        YouTube, Vimeo, or any direct video link works.
                    </Text>
                </View>

                {/* PREVIEW */}
                <Text style={styles.sectionTitle}>Preview</Text>
                <View style={styles.previewCard}>
                    <PreviewRow icon="logo-whatsapp" color="#25D366" label="WhatsApp / Call" value={config.supportPhone || '—'} />
                    <PreviewRow icon="mail" color="#e67e22" label="Email" value={config.supportEmail || '—'} />
                    <PreviewRow icon="document-text" color="#d32f2f" label="User Manual" value={config.userManualUrl ? 'Link set ✅' : 'Not set'} />
                    <PreviewRow icon="play-circle" color="#d32f2f" label="Video Tutorial" value={config.videoTutorialUrl ? 'Link set ✅' : 'Not set'} />
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
                        {saving ? 'Saving...' : isDirty ? 'Save Changes' : 'No Changes'}
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

// ── Small preview row component ──
function PreviewRow({ icon, color, label, value }: { icon: any; color: string; label: string; value: string }) {
    return (
        <View style={styles.previewRow}>
            <Ionicons name={icon} size={16} color={color} style={{ marginRight: 8 }} />
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

    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#e3f2fd',
        borderRadius: 12,
        padding: 14,
        gap: 10,
        marginBottom: 6,
    },
    infoText: { flex: 1, fontSize: 13, color: '#1565c0', lineHeight: 19 },

    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#999',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginTop: 20,
        marginBottom: 10,
    },

    fieldCard: {
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 15,
        marginBottom: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
    },
    fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    fieldLabel: { fontSize: 14, fontWeight: '700', color: '#333' },
    input: {
        borderWidth: 1.5,
        borderColor: '#e0e0e0',
        borderRadius: 10,
        paddingHorizontal: 13,
        paddingVertical: 11,
        fontSize: 15,
        color: '#222',
        backgroundColor: '#fafafa',
    },
    hint: { fontSize: 11, color: '#aaa', marginTop: 8, lineHeight: 16 },

    previewCard: {
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 14,
        gap: 10,
        elevation: 1,
    },
    previewRow: { flexDirection: 'row', alignItems: 'center' },
    previewLabel: { fontSize: 12, color: '#888', marginRight: 6, minWidth: 110 },
    previewValue: { fontSize: 13, fontWeight: '600', color: '#333', flex: 1 },

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