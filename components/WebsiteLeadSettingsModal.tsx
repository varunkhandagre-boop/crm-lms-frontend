import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getWebsiteLeadSettings, updateWebsiteLeadSettings, WebsiteLeadSettings } from '../services/api/websiteLeads';

interface Member {
    id: string;
    name: string;
    status?: string; // 'Active' | 'Disabled'
}

interface Props {
    visible: boolean;
    onClose: () => void;
    teamMembers: Member[];
    /** Only Admin can change it (backend enforces this too); Manager sees it read-only. */
    canEdit: boolean;
}

const DEFAULT_ID = '__default__';

export default function WebsiteLeadSettingsModal({ visible, onClose, teamMembers, canEdit }: Props) {
    const [settings, setSettings] = useState<WebsiteLeadSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [picking, setPicking] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setPicking(false);
        setLoading(true);
        getWebsiteLeadSettings()
            .then(setSettings)
            .catch((e) => Alert.alert('Error', e?.message || 'Could not load setting'))
            .finally(() => setLoading(false));
    }, [visible]);

    const choose = async (id: string) => {
        setPicking(false);
        setSaving(true);
        try {
            const updated = await updateWebsiteLeadSettings({ assigneeId: id === DEFAULT_ID ? null : id });
            setSettings(updated);
            Alert.alert('Saved ✅', `New website leads will go to ${updated.effectiveAssignee?.name || 'the Admin'}.`);
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const active = teamMembers.filter((m) => m.status !== 'Disabled');
    const pickerData: Member[] = [{ id: DEFAULT_ID, name: 'Default — first Admin' }, ...active];
    const selectedId = settings?.assigneeId || DEFAULT_ID;

    const renderPicker = () => (
        <View style={{ flex: 1 }}>
            <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => setPicking(false)} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={22} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Website leads go to</Text>
                <View style={{ width: 30 }} />
            </View>
            <FlatList
                data={pickerData}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => {
                    const selected = selectedId === item.id;
                    return (
                        <TouchableOpacity style={[styles.pickerItem, selected && { backgroundColor: '#e3f2fd' }]} onPress={() => choose(item.id)}>
                            <Text style={{ fontSize: 15, color: '#333', fontWeight: selected ? 'bold' : 'normal' }}>{item.name}</Text>
                            {selected && <Ionicons name="checkmark" size={18} color="green" />}
                        </TouchableOpacity>
                    );
                }}
            />
        </View>
    );

    const renderInfo = () => (
        <View>
            <View style={styles.headerRow}>
                <Text style={styles.title}>🌐 Website Leads</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={30} color="#d32f2f" />
                </TouchableOpacity>
            </View>
            <Text style={styles.muted}>
                Enquiries from the company website become leads automatically. The person chosen here gets every new
                website lead, its notification and the follow-up reminder. You can still reassign any single lead from Lead Details.
            </Text>

            <Text style={styles.label}>New website leads are assigned to</Text>
            {loading ? (
                <ActivityIndicator style={{ marginTop: 12 }} color="#3b5998" />
            ) : (
                <TouchableOpacity style={styles.selectBtn} onPress={() => setPicking(true)} disabled={!canEdit || saving}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: '#333', fontWeight: 'bold' }}>{settings?.effectiveAssignee?.name || '—'}</Text>
                        {!settings?.assigneeId && <Text style={styles.muted}>Default (first Admin)</Text>}
                    </View>
                    {saving ? <ActivityIndicator color="#3b5998" /> : canEdit ? <Ionicons name="chevron-down" size={16} color="gray" /> : null}
                </TouchableOpacity>
            )}
            {!canEdit && <Text style={[styles.muted, { marginTop: 8 }]}>Only an Admin can change this.</Text>}
        </View>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.sheet, picking && { height: '75%' }]}>{picking ? renderPicker() : renderInfo()}</View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: 'white', padding: 20, paddingBottom: 35, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    muted: { fontSize: 12, color: 'gray' },
    label: { marginTop: 16, marginBottom: 6, fontWeight: '600', color: '#555', fontSize: 12 },
    selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#f9f9f9' },
    pickerItem: { paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
