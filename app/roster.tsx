import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useData } from './context/DataContext';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { downloadRosterExcel } from '../utils/rosterExport';
import { isValidHhmm, localYmd } from '../utils/workSchedule';
import {
    createShift,
    deleteShift,
    fetchRoster,
    fetchShifts,
    isOvernightShift,
    Roster,
    RosterChange,
    RosterDay,
    saveRoster,
    Shift,
    shiftTimeLabel,
    updateShift,
} from '../services/api/shifts';

// Shift Roster. Office roles (Admin / HR / Manager): a week grid of who works
// which shift (or is Off) per day, bulk assign for a date range, and the
// company's Shifts list. Everyone else: their own shifts for the next 2 weeks.

const MANAGE_ROLES = ['admin', 'manager', 'hr', 'superadmin'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const addDays = (ymd: string, n: number) => {
    const d = new Date(`${ymd}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const dowOf = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
const dayLabel = (ymd: string) => `${DAY_SHORT[dowOf(ymd)]} ${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
const mondayOf = (ymd: string) => addDays(ymd, -((dowOf(ymd) + 6) % 7));
const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

// What a roster cell shows.
function cellText(d: RosterDay | undefined, holiday?: string): { top: string; bottom: string; tone: 'shift' | 'night' | 'off' | 'none' | 'holiday' } {
    if (holiday) return { top: 'Holiday', bottom: holiday, tone: 'holiday' };
    if (!d) return { top: '—', bottom: '', tone: 'none' };
    if (d.off) return { top: 'Off', bottom: d.source === 'roster' ? 'roster' : 'weekly off', tone: 'off' };
    if (!d.start) return { top: '—', bottom: 'no shift', tone: 'none' };
    return { top: `${d.overnight ? '🌙 ' : ''}${d.name ?? 'Shift'}`, bottom: `${d.start}–${d.end}`, tone: d.overnight ? 'night' : 'shift' };
}

export default function RosterScreen() {
    const router = useRouter();
    const headerTop = useHeaderTop();
    const { currentUser } = useData() as any;
    const canManage = MANAGE_ROLES.includes((currentUser?.role || '').toLowerCase().trim());
    const [tab, setTab] = useState<'roster' | 'shifts'>('roster');

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{canManage ? 'Shift Roster' : 'My Shifts'}</Text>
                <View style={{ width: 24 }} />
            </View>

            {canManage && (
                <View style={styles.tabs}>
                    {(['roster', 'shifts'] as const).map((t) => (
                        <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
                            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'roster' ? 'Roster' : 'Shifts'}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {!canManage ? <MyShifts /> : tab === 'roster' ? <RosterGrid /> : <ShiftsList />}
        </View>
    );
}

// ───────────── Employee: own next 14 days ─────────────

function MyShifts() {
    const [roster, setRoster] = useState<Roster | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const today = localYmd(new Date());

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            setRoster(await fetchRoster(today, addDays(today, 13)));
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not load your shifts');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [today]);
    useEffect(() => { load(); }, [load]);

    if (loading) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#3b5998" />;
    const me = roster?.users[0];
    const holidays = new Map((roster?.holidays ?? []).map((h) => [h.date, h.name]));
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

    return (
        <ScrollView contentContainerStyle={{ padding: 15 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
            <Text style={styles.hint}>Your shift for the next 2 weeks. HR / your manager sets this; you get a notification when it changes.</Text>
            {days.map((d) => {
                const c = cellText(me?.days[d], holidays.get(d));
                return (
                    <View key={d} style={[styles.myRow, d === today && styles.myRowToday]}>
                        <Text style={styles.myDate}>{d === today ? 'Today' : dayLabel(d)}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.myShift, toneText[c.tone]]}>{c.top}</Text>
                            {!!c.bottom && <Text style={styles.mySub}>{c.tone === 'night' ? `${c.bottom} (ends next day)` : c.bottom}</Text>}
                        </View>
                    </View>
                );
            })}
        </ScrollView>
    );
}

// ───────────── Office roles: week grid ─────────────

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthStartOf = (ymd: string) => `${ymd.slice(0, 7)}-01`;
const addMonths = (ymd: string, n: number) => {
    const d = new Date(`${ymd}T00:00:00.000Z`);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
};
const daysInMonth = (ymd: string) => new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)), 0)).getUTCDate();

function RosterGrid() {
    const isDesktop = useIsDesktop();
    // Week on a phone, the whole month on a laptop (switchable either way).
    const [view, setView] = useState<'week' | 'month'>(isDesktop ? 'month' : 'week');
    const [anchor, setAnchor] = useState(() => localYmd(new Date())); // any date in the period shown
    const [downloading, setDownloading] = useState(false);
    const [roster, setRoster] = useState<Roster | null>(null);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [cell, setCell] = useState<{ userId: string; name: string; ymd: string } | null>(null);
    const [bulkOpen, setBulkOpen] = useState(false);

    const days = useMemo(() => {
        const first = view === 'week' ? mondayOf(anchor) : monthStartOf(anchor);
        const count = view === 'week' ? 7 : daysInMonth(anchor);
        return Array.from({ length: count }, (_, i) => addDays(first, i));
    }, [view, anchor]);
    const lastDay = days[days.length - 1];
    const today = localYmd(new Date());
    const step = (dir: 1 | -1) => setAnchor(view === 'week' ? addDays(anchor, 7 * dir) : addMonths(anchor, dir));
    const periodLabel = view === 'week'
        ? `${dayLabel(days[0])} – ${dayLabel(lastDay)}`
        : `${FULL_MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;

    const download = async () => {
        setDownloading(true);
        try {
            const ok = await downloadRosterExcel(days[0], lastDay);
            if (!ok) Alert.alert('Nothing to download', 'No employees found.');
        } catch (e: any) {
            Alert.alert('Could not download', e?.message || 'Please try again');
        } finally {
            setDownloading(false);
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [r, s] = await Promise.all([fetchRoster(days[0], lastDay, 'all'), fetchShifts()]);
            setRoster(r);
            setShifts(s);
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not load the roster');
        } finally {
            setLoading(false);
        }
    }, [days, lastDay]);
    useEffect(() => { load(); }, [load]);

    const apply = async (changes: RosterChange[]) => {
        setSaving(true);
        try {
            const res = await saveRoster(changes);
            setCell(null);
            setBulkOpen(false);
            await load();
            if (res.changed === 0) Alert.alert('No change', 'Those days already had that shift.');
        } catch (e: any) {
            Alert.alert('Could not save', e?.message || 'Please try again');
        } finally {
            setSaving(false);
        }
    };

    const holidays = new Map((roster?.holidays ?? []).map((h) => [h.date, h.name]));
    const users = (roster?.users ?? []).filter((u) => !search.trim() || u.name.toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <View style={{ flex: 1 }}>
            <View style={styles.weekBar}>
                <TouchableOpacity onPress={() => step(-1)} style={styles.weekBtn} accessibilityLabel={`Previous ${view}`}>
                    <Ionicons name="chevron-back" size={20} color="#3b5998" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAnchor(today)} accessibilityLabel="Go to today">
                    <Text style={styles.weekText}>{periodLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => step(1)} style={styles.weekBtn} accessibilityLabel={`Next ${view}`}>
                    <Ionicons name="chevron-forward" size={20} color="#3b5998" />
                </TouchableOpacity>
                <View style={styles.viewToggle}>
                    {(['week', 'month'] as const).map((v) => (
                        <TouchableOpacity key={v} style={[styles.viewBtn, view === v && styles.viewBtnOn]} onPress={() => setView(v)}>
                            <Text style={[styles.viewBtnText, view === v && styles.viewBtnTextOn]}>{v === 'week' ? 'Week' : 'Month'}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.toolbar}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Search employee" value={search} onChangeText={setSearch} />
                <TouchableOpacity style={[styles.primaryBtn, { marginLeft: 8 }]} onPress={() => setBulkOpen(true)} disabled={shifts.length === 0 && !roster}>
                    <Ionicons name="calendar-outline" size={16} color="white" />
                    <Text style={styles.primaryBtnText}> Assign dates</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryBtn, { marginLeft: 8 }]} onPress={download} disabled={downloading} accessibilityLabel="Download roster as Excel">
                    {downloading ? <ActivityIndicator size="small" color="#2e7d32" /> : <Ionicons name="download-outline" size={18} color="#2e7d32" />}
                    {isDesktop && <Text style={styles.secondaryBtnText}> Excel</Text>}
                </TouchableOpacity>
            </View>

            {shifts.length === 0 && !loading && (
                <Text style={[styles.hint, { marginHorizontal: 15 }]}>No shifts yet. Add them in the Shifts tab (e.g. General 09:00–18:00, Night 22:00–06:00).</Text>
            )}

            {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#3b5998" />
            ) : (
                <ScrollView style={{ flex: 1 }}>
                    <ScrollView horizontal>
                        <View>
                            <View style={styles.gridRow}>
                                <View style={[styles.nameCell, styles.headCell]}><Text style={styles.headText}>Employee</Text></View>
                                {days.map((d) => (
                                    <View key={d} style={[styles.dayCell, view === 'month' && styles.dayCellCompact, styles.headCell, d === today && styles.todayHead]}>
                                        <Text style={styles.headText}>{DAY_SHORT[dowOf(d)]}</Text>
                                        <Text style={styles.headSub}>{Number(d.slice(8, 10))} {MONTHS[Number(d.slice(5, 7)) - 1]}</Text>
                                    </View>
                                ))}
                            </View>
                            {users.map((u) => (
                                <View key={u.id} style={styles.gridRow}>
                                    <View style={styles.nameCell}><Text style={styles.nameText} numberOfLines={2}>{u.name}</Text></View>
                                    {days.map((d) => {
                                        const c = cellText(u.days[d], holidays.get(d));
                                        const rostered = u.days[d]?.source === 'roster';
                                        return (
                                            <TouchableOpacity
                                                key={d}
                                                style={[styles.dayCell, view === 'month' && styles.dayCellCompact, toneBg[c.tone], rostered && styles.rosteredCell]}
                                                onPress={() => setCell({ userId: u.id, name: u.name, ymd: d })}
                                                accessibilityLabel={`${u.name} ${dayLabel(d)}: ${c.top}`}
                                            >
                                                <Text style={[styles.cellTop, toneText[c.tone]]} numberOfLines={1}>{c.top}</Text>
                                                {!!c.bottom && <Text style={styles.cellBottom} numberOfLines={1}>{c.bottom}</Text>}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            ))}
                            {users.length === 0 && <Text style={[styles.hint, { padding: 15 }]}>No employees found.</Text>}
                        </View>
                    </ScrollView>
                    <Text style={[styles.hint, { margin: 15 }]}>
                        Tap a day to change it. Bold border = set in the roster; the rest come from the employee’s default shift and weekly off. 🌙 = night shift (ends next day).
                    </Text>
                </ScrollView>
            )}

            <CellModal
                key={cell ? `cell-${cell.userId}|${cell.ymd}` : 'cell-closed'}
                cell={cell}
                shifts={shifts}
                saving={saving}
                onClose={() => setCell(null)}
                onPick={(shift, toWeekEnd) => cell && apply([{ userIds: [cell.userId], fromDate: cell.ymd, toDate: toWeekEnd ? lastDay : cell.ymd, shift }])}
                lastDay={lastDay}
            />
            <BulkModal
                key={bulkOpen ? 'bulk-open' : 'bulk-closed'}
                open={bulkOpen}
                users={roster?.users ?? []}
                shifts={shifts}
                saving={saving}
                defaultFrom={days[0]}
                defaultTo={lastDay}
                onClose={() => setBulkOpen(false)}
                onSave={(c) => apply([c])}
            />
        </View>
    );
}

function ShiftChoices({ shifts, onPick, disabled }: { shifts: Shift[]; onPick: (shift: string) => void; disabled: boolean }) {
    return (
        <View>
            {shifts.map((s) => (
                <TouchableOpacity key={s.id} style={styles.choice} onPress={() => onPick(s.id)} disabled={disabled}>
                    <Text style={styles.choiceTitle}>{isOvernightShift(s.startTime, s.endTime) ? '🌙 ' : ''}{s.name}</Text>
                    <Text style={styles.choiceSub}>{shiftTimeLabel(s.startTime, s.endTime)}</Text>
                </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.choice} onPress={() => onPick('off')} disabled={disabled}>
                <Text style={[styles.choiceTitle, { color: '#c62828' }]}>Off</Text>
                <Text style={styles.choiceSub}>Day off (instead of the weekly off)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.choice} onPress={() => onPick('default')} disabled={disabled}>
                <Text style={[styles.choiceTitle, { color: '#555' }]}>Clear (use default)</Text>
                <Text style={styles.choiceSub}>Employee’s default shift and weekly off apply</Text>
            </TouchableOpacity>
        </View>
    );
}

function CellModal({ cell, shifts, saving, onClose, onPick, lastDay }: {
    cell: { userId: string; name: string; ymd: string } | null;
    shifts: Shift[];
    saving: boolean;
    onClose: () => void;
    onPick: (shift: string, toWeekEnd: boolean) => void;
    lastDay: string;
}) {
    const [toWeekEnd, setToWeekEnd] = useState(false); // fresh per cell (keyed by the caller)
    return (
        <Modal visible={!!cell} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <Text style={styles.sheetTitle}>{cell?.name}</Text>
                    <Text style={styles.sheetSub}>{cell ? dayLabel(cell.ymd) : ''}</Text>
                    {cell && cell.ymd < lastDay && (
                        <TouchableOpacity style={styles.checkRow} onPress={() => setToWeekEnd(!toWeekEnd)}>
                            <Ionicons name={toWeekEnd ? 'checkbox' : 'square-outline'} size={20} color="#3b5998" />
                            <Text style={styles.checkText}>Also till {dayLabel(lastDay)}</Text>
                        </TouchableOpacity>
                    )}
                    <ScrollView style={{ maxHeight: 360 }}>
                        <ShiftChoices shifts={shifts} disabled={saving} onPick={(s) => onPick(s, toWeekEnd)} />
                    </ScrollView>
                    {saving ? <ActivityIndicator color="#3b5998" style={{ marginTop: 10 }} /> : (
                        <TouchableOpacity onPress={onClose} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

function BulkModal({ open, users, shifts, saving, defaultFrom, defaultTo, onClose, onSave }: {
    open: boolean;
    users: { id: string; name: string }[];
    shifts: Shift[];
    saving: boolean;
    defaultFrom: string;
    defaultTo: string;
    onClose: () => void;
    onSave: (c: RosterChange) => void;
}) {
    // Fresh each time it opens (keyed by the caller).
    const [picked, setPicked] = useState<string[]>([]);
    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(defaultTo);

    const pick = (shift: string) => {
        if (picked.length === 0) return Alert.alert('Pick employees', 'Select at least one employee.');
        if (!isYmd(from) || !isYmd(to)) return Alert.alert('Dates', 'Dates must be YYYY-MM-DD, e.g. 2026-10-05.');
        if (from > to) return Alert.alert('Dates', '"From" must be on or before "To".');
        if (Date.parse(to) - Date.parse(from) > 61 * 86400000) return Alert.alert('Dates', 'At most 62 days at a time.');
        onSave({ userIds: picked, fromDate: from, toDate: to, shift });
    };

    return (
        <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={[styles.sheet, { maxHeight: '90%' }]}>
                    <Text style={styles.sheetTitle}>Assign shift for dates</Text>
                    <ScrollView>
                        <Text style={styles.label}>Employees ({picked.length} selected)</Text>
                        <View style={styles.chips}>
                            {users.map((u) => {
                                const on = picked.includes(u.id);
                                return (
                                    <TouchableOpacity key={u.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setPicked(on ? picked.filter((x) => x !== u.id) : [...picked, u.id])}>
                                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{u.name}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <View style={{ flexDirection: 'row', marginTop: 6 }}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.label}>From (YYYY-MM-DD)</Text>
                                <TextInput style={styles.input} value={from} onChangeText={setFrom} maxLength={10} keyboardType="numbers-and-punctuation" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>To (YYYY-MM-DD)</Text>
                                <TextInput style={styles.input} value={to} onChangeText={setTo} maxLength={10} keyboardType="numbers-and-punctuation" />
                            </View>
                        </View>
                        <Text style={styles.label}>Set these days to</Text>
                        <ShiftChoices shifts={shifts} disabled={saving} onPick={pick} />
                    </ScrollView>
                    {saving ? <ActivityIndicator color="#3b5998" style={{ marginTop: 10 }} /> : (
                        <TouchableOpacity onPress={onClose} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

// ───────────── Office roles: Shifts list ─────────────

const EMPTY_FORM = { name: '', startTime: '', endTime: '', graceMinutes: '0' };

function ShiftsList() {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Shift | 'new' | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setShifts(await fetchShifts());
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not load shifts');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const open = (s: Shift | 'new') => {
        setEditing(s);
        setForm(s === 'new' ? EMPTY_FORM : { name: s.name, startTime: s.startTime, endTime: s.endTime, graceMinutes: String(s.graceMinutes) });
    };

    const save = async () => {
        const name = form.name.trim();
        if (!name) return Alert.alert('Name', 'Give the shift a name, e.g. Night.');
        if (!isValidHhmm(form.startTime) || !isValidHhmm(form.endTime)) return Alert.alert('Time', 'Times must be 24-hour HH:MM, e.g. 22:00.');
        const input = { name, startTime: form.startTime, endTime: form.endTime, graceMinutes: Math.min(240, Number(form.graceMinutes) || 0) };
        setSaving(true);
        try {
            if (editing === 'new') await createShift(input);
            else if (editing) await updateShift(editing.id, input);
            setEditing(null);
            await load();
        } catch (e: any) {
            Alert.alert('Could not save', e?.message || 'Please try again');
        } finally {
            setSaving(false);
        }
    };

    const remove = (s: Shift) => {
        Alert.alert('Remove shift', `Remove "${s.name}"? Past attendance keeps it.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteShift(s.id);
                        await load();
                    } catch (e: any) {
                        Alert.alert('Could not remove', e?.message || 'Please try again');
                    }
                },
            },
        ]);
    };

    const overnight = isValidHhmm(form.startTime) && isValidHhmm(form.endTime) && isOvernightShift(form.startTime, form.endTime);

    return (
        <View style={{ flex: 1 }}>
            <View style={styles.toolbar}>
                <Text style={[styles.hint, { flex: 1 }]}>Each shift has its own start, end and late grace. Max 12 hours.</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => open('new')}>
                    <Ionicons name="add" size={18} color="white" />
                    <Text style={styles.primaryBtnText}> Add</Text>
                </TouchableOpacity>
            </View>
            {loading ? <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#3b5998" /> : (
                <ScrollView contentContainerStyle={{ padding: 15 }}>
                    {shifts.length === 0 && <Text style={styles.hint}>No shifts yet. Add one, e.g. General 09:00–18:00 or Night 22:00–06:00.</Text>}
                    {shifts.map((s) => {
                        const night = isOvernightShift(s.startTime, s.endTime);
                        return (
                            <View key={s.id} style={styles.shiftCard}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.shiftName}>{night ? '🌙 ' : ''}{s.name}</Text>
                                    <Text style={styles.shiftTime}>{s.startTime}–{s.endTime}{night ? '  ·  Night shift, ends next day' : ''}</Text>
                                    <Text style={styles.shiftGrace}>Late after {s.graceMinutes} min</Text>
                                </View>
                                <TouchableOpacity onPress={() => open(s)} style={styles.iconBtn} accessibilityLabel={`Edit ${s.name}`}>
                                    <Ionicons name="create-outline" size={20} color="#3b5998" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => remove(s)} style={styles.iconBtn} accessibilityLabel={`Remove ${s.name}`}>
                                    <Ionicons name="trash-outline" size={20} color="#c62828" />
                                </TouchableOpacity>
                            </View>
                        );
                    })}
                </ScrollView>
            )}

            <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
                <View style={styles.backdrop}>
                    <View style={styles.sheet}>
                        <Text style={styles.sheetTitle}>{editing === 'new' ? 'Add shift' : 'Edit shift'}</Text>
                        <Text style={styles.label}>Name</Text>
                        <TextInput style={styles.input} value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} placeholder="Night" maxLength={40} />
                        <View style={{ flexDirection: 'row' }}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.label}>Start</Text>
                                <TextInput style={styles.input} value={form.startTime} onChangeText={(t) => setForm({ ...form, startTime: t.trim() })} placeholder="22:00" maxLength={5} keyboardType="numbers-and-punctuation" />
                            </View>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.label}>End</Text>
                                <TextInput style={styles.input} value={form.endTime} onChangeText={(t) => setForm({ ...form, endTime: t.trim() })} placeholder="06:00" maxLength={5} keyboardType="numbers-and-punctuation" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>Late after (min)</Text>
                                <TextInput style={styles.input} value={form.graceMinutes} onChangeText={(t) => setForm({ ...form, graceMinutes: t.replace(/[^0-9]/g, '') })} keyboardType="numeric" maxLength={3} />
                            </View>
                        </View>
                        {overnight && <Text style={styles.nightNote}>🌙 Night shift: ends the next day</Text>}
                        <Text style={styles.hint}>Changing times doesn’t change past attendance.</Text>
                        <View style={styles.sheetActions}>
                            <TouchableOpacity onPress={() => setEditing(null)} style={styles.cancelBtn} disabled={saving}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={save} style={[styles.primaryBtn, { marginLeft: 10 }]} disabled={saving}>
                                {saving ? <ActivityIndicator color="white" /> : <Text style={styles.primaryBtnText}>Save</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const toneBg = StyleSheet.create({
    shift: { backgroundColor: '#e8f0fe' },
    night: { backgroundColor: '#e8eaf6' },
    off: { backgroundColor: '#fdecea' },
    holiday: { backgroundColor: '#fff3e0' },
    none: { backgroundColor: '#fff' },
});
const toneText = StyleSheet.create({
    shift: { color: '#1a4fa0' },
    night: { color: '#303f9f' },
    off: { color: '#c62828' },
    holiday: { color: '#e65100' },
    none: { color: '#999' },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', elevation: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    tabs: { flexDirection: 'row', backgroundColor: 'white', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabOn: { borderBottomColor: '#3b5998' },
    tabText: { color: '#777', fontWeight: '600' },
    tabTextOn: { color: '#3b5998' },
    hint: { fontSize: 12, color: '#666', lineHeight: 17 },
    weekBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'white' },
    weekBtn: { padding: 6 },
    weekText: { fontWeight: 'bold', color: '#333' },
    toolbar: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 15 },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
    primaryBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b5998', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9 },
    primaryBtnText: { color: 'white', fontWeight: 'bold' },
    gridRow: { flexDirection: 'row' },
    headCell: { backgroundColor: '#eef1f7', justifyContent: 'center' },
    todayHead: { backgroundColor: '#d6e0f5' },
    headText: { fontWeight: 'bold', color: '#3b5998', fontSize: 12, textAlign: 'center' },
    headSub: { color: '#666', fontSize: 11, textAlign: 'center' },
    nameCell: { width: 110, padding: 8, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#e3e3e3', backgroundColor: 'white', justifyContent: 'center' },
    nameText: { fontSize: 12, fontWeight: '600', color: '#333' },
    dayCell: { width: 84, minHeight: 50, padding: 5, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#e3e3e3', justifyContent: 'center' },
    rosteredCell: { borderWidth: 2, borderColor: '#3b5998' },
    dayCellCompact: { width: 70, padding: 4 },
    viewToggle: { flexDirection: 'row', marginLeft: 10, borderWidth: 1, borderColor: '#3b5998', borderRadius: 6, overflow: 'hidden' },
    viewBtn: { paddingHorizontal: 10, paddingVertical: 5 },
    viewBtnOn: { backgroundColor: '#3b5998' },
    viewBtnText: { fontSize: 12, fontWeight: '600', color: '#3b5998' },
    viewBtnTextOn: { color: 'white' },
    secondaryBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#2e7d32', backgroundColor: '#e8f5e9', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 },
    secondaryBtnText: { color: '#2e7d32', fontWeight: 'bold' },
    cellTop: { fontSize: 11, fontWeight: 'bold' },
    cellBottom: { fontSize: 10, color: '#666', marginTop: 2 },
    myRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 8, padding: 12, marginTop: 8 },
    myRowToday: { borderWidth: 1.5, borderColor: '#3b5998' },
    myDate: { width: 100, fontWeight: '600', color: '#333' },
    myShift: { fontSize: 15, fontWeight: 'bold' },
    mySub: { fontSize: 12, color: '#666', marginTop: 2 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
    sheet: { backgroundColor: 'white', borderRadius: 12, padding: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
    sheetTitle: { fontSize: 17, fontWeight: 'bold', color: '#333' },
    sheetSub: { color: '#666', marginTop: 2, marginBottom: 6 },
    sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
    label: { fontSize: 12, color: '#555', fontWeight: '600', marginTop: 10, marginBottom: 6 },
    checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    checkText: { marginLeft: 8, color: '#333' },
    choice: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#eee' },
    choiceTitle: { fontWeight: 'bold', color: '#1a4fa0', fontSize: 15 },
    choiceSub: { color: '#666', fontSize: 12, marginTop: 2 },
    cancelBtn: { paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', marginTop: 6 },
    cancelText: { color: '#666', fontWeight: '600' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#cfd8dc', backgroundColor: '#fff' },
    chipOn: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
    chipText: { fontSize: 12, color: '#3b5998', fontWeight: '600' },
    chipTextOn: { color: '#fff' },
    shiftCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 8, padding: 14, marginBottom: 10 },
    shiftName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    shiftTime: { color: '#3b5998', marginTop: 3, fontWeight: '600' },
    shiftGrace: { color: '#777', fontSize: 12, marginTop: 2 },
    iconBtn: { padding: 8 },
    nightNote: { color: '#303f9f', fontWeight: '600', marginTop: 10 },
});
