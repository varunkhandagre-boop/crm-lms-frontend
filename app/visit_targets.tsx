import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getVisitTargets, VisitTargetRow, VisitTargets } from '../services/api/salesVisits';
import { useData } from './context/DataContext';

// Visit Targets: each salesperson's visits vs their daily / monthly target.
// Field users see only themselves (the server scopes it). Targets are set in
// Team & Settings → user → "Visits / day" and "Visits / month".

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const shiftMonth = (ym: string, delta: number) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
};

const GREEN = '#2e7d32', ORANGE = '#ef6c00', RED = '#c62828';

function Bar({ value, target, marker }: { value: number; target: number; marker?: number | null }) {
    const pct = Math.min(100, (value / target) * 100);
    const color = value >= target ? GREEN : marker != null && value >= marker ? GREEN : marker != null ? ORANGE : value > 0 ? ORANGE : RED;
    return (
        <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
            {marker != null && marker < target && (
                <View style={[styles.barMarker, { left: `${(marker / target) * 100}%` }]} />
            )}
        </View>
    );
}

export default function VisitTargetsScreen() {
    const router = useRouter();
    const { currentUser } = useData();
    const [month, setMonth] = useState<string | null>(null); // null = current (server decides)
    const [data, setData] = useState<VisitTargets | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (m: string | null, isRefresh = false) => {
        if (!currentUser?.companyId) return;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            setData(await getVisitTargets(m || undefined));
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not load visit targets');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [currentUser?.companyId]);

    useFocusEffect(useCallback(() => { load(month); }, [load, month]));

    const go = (delta: number) => {
        if (!data) return;
        setMonth(shiftMonth(data.month, delta));
    };
    const nowYm = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
    const canGoNext = !!data && data.month < nowYm;

    const renderRow = ({ item }: { item: VisitTargetRow }) => {
        const noTarget = !item.dailyTarget && !item.monthlyTarget;
        const behind = item.expectedByNow != null && item.month < item.expectedByNow;
        return (
            <View style={styles.card}>
                <View style={styles.cardHead}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    {!!item.jobTitle && <Text style={styles.job}>{item.jobTitle}</Text>}
                </View>

                {item.today != null && (
                    <View style={styles.block}>
                        <View style={styles.rowLine}>
                            <Text style={styles.label}>Today</Text>
                            <Text style={styles.value}>
                                {item.today}{item.dailyTarget ? <Text style={styles.of}> / {item.dailyTarget}</Text> : null}
                                {item.dailyTarget && item.today >= item.dailyTarget ? '  ✅' : ''}
                            </Text>
                        </View>
                        {!!item.dailyTarget && <Bar value={item.today} target={item.dailyTarget} />}
                    </View>
                )}

                <View style={styles.block}>
                    <View style={styles.rowLine}>
                        <Text style={styles.label}>{data?.isCurrentMonth ? 'This month' : monthLabel(data?.month || '')}</Text>
                        <Text style={styles.value}>
                            {item.month}{item.monthlyTarget ? <Text style={styles.of}> / {item.monthlyTarget}</Text> : null}
                            {item.monthlyTarget && item.month >= item.monthlyTarget ? '  🏆' : ''}
                        </Text>
                    </View>
                    {!!item.monthlyTarget && <Bar value={item.month} target={item.monthlyTarget} marker={item.expectedByNow} />}
                    {item.expectedByNow != null && (
                        <Text style={[styles.pace, { color: behind ? ORANGE : GREEN }]}>
                            {behind
                                ? `Behind pace — should be at ${item.expectedByNow} by today (${item.expectedByNow - item.month} short)`
                                : `On track — ${item.expectedByNow} expected by today`}
                        </Text>
                    )}
                </View>

                {noTarget && <Text style={styles.noTarget}>No visit target set (Team & Settings → edit user → Visits / day, Visits / month)</Text>}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>🎯 Visit Targets</Text>
            </View>

            <View style={styles.monthBar}>
                <TouchableOpacity onPress={() => go(-1)} style={styles.monthBtn} disabled={!data}>
                    <Ionicons name="chevron-back" size={22} color="#3b5998" />
                </TouchableOpacity>
                <Text style={styles.monthText}>{data ? monthLabel(data.month) : '…'}</Text>
                <TouchableOpacity onPress={() => go(1)} style={styles.monthBtn} disabled={!canGoNext}>
                    <Ionicons name="chevron-forward" size={22} color={canGoNext ? '#3b5998' : '#ccc'} />
                </TouchableOpacity>
            </View>

            {loading && !data ? (
                <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={data?.rows || []}
                    keyExtractor={(r) => r.userId}
                    renderItem={renderRow}
                    contentContainerStyle={{ padding: 12 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(month, true)} />}
                    ListHeaderComponent={data?.isCurrentMonth ? (
                        <Text style={styles.hint}>Day {data.dayOfMonth} of {data.daysInMonth}. The line on the month bar shows where you should be by today.</Text>
                    ) : null}
                    ListEmptyComponent={
                        <Text style={styles.empty}>
                            {error || 'No visit targets set and no visits logged this month. Set targets in Team & Settings → edit user → "Visits / day" / "Visits / month".'}
                        </Text>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#fff', elevation: 2 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 12 },
    monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#eee' },
    monthBtn: { padding: 8 },
    monthText: { fontSize: 16, fontWeight: 'bold', color: '#333', minWidth: 110, textAlign: 'center' },
    hint: { fontSize: 12, color: 'gray', marginBottom: 8 },
    empty: { textAlign: 'center', color: 'gray', marginTop: 30, paddingHorizontal: 20, lineHeight: 20 },
    card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, elevation: 1 },
    cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    name: { flex: 1, fontSize: 16, fontWeight: 'bold', color: '#222' },
    job: { fontSize: 11, color: '#3b5998', backgroundColor: '#e8eaf6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    block: { marginTop: 8 },
    rowLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
    label: { fontSize: 13, color: '#555' },
    value: { fontSize: 16, fontWeight: 'bold', color: '#222' },
    of: { fontSize: 13, fontWeight: 'normal', color: '#777' },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: '#eceff1', overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4 },
    barMarker: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#37474f' },
    pace: { fontSize: 11, marginTop: 4, fontWeight: '600' },
    noTarget: { fontSize: 11, color: '#999', fontStyle: 'italic', marginTop: 8 },
});
