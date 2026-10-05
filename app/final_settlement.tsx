import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    deleteFinalSettlement,
    fetchFinalSettlement,
    FnfInput,
    FnfLine,
    FnfPreview,
    FnfSaved,
    markFinalSettlementPaid,
    previewFinalSettlement,
    saveFinalSettlement,
} from '../services/api/payroll';
import { pickerHandlers } from '../utils/datePickerHandlers';
import { urlToBase64Image } from '../utils/pdfImageHelper';
import { sharePdfFromHtml } from '../utils/sharePdf';
import { localYmd } from '../utils/workSchedule';
import { useData } from './context/DataContext';

// Full & Final settlement for an employee who is leaving (HR / Admin).
// Calculate → check the lines → Save (closes their advances) → PDF → Mark paid.

const rs = (n: number) => `${n < 0 ? '− ' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const dmy = (s?: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '-');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export default function FinalSettlementScreen() {
    const router = useRouter();
    const { companyProfile } = useData();
    const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();

    const [saved, setSaved] = useState<FnfSaved | null>(null);
    const [loadingSaved, setLoadingSaved] = useState(true);

    const [lwd, setLwd] = useState(new Date());
    const [showLwdPicker, setShowLwdPicker] = useState(false);
    const [encashDays, setEncashDays] = useState(''); // '' = suggested
    const [noticeShort, setNoticeShort] = useState('');
    const [gratuity, setGratuity] = useState<boolean | null>(null); // null = auto (5+ years)
    const [addLabel, setAddLabel] = useState('');
    const [addAmount, setAddAmount] = useState('');
    const [dedLabel, setDedLabel] = useState('');
    const [dedAmount, setDedAmount] = useState('');
    const [note, setNote] = useState('');

    const [preview, setPreview] = useState<FnfPreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [showPaidPicker, setShowPaidPicker] = useState(false);

    const loadSaved = useCallback(async () => {
        if (!userId) return;
        try {
            setSaved(await fetchFinalSettlement(String(userId)));
        } catch {
            setSaved(null);
        } finally {
            setLoadingSaved(false);
        }
    }, [userId]);

    useEffect(() => {
        const t = setTimeout(() => loadSaved(), 0);
        return () => clearTimeout(t);
    }, [loadSaved]);

    const input = (): FnfInput => ({
        userId: String(userId),
        lastWorkingDay: localYmd(lwd),
        encashDays: encashDays === '' ? null : Number(encashDays) || 0,
        noticeShortDays: Number(noticeShort) || 0,
        includeGratuity: gratuity,
        otherAdditions: Number(addAmount) ? [{ label: addLabel || 'Addition', amount: Number(addAmount) }] : [],
        otherDeductions: Number(dedAmount) ? [{ label: dedLabel || 'Deduction', amount: Number(dedAmount) }] : [],
        note: note.trim() || undefined,
    });

    const calculate = async () => {
        setBusy(true);
        try {
            const p = await previewFinalSettlement(input());
            setPreview(p);
            if (encashDays === '') setEncashDays('');
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not calculate');
        } finally {
            setBusy(false);
        }
    };

    const save = () => {
        if (!preview) return;
        Alert.alert(
            'Save Full & Final?',
            `Net ${rs(preview.net)} for ${preview.employee.name}.\n\nTheir advances will be marked settled. You can still delete it until it is marked paid. Disable the employee in Manage Team when they leave.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Save', onPress: async () => {
                    setBusy(true);
                    try {
                        const r = await saveFinalSettlement(input());
                        setSaved(r.existing);
                        setPreview(r);
                    } catch (e: any) {
                        Alert.alert('Error', e?.message || 'Could not save');
                    } finally {
                        setBusy(false);
                    }
                }},
            ]
        );
    };

    const remove = () => {
        if (!saved) return;
        Alert.alert('Delete this settlement?', 'The advances it closed will be reopened.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                try {
                    await deleteFinalSettlement(saved.id);
                    setSaved(null);
                    setPreview(null);
                } catch (e: any) {
                    Alert.alert('Error', e?.message || 'Could not delete');
                }
            }},
        ]);
    };

    const onPaidPicked = async (event: any, date?: Date) => {
        setShowPaidPicker(false);
        if (event?.type !== 'set' || !date || !saved) return;
        try {
            setSaved(await markFinalSettlementPaid(saved.id, localYmd(date)));
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not mark paid');
        }
    };

    const savedLines: FnfLine[] = saved ? saved.lines?.lines || [] : [];
    const shownLines = saved ? savedLines : preview?.lines || [];
    const shownNet = saved ? Number(saved.netAmount) : preview?.net ?? 0;

    const sharePdf = async (p: FnfPreview | null = preview) => {
        const emp = p?.employee;
        const logo = await urlToBase64Image(companyProfile?.logoUrl);
        const rows = shownLines
            .map((l) => `<tr><td>${esc(l.label)}${l.note ? `<div class="n">${esc(l.note)}</div>` : ''}</td><td class="a ${l.amount < 0 ? 'neg' : ''}">${rs(l.amount)}</td></tr>`)
            .join('');
        const html = `
        <html><head><meta charset="utf-8"/><style>
          body{font-family:Helvetica,Arial;padding:28px;color:#222} h2{margin:6px 0 2px} .muted{color:#666;font-size:12px}
          table{width:100%;border-collapse:collapse;margin-top:16px} td{border-bottom:1px solid #eee;padding:8px;font-size:13px}
          .a{text-align:right;white-space:nowrap} .neg{color:#c62828} .n{font-size:11px;color:#888}
          .net td{font-weight:bold;font-size:16px;border-top:2px solid #333} .grid td{border:none;padding:3px 0}
          .sign{display:flex;justify-content:space-between;margin-top:60px;font-size:12px}
        </style></head><body>
          ${logo ? `<img src="${logo}" style="height:56px"/>` : `<h2>${esc(companyProfile?.companyName || '')}</h2>`}
          <h2>Full &amp; Final Settlement</h2>
          <div class="muted">${esc(companyProfile?.companyName || '')}</div>
          <table class="grid">
            <tr><td><b>Employee</b></td><td>${esc(emp?.name || String(name || ''))}${emp?.empId ? ` (${esc(emp.empId)})` : ''}</td></tr>
            <tr><td><b>Joined</b></td><td>${dmy(emp?.joiningDate)}</td></tr>
            <tr><td><b>Last working day</b></td><td>${dmy(saved?.lastWorkingDay || p?.lastWorkingDay)}</td></tr>
            ${emp?.bankAccountNo ? `<tr><td><b>Bank</b></td><td>${esc(emp.bankName || '')} • ${esc(emp.bankAccountNo)} • ${esc(emp.bankIfsc || '')}</td></tr>` : ''}
          </table>
          <table>${rows}<tr class="net"><td>Net payable</td><td class="a">${rs(shownNet)}</td></tr></table>
          ${saved?.note ? `<p class="muted">Note: ${esc(saved.note)}</p>` : ''}
          ${saved?.status === 'PAID' ? `<p><b>Paid on ${dmy(saved.paidAt)}</b></p>` : ''}
          <div class="sign"><div>Employee signature</div><div>For ${esc(companyProfile?.companyName || 'the company')}</div></div>
        </body></html>`;
        await sharePdfFromHtml(html, `FnF_${(emp?.name || String(name || 'employee')).replace(/\s+/g, '_')}.pdf`, 'Full & Final settlement');
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>Full & Final — {name || ''}</Text>
            </View>

            {loadingSaved ? (
                <ActivityIndicator size="large" color="#c62828" style={{ marginTop: 50 }} />
            ) : (
                <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
                    {saved ? (
                        <View style={[styles.banner, saved.status === 'PAID' ? styles.bannerPaid : styles.bannerFinal]}>
                            <Text style={styles.bannerText}>
                                {saved.status === 'PAID' ? `✅ Paid on ${dmy(saved.paidAt)}` : '🔒 Saved — not paid yet'} • Last day {dmy(saved.lastWorkingDay)}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.card}>
                            <Text style={styles.label}>Last working day</Text>
                            <TouchableOpacity style={styles.input} onPress={() => setShowLwdPicker(true)}>
                                <Text>{lwd.toLocaleDateString('en-GB')}</Text>
                            </TouchableOpacity>
                            {showLwdPicker && <DateTimePicker value={lwd} mode="date" {...pickerHandlers((e: any, d?: Date) => { setShowLwdPicker(false); if (d) setLwd(d); })} />}

                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Encash leave (days)</Text>
                                    <TextInput style={styles.input} keyboardType="numeric" value={encashDays} onChangeText={(t) => setEncashDays(t.replace(/[^0-9.]/g, ''))}
                                        placeholder={preview ? `Balance: ${preview.suggestedEncashDays}` : 'Leave balance'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Notice short (days)</Text>
                                    <TextInput style={styles.input} keyboardType="numeric" value={noticeShort} onChangeText={(t) => setNoticeShort(t.replace(/[^0-9.]/g, ''))} placeholder="0" />
                                </View>
                            </View>

                            <View style={styles.switchRow}>
                                <Text style={[styles.label, { flex: 1, marginTop: 0 }]}>
                                    Gratuity {preview ? (preview.gratuityEligible ? `(eligible — ${preview.employee.tenureYears} yrs)` : `(${preview.employee.tenureYears} yrs — needs 5)`) : '(auto at 5+ years)'}
                                </Text>
                                <Switch value={gratuity ?? !!preview?.gratuityEligible} onValueChange={(v) => setGratuity(v)} />
                            </View>

                            <Text style={styles.label}>Other addition (bonus, etc.)</Text>
                            <View style={styles.row}>
                                <TextInput style={[styles.input, { flex: 2 }]} value={addLabel} onChangeText={setAddLabel} placeholder="Label" />
                                <TextInput style={[styles.input, { flex: 1 }]} keyboardType="numeric" value={addAmount} onChangeText={(t) => setAddAmount(t.replace(/[^0-9.]/g, ''))} placeholder="₹" />
                            </View>
                            <Text style={styles.label}>Other deduction (asset not returned, etc.)</Text>
                            <View style={styles.row}>
                                <TextInput style={[styles.input, { flex: 2 }]} value={dedLabel} onChangeText={setDedLabel} placeholder="Label" />
                                <TextInput style={[styles.input, { flex: 1 }]} keyboardType="numeric" value={dedAmount} onChangeText={(t) => setDedAmount(t.replace(/[^0-9.]/g, ''))} placeholder="₹" />
                            </View>
                            <Text style={styles.label}>Note</Text>
                            <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} multiline value={note} onChangeText={setNote} />

                            <TouchableOpacity style={[styles.btn, { backgroundColor: '#1565c0' }]} onPress={calculate} disabled={busy}>
                                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Calculate</Text>}
                            </TouchableOpacity>
                        </View>
                    )}

                    {shownLines.length > 0 && (
                        <View style={styles.card}>
                            {shownLines.map((l, i) => (
                                <View key={`${l.key}-${i}`} style={styles.line}>
                                    <View style={{ flex: 1, marginRight: 8 }}>
                                        <Text style={styles.lineLabel}>{l.label}</Text>
                                        {!!l.note && <Text style={styles.lineNote}>{l.note}</Text>}
                                    </View>
                                    <Text style={[styles.lineAmt, l.amount < 0 && { color: '#c62828' }]}>{rs(l.amount)}</Text>
                                </View>
                            ))}
                            <View style={[styles.line, { borderTopWidth: 2, borderTopColor: '#333', borderBottomWidth: 0 }]}>
                                <Text style={[styles.lineLabel, { fontWeight: 'bold', fontSize: 15 }]}>Net payable</Text>
                                <Text style={[styles.lineAmt, { fontSize: 18, color: shownNet < 0 ? '#c62828' : '#2e7d32' }]}>{rs(shownNet)}</Text>
                            </View>
                            {shownNet < 0 && <Text style={styles.lineNote}>Negative = the employee owes the company this amount.</Text>}
                            <Text style={styles.lineNote}>Calculated by the company’s Salary Rules and leave balance. Check before paying — not legal or tax advice.</Text>
                        </View>
                    )}

                    {!saved && preview && (
                        <TouchableOpacity style={[styles.btn, { backgroundColor: '#c62828' }]} onPress={save} disabled={busy}>
                            <Text style={styles.btnText}>Save Full & Final</Text>
                        </TouchableOpacity>
                    )}

                    {saved && (
                        <>
                            <TouchableOpacity style={[styles.btn, { backgroundColor: '#2e7d32' }]} onPress={async () => {
                                // employee / bank details for the PDF header (lines come from the saved settlement)
                                let p = preview;
                                if (!p) {
                                    try { p = await previewFinalSettlement({ userId: String(userId), lastWorkingDay: saved.lastWorkingDay.slice(0, 10) }); setPreview(p); } catch { /* header falls back to the name */ }
                                }
                                sharePdf(p);
                            }}>
                                <Text style={styles.btnText}>📄 Share PDF</Text>
                            </TouchableOpacity>
                            {saved.status !== 'PAID' && (
                                <>
                                    <TouchableOpacity style={[styles.btn, { backgroundColor: '#1565c0' }]} onPress={() => setShowPaidPicker(true)}>
                                        <Text style={styles.btnText}>💰 Mark as Paid</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={remove} style={{ alignSelf: 'center', marginTop: 12 }}>
                                        <Text style={{ color: '#c62828', fontWeight: 'bold' }}>Delete settlement</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                            {showPaidPicker && <DateTimePicker value={new Date()} mode="date" maximumDate={new Date()} {...pickerHandlers(onPaidPicked)} />}
                        </>
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#c62828' },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#fff', marginLeft: 12 },
    card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, elevation: 1 },
    label: { fontSize: 12, fontWeight: '600', color: '#555', marginTop: 10, marginBottom: 4 },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: '#fff' },
    row: { flexDirection: 'row', gap: 8 },
    switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    btn: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    banner: { padding: 12, borderRadius: 10, marginBottom: 12 },
    bannerFinal: { backgroundColor: '#ede7f6' },
    bannerPaid: { backgroundColor: '#e8f5e9' },
    bannerText: { fontWeight: 'bold', color: '#333' },
    line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    lineLabel: { fontSize: 13, color: '#333' },
    lineNote: { fontSize: 11, color: '#888', marginTop: 2 },
    lineAmt: { fontSize: 14, fontWeight: 'bold', color: '#222' },
});
