import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatInr } from '../constants/leadStatus';
import { getTeamDay, TeamDay } from '../services/api/teamDay';
import { useHeaderTop } from '../hooks/useHeaderTop';

// Opened from the 8 PM "Team today" notification (or Team Performance).
// Shows the same numbers as the notification, per salesperson, for any day.

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const label = (s: string) => {
    const d = new Date(`${s}T00:00:00`);
    const today = ymd(new Date());
    if (s === today) return 'Today';
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export default function TeamTodayScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    const params = useLocalSearchParams<{ date?: string }>();
    const [date, setDate] = useState<string>(typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : ymd(new Date()));
    const [data, setData] = useState<TeamDay | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError('');
        try {
            setData(await getTeamDay(date));
        } catch (e: any) {
            setError(e?.message || 'Could not load');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [date]);

    useEffect(() => { load(); }, [load]);

    const shift = (days: number) => {
        const d = new Date(`${date}T00:00:00`);
        d.setDate(d.getDate() + days);
        if (ymd(d) > ymd(new Date())) return;
        setDate(ymd(d));
    };

    const t = data?.totals;
    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Team Day Report</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.dateRow}>
                <TouchableOpacity onPress={() => shift(-1)} style={styles.arrow}><Ionicons name="chevron-back" size={22} color="#3b5998" /></TouchableOpacity>
                <Text style={styles.dateText}>{label(date)}</Text>
                <TouchableOpacity onPress={() => shift(1)} style={styles.arrow} disabled={date >= ymd(new Date())}>
                    <Ionicons name="chevron-forward" size={22} color={date >= ymd(new Date()) ? '#ccc' : '#3b5998'} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#3b5998" />
            ) : error ? (
                <Text style={styles.muted}>{error}</Text>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
                    {t && (
                        <View style={styles.totals}>
                            <Stat icon="walk" label="Visits" value={String(t.visits)} />
                            <Stat icon="person-add" label="New leads" value={`${t.newLeads}${t.websiteLeads ? ` +${t.websiteLeads}🌐` : ''}`} />
                            <Stat icon="document-text" label="Quotations" value={String(t.quotations)} sub={t.quotationValue ? formatInr(t.quotationValue) : undefined} />
                            <Stat icon="cart" label="Orders" value={String(t.orders)} sub={t.orderValue ? formatInr(t.orderValue) : undefined} />
                        </View>
                    )}

                    {(data?.people || []).map((p) => (
                        <View key={p.userId} style={styles.card}>
                            <Text style={styles.name}>{p.name || 'Unknown'}</Text>
                            <View style={styles.personRow}>
                                <Small label="Visits" value={p.visits} />
                                <Small label="Leads" value={p.newLeads + p.websiteLeads} />
                                <Small label="Quotes" value={p.quotations} extra={p.quotationValue ? formatInr(p.quotationValue) : ''} />
                                <Small label="Orders" value={p.orders} extra={p.orderValue ? formatInr(p.orderValue) : ''} />
                            </View>
                        </View>
                    ))}
                    {(data?.people || []).length === 0 && <Text style={styles.muted}>No sales activity recorded on this day.</Text>}
                </ScrollView>
            )}
        </View>
    );
}

function Stat({ icon, label, value, sub }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; sub?: string }) {
    return (
        <View style={styles.stat}>
            <Ionicons name={icon} size={18} color="#3b5998" />
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
            {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
        </View>
    );
}

function Small({ label, value, extra }: { label: string; value: number; extra?: string }) {
    return (
        <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.smallValue, value === 0 && { color: '#bbb' }]}>{value}</Text>
            <Text style={styles.smallLabel}>{label}</Text>
            {extra ? <Text style={styles.statSub}>{extra}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', elevation: 2 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
    arrow: { padding: 6, marginHorizontal: 10 },
    dateText: { fontSize: 15, fontWeight: 'bold', color: '#333', minWidth: 150, textAlign: 'center' },
    totals: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 12, elevation: 1 },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 4 },
    statLabel: { fontSize: 11, color: 'gray' },
    statSub: { fontSize: 10, color: '#2e7d32', fontWeight: 'bold' },
    card: { backgroundColor: 'white', borderRadius: 10, padding: 12, marginBottom: 8, elevation: 1 },
    name: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 8 },
    personRow: { flexDirection: 'row' },
    smallValue: { fontSize: 16, fontWeight: 'bold', color: '#3b5998' },
    smallLabel: { fontSize: 10, color: 'gray' },
    muted: { color: 'gray', textAlign: 'center', marginTop: 30 },
});
