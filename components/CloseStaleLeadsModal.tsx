import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { LOST_REASONS, LostReason } from '../constants/leadStatus';
import { closeStaleLeads, getStaleLeadsCount } from '../services/api/leads';

interface Member {
    id: string;
    name: string;
    status?: string;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    onDone: () => void; // caller refreshes its lead list
    teamMembers: Member[];
}

const DAY_OPTIONS = [30, 60, 90, 180];

export default function CloseStaleLeadsModal({ visible, onClose, onDone, teamMembers }: Props) {
    const [employeeId, setEmployeeId] = useState('');
    const [days, setDays] = useState(60);
    const [reason, setReason] = useState<LostReason>('No Response');
    const [note, setNote] = useState('');
    const [count, setCount] = useState<number | null>(null);
    const [counting, setCounting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [picker, setPicker] = useState<'employee' | 'reason' | null>(null);

    useEffect(() => {
        if (!visible) return;
        setEmployeeId('');
        setDays(60);
        setReason('No Response');
        setNote('');
        setPicker(null);
    }, [visible]);

    // Live preview of how many leads the current filter would close.
    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        setCounting(true);
        setCount(null);
        getStaleLeadsCount({ olderThanDays: days, assignedToId: employeeId || undefined })
            .then(c => { if (!cancelled) setCount(c); })
            .catch(e => { if (!cancelled) Alert.alert('Error', e?.message || 'Could not count stale leads'); })
            .finally(() => { if (!cancelled) setCounting(false); });
        return () => { cancelled = true; };
    }, [visible, days, employeeId]);

    const employeeName = employeeId ? teamMembers.find(m => m.id === employeeId)?.name || '' : 'All Staff';

    const confirm = () => {
        if (!count) return;
        Alert.alert(
            'Close Stale Leads?',
            `${count} open lead(s) of ${employeeName} with no follow-up for ${days}+ days will be marked Lost (${reason}).\n\nThey can still be reopened one by one from Lead Details.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: `Close ${count}`, style: 'destructive', onPress: submit },
            ]
        );
    };

    const submit = async () => {
        setSaving(true);
        try {
            const closed = await closeStaleLeads({ olderThanDays: days, assignedToId: employeeId || undefined, lostReason: reason, note: note.trim() || undefined });
            Alert.alert('Done ✅', `${closed} stale lead(s) marked as Lost.`);
            onDone();
            onClose();
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not close leads');
        } finally {
            setSaving(false);
        }
    };

    const renderPicker = () => {
        const items: { id: string; label: string; muted?: boolean }[] = picker === 'employee'
            ? [{ id: '', label: 'All Staff' }, ...teamMembers.map(m => ({ id: m.id, label: m.name + (m.status === 'Disabled' ? '  (Disabled)' : ''), muted: m.status === 'Disabled' }))]
            : LOST_REASONS.map(r => ({ id: r, label: r }));
        const selected = picker === 'employee' ? employeeId : reason;
        return (
            <View style={{ flex: 1 }}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => setPicker(null)} style={{ padding: 4 }}>
                        <Ionicons name="arrow-back" size={22} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.title}>{picker === 'employee' ? 'Employee' : 'Lost Reason'}</Text>
                    <View style={{ width: 30 }} />
                </View>
                <ScrollView style={{ flex: 1 }}>
                    {items.map((item) => (
                        <TouchableOpacity
                            key={item.id || 'all'}
                            style={[styles.pickerItem, selected === item.id && { backgroundColor: '#e3f2fd' }]}
                            onPress={() => {
                                if (picker === 'employee') setEmployeeId(item.id); else setReason(item.id as LostReason);
                                setPicker(null);
                            }}
                        >
                            <Text style={{ fontSize: 15, color: item.muted ? 'gray' : '#333', fontWeight: selected === item.id ? 'bold' : 'normal' }}>{item.label}</Text>
                            {selected === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        );
    };

    const renderForm = () => (
        <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.headerRow}>
                <Text style={styles.title}>Close Stale Leads</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={30} color="#d32f2f" />
                </TouchableOpacity>
            </View>
            <Text style={styles.muted}>Mark old open leads that nobody is following up on as Lost, so lists, reminders and reports only show real, active deals.</Text>

            <Text style={styles.label}>Employee</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => setPicker('employee')}>
                <Text style={{ color: '#333', fontWeight: 'bold' }}>{employeeName}</Text>
                <Ionicons name="chevron-down" size={16} color="gray" />
            </TouchableOpacity>

            <Text style={styles.label}>No follow-up for more than</Text>
            <View style={styles.chipRow}>
                {DAY_OPTIONS.map(d => (
                    <TouchableOpacity key={d} style={[styles.chip, days === d && styles.chipActive]} onPress={() => setDays(d)}>
                        <Text style={[styles.chipText, days === d && { color: 'white' }]}>{d} days</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.label}>Lost reason</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => setPicker('reason')}>
                <Text style={{ color: '#333', fontWeight: 'bold' }}>{reason}</Text>
                <Ionicons name="chevron-down" size={16} color="gray" />
            </TouchableOpacity>
            <TextInput
                style={[styles.selectBtn, { marginTop: 8 }]}
                placeholder={`Note (optional) — default: "Auto-closed: no follow-up for over ${days} days."`}
                value={note}
                onChangeText={setNote}
                maxLength={500}
            />

            <View style={styles.previewBox}>
                {counting ? <ActivityIndicator color="#c62828" /> : (
                    <Text style={styles.previewText}>
                        {count === null ? '—' : count === 0 ? 'No stale leads match this filter 🎉' : `${count} lead(s) will be marked Lost`}
                    </Text>
                )}
            </View>

            <TouchableOpacity
                style={[styles.saveBtn, (!count || saving || counting) && { backgroundColor: '#ccc' }]}
                disabled={!count || saving || counting}
                onPress={confirm}
            >
                {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Close {count || ''} Lead(s)</Text>}
            </TouchableOpacity>
        </ScrollView>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.sheet, picker && { height: '75%' }]}>
                    {picker ? renderPicker() : renderForm()}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: 'white', padding: 20, paddingBottom: 35, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    muted: { fontSize: 12, color: 'gray' },
    label: { marginTop: 16, marginBottom: 6, fontWeight: '600', color: '#555', fontSize: 12 },
    selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#f9f9f9' },
    chipRow: { flexDirection: 'row', gap: 8 },
    chip: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#c62828', alignItems: 'center' },
    chipActive: { backgroundColor: '#c62828' },
    chipText: { fontSize: 12, fontWeight: 'bold', color: '#c62828' },
    previewBox: { marginTop: 18, padding: 12, borderRadius: 8, backgroundColor: '#ffebee', alignItems: 'center' },
    previewText: { color: '#c62828', fontWeight: 'bold', fontSize: 14 },
    pickerItem: { paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    saveBtn: { backgroundColor: '#c62828', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 18 },
    saveText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
