import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from './context/DataContext';
import { formatInr, PIPELINE_STAGES, STAGE_COLORS } from '../constants/leadStatus';
import { getPipeline, getPipelineColumnPage, PipelineCard, PipelineColumnData, updateLead } from '../services/api/leads';
import { fetchTeamMembers } from '../services/api/users';
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

const PAGE_SIZE = 15;

function todayYmd(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Quotation for 25 days" — red once a lead has sat in one stage over 30 days.
const STUCK_DAYS = 30;
function stageAge(stage: string | null, since?: string) {
    if (!since) return null;
    const ms = Date.now() - new Date(since).getTime();
    if (isNaN(ms)) return null;
    const days = Math.max(0, Math.floor(ms / 86_400_000));
    const name = stage || 'New';
    const label = days === 0 ? `${name} since today` : `${name} for ${days} day${days === 1 ? '' : 's'}`;
    return { label, stuck: days > STUCK_DAYS };
}

function followUpBadge(nextDate: string | null) {
    if (!nextDate) return { label: 'No date', color: '#757575', bg: '#eeeeee' };
    const ymd = nextDate.slice(0, 10); // @db.Date arrives as "YYYY-MM-DDT00:00:00.000Z"
    const today = todayYmd();
    const [y, m, d] = ymd.split('-');
    const short = `${d}/${m}`;
    if (ymd < today) return { label: `Overdue ${short}`, color: '#d32f2f', bg: '#ffebee' };
    if (ymd === today) return { label: 'Today', color: '#f57c00', bg: '#fff3e0' };
    return { label: short + (y !== today.slice(0, 4) ? `/${y.slice(2)}` : ''), color: '#388e3c', bg: '#e8f5e9' };
}

export default function LeadsBoardScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const columnWidth = Math.min(320, Math.round(width * 0.82));

    const { currentUser } = useData();
    const userRole = (currentUser?.role || '').toLowerCase();
    const canFilterByEmployee = ['admin', 'manager', 'accountant', 'hr', 'superadmin'].includes(userRole);

    const [columns, setColumns] = useState<PipelineColumnData[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState<string | null>(null);
    const [employeeId, setEmployeeId] = useState<string | undefined>(undefined);
    const [showEmployeePicker, setShowEmployeePicker] = useState(false);
    const [moving, setMoving] = useState<PipelineCard | null>(null);
    const [moveNote, setMoveNote] = useState('');

    const { data: teamMembers } = useCachedList({
        cacheKey: buildCacheKey('team_members', currentUser?.companyId),
        enabled: !!currentUser?.companyId && canFilterByEmployee,
        fetcher: fetchTeamMembers,
    });

    // Search: typed text → debounced value that actually hits the server.
    const [searchText, setSearchText] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchText.trim()), 400);
        return () => clearTimeout(t);
    }, [searchText]);

    // Only the default board (no search, all staff) is cached — it opens
    // instantly from the last copy, then refreshes quietly in the background.
    const cacheKey = !search && !employeeId ? buildCacheKey('leads_board', currentUser?.companyId) : null;
    const requestId = useRef(0);

    const load = useCallback(async () => {
        const id = ++requestId.current;
        setLoading(true);
        try {
            const fresh = await getPipeline({ assignedToId: employeeId, perColumn: PAGE_SIZE, search: search || undefined });
            if (id !== requestId.current) return; // a newer search/filter is already loading
            setColumns(fresh);
            if (cacheKey) AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch(() => {});
        } catch (e: any) {
            if (id === requestId.current) Alert.alert('Error', e?.message || 'Could not load the pipeline');
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, [employeeId, search, cacheKey]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (cacheKey) {
                try {
                    const raw = await AsyncStorage.getItem(cacheKey);
                    if (raw && !cancelled) setColumns(JSON.parse(raw));
                } catch {
                    // unreadable cache — the network load below covers it
                }
            }
            if (!cancelled) load();
        })();
        return () => { cancelled = true; };
    }, [load, cacheKey]);

    const loadMore = async (col: PipelineColumnData) => {
        setLoadingMore(col.column);
        try {
            const nextPage = Math.floor(col.leads.length / PAGE_SIZE) + 1;
            const res = await getPipelineColumnPage({ column: col.column, page: nextPage, limit: PAGE_SIZE, assignedToId: employeeId, search: search || undefined });
            setColumns(prev => prev.map(c => c.column === col.column
                ? { ...c, leads: [...c.leads, ...res.data.filter(n => !c.leads.some(o => o.id === n.id))] }
                : c));
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not load more leads');
        } finally {
            setLoadingMore(null);
        }
    };

    // Optimistic move: update the board immediately, reload it if the save fails.
    const openMove = (card: PipelineCard) => { setMoveNote(''); setMoving(card); };

    const moveTo = async (card: PipelineCard, stage: string) => {
        const note = moveNote.trim();
        setMoving(null);
        const fromColumn = columns.find(c => c.leads.some(l => l.id === card.id))?.column;
        setColumns(prev => prev.map(c => {
            const v = card.dealValue || 0;
            if (c.column === fromColumn) return { ...c, count: c.count - 1, value: c.value - v, leads: c.leads.filter(l => l.id !== card.id) };
            if (c.column === stage) return { ...c, count: c.count + 1, value: c.value + v, leads: [{ ...card, stage, stageChangedAt: new Date().toISOString() }, ...c.leads] };
            return c;
        }));
        try {
            await updateLead(card.id, { stage, ...(note ? { note } : {}) });
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not move the lead');
            load();
        }
    };

    const employeeName = employeeId ? teamMembers.find((m: any) => m.id === employeeId)?.name || 'Employee' : 'All Staff';
    const totalOpen = columns.reduce((sum, c) => sum + c.count, 0);

    const renderCard = (card: PipelineCard) => {
        const badge = followUpBadge(card.nextDate);
        const age = stageAge(card.stage, card.stageChangedAt);
        return (
            <TouchableOpacity
                key={card.id}
                style={styles.card}
                onPress={() => router.push({ pathname: '/lead_details', params: { id: card.id } } as any)}
                onLongPress={() => openMove(card)}
                delayLongPress={300}
            >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                        {card.isHot ? '🔥 ' : ''}{card.orgName}
                    </Text>
                    <TouchableOpacity onPress={() => openMove(card)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="swap-horizontal" size={18} color="#3b5998" />
                    </TouchableOpacity>
                </View>
                {!!(card.contactPerson || card.city) && (
                    <Text style={styles.cardSub} numberOfLines={1}>
                        {[card.contactPerson, card.city].filter(Boolean).join(' • ')}
                    </Text>
                )}
                {card.requirements.length > 0 && (
                    <Text style={styles.cardSub} numberOfLines={1}>📦 {card.requirements.join(', ')}</Text>
                )}
                {age && (
                    <Text style={[styles.stageAge, age.stuck && styles.stageAgeStuck]} numberOfLines={1}>
                        ⏳ {age.label}
                    </Text>
                )}
                <View style={styles.cardFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: badge.color }}>{badge.label}</Text>
                        </View>
                        {!!card.dealValue && <Text style={styles.value}>{formatInr(card.dealValue)}</Text>}
                    </View>
                    {canFilterByEmployee && !employeeId && (
                        <Text style={styles.owner} numberOfLines={1}>👤 {card.assignedToName}</Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderColumn = (col: PipelineColumnData) => {
        const color = STAGE_COLORS[col.column] || '#607d8b';
        const hasMore = col.leads.length < col.count;
        return (
            <View key={col.column} style={[styles.column, { width: columnWidth }]}>
                <View style={[styles.columnHeader, { borderTopColor: color }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.columnTitle, { color }]}>{col.column}</Text>
                        {col.value > 0 && <Text style={styles.columnValue}>{formatInr(col.value)} in pipeline</Text>}
                    </View>
                    <View style={[styles.countPill, { backgroundColor: color }]}>
                        <Text style={styles.countText}>{col.count}</Text>
                    </View>
                </View>
                <FlatList
                    data={col.leads}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => renderCard(item)}
                    nestedScrollEnabled
                    contentContainerStyle={{ paddingBottom: 20 }}
                    ListEmptyComponent={<Text style={styles.empty}>No leads here</Text>}
                    ListFooterComponent={hasMore ? (
                        <TouchableOpacity style={styles.moreBtn} onPress={() => loadMore(col)} disabled={loadingMore === col.column}>
                            {loadingMore === col.column
                                ? <ActivityIndicator size="small" color="#3b5998" />
                                : <Text style={styles.moreText}>Load more ({col.count - col.leads.length})</Text>}
                        </TouchableOpacity>
                    ) : null}
                />
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.headerTitle}>Pipeline Board</Text>
                    <Text style={styles.headerSub}>{totalOpen} open leads • long-press a card to move it</Text>
                </View>
                <TouchableOpacity onPress={load} style={{ padding: 4 }}>
                    <Ionicons name="refresh" size={22} color="#3b5998" />
                </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color="#1565c0" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search hospital, contact, city, mobile..."
                    value={searchText}
                    onChangeText={setSearchText}
                    returnKeyType="search"
                />
                {loading && columns.length > 0 ? <ActivityIndicator size="small" color="#3b5998" /> : null}
                {searchText.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchText('')} style={{ marginLeft: 6 }}>
                        <Ionicons name="close-circle" size={18} color="#d32f2f" />
                    </TouchableOpacity>
                )}
            </View>

            {canFilterByEmployee && (
                <View style={styles.filterRow}>
                    <TouchableOpacity style={styles.filterChip} onPress={() => setShowEmployeePicker(true)}>
                        <Ionicons name="person" size={12} color="#2e7d32" style={{ marginRight: 4 }} />
                        <Text style={styles.filterText}>{employeeName}</Text>
                        <Ionicons name="caret-down" size={14} color="#2e7d32" />
                    </TouchableOpacity>
                </View>
            )}

            {loading && columns.length === 0 ? (
                <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 50 }} />
            ) : (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={columnWidth + 12}
                    decelerationRate="fast"
                    contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: insets.bottom + 10 }}
                >
                    {columns.map(renderColumn)}
                </ScrollView>
            )}

            {/* Move-to-stage picker */}
            <Modal visible={!!moving} transparent animationType="fade" onRequestClose={() => setMoving(null)}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setMoving(null)} />
                    <View style={styles.pickerBox}>
                        <Text style={styles.pickerTitle} numberOfLines={2}>Move "{moving?.orgName}" to</Text>
                        <TextInput
                            style={styles.noteInput}
                            placeholder="Add a note (optional) — e.g. Quotation sent ₹4.5L"
                            value={moveNote}
                            onChangeText={setMoveNote}
                            maxLength={1000}
                            multiline
                        />
                        {PIPELINE_STAGES.map(stage => {
                            const current = (moving?.stage || 'New') === stage;
                            return (
                                <TouchableOpacity
                                    key={stage}
                                    style={[styles.pickerItem, current && { opacity: 0.4 }]}
                                    disabled={current}
                                    onPress={() => moving && moveTo(moving, stage)}
                                >
                                    <View style={[styles.dot, { backgroundColor: STAGE_COLORS[stage] }]} />
                                    <Text style={{ fontSize: 15, color: '#333', flex: 1 }}>{stage}</Text>
                                    {current && <Text style={{ fontSize: 11, color: 'gray' }}>current</Text>}
                                </TouchableOpacity>
                            );
                        })}
                        <Text style={styles.pickerHint}>
                            To mark a lead Won or Lost, open it and use "Log Visit & Update Lead".
                        </Text>
                    </View>
                </View>
            </Modal>

            {/* Employee filter */}
            <Modal visible={showEmployeePicker} transparent animationType="fade" onRequestClose={() => setShowEmployeePicker(false)}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowEmployeePicker(false)} />
                    <View style={[styles.pickerBox, { maxHeight: '70%' }]}>
                        <Text style={styles.pickerTitle}>Show leads of</Text>
                        <FlatList
                            data={[{ id: '', name: 'All Staff' }, ...teamMembers.filter((m: any) => m.status !== 'Disabled')]}
                            keyExtractor={(item: any) => item.id || 'all'}
                            renderItem={({ item }: any) => (
                                <TouchableOpacity
                                    style={styles.pickerItem}
                                    onPress={() => { setEmployeeId(item.id || undefined); setShowEmployeePicker(false); }}
                                >
                                    <Text style={{ fontSize: 15, color: '#333', flex: 1, fontWeight: (employeeId || '') === item.id ? 'bold' : 'normal' }}>{item.name}</Text>
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
    container: { flex: 1, backgroundColor: '#eef1f6' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 12, backgroundColor: 'white', elevation: 3 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    headerSub: { fontSize: 11, color: 'gray', marginTop: 1 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', marginHorizontal: 15, marginTop: 10, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#bbdefb' },
    searchInput: { flex: 1, paddingVertical: 9, paddingHorizontal: 8, fontSize: 14, color: '#333' },
    filterRow: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 8 },
    filterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', borderColor: '#a5d6a7', borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 5 },
    filterText: { color: '#2e7d32', fontWeight: 'bold', fontSize: 12, marginRight: 4 },

    column: { marginHorizontal: 6, marginTop: 8, backgroundColor: '#f7f8fb', borderRadius: 10, paddingHorizontal: 8 },
    columnHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 4, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginHorizontal: -8, paddingHorizontal: 12, backgroundColor: 'white', marginBottom: 8 },
    columnTitle: { fontSize: 14, fontWeight: 'bold' },
    columnValue: { fontSize: 11, color: '#2e7d32', fontWeight: '600', marginTop: 1 },
    value: { fontSize: 11, fontWeight: 'bold', color: '#2e7d32' },
    countPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    countText: { color: 'white', fontSize: 12, fontWeight: 'bold' },

    card: { backgroundColor: 'white', borderRadius: 8, padding: 10, marginBottom: 8, elevation: 1 },
    cardTitle: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#333', marginRight: 6 },
    cardSub: { fontSize: 12, color: 'gray', marginTop: 3 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    badge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
    owner: { fontSize: 11, color: '#555', flexShrink: 1, marginLeft: 8 },
    stageAge: { fontSize: 11, color: '#757575', marginTop: 3 },
    stageAgeStuck: { color: '#d32f2f', fontWeight: 'bold' },
    empty: { textAlign: 'center', color: '#9e9e9e', marginTop: 20, fontStyle: 'italic' },
    moreBtn: { alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#c5cae9', backgroundColor: 'white' },
    moreText: { color: '#3b5998', fontWeight: 'bold', fontSize: 12 },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
    pickerBox: { width: '82%', backgroundColor: 'white', borderRadius: 12, padding: 16, elevation: 10 },
    pickerTitle: { fontSize: 16, fontWeight: 'bold', color: '#3b5998', marginBottom: 8, textAlign: 'center' },
    pickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    noteInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#fafafa', marginBottom: 6, maxHeight: 90, textAlignVertical: 'top' },
    pickerHint: { fontSize: 11, color: 'gray', marginTop: 10, textAlign: 'center' },
});
