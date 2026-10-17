import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useHeaderTop } from '../../hooks/useHeaderTop';
import { useServerPagedList } from '../../hooks/useServerPagedList';
import {
    DeletionRequest,
    DeletionStatus,
    listDeletionRequests,
    markDeletionDone,
    removePersonalData,
} from '../../services/api/deletionRequests';

const TABS: { key: DeletionStatus; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'done', label: 'Done' },
    { key: 'all', label: 'All' },
];

const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const ROLE_LABEL: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', MANAGER: 'Manager', ACCOUNT: 'Accounts',
    HR: 'HR', STORE: 'Store', FIELD_USER: 'Field user',
};

function deadline(item: DeletionRequest): { text: string; bg: string; color: string } {
    if (item.status === 'DONE') return { text: 'Done', bg: '#e8f5e9', color: '#2e7d32' };
    if (item.daysLeft < 0) return { text: `Overdue by ${-item.daysLeft} day${item.daysLeft === -1 ? '' : 's'}`, bg: '#ffebee', color: '#c62828' };
    if (item.daysLeft === 0) return { text: 'Due today', bg: '#ffebee', color: '#c62828' };
    if (item.daysLeft <= 7) return { text: `${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'} left`, bg: '#fff3e0', color: '#e65100' };
    return { text: `${item.daysLeft} days left`, bg: '#e3f2fd', color: '#1565c0' };
}

