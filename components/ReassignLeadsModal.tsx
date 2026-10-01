import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { bulkReassignLeads, getAssigneeSummary } from '../services/api/leads';

interface Member {
    id: string;
    name: string;
    status?: string; // 'Active' | 'Disabled'
}

interface Props {
    visible: boolean;
    onClose: () => void;
    onDone: () => void; // caller refreshes its lead list
    teamMembers: Member[];
    initialFromUserId?: string;
}

type Scope = 'open' | 'all';

export default function ReassignLeadsModal({ visible, onClose, onDone, teamMembers, initialFromUserId }: Props) {
    const [fromId, setFromId] = useState('');
    const [toId, setToId] = useState('');
    const [scope, setScope] = useState<Scope>('open');
    const [summary, setSummary] = useState<{ total: number; open: number } | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pickerFor, setPickerFor] = useState<'from' | 'to' | null>(null);

    useEffect(() => {
        if (!visible) return;
        setFromId(initialFromUserId && initialFromUserId !== 'All' ? initialFromUserId : '');
        setToId('');
        setScope('open');
        setPickerFor(null);
    }, [visible, initialFromUserId]);

    useEffect(() => {
        setSummary(null);
        if (!fromId) return;
        let cancelled = false;
        setLoadingSummary(true);
        getAssigneeSummary(fromId)
            .then((s) => { if (!cancelled) setSummary(s); })
            .catch((e) => { if (!cancelled) Alert.alert('Error', e?.message || 'Could not load lead count'); })
            .finally(() => { if (!cancelled) setLoadingSummary(false); });
        return () => { cancelled = true; };
    }, [fromId]);

    const nameOf = (id: string) => teamMembers.find((m) => m.id === id)?.name || '';
    const isDisabled = (m: Member) => m.status === 'Disabled';
    const moveCount = summary ? (scope === 'open' ? summary.open : summary.total) : 0;

    // "From" can be a disabled employee (someone who left); "To" must be active.
    const pickerData = pickerFor === 'to'
        ? teamMembers.filter((m) => !isDisabled(m) && m.id !== fromId)
        : teamMembers.filter((m) => m.id !== toId);

    const confirm = () => {
        if (!fromId || !toId || moveCount === 0) return;
        Alert.alert(
            'Reassign Leads?',
            `${moveCount} ${scope === 'open' ? 'open ' : ''}lead(s) will move from ${nameOf(fromId)} to ${nameOf(toId)}.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reassign', onPress: submit },
            ]
        );
    };

    const submit = async () => {
        setSaving(true);
        try {
            const res = await bulkReassignLeads({ fromUserId: fromId, toUserId: toId, scope });
            Alert.alert('Done ✅', `${res.count} lead(s) moved to ${res.toUserName}.`);
            onDone();
            onClose();
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Reassign failed');
        } finally {
            setSaving(false);
        }
    };

    const renderPicker = () => (
        <View style={{ flex: 1 }}>
            <View style={styles.pickerHeaderRow}>
                <TouchableOpacity onPress={() => setPickerFor(null)} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={22} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>{pickerFor === 'from' ? 'Move leads FROM' : 'Move leads TO'}</Text>
                <View style={{ width: 30 }} />
            </View>
            <FlatList
                data={pickerData}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => {
                    const selected = (pickerFor === 'from' ? fromId : toId) === item.id;
                    return (
                        <TouchableOpacity
                            style={[styles.pickerItem, selected && { backgroundColor: '#e3f2fd' }]}
                            onPress={() => {
                                if (pickerFor === 'from') setFromId(item.id); else setToId(item.id);
                                setPickerFor(null);
                            }}
                        >
                            <Text style={{ fontSize: 15, color: isDisabled(item) ? 'gray' : '#333', fontWeight: selected ? 'bold' : 'normal' }}>
                                {item.name}{isDisabled(item) ? '  (Disabled)' : ''}
                            </Text>
                            {selected && <Ionicons name="checkmark" size={18} color="green" />}
                        </TouchableOpacity>
                    );
                }}
                ListEmptyComponent={<Text style={styles.muted}>No employees available.</Text>}
            />
        </View>
    );

    const renderForm = () => (
        <View>
            <View style={styles.pickerHeaderRow}>
                <Text style={styles.title}>Reassign Leads</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={30} color="#d32f2f" />
                </TouchableOpacity>
            </View>
            <Text style={styles.muted}>Move one employee's leads to another — e.g. when someone is on leave or has left.</Text>

            <Text style={styles.label}>From</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => setPickerFor('from')}>
                <Text style={{ color: fromId ? '#333' : 'gray', fontWeight: 'bold' }}>{nameOf(fromId) || 'Select employee...'}</Text>
                <Ionicons name="chevron-down" size={16} color="gray" />
            </TouchableOpacity>

            {fromId ? (
                loadingSummary ? (
                    <ActivityIndicator style={{ marginTop: 12 }} color="#3b5998" />
                ) : summary ? (
                    <View style={styles.scopeRow}>
                        {([
                            ['open', `Open leads (${summary.open})`],
                            ['all', `All leads (${summary.total})`],
                        ] as [Scope, string][]).map(([key, label]) => (
                            <TouchableOpacity key={key} style={[styles.scopeChip, scope === key && styles.scopeChipActive]} onPress={() => setScope(key)}>
                                <Text style={[styles.scopeText, scope === key && { color: 'white' }]}>{label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : null
            ) : null}
            {scope === 'all' && (
                <Text style={[styles.muted, { marginTop: 6 }]}>
                    Won and lost leads will also move, so their sales history will show under the new employee.
                </Text>
            )}

            <Text style={styles.label}>To</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => setPickerFor('to')} disabled={!fromId}>
                <Text style={{ color: toId ? '#333' : 'gray', fontWeight: 'bold' }}>{nameOf(toId) || 'Select employee...'}</Text>
                <Ionicons name="chevron-down" size={16} color="gray" />
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.saveBtn, (!fromId || !toId || moveCount === 0 || saving) && { backgroundColor: '#ccc' }]}
                disabled={!fromId || !toId || moveCount === 0 || saving}
                onPress={confirm}
            >
                {saving ? <ActivityIndicator color="white" /> : (
                    <Text style={styles.saveText}>
                        {fromId && summary && moveCount === 0 ? 'No leads to move' : `Reassign ${moveCount || ''} Lead(s)`}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.sheet, pickerFor && { height: '75%' }]}>
                    {pickerFor ? renderPicker() : renderForm()}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: 'white', padding: 20, paddingBottom: 35, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    pickerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    muted: { fontSize: 12, color: 'gray' },
    label: { marginTop: 16, marginBottom: 6, fontWeight: '600', color: '#555', fontSize: 12 },
    selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#f9f9f9' },
    scopeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    scopeChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#3b5998', alignItems: 'center' },
    scopeChipActive: { backgroundColor: '#3b5998' },
    scopeText: { fontSize: 13, fontWeight: 'bold', color: '#3b5998' },
    pickerItem: { paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    saveBtn: { backgroundColor: '#3b5998', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 24 },
    saveText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
