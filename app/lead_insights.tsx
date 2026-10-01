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
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from './context/DataContext';
import { formatInr, STAGE_COLORS } from '../constants/leadStatus';
import { getLeadAnalytics, LeadAnalytics } from '../services/api/leads';
import { fetchTeamMembers } from '../services/api/users';
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

type Period = 'month' | 'fy' | 'lastFy' | 'all';

const PERIODS: { key: Period; label: string }[] = [
    { key: 'month', label: 'This Month' },
    { key: 'fy', label: 'This FY' },
    { key: 'lastFy', label: 'Last FY' },
    { key: 'all', label: 'All Time' },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Indian financial year: 1 April – 31 March. Filters on the lead's created date.
function periodRange(period: Period): { from?: string; to?: string } {
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    if (period === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    if (period === 'fy') return { from: `${fyStart}-04-01`, to: ymd(now) };
    if (period === 'lastFy') return { from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31` };
    return {};
}

export default function LeadInsightsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { currentUser } = useData();
    const userRole = (currentUser?.role || '').toLowerCase();
    const canFilterByEmployee = ['admin', 'manager', 'accountant', 'hr', 'superadmin'].includes(userRole);

    const [period, setPeriod] = useState<Period>('fy');
    const [employeeId, setEmployeeId] = useState<string | undefined>(undefined);
    const [showEmployeePicker, setShowEmployeePicker] = useState(false);
    const [data, setData] = useState<LeadAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const { data: teamMembers } = useCachedList({
        cacheKey: buildCacheKey('team_members', currentUser?.companyId),
        enabled: !!currentUser?.companyId && canFilterByEmployee,
        fetcher: fetchTeamMembers,
    });

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            setData(await getLeadAnalytics({ ...periodRange(period), assignedToId: employeeId }));
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not load insights');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [period, employeeId]);

    useEffect(() => { load(); }, [load]);

    const employeeName = employeeId ? teamMembers.find((m: any) => m.id === employeeId)?.name || 'Employee' : 'All Staff';

    const renderSummary = (d: LeadAnalytics) => (
        <View style={styles.summaryRow}>
            {[
                { label: 'Leads', value: d.summary.total, color: '#3b5998' },
                { label: 'Won', value: d.summary.won, color: '#2e7d32' },
                { label: 'Lost', value: d.summary.lost, color: '#c62828' },
                { label: 'Open', value: d.summary.open, color: '#f57c00' },
            ].map(c => (
                <View key={c.label} style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: c.color }]}>{c.value}</Text>
                    <Text style={styles.summaryLabel}>{c.label}</Text>
                </View>
            ))}
        </View>
    );

    const renderRates = (d: LeadAnalytics) => (
        <View style={styles.ratesRow}>
            <View style={styles.rateBox}>
                <Text style={styles.rateValue}>{d.summary.conversionPct}%</Text>
                <Text style={styles.rateLabel}>Conversion{'\n'}(won ÷ all leads)</Text>
            </View>
            <View style={styles.rateBox}>
                <Text style={styles.rateValue}>{d.summary.winRatePct}%</Text>
                <Text style={styles.rateLabel}>Win rate{'\n'}(won ÷ won + lost)</Text>
            </View>
        </View>
    );

    const renderPipelineValue = (d: LeadAnalytics) => {
        const p = d.pipeline;
        const max = Math.max(1, ...p.byStage.map(s => s.value));
        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>💰 Pipeline Value (open deals right now)</Text>
                <View style={[styles.ratesRow, { marginTop: 10 }]}>
                    <View style={[styles.rateBox, { backgroundColor: '#e8f5e9' }]}>
                        <Text style={[styles.rateValue, { color: '#2e7d32' }]}>{formatInr(p.totalValue)}</Text>
                        <Text style={styles.rateLabel}>Total in pipeline</Text>
                    </View>
                    <View style={[styles.rateBox, { backgroundColor: '#fff8e1' }]}>
                        <Text style={[styles.rateValue, { color: '#f57c00' }]}>{formatInr(p.weightedForecast)}</Text>
                        <Text style={styles.rateLabel}>Expected (forecast)</Text>
                    </View>
                </View>
                {p.byStage.filter(s => s.value > 0).map(s => (
                    <View key={s.stage} style={{ marginTop: 10 }}>
                        <View style={styles.barLabelRow}>
                            <Text style={styles.barLabel}>{s.stage} <Text style={{ color: '#9e9e9e', fontSize: 11 }}>({s.winChancePct}% chance)</Text></Text>
                            <Text style={styles.barCount}>{formatInr(s.value)}</Text>
                        </View>
                        <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${Math.max(2, (s.value / max) * 100)}%`, backgroundColor: STAGE_COLORS[s.stage] || '#607d8b' }]} />
                        </View>
                    </View>
                ))}
                <Text style={[styles.sectionHint, { marginTop: 10 }]}>
                    {p.leadsWithValue} of {p.openLeads} open leads have a deal value. Forecast = each deal × a typical win chance for its stage — an estimate, not a promise.
                </Text>
            </View>
        );
    };

    const renderFunnel = (d: LeadAnalytics) => {
        const max = Math.max(1, d.funnel[0]?.count || 0);
        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>📉 Sales Funnel</Text>
                <Text style={styles.sectionHint}>How many leads reached each stage. The red % is how many made it from the step above — the lowest one is your biggest drop-off.</Text>
                {d.funnel.map((f, i) => {
                    const color = f.stage === 'Won' ? '#4caf50' : STAGE_COLORS[f.stage] || '#607d8b';
                    return (
                        <View key={f.stage} style={{ marginTop: 10 }}>
                            <View style={styles.barLabelRow}>
                                <Text style={styles.barLabel}>{f.stage}</Text>
                                <Text style={styles.barCount}>
                                    {f.count}
                                    {i > 0 && <Text style={{ color: f.pctOfPrevious < 50 ? '#c62828' : '#757575', fontWeight: 'normal' }}>  ({f.pctOfPrevious}% of above)</Text>}
                                </Text>
                            </View>
                            <View style={styles.barTrack}>
                                <View style={[styles.barFill, { width: `${Math.max(2, (f.count / max) * 100)}%`, backgroundColor: color }]} />
                            </View>
                        </View>
                    );
                })}
            </View>
        );
    };

    const renderLostReasons = (d: LeadAnalytics) => (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>❌ Why Leads Were Lost</Text>
            {d.lostReasons.length === 0 ? (
                <Text style={styles.empty}>
                    No lost reasons recorded yet for this period. Reasons are captured from now on whenever a lead is marked Lost.
                </Text>
            ) : d.lostReasons.map(r => (
                <View key={r.reason} style={{ marginTop: 10 }}>
                    <View style={styles.barLabelRow}>
                        <Text style={styles.barLabel}>{r.reason}</Text>
                        <Text style={styles.barCount}>{r.count} <Text style={{ color: '#757575', fontWeight: 'normal' }}>({r.pct}%)</Text></Text>
                    </View>
                    <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.max(2, r.pct)}%`, backgroundColor: r.reason === 'Not recorded' ? '#bdbdbd' : '#e57373' }]} />
                    </View>
                </View>
            ))}
            {d.summary.lost > d.summary.lostWithReasonRecorded && (
                <Text style={[styles.sectionHint, { marginTop: 10 }]}>
                    {d.summary.lost - d.summary.lostWithReasonRecorded} older lost lead(s) were closed before reasons were tracked.
                </Text>
            )}
        </View>
    );

    const renderSources = (d: LeadAnalytics) => (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>📣 Lead Source Performance</Text>
            <Text style={styles.sectionHint}>Which channel brings leads that actually convert.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                    <View style={[styles.tr, styles.thRow]}>
                        <Text style={[styles.th, styles.colSource]}>Source</Text>
                        <Text style={[styles.th, styles.colNum]}>Leads</Text>
                        <Text style={[styles.th, styles.colNum]}>Won</Text>
                        <Text style={[styles.th, styles.colNum]}>Lost</Text>
                        <Text style={[styles.th, styles.colNum]}>Open</Text>
                        <Text style={[styles.th, styles.colPct]}>Conv %</Text>
                        <Text style={[styles.th, styles.colPct]}>Win %</Text>
                    </View>
                    {d.bySource.map((s, i) => (
                        <View key={s.source} style={[styles.tr, i % 2 === 1 && { backgroundColor: '#f7f8fb' }]}>
                            <Text style={[styles.td, styles.colSource]} numberOfLines={1}>{s.source}</Text>
                            <Text style={[styles.td, styles.colNum]}>{s.total}</Text>
                            <Text style={[styles.td, styles.colNum, { color: '#2e7d32' }]}>{s.won}</Text>
                            <Text style={[styles.td, styles.colNum, { color: '#c62828' }]}>{s.lost}</Text>
                            <Text style={[styles.td, styles.colNum]}>{s.open}</Text>
                            <Text style={[styles.td, styles.colPct, { fontWeight: 'bold' }]}>{s.conversionPct}%</Text>
                            <Text style={[styles.td, styles.colPct]}>{s.won + s.lost > 0 ? `${s.winRatePct}%` : '–'}</Text>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Lead Insights</Text>
                <View style={{ width: 32 }} />
            </View>

            <View style={styles.filterBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 15 }}>
                    {PERIODS.map(p => (
                        <TouchableOpacity key={p.key} style={[styles.chip, period === p.key && styles.chipActive]} onPress={() => setPeriod(p.key)}>
                            <Text style={[styles.chipText, period === p.key && { color: 'white' }]}>{p.label}</Text>
                        </TouchableOpacity>
                    ))}
                    {canFilterByEmployee && (
                        <TouchableOpacity style={[styles.chip, { backgroundColor: '#e8f5e9', borderColor: '#a5d6a7' }]} onPress={() => setShowEmployeePicker(true)}>
                            <Text style={[styles.chipText, { color: '#2e7d32' }]}>👤 {employeeName} ▾</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            </View>

            {loading && !data ? (
                <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 50 }} />
            ) : data ? (
                <ScrollView
                    contentContainerStyle={{ padding: 15, paddingBottom: insets.bottom + 30 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
                >
                    {loading && <ActivityIndicator color="#3b5998" style={{ marginBottom: 10 }} />}
                    {data.summary.total === 0 ? (
                        <Text style={styles.empty}>No leads were created in this period.</Text>
                    ) : (
                        <>
                            {renderSummary(data)}
                            {renderRates(data)}
                            {renderPipelineValue(data)}
                            {renderFunnel(data)}
                            {renderLostReasons(data)}
                            {renderSources(data)}
                        </>
                    )}
                </ScrollView>
            ) : null}

            <Modal visible={showEmployeePicker} transparent animationType="fade" onRequestClose={() => setShowEmployeePicker(false)}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowEmployeePicker(false)} />
                    <View style={styles.pickerBox}>
                        <Text style={styles.pickerTitle}>Show insights for</Text>
                        <FlatList
                            data={[{ id: '', name: 'All Staff' }, ...teamMembers]}
                            keyExtractor={(item: any) => item.id || 'all'}
                            renderItem={({ item }: any) => (
                                <TouchableOpacity
                                    style={styles.pickerItem}
                                    onPress={() => { setEmployeeId(item.id || undefined); setShowEmployeePicker(false); }}
                                >
                                    <Text style={{ fontSize: 15, color: item.status === 'Disabled' ? 'gray' : '#333', flex: 1, fontWeight: (employeeId || '') === item.id ? 'bold' : 'normal' }}>
                                        {item.name}{item.status === 'Disabled' ? '  (Disabled)' : ''}
                                    </Text>
                                    {(employeeId || '') === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f2f4f8' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingBottom: 12, backgroundColor: 'white', elevation: 3 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    filterBar: { backgroundColor: 'white', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, borderWidth: 1, borderColor: '#3b5998' },
    chipActive: { backgroundColor: '#3b5998' },
    chipText: { fontSize: 12, fontWeight: 'bold', color: '#3b5998' },

    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryCard: { flex: 1, backgroundColor: 'white', borderRadius: 10, paddingVertical: 12, alignItems: 'center', elevation: 1 },
    summaryValue: { fontSize: 20, fontWeight: 'bold' },
    summaryLabel: { fontSize: 11, color: 'gray', marginTop: 2 },
    ratesRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    rateBox: { flex: 1, backgroundColor: '#e8eaf6', borderRadius: 10, padding: 12, alignItems: 'center' },
    rateValue: { fontSize: 22, fontWeight: 'bold', color: '#3b5998' },
    rateLabel: { fontSize: 10, color: '#555', textAlign: 'center', marginTop: 2 },

    section: { backgroundColor: 'white', borderRadius: 12, padding: 15, marginTop: 15, elevation: 1 },
    sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#333' },
    sectionHint: { fontSize: 11, color: 'gray', marginTop: 4 },
    barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    barLabel: { fontSize: 13, color: '#333', flexShrink: 1 },
    barCount: { fontSize: 13, fontWeight: 'bold', color: '#333' },
    barTrack: { height: 10, backgroundColor: '#eceff1', borderRadius: 5, overflow: 'hidden' },
    barFill: { height: 10, borderRadius: 5 },
    empty: { textAlign: 'center', color: 'gray', marginTop: 15, fontStyle: 'italic', fontSize: 12 },

    tr: { flexDirection: 'row', paddingVertical: 8 },
    thRow: { borderBottomWidth: 1, borderBottomColor: '#ddd', marginTop: 10 },
    th: { fontSize: 11, fontWeight: 'bold', color: '#555' },
    td: { fontSize: 13, color: '#333' },
    colSource: { width: 120, paddingRight: 6 },
    colNum: { width: 48, textAlign: 'right' },
    colPct: { width: 62, textAlign: 'right' },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
    pickerBox: { width: '82%', maxHeight: '70%', backgroundColor: 'white', borderRadius: 12, padding: 16, elevation: 10 },
    pickerTitle: { fontSize: 16, fontWeight: 'bold', color: '#3b5998', marginBottom: 8, textAlign: 'center' },
    pickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
});