export default function DeletionRequestsScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    const [status, setStatus] = useState<DeletionStatus>('pending');
    const [counts, setCounts] = useState<{ pending: number; overdue: number } | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [doneFor, setDoneFor] = useState<DeletionRequest | null>(null);
    const [note, setNote] = useState('');

    const fetchPage = useCallback(async (p: { status: DeletionStatus; page: number; limit: number }) => {
        const res = await listDeletionRequests(p);
        setCounts({ pending: res.pending, overdue: res.overdue });
        return res;
    }, []);

    const list = useServerPagedList<{ status: DeletionStatus }, DeletionRequest>({
        fetchPage,
        filters: { status },
        enabled: true,
    });

    const confirmRemove = (item: DeletionRequest) => {
        Alert.alert(
            'Remove personal data?',
            `${item.userName} (${item.companyName})\n\nThis removes their mobile numbers, personal email, address, bank details, Aadhaar, PAN, blood group, photo, personal notes and GPS location history, and frees the login email.\n\nTheir name stays on the company's records (leads, orders, attendance). This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        setBusyId(item.id);
                        try {
                            const r = await removePersonalData(item.id);
                            Alert.alert('Done ✅', `Personal data removed. ${r.notesDeleted} notes and ${r.locationPointsDeleted} location points deleted.`);
                            list.reload();
                        } catch (e: any) {
                            Alert.alert('Could not remove', e.message || 'Please try again.');
                        } finally {
                            setBusyId(null);
                        }
                    },
                },
            ],
        );
    };

    const saveDone = async () => {
        if (!doneFor) return;
        if (note.trim().length < 3) {
            Alert.alert('Add a note', 'Write what was done, e.g. "Spoke to admin on 20 Oct, company data deleted".');
            return;
        }
        setBusyId(doneFor.id);
        try {
            await markDeletionDone(doneFor.id, note);
            setDoneFor(null);
            setNote('');
            list.reload();
        } catch (e: any) {
            Alert.alert('Could not save', e.message || 'Please try again.');
        } finally {
            setBusyId(null);
        }
    };

    const renderItem = ({ item }: { item: DeletionRequest }) => {
        const d = deadline(item);
        const isAdminRequest = item.mode === 'REQUEST';
        const busy = busyId === item.id;
        return (
            <View style={styles.card}>
                <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{item.userName}</Text>
                        <Text style={styles.sub}>{ROLE_LABEL[item.userRole] || item.userRole} • {item.companyName}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: d.bg }]}>
                        <Text style={[styles.badgeText, { color: d.color }]}>{d.text}</Text>
                    </View>
                </View>

                <View style={[styles.modeBox, isAdminRequest ? styles.modeAdmin : styles.modeEmployee]}>
                    <Ionicons name={isAdminRequest ? 'business' : 'person'} size={14} color={isAdminRequest ? '#6a1b9a' : '#37474f'} />
                    <Text style={styles.modeText}>
                        {isAdminRequest
                            ? 'Company admin — wants the whole company account deleted. Call them first.'
                            : item.loginActive
                                ? 'Employee — the company has switched this login on again.'
                                : 'Employee — login already closed.'}
                    </Text>
                </View>

                <Text style={styles.line}>✉️ {item.userEmail}{item.userMobile ? `   📞 ${item.userMobile}` : ''}</Text>
                <Text style={styles.line}>Requested {fmtDate(item.requestedAt)} • Deadline {fmtDate(item.dueAt)}</Text>
                {item.reason ? <Text style={styles.reason}>“{item.reason}”</Text> : null}

                {item.status === 'DONE' ? (
                    <View style={styles.doneBox}>
                        <Text style={styles.doneText}>
                            ✅ {item.dataRemovedAt ? 'Personal data removed' : 'Marked done'} on {fmtDate(item.completedAt)}
                            {item.completedByName ? ` by ${item.completedByName}` : ''}
                        </Text>
                        {item.note ? <Text style={styles.doneNote}>{item.note}</Text> : null}
                    </View>
                ) : (
                    <View style={styles.actions}>
                        {!isAdminRequest && (
                            <TouchableOpacity
                                style={[styles.actionBtn, styles.removeBtn, (busy || item.loginActive) && styles.disabled]}
                                disabled={busy || item.loginActive}
                                onPress={() => confirmRemove(item)}
                            >
                                {busy ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="trash" size={15} color="white" />}
                                <Text style={styles.actionText}>Remove personal data</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.actionBtn, styles.doneBtn, busy && styles.disabled]}
                            disabled={busy}
                            onPress={() => { setNote(''); setDoneFor(item); }}
                        >
                            <Ionicons name="checkmark-done" size={15} color="white" />
                            <Text style={styles.actionText}>Mark done</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Deletion requests</Text>
                </View>
                <Text style={styles.headerHint}>
                    {counts
                        ? `${counts.pending} pending${counts.overdue ? ` • ${counts.overdue} overdue` : ''} — complete each within 30 days`
                        : 'Complete each request within 30 days'}
                </Text>
                <View style={styles.tabs}>
                    {TABS.map(t => (
                        <TouchableOpacity
                            key={t.key}
                            style={[styles.tab, status === t.key && styles.tabActive]}
                            onPress={() => setStatus(t.key)}
                        >
                            <Text style={[styles.tabText, status === t.key && styles.tabTextActive]}>
                                {t.label}{t.key === 'pending' && counts ? ` (${counts.pending})` : ''}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {list.loading && list.items.length === 0 ? (
                <ActivityIndicator size="large" color="#d32f2f" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={list.items}
                    keyExtractor={i => i.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
                    onEndReached={() => { if (list.hasMore) list.loadMore(); }}
                    onEndReachedThreshold={0.4}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name={list.error ? 'cloud-offline' : 'checkmark-circle'} size={48} color={list.error ? '#999' : '#81c784'} />
                            <Text style={styles.emptyText}>
                                {list.error ? list.error.message : status === 'pending' ? 'No pending requests 🎉' : 'Nothing here yet.'}
                            </Text>
                        </View>
                    }
                    ListFooterComponent={list.loadingMore ? <ActivityIndicator color="#d32f2f" style={{ margin: 16 }} /> : null}
                />
            )}

            <Modal transparent visible={!!doneFor} animationType="fade" onRequestClose={() => setDoneFor(null)}>
                <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={styles.sheet}>
                        <Text style={styles.sheetTitle}>Mark done</Text>
                        <Text style={styles.sheetSub}>{doneFor?.userName} • {doneFor?.companyName}</Text>
                        <TextInput
                            style={styles.input}
                            value={note}
                            onChangeText={setNote}
                            placeholder='What was done? e.g. "Called admin on 20 Oct, company data deleted"'
                            placeholderTextColor="#aaa"
                            multiline
                            maxLength={500}
                        />
                        <View style={styles.sheetRow}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDoneFor(null)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.saveBtn, busyId === doneFor?.id && styles.disabled]} onPress={saveDone} disabled={busyId === doneFor?.id}>
                                <Text style={styles.actionText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { backgroundColor: '#d32f2f', paddingHorizontal: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    headerHint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 6, marginLeft: 36 },
    tabs: { flexDirection: 'row', marginTop: 12 },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 11 },
    tabActive: { borderBottomWidth: 3, borderBottomColor: 'white', backgroundColor: 'rgba(255,255,255,0.1)' },
    tabText: { color: 'rgba(255,255,255,0.75)', fontWeight: '600', fontSize: 13 },
    tabTextActive: { color: 'white' },
    listContent: { padding: 14, paddingBottom: 40, width: '100%', maxWidth: 820, alignSelf: 'center' },
    card: { backgroundColor: 'white', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    name: { fontSize: 16, fontWeight: 'bold', color: '#222' },
    sub: { fontSize: 12, color: '#777', marginTop: 2 },
    badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
    badgeText: { fontSize: 11, fontWeight: 'bold' },
    modeBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, padding: 8, marginTop: 10 },
    modeEmployee: { backgroundColor: '#eceff1' },
    modeAdmin: { backgroundColor: '#f3e5f5' },
    modeText: { flex: 1, fontSize: 12, color: '#37474f' },
    line: { fontSize: 12, color: '#555', marginTop: 8 },
    reason: { fontSize: 13, color: '#444', fontStyle: 'italic', marginTop: 8 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10 },
    removeBtn: { backgroundColor: '#c62828' },
    doneBtn: { backgroundColor: '#2e7d32' },
    actionText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
    disabled: { opacity: 0.45 },
    doneBox: { backgroundColor: '#f1f8e9', borderRadius: 8, padding: 9, marginTop: 10 },
    doneText: { fontSize: 12, color: '#2e7d32', fontWeight: '600' },
    doneNote: { fontSize: 12, color: '#555', marginTop: 4 },
    empty: { alignItems: 'center', marginTop: 60, gap: 10 },
    emptyText: { color: '#777', fontSize: 14, textAlign: 'center' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 22 },
    sheet: { backgroundColor: 'white', borderRadius: 16, padding: 18, width: '100%', maxWidth: 460, alignSelf: 'center' },
    sheetTitle: { fontSize: 17, fontWeight: 'bold', color: '#222' },
    sheetSub: { fontSize: 12, color: '#777', marginTop: 3 },
    input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, minHeight: 90, textAlignVertical: 'top', marginTop: 12, fontSize: 14, color: '#222' },
    sheetRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#cfd8dc' },
    cancelText: { color: '#455a64', fontWeight: 'bold' },
    saveBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: '#2e7d32' },
});
