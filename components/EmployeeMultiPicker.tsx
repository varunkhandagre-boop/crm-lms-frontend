import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type PickerEmployee = { id: string; name: string; role?: string; jobTitle?: string; status?: string };

type Props = {
    visible: boolean;
    title: string;
    hint?: string;
    employees: PickerEmployee[];
    selected: string[];
    saveLabel?: string;
    saving?: boolean;
    onClose: () => void;
    onSave: (ids: string[]) => void;
};

/** Search + tick several employees (active ones only). */
export default function EmployeeMultiPicker({ visible, title, hint, employees, selected, saveLabel = 'Save', saving, onClose, onSave }: Props) {
    const [picked, setPicked] = useState<string[]>(selected);
    const [search, setSearch] = useState('');

    useEffect(() => { if (visible) { setPicked(selected); setSearch(''); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    const list = useMemo(() => {
        const q = search.trim().toLowerCase();
        return employees
            .filter((e) => e.status !== 'Disabled')
            .filter((e) => !q || (e.name || '').toLowerCase().includes(q) || (e.jobTitle || '').toLowerCase().includes(q))
            .sort((a, b) => Number(picked.includes(b.id)) - Number(picked.includes(a.id)) || (a.name || '').localeCompare(b.name || ''));
    }, [employees, search, picked]);

    const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.box}>
                    <View style={styles.head}>
                        <Text style={styles.title}>{title}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close-circle" size={28} color="#d32f2f" /></TouchableOpacity>
                    </View>
                    {!!hint && <Text style={styles.hint}>{hint}</Text>}
                    <View style={styles.searchRow}>
                        <Ionicons name="search" size={18} color="#888" />
                        <TextInput style={styles.search} placeholder="Search employee" value={search} onChangeText={setSearch} />
                    </View>
                    <FlatList
                        data={list}
                        keyExtractor={(e) => e.id}
                        style={{ maxHeight: 380 }}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={<Text style={styles.empty}>No employees found.</Text>}
                        renderItem={({ item }) => {
                            const on = picked.includes(item.id);
                            return (
                                <TouchableOpacity style={[styles.row, on && styles.rowOn]} onPress={() => toggle(item.id)}>
                                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? '#e67e22' : '#999'} />
                                    <View style={{ marginLeft: 10, flex: 1 }}>
                                        <Text style={styles.name}>{item.name}</Text>
                                        {!!(item.jobTitle || item.role) && <Text style={styles.sub}>{item.jobTitle || item.role}</Text>}
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                    <View style={styles.foot}>
                        <Text style={styles.count}>{picked.length ? `${picked.length} selected` : 'Nobody selected'}</Text>
                        <TouchableOpacity style={[styles.save, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => onSave(picked)}>
                            {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>{saveLabel}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 18 },
    box: { backgroundColor: 'white', borderRadius: 14, padding: 16, maxWidth: 480, width: '100%', alignSelf: 'center' },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 18, fontWeight: 'bold', color: '#e67e22', flex: 1, marginRight: 10 },
    hint: { fontSize: 13, color: '#666', marginTop: 6 },
    searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e67e2255', borderRadius: 8, paddingHorizontal: 10, marginVertical: 12 },
    search: { flex: 1, paddingVertical: 9, paddingHorizontal: 8, fontSize: 15 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
    rowOn: { backgroundColor: '#fff3e0' },
    name: { fontSize: 15, color: '#333', fontWeight: '600' },
    sub: { fontSize: 12, color: '#888' },
    empty: { textAlign: 'center', color: '#888', padding: 20 },
    foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    count: { color: '#555', fontSize: 13 },
    save: { backgroundColor: '#e67e22', paddingVertical: 11, paddingHorizontal: 22, borderRadius: 8, minWidth: 110, alignItems: 'center' },
    saveText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
});
