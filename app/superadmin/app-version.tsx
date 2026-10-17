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
    View,
} from 'react-native';
import { useHeaderTop } from '../../hooks/useHeaderTop';
import { AppVersionSettings, fetchAppVersionSettings, saveAppVersionSettings } from '../../services/api/appVersion';
import { APP_PLATFORM, APP_VERSION } from '../../utils/appVersion';

type Form = Record<keyof AppVersionSettings, string>;

const EMPTY: Form = {
    androidLatestVersion: '', androidMinVersion: '', iosLatestVersion: '', iosMinVersion: '', iosStoreUrl: '', message: '',
};

const VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;

function toForm(s: AppVersionSettings): Form {
    return {
        androidLatestVersion: s.androidLatestVersion ?? '',
        androidMinVersion: s.androidMinVersion ?? '',
        iosLatestVersion: s.iosLatestVersion ?? '',
        iosMinVersion: s.iosMinVersion ?? '',
        iosStoreUrl: s.iosStoreUrl ?? '',
        message: s.message ?? '',
    };
}

const blankToNull = (v: string) => (v.trim() ? v.trim() : null);

export default function AppVersionScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    const [form, setForm] = useState<Form>(EMPTY);
    const [original, setOriginal] = useState<Form>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchAppVersionSettings()
            .then(s => { setForm(toForm(s)); setOriginal(toForm(s)); })
            .catch((e: any) => Alert.alert('Error', e.message || 'Could not load the settings.'))
            .finally(() => setLoading(false));
    }, []);

    const set = (key: keyof Form, value: string) => setForm(prev => ({ ...prev, [key]: value }));
    const isDirty = JSON.stringify(form) !== JSON.stringify(original);

    const validate = (): string | null => {
        const versions: [keyof Form, string][] = [
            ['androidLatestVersion', 'Android latest'], ['androidMinVersion', 'Android minimum'],
            ['iosLatestVersion', 'iPhone latest'], ['iosMinVersion', 'iPhone minimum'],
        ];
        for (const [key, label] of versions) {
            const v = form[key].trim();
            if (v && !VERSION_RE.test(v)) return `${label}: use a version like 3.2.2`;
        }
        if (form.iosStoreUrl.trim() && !/^https:\/\//.test(form.iosStoreUrl.trim())) return 'The App Store link must start with https://';
        return null;
    };

    const doSave = async () => {
        setSaving(true);
        try {
            const saved = await saveAppVersionSettings({
                androidLatestVersion: blankToNull(form.androidLatestVersion),
                androidMinVersion: blankToNull(form.androidMinVersion),
                iosLatestVersion: blankToNull(form.iosLatestVersion),
                iosMinVersion: blankToNull(form.iosMinVersion),
                iosStoreUrl: blankToNull(form.iosStoreUrl),
                message: blankToNull(form.message),
            });
            setForm(toForm(saved));
            setOriginal(toForm(saved));
            Alert.alert('Saved ✅', 'Phones pick this up within a minute.');
        } catch (e: any) {
            Alert.alert('Could not save', e.message || 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = () => {
        const err = validate();
        if (err) { Alert.alert('Check the form', err); return; }
        const blocks: string[] = [];
        if (form.androidMinVersion.trim() && form.androidMinVersion !== original.androidMinVersion) {
            blocks.push(`Android phones below ${form.androidMinVersion.trim()}`);
        }
        if (form.iosMinVersion.trim() && form.iosMinVersion !== original.iosMinVersion) {
            blocks.push(`iPhones below ${form.iosMinVersion.trim()}`);
        }
        if (blocks.length) {
            Alert.alert(
                'Block old versions?',
                `${blocks.join(' and ')} will stop working until they update. Make sure the new version is already live on the store.`,
                [{ text: 'Cancel', style: 'cancel' }, { text: 'Save', style: 'destructive', onPress: doSave }],
            );
            return;
        }
        doSave();
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#d32f2f" />
            </View>
        );
    }

    const field = (key: keyof Form, label: string, placeholder: string, hint: string) => (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                style={styles.input}
                value={form[key]}
                onChangeText={v => set(key, v)}
                placeholder={placeholder}
                placeholderTextColor="#bbb"
                autoCapitalize="none"
                keyboardType={key === 'iosStoreUrl' ? 'url' : 'numbers-and-punctuation'}
            />
            <Text style={styles.hint}>{hint}</Text>
        </View>
    );

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>App version</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.info}>
                    <Ionicons name="information-circle" size={20} color="#1565c0" />
                    <Text style={styles.infoText}>
                        Latest = phones on an older version see “New version available” (they can tap Later).{'\n'}
                        Minimum = phones below it must update before they can use the app.{'\n'}
                        Leave a box empty to switch it off. Set these only after the new version is live on the store.
                    </Text>
                </View>
                {APP_PLATFORM && (
                    <Text style={styles.thisPhone}>This phone has version {APP_VERSION} ({APP_PLATFORM === 'ios' ? 'iPhone' : 'Android'})</Text>
                )}

                <Text style={styles.section}>Android (Play Store)</Text>
                <View style={styles.card}>
                    {field('androidLatestVersion', 'Latest version', 'e.g. 3.2.2', 'Older apps get a one-time "please update" message.')}
                    {field('androidMinVersion', 'Minimum version', 'empty = no one is blocked', 'Apps older than this are blocked until they update. Apps before 3.2.2 can only see an error message, so set this a few days after the update is out.')}
                </View>

                <Text style={styles.section}>iPhone (App Store)</Text>
                <View style={styles.card}>
                    {field('iosLatestVersion', 'Latest version', 'e.g. 3.2.2', 'Older apps get a one-time "please update" message.')}
                    {field('iosMinVersion', 'Minimum version', 'empty = no one is blocked', 'Apps older than this are blocked until they update.')}
                    {field('iosStoreUrl', 'App Store link', 'https://apps.apple.com/app/id…', 'From App Store Connect, once the app is live. Without it iPhone users are only told to open the App Store.')}
                </View>

                <Text style={styles.section}>Message (optional)</Text>
                <View style={styles.card}>
                    <TextInput
                        style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                        value={form.message}
                        onChangeText={v => set('message', v)}
                        placeholder="e.g. Courier sharing and faster lists are here. Please update."
                        placeholderTextColor="#bbb"
                        multiline
                        maxLength={300}
                    />
                    <Text style={styles.hint}>Shown in the update prompt. Empty = a standard text.</Text>
                </View>

                <TouchableOpacity
                    style={[styles.saveBtn, (!isDirty || saving) && styles.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={!isDirty || saving}
                >
                    {saving ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="save" size={20} color="white" style={{ marginRight: 8 }} />}
                    <Text style={styles.saveText}>{saving ? 'Saving…' : isDirty ? 'Save' : 'No changes'}</Text>
                </TouchableOpacity>
                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { backgroundColor: '#d32f2f', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    content: { padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
    info: { flexDirection: 'row', gap: 10, backgroundColor: '#e3f2fd', borderRadius: 12, padding: 14 },
    infoText: { flex: 1, fontSize: 13, color: '#1565c0', lineHeight: 20 },
    thisPhone: { fontSize: 12, color: '#777', marginTop: 10, textAlign: 'center' },
    section: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 10 },
    card: { backgroundColor: 'white', borderRadius: 14, padding: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    field: { marginBottom: 14 },
    label: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 8 },
    input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: '#222', backgroundColor: '#fafafa' },
    hint: { fontSize: 11, color: '#999', marginTop: 6, lineHeight: 16 },
    saveBtn: { flexDirection: 'row', backgroundColor: '#d32f2f', padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
    saveBtnDisabled: { backgroundColor: '#bbb' },
    saveText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
