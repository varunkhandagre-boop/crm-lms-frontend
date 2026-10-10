import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { AlertSettingItem, fetchAlertSettings, saveAlertSetting } from '../services/api/alertSettings';
import { pickerHandlers } from '../utils/datePickerHandlers';
import { useData } from '../app/context/DataContext';

const SECTIONS: { module: AlertSettingItem['module']; title: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { module: 'sales', title: 'Sales', icon: 'trending-up', color: '#3b5998' },
    { module: 'service', title: 'Service', icon: 'construct', color: '#e67e22' },
    { module: 'hr', title: 'HR', icon: 'people', color: '#2e7d32' },
];

/** "20:00" → "8:00 PM" */
function to12h(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function toDate(hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}

const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** "Alerts" tab in Team & Settings (manage_team.tsx): daily alert on/off + time. */
export default function AlertSettingsTab() {
    const { currentUser } = useData();
    const isAllowed = ['Admin', 'SuperAdmin'].includes(currentUser?.role || '');

    const [items, setItems] = useState<AlertSettingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [pickerFor, setPickerFor] = useState<AlertSettingItem | null>(null);

    const load = async (isRefresh = false) => {
        if (!isAllowed) { setLoading(false); return; }
        if (isRefresh) setRefreshing(true);
        try {
            setItems(await fetchAlertSettings());
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not load alert settings');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { load(); }, []);

    // Saved straight away — no separate Save button to forget.
    const save = async (key: string, change: { enabled?: boolean; time?: string }) => {
        setSavingKey(key);
        try {
            setItems(await saveAlertSetting(key, change));
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not save');
        } finally {
            setSavingKey(null);
        }
    };

    if (!isAllowed) {
        return (
            <View style={[styles.container, styles.center]}>
                <Ionicons name="lock-closed" size={40} color="#ccc" />
                <Text style={styles.muted}>Only an Admin can change alert settings.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#3b5998" />
            ) : (
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
                >
                    <Text style={styles.intro}>
                        Daily alerts arrive as a phone notification and in the 🔔 list. Turn any of them off, or tap the time to change
                        it. If today&apos;s alert has already gone, the new time applies from tomorrow.
                    </Text>

                    {SECTIONS.map((section) => {
                        const list = items.filter((i) => i.module === section.module);
                        if (list.length === 0) return null;
                        return (
                            <View key={section.module} style={{ marginBottom: 10 }}>
                                <View style={styles.sectionRow}>
                                    <Ionicons name={section.icon} size={18} color={section.color} />
                                    <Text style={[styles.sectionTitle, { color: section.color }]}>{section.title}</Text>
                                </View>
                                {list.map((item) => (
                                    <View key={item.key} style={[styles.card, !item.enabled && { opacity: 0.6 }]}>
                                        <View style={styles.cardTop}>
                                            <Text style={styles.cardTitle}>{item.label}</Text>
                                            {savingKey === item.key ? (
                                                <ActivityIndicator color="#3b5998" />
                                            ) : (
                                                <Switch value={item.enabled} onValueChange={(v) => save(item.key, { enabled: v })} />
                                            )}
                                        </View>
                                        <Text style={styles.desc}>{item.description}</Text>
                                        <View style={styles.cardBottom}>
                                            <Text style={styles.recipients}>To: {item.recipients}</Text>
                                            <TouchableOpacity
                                                style={styles.timeBtn}
                                                disabled={!item.enabled || savingKey === item.key}
                                                onPress={() => setPickerFor(item)}
                                            >
                                                <Ionicons name="time-outline" size={14} color="#3b5998" />
                                                <Text style={styles.timeText}>{to12h(item.time)}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {item.time !== item.defaultTime && (
                                            <TouchableOpacity onPress={() => save(item.key, { time: item.defaultTime })}>
                                                <Text style={styles.resetText}>Reset to {to12h(item.defaultTime)}</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))}
                            </View>
                        );
                    })}
                </ScrollView>
            )}

            {pickerFor && (
                <DateTimePicker
                    value={toDate(pickerFor.time)}
                    mode="time"
                    {...pickerHandlers((_e, d) => {
                        const item = pickerFor;
                        setPickerFor(null);
                        if (d && item) {
                            const hhmm = toHHMM(d);
                            if (hhmm !== item.time) save(item.key, { time: hhmm });
                        }
                    })}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center', gap: 10 },
    content: { padding: 5, paddingBottom: 40 },
    intro: { fontSize: 12, color: 'gray', marginBottom: 15, lineHeight: 18 },
    muted: { fontSize: 13, color: 'gray' },
    sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 5 },
    sectionTitle: { fontSize: 15, fontWeight: 'bold', marginLeft: 6 },
    card: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', flex: 1, marginRight: 10 },
    desc: { fontSize: 12, color: '#666', marginTop: 4 },
    cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
    recipients: { fontSize: 11, color: 'gray', flex: 1, marginRight: 10 },
    timeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8eaf6', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
    timeText: { fontSize: 13, fontWeight: 'bold', color: '#3b5998' },
    resetText: { fontSize: 11, color: '#1565c0', marginTop: 8, textAlign: 'right' },
});
