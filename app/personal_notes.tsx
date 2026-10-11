import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { useData } from './context/DataContext';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

import {
    createPersonalNote,
    deletePersonalNote,
    ChecklistItem,
    listPersonalNotes,
    PersonalNote,
    updatePersonalNote,
} from '../services/api/personalNotes';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { pickerHandlers } from '../utils/datePickerHandlers';

const NOTE_COLORS = ['#fff9c4', '#bbdefb', '#c8e6c9', '#f8bbd0', '#ffecb3', '#e1bee7'];

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "Today, 6:00 pm" / "Tomorrow, 9:00 am" / "14 Oct, 11:30 am" */
function fmtReminder(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (sameDay(d, now)) return `Today, ${time}`;
    if (sameDay(d, tomorrow)) return `Tomorrow, ${time}`;
    return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

function atTime(daysAhead: number, hour: number) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return d;
}

/** "yyyy-MM-ddTHH:mm" in local time, for the web date-time box. */
function toLocalInput(d: Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const checklistText = (items: ChecklistItem[]) => items.map((i) => i.text).join('\n');

export default function PersonalNotesScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();

    const { currentUser } = useData();
    const params = useLocalSearchParams<{ id?: string }>();

    // notes now comes from useCachedList below (cache-first). Search stays
    // debounced (350ms) — the debounced value feeds the cache key, so
    // typing doesn't create a new cache entry on every keystroke, and the
    // common case (empty search, not archived) still gets instant reloads.
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [isGridView, setIsGridView] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedNoteId, setSelectedNoteId] = useState('');

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0]);
    const [isPinned, setIsPinned] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Checklist mode + reminder for the note being edited.
    const [isChecklist, setIsChecklist] = useState(false);
    const [items, setItems] = useState<ChecklistItem[]>([]);
    const [reminder, setReminder] = useState<Date | null>(null);
    const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
    const [pickerValue, setPickerValue] = useState<Date>(new Date());
    // Reminder as it was when the editor opened — only a change is sent, so editing a
    // note never wipes the record of a reminder that already went out.
    const [initialReminder, setInitialReminder] = useState<string | null>(null);

    // Debounce: update debouncedQuery 350ms after typing settles (0ms when
    // clearing/toggling), same timing the original code used before the
    // network call itself.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), searchQuery ? 350 : 0);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // 🔥 PERSONAL NOTES — cache-first, keyed by company + user (these are
    // per-user, not shared across the company) + the settled search state.
    // See hooks/useCachedList.ts.
    const notesCacheKey = buildCacheKey(
        `personal_notes:${currentUser?.id || 'self'}:${showArchived}:${debouncedQuery || 'none'}`,
        currentUser?.companyId
    );
    const {
        data: notes,
        loading,
        refreshing: notesRefreshing,
        refresh: refreshNotes,
    } = useCachedList({
        cacheKey: notesCacheKey,
        enabled: !!currentUser?.companyId,
        fetcher: () => listPersonalNotes(showArchived, debouncedQuery || undefined),
    });

    const openAddModal = (asChecklist = false) => {
        setIsEditing(false); setTitle(''); setContent('');
        setSelectedColor(NOTE_COLORS[0]); setIsPinned(false);
        setIsChecklist(asChecklist); setItems(asChecklist ? [{ text: '', done: false }] : []);
        setReminder(null); setPickerMode(null); setInitialReminder(null);
        setModalVisible(true);
    };

    const openEditModal = (note: PersonalNote) => {
        setIsEditing(true); setSelectedNoteId(note.id);
        setTitle(note.title); setContent(note.content);
        setSelectedColor(note.color || NOTE_COLORS[0]);
        setIsPinned(note.isPinned || false);
        const list = Array.isArray(note.checklist) ? note.checklist : null;
        setIsChecklist(!!list); setItems(list ? list.map((i) => ({ ...i })) : []);
        // A reminder already sent stays visible on the card but isn't offered again in the editor.
        const pending = note.reminderAt && !note.reminderSentAt ? new Date(note.reminderAt) : null;
        setReminder(pending);
        setInitialReminder(pending ? pending.toISOString() : null);
        setPickerMode(null);
        setModalVisible(true);
    };

    // Opened from a reminder notification: /personal_notes?id=<note>
    const [openedFromLink, setOpenedFromLink] = useState('');
    useEffect(() => {
        const id = typeof params.id === 'string' ? params.id : '';
        if (!id || id === openedFromLink || !notes?.length) return;
        const note = notes.find((n) => n.id === id);
        if (note) { setOpenedFromLink(id); openEditModal(note); }
    }, [params.id, notes]);

    // Text ⇄ checklist: lines become items and back, nothing is lost.
    const toggleChecklistMode = () => {
        if (isChecklist) {
            setContent(checklistText(items.filter((i) => i.text.trim())));
            setIsChecklist(false);
        } else {
            const lines = content.split('\n').map((l) => l.replace(/^\s*([-•*]|☐|☑)\s*/, '').trim()).filter(Boolean);
            setItems(lines.length ? lines.map((text) => ({ text, done: false })) : [{ text: '', done: false }]);
            setIsChecklist(true);
        }
    };
    const updateItem = (index: number, patch: Partial<ChecklistItem>) =>
        setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
    const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));
    const addItem = () => setItems((prev) => [...prev, { text: '', done: false }]);

    const pickReminder = () => {
        const start = reminder && reminder > new Date() ? reminder : atTime(1, 9);
        setPickerValue(start);
        setPickerMode('date');
    };
    const onPicker = (event: any, date?: Date) => {
        if (event?.type === 'dismissed' || !date) { setPickerMode(null); return; }
        if (pickerMode === 'date') {
            const next = new Date(pickerValue);
            next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            setPickerValue(next);
            setPickerMode('time');
            return;
        }
        const next = new Date(pickerValue);
        next.setHours(date.getHours(), date.getMinutes(), 0, 0);
        setPickerMode(null);
        if (next <= new Date()) { Alert.alert('Reminder', 'Please choose a time in the future.'); return; }
        setReminder(next);
    };

    const handleSave = async () => {
        const cleanItems = items.map((i) => ({ text: i.text.trim(), done: i.done })).filter((i) => i.text);
        const body = isChecklist ? checklistText(cleanItems) : content;
        if (!title.trim() && !body.trim()) { Alert.alert('Empty', 'Please write something.'); return; }
        if (reminder && reminder <= new Date() && reminder.toISOString() !== initialReminder) { Alert.alert('Reminder', 'The reminder time has already passed. Choose a new time or remove it.'); return; }

        setIsSaving(true);
        try {
            // content keeps a plain copy of checklist items so search still finds them.
            const payload = {
                title: title || 'Untitled', content: body, color: selectedColor, isPinned,
                checklist: isChecklist ? cleanItems : null,
            };
            const reminderIso = reminder ? reminder.toISOString() : null;
            const payloadWithReminder = !isEditing || reminderIso !== initialReminder ? { ...payload, reminderAt: reminderIso } : payload;
            if (isEditing) {
                await updatePersonalNote(selectedNoteId, payloadWithReminder);
            } else {
                await createPersonalNote(payloadWithReminder);
            }
            setModalVisible(false);
            await refreshNotes();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not save note.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (id: string) => {
        Alert.alert('Delete Note?', 'This action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                        await deletePersonalNote(id);
                        await refreshNotes();
                    } catch (e: any) {
                        Alert.alert('Error', e.message || 'Could not delete note.');
                    }
                }
            }
        ]);
    };

    const toggleArchive = async (note: PersonalNote) => {
        try {
            await updatePersonalNote(note.id, { isArchived: !note.isArchived, isPinned: false });
            await refreshNotes();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not update note.');
        }
    };

    const handleShare = async (note: PersonalNote) => {
        const body = Array.isArray(note.checklist)
            ? note.checklist.map((i) => `${i.done ? '☑' : '☐'} ${i.text}`).join('\n')
            : note.content;
        try { await Share.share({ message: `*${note.title}*\n\n${body}` }); } catch (e) {}
    };

    // Tick an item straight from the card.
    const toggleCardItem = async (note: PersonalNote, index: number) => {
        if (!Array.isArray(note.checklist)) return;
        const next = note.checklist.map((it, i) => (i === index ? { ...it, done: !it.done } : it));
        try {
            await updatePersonalNote(note.id, { checklist: next });
            await refreshNotes();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not update note.');
        }
    };

    const formatSmartDate = (isoString: string) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return 'Today, ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    const renderNote = ({ item }: { item: PersonalNote }) => (
        <TouchableOpacity
            style={[styles.card, { backgroundColor: item.color || '#fff9c4' }, !isGridView && { width: '100%' }]}
            onPress={() => openEditModal(item)}
            onLongPress={() => handleDelete(item.id)}
            activeOpacity={0.8}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={isGridView ? 1 : 2}>{item.title}</Text>
                {item.isPinned && <Ionicons name="pin" size={16} color="#d32f2f" style={{ marginLeft: 5 }} />}
            </View>
            {Array.isArray(item.checklist) ? (
                <View style={styles.cardChecklist}>
                    {item.checklist.slice(0, isGridView ? 5 : 12).map((it, i) => (
                        <TouchableOpacity key={i} style={styles.cardItem} onPress={() => toggleCardItem(item, i)} hitSlop={4}>
                            <Ionicons name={it.done ? 'checkbox' : 'square-outline'} size={16} color={it.done ? '#2e7d32' : '#555'} />
                            <Text style={[styles.cardItemText, it.done && styles.itemDone]} numberOfLines={1}>{it.text}</Text>
                        </TouchableOpacity>
                    ))}
                    {item.checklist.length > (isGridView ? 5 : 12) && (
                        <Text style={styles.moreText}>+{item.checklist.length - (isGridView ? 5 : 12)} more</Text>
                    )}
                    <Text style={styles.progressText}>{item.checklist.filter((i) => i.done).length}/{item.checklist.length} done</Text>
                </View>
            ) : (
                <Text style={styles.cardContent} numberOfLines={isGridView ? 5 : undefined}>{item.content}</Text>
            )}
            {!!item.reminderAt && (
                <View style={[styles.reminderChip, item.reminderSentAt ? styles.reminderChipDone : null]}>
                    <Ionicons name={item.reminderSentAt ? 'alarm-outline' : 'alarm'} size={12} color={item.reminderSentAt ? '#777' : '#e65100'} />
                    <Text style={[styles.reminderChipText, item.reminderSentAt ? { color: '#777' } : null]}>{fmtReminder(item.reminderAt)}</Text>
                </View>
            )}

            <View style={styles.cardFooter}>
                <Text style={styles.dateText}>{formatSmartDate(item.updatedAt || item.createdAt)}</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity onPress={() => handleShare(item)}><Ionicons name="share-social-outline" size={18} color="#555" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleArchive(item)}>
                        <Ionicons name={item.isArchived ? 'arrow-undo-outline' : 'archive-outline'} size={18} color="#555" />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{showArchived ? 'Archived Notes' : 'My Notes'}</Text>

                <View style={{ flexDirection: 'row', gap: 15 }}>
                    <TouchableOpacity onPress={() => setShowArchived(!showArchived)}>
                        <Ionicons name={showArchived ? 'journal' : 'archive'} size={22} color={showArchived ? '#3b5998' : '#888'} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setIsGridView(!isGridView)}>
                        <Ionicons name={isGridView ? 'list' : 'grid'} size={22} color="#3b5998" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#888" style={{ marginLeft: 10 }} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search your notes..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholderTextColor="#999"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={20} color="#888" style={{ marginRight: 10 }} />
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    key={isGridView ? 'GRID' : 'LIST'}
                    data={notes}
                    keyExtractor={item => item.id}
                    renderItem={renderNote}
                    contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
                    numColumns={isGridView ? 2 : 1}
                    columnWrapperStyle={isGridView ? { justifyContent: 'space-between' } : undefined}
                    refreshControl={
                        <RefreshControl refreshing={notesRefreshing} onRefresh={refreshNotes} colors={['#3b5998']} tintColor="#3b5998" />
                    }
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 100 }}>
                            <Ionicons name={showArchived ? 'archive-outline' : 'search-outline'} size={60} color="#ccc" />
                            <Text style={{ color: 'gray', marginTop: 10 }}>
                                {searchQuery ? 'No notes found.' : showArchived ? 'Archive is empty.' : 'No notes yet. Start writing!'}
                            </Text>
                        </View>
                    }
                />
            )}

            {!showArchived && (
                <>
                    <TouchableOpacity style={styles.fabSmall} onPress={() => openAddModal(true)} accessibilityLabel="New checklist">
                        <Ionicons name="checkbox-outline" size={22} color="#3b5998" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.fab} onPress={() => openAddModal(false)} accessibilityLabel="New note">
                        <Ionicons name="add" size={30} color="white" />
                    </TouchableOpacity>
                </>
            )}

            <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={[styles.modalContainer, { backgroundColor: selectedColor }]}>

                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Text style={{ color: '#d32f2f', fontSize: 16 }}>Cancel</Text>
                            </TouchableOpacity>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                                <TouchableOpacity onPress={toggleChecklistMode} accessibilityLabel={isChecklist ? 'Change to text note' : 'Change to checklist'}>
                                    <Ionicons name={isChecklist ? 'document-text-outline' : 'checkbox-outline'} size={22} color="#555" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsPinned(!isPinned)}>
                                    <Ionicons name={isPinned ? 'pin' : 'pin-outline'} size={22} color={isPinned ? '#d32f2f' : '#555'} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                                    <Text style={{ color: '#3b5998', fontWeight: 'bold', fontSize: 16 }}>{isSaving ? 'Saving...' : 'Save'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TextInput
                            style={styles.titleInput} placeholder="Title" value={title} onChangeText={setTitle} placeholderTextColor="#777"
                        />

                        {/* Reminder: quick choices or any date and time */}
                        <View style={styles.reminderRow}>
                            <Ionicons name="alarm-outline" size={18} color={reminder ? '#e65100' : '#555'} />
                            {reminder ? (
                                <>
                                    <TouchableOpacity onPress={pickReminder} style={[styles.reminderPill, styles.reminderPillOn]}>
                                        <Text style={styles.reminderPillOnText}>{fmtReminder(reminder.toISOString())}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setReminder(null)} hitSlop={8}>
                                        <Ionicons name="close-circle" size={20} color="#888" />
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    {new Date().getHours() < 18 && (
                                        <TouchableOpacity style={styles.reminderPill} onPress={() => setReminder(atTime(0, 18))}>
                                            <Text style={styles.reminderPillText}>Today 6 pm</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={styles.reminderPill} onPress={() => setReminder(atTime(1, 9))}>
                                        <Text style={styles.reminderPillText}>Tomorrow 9 am</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.reminderPill} onPress={pickReminder}>
                                        <Text style={styles.reminderPillText}>Pick date & time</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                        {pickerMode && Platform.OS === 'web' && (
                            <View style={styles.webPicker}>
                                {React.createElement('input', {
                                    type: 'datetime-local',
                                    defaultValue: toLocalInput(pickerValue),
                                    min: toLocalInput(new Date()),
                                    style: { fontSize: 16, padding: 8 },
                                    onChange: (e: any) => {
                                        const v = e?.target?.value;
                                        if (v) setPickerValue(new Date(v));
                                    },
                                })}
                                <TouchableOpacity style={styles.webPickerBtn} onPress={() => {
                                    setPickerMode(null);
                                    if (pickerValue <= new Date()) { Alert.alert('Reminder', 'Please choose a time in the future.'); return; }
                                    setReminder(pickerValue);
                                }}>
                                    <Text style={{ color: 'white', fontWeight: 'bold' }}>Set</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {pickerMode && Platform.OS !== 'web' && (
                            <DateTimePicker
                                value={pickerValue}
                                mode={pickerMode}
                                minimumDate={pickerMode === 'date' ? new Date() : undefined}
                                {...pickerHandlers(onPicker)}
                            />
                        )}

                        {isChecklist ? (
                            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                                {items.map((it, i) => (
                                    <View key={i} style={styles.itemRow}>
                                        <TouchableOpacity onPress={() => updateItem(i, { done: !it.done })} hitSlop={6}>
                                            <Ionicons name={it.done ? 'checkbox' : 'square-outline'} size={22} color={it.done ? '#2e7d32' : '#555'} />
                                        </TouchableOpacity>
                                        <TextInput
                                            style={[styles.itemInput, it.done && styles.itemDone]}
                                            value={it.text}
                                            onChangeText={(t) => updateItem(i, { text: t })}
                                            placeholder="List item"
                                            placeholderTextColor="#888"
                                            onSubmitEditing={addItem}
                                            returnKeyType="next"
                                            blurOnSubmit={false}
                                            autoFocus={!it.text && i === items.length - 1 && items.length > 1}
                                        />
                                        <TouchableOpacity onPress={() => removeItem(i)} hitSlop={6}>
                                            <Ionicons name="close" size={18} color="#888" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
                                    <Ionicons name="add" size={20} color="#3b5998" />
                                    <Text style={styles.addItemText}>Add item</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        ) : (
                            <View style={{ flex: 1 }}>
                                <TextInput
                                    style={styles.contentInput}
                                    placeholder="Type your note here..."
                                    value={content}
                                    onChangeText={setContent}
                                    multiline
                                    textAlignVertical="top"
                                    placeholderTextColor="#777"
                                />
                            </View>
                        )}
                        <Text style={styles.micHint}>🎤 Tip: tap the mic on your keyboard to speak instead of typing (Hindi or English).</Text>

                        <View style={styles.colorPickerContainer}>
                            {NOTE_COLORS.map(color => (
                                <TouchableOpacity key={color} style={[styles.colorCircle, { backgroundColor: color }, selectedColor === color && styles.selectedColorCircle]} onPress={() => setSelectedColor(color)} />
                            ))}
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: 'white', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },

    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0e0e0', margin: 15, borderRadius: 25, height: 45, paddingHorizontal: 5 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: '#333' },

    card: { width: '48%', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 } },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
    cardTitle: { fontWeight: 'bold', fontSize: 16, color: '#333', flex: 1 },
    cardContent: { fontSize: 13, color: '#444', minHeight: 50, marginBottom: 15 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 10 },
    dateText: { fontSize: 10, color: '#777', fontWeight: 'bold' },

    fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#3b5998', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 } },

    modalContainer: { flex: 1, padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingTop: 10 },
    titleInput: { fontSize: 22, fontWeight: 'bold', paddingBottom: 10, color: '#333' },
    contentInput: { fontSize: 16, color: '#333', flex: 1, lineHeight: 24 },

    micHint: { fontSize: 12, color: '#555', textAlign: 'center', marginVertical: 8 },
    fabSmall: { position: 'absolute', bottom: 100, right: 38, backgroundColor: 'white', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 } },
    cardChecklist: { minHeight: 50, marginBottom: 10 },
    cardItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
    cardItemText: { fontSize: 13, color: '#333', flex: 1 },
    itemDone: { textDecorationLine: 'line-through', color: '#888' },
    moreText: { fontSize: 11, color: '#666', marginTop: 2 },
    progressText: { fontSize: 11, color: '#2e7d32', fontWeight: 'bold', marginTop: 4 },
    reminderChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
    reminderChipDone: { backgroundColor: 'rgba(0,0,0,0.05)' },
    reminderChipText: { fontSize: 11, color: '#e65100', fontWeight: 'bold' },
    reminderRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    reminderPill: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.6)' },
    reminderPillText: { fontSize: 12, color: '#333', fontWeight: '600' },
    reminderPillOn: { backgroundColor: '#e65100', borderColor: '#e65100' },
    reminderPillOnText: { fontSize: 12, color: 'white', fontWeight: 'bold' },
    webPicker: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    webPickerBtn: { backgroundColor: '#3b5998', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    itemInput: { flex: 1, fontSize: 16, color: '#333', paddingVertical: 6 },
    addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
    addItemText: { color: '#3b5998', fontWeight: 'bold', fontSize: 15 },

    colorPickerContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 15, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 30, marginBottom: 20 },
    colorCircle: { width: 35, height: 35, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
    selectedColorCircle: { borderWidth: 3, borderColor: '#3b5998', transform: [{ scale: 1.1 }] }
});
