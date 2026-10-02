import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { EngineerStat, getEngineerStats } from '../services/api/serviceCalls';

type Period = 'month' | 'fy' | 'all';
const PERIODS: { key: Period; label: string }[] = [
    { key: 'month', label: 'This Month' },
    { key: 'fy', label: 'This FY' },
    { key: 'all', label: 'All Time' },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function range(p: Period): { from?: string; to?: string } {
    const now = new Date();
    if (p === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    if (p === 'fy') {
        const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        return { from: `${start}-04-01`, to: ymd(now) };
    }
    return {};
}

/** 30 → "30 hrs", 60 → "2.5 days" */
export function formatHours(h: number | null): string {
    if (h === null || h === undefined) return '—';
    if (h < 48) return `${Math.round(h)} hrs`;
    return `${(h / 24).toFixed(1)} days`;
}

export default function EngineerStatsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const [period, setPeriod] = useState<Period>('month');
    const [data, setData] = useState<{ engineers: EngineerStat[]; unassignedOpen: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        setLoading(true);
        setError('');
        const r = range(period);
        getEngineerStats(r.from, r.to)
            .then((d) => { if (!cancelled) setData(d); })
            .catch((e) => { if (!cancelled) setError(e?.message || 'Could not load'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [visible, period]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    <View style={styles.headerRow}>
                        <Text style={styles.title}>📊 Engineer Performance</Text>
                        <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={30} color="#d32f2f" /></TouchableOpacity>
                    </View>
                    <View style={styles.periodRow}>
                        {PERIODS.map((p) => (
                            <TouchableOpacity key={p.key} style={[styles.chip, period === p.key && styles.chipActive]} onPress={() => setPeriod(p.key)}>
                                <Text style={[styles.chipText, period === p.key && { color: 'white' }]}>{p.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {loading ? (
                        <ActivityIndicator style={{ marginVertical: 30 }} color="#3b5998" />
                    ) : error ? (
                        <Text style={styles.muted}>{error}</Text>
                    ) : (
                        <ScrollView>
                            {!!data?.unassignedOpen && (
                                <View style={styles.warnBox}>
                                    <Ionicons name="alert-circle" size={16} color="#c62828" />
                                    <Text style={styles.warnText}>{data.unassignedOpen} open call(s) not assigned to anyone</Text>
                                </View>
                            )}
                            <View style={[styles.tr, styles.th]}>
                                <Text style={[styles.cell, { flex: 2 }]}>Engineer</Text>
                                <Text style={styles.cell}>Open now</Text>
                                <Text style={styles.cell}>Closed</Text>
                                <Text style={styles.cell}>Avg time</Text>
                            </View>
                            {(data?.engineers || []).map((e) => (
                                <View key={e.engineerId} style={styles.tr}>
                                    <Text style={[styles.cell, { flex: 2, fontWeight: 'bold', textAlign: 'left' }]} numberOfLines={1}>{e.name}</Text>
                                    <Text style={[styles.cell, e.openNow > 0 && { color: '#c62828', fontWeight: 'bold' }]}>{e.openNow}</Text>
                                    <Text style={styles.cell}>{e.closed}</Text>
                                    <Text style={styles.cell}>{formatHours(e.avgHours)}</Text>
                                </View>
                            ))}
                            {(data?.engineers || []).length === 0 && (
                                <Text style={[styles.muted, { marginTop: 15 }]}>No calls have been assigned to engineers yet.</Text>
                            )}
                            <Text style={[styles.muted, { marginTop: 12 }]}>
                                Avg time = from logging the call to closing it, for calls closed in this period. Only calls assigned to an engineer count.
                            </Text>
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: 'white', padding: 20, paddingBottom: 35, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    periodRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#3b5998' },
    chipActive: { backgroundColor: '#3b5998' },
    chipText: { fontSize: 12, fontWeight: 'bold', color: '#3b5998' },
    warnBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', padding: 8, borderRadius: 8, marginBottom: 10 },
    warnText: { marginLeft: 6, color: '#c62828', fontSize: 12, fontWeight: 'bold' },
    tr: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
    th: { backgroundColor: '#f5f5f5' },
    cell: { flex: 1, fontSize: 12, color: '#333', textAlign: 'center' },
    muted: { fontSize: 11, color: 'gray' },
});
