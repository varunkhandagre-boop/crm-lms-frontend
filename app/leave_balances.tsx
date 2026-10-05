import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    CarryForwardResult,
    commitCarryForward,
    EmployeeLeaveBalances,
    fetchAllLeaveBalances,
    previewCarryForward,
    saveOpeningBalance,
} from '../services/api/leaves';

// HR: every employee's CL / SL / EL / Comp Off balance for a financial year,
// opening balances (e.g. carried over from before this app) and the
// end-of-year carry forward. Works when Payroll → Salary Rules → Leave Policy is on.

const currentFy = () => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; };
const fyLabel = (y: number) => `FY ${String(y).slice(-2)}-${String(y + 1).slice(-2)}`;
const OPENING_TYPES = ['CL', 'SL', 'EL'] as const;

export default function LeaveBalancesScreen() {
    const router = useRouter();
    const [fy, setFy] = useState(currentFy());
    const [rows, setRows] = useState<EmployeeLeaveBalances[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [editing, setEditing] = useState<EmployeeLeaveBalances | null>(null);
    const [openingDraft, setOpeningDraft] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const [cf, setCf] = useState<CarryForwardResult | null>(null);
    const [cfBusy, setCfBusy] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            setRows(await fetchAllLeaveBalances(fy));
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not load leave balances');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fy]);

    useEffect(() => { load(); }, [load]);

    const policyOn = rows.some((r) => r.summary.policy?.enabled);

    const openEdit = (r: EmployeeLeaveBalances) => {
        const draft: Record<string, string> = {};
        for (const t of OPENING_TYPES) draft[t] = String(r.summary.balances?.find((b) => b.type === t)?.opening ?? 0);
        setOpeningDraft(draft);
        setEditing(r);
    };

    const saveOpening = async () => {
        if (!editing) return;
        setSaving(true);
        try {
            for (const t of OPENING_TYPES) {
                const before = editing.summary.balances?.find((b) => b.type === t)?.opening ?? 0;
                const next = Math.max(0, Number(openingDraft[t]) || 0);
                if (next !== before) await saveOpeningBalance({ userId: editing.userId, fyStartYear: fy, type: t, days: next });
            }
            setEditing(null);
            await load(true);
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const startCarryForward = async () => {
        setCfBusy(true);
        try {
            setCf(await previewCarryForward(fy));
        } catch (e: any) {
            Alert.alert('Carry forward', e?.message || 'Could not prepare carry forward');
        } finally {
            setCfBusy(false);
        }
    };

    const confirmCarryForward = () => {
        if (!cf) return;
        Alert.alert(
            `Carry forward to ${fyLabel(cf.toFyStartYear)}?`,
            `${cf.types.join(' / ')} balances become each employee's opening balance for ${fyLabel(cf.toFyStartYear)}.${cf.fyEnded ? '' : `\n\n⚠️ ${fyLabel(cf.fromFyStartYear)} hasn't ended yet — leave taken after today won't be counted. You can run it again after 31 March.`}`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Carry forward', onPress: async () => {
                    setCfBusy(true);
                    try {
                        await commitCarryForward(cf.fromFyStartYear);
                        setCf(null);
                        Alert.alert('Done ✅', `Opening balances for ${fyLabel(cf.toFyStartYear)} are saved.`);
                    } catch (e: any) {
                        Alert.alert('Error', e?.message || 'Could not carry forward');
                    } finally {
                        setCfBusy(false);
                    }
                }},
            ]
        );
    };

    const renderRow = ({ item }: { item: EmployeeLeaveBalances }) => {
        const b = item.summary.balances;
        return (
            <TouchableOpacity style={styles.card} onPress={() => policyOn && openEdit(item)} disabled={!policyOn}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    {!!item.empId && <Text style={styles.emp}>{item.empId}</Text>}
                    {policyOn && <Ionicons name="create-outline" size={16} color="#3b5998" style={{ marginLeft: 6 }} />}
                </View>
                {b ? (
                    <View style={styles.chips}>
                        {b.map((x) => (
                            <View key={x.type} style={[styles.chip, x.overdrawn > 0 && { backgroundColor: '#ffebee' }]}>
                                <Text style={styles.chipType}>{x.type === 'COMP' ? 'Comp' : x.type}</Text>
                                <Text style={[styles.chipVal, x.overdrawn > 0 && { color: '#c62828' }]}>{x.balance}</Text>
                                <Text style={styles.chipSub}>{x.used}/{x.quota + x.opening}{x.opening ? ` (+${x.opening} open)` : ''}</Text>
                            </View>
                        ))}
                        {item.summary.lwp > 0 && (
                            <View style={[styles.chip, { backgroundColor: '#ffebee' }]}>
                                <Text style={styles.chipType}>LWP</Text>
                                <Text style={[styles.chipVal, { color: '#c62828' }]}>{item.summary.lwp}</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <Text style={styles.sub}>Balance {item.summary.balance} of {item.summary.totalQuota} (single pool)</Text>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Leave Balances</Text>
            </View>
            <View style={styles.fyBar}>
                <TouchableOpacity onPress={() => setFy(fy - 1)} style={{ padding: 8 }}><Ionicons name="chevron-back" size={22} color="#3b5998" /></TouchableOpacity>
                <Text style={styles.fyText}>{fyLabel(fy)}</Text>
                <TouchableOpacity onPress={() => setFy(fy + 1)} style={{ padding: 8 }} disabled={fy >= currentFy() + 1}>
                    <Ionicons name="chevron-forward" size={22} color={fy >= currentFy() + 1 ? '#ccc' : '#3b5998'} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={rows}
                    keyExtractor={(r) => r.userId}
                    renderItem={renderRow}
                    contentContainerStyle={{ padding: 12 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
                    ListHeaderComponent={
                        policyOn ? (
                            <View style={{ marginBottom: 8 }}>
                                <Text style={styles.hint}>Tap an employee to set opening balances for {fyLabel(fy)}.</Text>
                                <TouchableOpacity style={styles.cfBtn} onPress={startCarryForward} disabled={cfBusy}>
                                    {cfBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.cfBtnText}>↪ Carry forward {fyLabel(fy)} → {fyLabel(fy + 1)}</Text>}
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <Text style={[styles.hint, { color: '#ef6c00' }]}>
                                Separate CL / SL / EL balances are off. Turn on “Leave Policy” in Payroll → Salary Rules.
                            </Text>
                        )
                    }
                    ListEmptyComponent={<Text style={styles.empty}>No active employees.</Text>}
                />
            )}

            {/* Opening balance editor */}
            <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
                <View style={styles.overlay}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalTitle}>{editing?.name}</Text>
                        <Text style={styles.sub}>Opening balance for {fyLabel(fy)} (added on top of the yearly quota)</Text>
                        {OPENING_TYPES.map((t) => (
                            <View key={t} style={styles.openRow}>
                                <Text style={styles.openType}>{t}</Text>
                                <TextInput
                                    style={styles.input}
                                    keyboardType="numeric"
                                    value={openingDraft[t]}
                                    onChangeText={(v) => setOpeningDraft({ ...openingDraft, [t]: v.replace(/[^0-9.]/g, '') })}
                                />
                            </View>
                        ))}
                        <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
                            <TouchableOpacity style={[styles.btn, { backgroundColor: '#eee' }]} onPress={() => setEditing(null)}>
                                <Text style={{ fontWeight: 'bold', color: '#333' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, { backgroundColor: '#3b5998' }]} onPress={saveOpening} disabled={saving}>
                                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ fontWeight: 'bold', color: '#fff' }}>Save</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Carry forward preview */}
            <Modal visible={!!cf} transparent animationType="fade" onRequestClose={() => setCf(null)}>
                <View style={styles.overlay}>
                    <View style={[styles.modalBox, { maxHeight: '80%' }]}>
                        <Text style={styles.modalTitle}>Carry forward → {cf ? fyLabel(cf.toFyStartYear) : ''}</Text>
                        <Text style={styles.sub}>
                            {cf?.types.join(' / ')} • closing balance → carried (capped at the max carry).{cf && !cf.fyEnded ? ' ⚠️ Year not over yet.' : ''}
                        </Text>
                        <ScrollView style={{ maxHeight: 380, marginTop: 8 }}>
                            {cf?.rows.map((r) => (
                                <View key={r.userId} style={styles.cfRow}>
                                    <Text style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{r.name}</Text>
                                    <Text style={{ color: '#555', fontSize: 12 }}>
                                        {r.items.map((it) => it.skipped ? `${it.type}: kept (set by hand)` : `${it.type} ${it.closing} → ${it.carry}`).join('   ')}
                                    </Text>
                                </View>
                            ))}
                        </ScrollView>
                        <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
                            <TouchableOpacity style={[styles.btn, { backgroundColor: '#eee' }]} onPress={() => setCf(null)}>
                                <Text style={{ fontWeight: 'bold', color: '#333' }}>Close</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, { backgroundColor: '#6a1b9a' }]} onPress={confirmCarryForward} disabled={cfBusy}>
                                <Text style={{ fontWeight: 'bold', color: '#fff' }}>Carry forward</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#fff', elevation: 2 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 12 },
    fyBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
    fyText: { fontSize: 16, fontWeight: 'bold', color: '#333', minWidth: 100, textAlign: 'center' },
    hint: { fontSize: 12, color: 'gray', marginBottom: 8 },
    cfBtn: { backgroundColor: '#6a1b9a', padding: 12, borderRadius: 8, alignItems: 'center' },
    cfBtnText: { color: '#fff', fontWeight: 'bold' },
    empty: { textAlign: 'center', color: 'gray', marginTop: 30 },
    card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, elevation: 1 },
    name: { flex: 1, fontSize: 15, fontWeight: 'bold', color: '#222' },
    emp: { fontSize: 11, color: '#3b5998', backgroundColor: '#e8eaf6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    sub: { fontSize: 12, color: 'gray', marginTop: 4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    chip: { backgroundColor: '#e8f5e9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', minWidth: 62 },
    chipType: { fontSize: 10, fontWeight: 'bold', color: '#555' },
    chipVal: { fontSize: 16, fontWeight: 'bold', color: '#2e7d32' },
    chipSub: { fontSize: 9, color: 'gray' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
    modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
    modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#222' },
    openRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    openType: { width: 40, fontWeight: 'bold', color: '#3b5998' },
    input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
    cfRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
});
