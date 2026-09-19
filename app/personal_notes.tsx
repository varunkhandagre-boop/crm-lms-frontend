import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
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
    listPersonalNotes,
    PersonalNote,
    updatePersonalNote,
} from '../services/api/personalNotes';

const NOTE_COLORS = ['#fff9c4', '#bbdefb', '#c8e6c9', '#f8bbd0', '#ffecb3', '#e1bee7'];

export default function PersonalNotesScreen() {
    const router = useRouter();

    const { currentUser } = useData();

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

    const toggleRecording = () => {
        Alert.alert('Coming Soon 🎤', 'Voice-to-Text feature will be available in the next update!');
    };

    const openAddModal = () => {
        setIsEditing(false); setTitle(''); setContent('');
        setSelectedColor(NOTE_COLORS[0]); setIsPinned(false); setModalVisible(true);
    };

    const openEditModal = (note: PersonalNote) => {
        setIsEditing(true); setSelectedNoteId(note.id);
        setTitle(note.title); setContent(note.content);
        setSelectedColor(note.color || NOTE_COLORS[0]);
        setIsPinned(note.isPinned || false); setModalVisible(true);
    };

    const handleSave = async () => {
        if (!title.trim() && !content.trim()) { Alert.alert('Empty', 'Please write something.'); return; }

        setIsSaving(true);
        try {
            const payload = { title: title || 'Untitled', content, color: selectedColor, isPinned };
            if (isEditing) {
                await updatePersonalNote(selectedNoteId, payload);
            } else {
                await createPersonalNote(payload);
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
        try { await Share.share({ message: `*${note.title}*\n\n${note.content}` }); } catch (e) {}
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
            <Text style={styles.cardContent} numberOfLines={isGridView ? 5 : undefined}>{item.content}</Text>

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
            <View style={styles.header}>
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
                <TouchableOpacity style={styles.fab} onPress={openAddModal}>
                    <Ionicons name="add" size={30} color="white" />
                </TouchableOpacity>
            )}

            <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={[styles.modalContainer, { backgroundColor: selectedColor }]}>

                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Text style={{ color: '#d32f2f', fontSize: 16 }}>Cancel</Text>
                            </TouchableOpacity>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
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

                        <View style={{ flex: 1, position: 'relative' }}>
                            <TextInput
                                style={styles.contentInput}
                                placeholder="Type your note here..."
                                value={content}
                                onChangeText={setContent}
                                multiline
                                textAlignVertical="top"
                                placeholderTextColor="#777"
                            />

                            <TouchableOpacity
                                onPress={toggleRecording}
                                style={styles.floatingMicBtn}
                            >
                                <Ionicons
                                    name="mic-off-outline"
                                    size={28}
                                    color="gray"
                                />
                            </TouchableOpacity>
                        </View>

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
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', alignItems: 'center' },
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

    floatingMicBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: '#ffffff', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 } },

    colorPickerContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 15, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 30, marginBottom: 20 },
    colorCircle: { width: 35, height: 35, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
    selectedColorCircle: { borderWidth: 3, borderColor: '#3b5998', transform: [{ scale: 1.1 }] }
});
