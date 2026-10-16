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
import { fetchInvoiceSettings, InvoiceSettings, saveInvoiceSettings } from '../../services/api/invoices';

type Form = {
    legalName: string; tradeName: string; gstin: string; address: string; sacCode: string;
    invoicePrefix: string; email: string; phone: string; footerNote: string;
};

const EMPTY: Form = { legalName: '', tradeName: '', gstin: '', address: '', sacCode: '', invoicePrefix: 'LMS/CRM', email: '', phone: '', footerNote: '' };

const toForm = (s: InvoiceSettings | null): Form => s ? {
    legalName: s.legalName, tradeName: s.tradeName ?? '', gstin: s.gstin, address: s.address, sacCode: s.sacCode ?? '',
    invoicePrefix: s.invoicePrefix, email: s.email ?? '', phone: s.phone ?? '', footerNote: s.footerNote ?? '',
} : EMPTY;

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** SuperAdmin → Invoice details: our GST details printed on every plan invoice. */
export default function InvoiceSettingsScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    const [form, setForm] = useState<Form>(EMPTY);
    const [original, setOriginal] = useState<Form>(EMPTY);
    const [stateName, setStateName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchInvoiceSettings()
            .then(s => { setForm(toForm(s)); setOriginal(toForm(s)); setStateName(s?.stateName ?? ''); })
            .catch((e: any) => Alert.alert('Error', e.message || 'Could not load the invoice details.'))
            .finally(() => setLoading(false));
    }, []);

    const set = (k: keyof Form, v: string) => setForm(prev => ({ ...prev, [k]: v }));
    const isDirty = JSON.stringify(form) !== JSON.stringify(original);

    const save = async () => {
        const gstin = form.gstin.trim().toUpperCase();
        if (form.legalName.trim().length < 2) return Alert.alert('Check the form', 'Enter the legal name.');
        if (!GSTIN_RE.test(gstin)) return Alert.alert('Check the form', 'Enter a valid 15-character GSTIN.');
        if (form.address.trim().length < 5) return Alert.alert('Check the form', 'Enter the address.');
        if (form.sacCode.trim() && !/^\d{4,8}$/.test(form.sacCode.trim())) return Alert.alert('Check the form', 'SAC code is 4–8 digits.');
        setSaving(true);
        try {
            const saved = await saveInvoiceSettings({
                legalName: form.legalName.trim(),
                tradeName: form.tradeName.trim() || null,
                gstin,
                address: form.address.trim(),
                stateCode: gstin.slice(0, 2),
                sacCode: form.sacCode.trim() || null,
                invoicePrefix: form.invoicePrefix.trim() || 'LMS/CRM',
                email: form.email.trim() || null,
                phone: form.phone.trim() || null,
                footerNote: form.footerNote.trim() || null,
            });
            setForm(toForm(saved)); setOriginal(toForm(saved)); setStateName(saved.stateName ?? '');
            Alert.alert('Saved ✅', 'New invoices use these details. Invoices already made keep the old ones.');
        } catch (e: any) {
            Alert.alert('Could not save', e.message || 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color="#d32f2f" /></View>;
    }

    const field = (key: keyof Form, label: string, opts: { placeholder?: string; hint?: string; multiline?: boolean; caps?: boolean; keyboard?: any } = {}) => (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                style={[styles.input, opts.multiline && { minHeight: 70, textAlignVertical: 'top' }]}
                value={form[key]}
                onChangeText={v => set(key, v)}
                placeholder={opts.placeholder}
                placeholderTextColor="#bbb"
                multiline={opts.multiline}
                autoCapitalize={opts.caps ? 'characters' : 'none'}
                keyboardType={opts.keyboard}
            />
            {opts.hint ? <Text style={styles.hint}>{opts.hint}</Text> : null}
        </View>
    );

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Invoice details</Text>
                <View style={{ width: 24 }} />
            </View>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.info}>
                    <Ionicons name="information-circle" size={20} color="#1565c0" />
                    <Text style={styles.infoText}>
                        Printed on every GST invoice for plan purchases. Same state as the buyer → CGST + SGST; other state → IGST (from the buyer’s GSTIN or state).
                    </Text>
                </View>
                {!form.sacCode.trim() && (
                    <View style={styles.warn}>
                        <Ionicons name="alert-circle" size={18} color="#e65100" />
                        <Text style={styles.warnText}>SAC code is empty. Ask your CA and add it below — it appears on new invoices.</Text>
                    </View>
                )}
                <View style={styles.card}>
                    {field('legalName', 'Legal name (as on GST certificate)', { placeholder: 'VARUN KHANDAGRE' })}
                    {field('tradeName', 'Trade name', { placeholder: 'LIFE LINE MEDICAL SYSTEMS' })}
                    {field('gstin', 'GSTIN', { placeholder: '27XXXXX0000X1ZX', caps: true, hint: stateName ? `State: ${stateName} (${form.gstin.slice(0, 2)})` : 'The first two digits give the state.' })}
                    {field('address', 'Address', { multiline: true })}
                    {field('sacCode', 'SAC code', { placeholder: 'e.g. 998314', keyboard: 'number-pad', hint: 'Service code for software subscription. Confirm with your CA.' })}
                    {field('invoicePrefix', 'Invoice number prefix', { placeholder: 'LMS/CRM', caps: true, hint: `Numbers look like ${form.invoicePrefix.trim() || 'LMS/CRM'}/2026-27/0001 and restart every 1 April.` })}
                    {field('email', 'Email (optional)', { keyboard: 'email-address' })}
                    {field('phone', 'Phone (optional)', { keyboard: 'phone-pad' })}
                    {field('footerNote', 'Note at the bottom (optional)', { multiline: true, placeholder: 'This is a computer-generated invoice.' })}
                </View>
                <TouchableOpacity style={[styles.saveBtn, (!isDirty || saving) && { backgroundColor: '#bbb' }]} onPress={save} disabled={!isDirty || saving}>
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
    infoText: { flex: 1, fontSize: 13, color: '#1565c0', lineHeight: 19 },
    warn: { flexDirection: 'row', gap: 8, backgroundColor: '#fff3e0', borderRadius: 12, padding: 12, marginTop: 10, alignItems: 'center' },
    warnText: { flex: 1, fontSize: 12, color: '#e65100' },
    card: { backgroundColor: 'white', borderRadius: 14, padding: 15, marginTop: 14, elevation: 2 },
    field: { marginBottom: 14 },
    label: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 8 },
    input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: '#222', backgroundColor: '#fafafa' },
    hint: { fontSize: 11, color: '#999', marginTop: 6 },
    saveBtn: { flexDirection: 'row', backgroundColor: '#d32f2f', padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
    saveText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
