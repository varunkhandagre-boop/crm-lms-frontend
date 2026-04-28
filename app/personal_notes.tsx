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
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (Firebase DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

const NOTE_COLORS = ['#fff9c4', '#bbdefb', '#c8e6c9', '#f8bbd0', '#ffecb3', '#e1bee7'];

export default function PersonalNotesScreen() {
    const router = useRouter();

    // 🔥 1. Context se current user nikalenge
    const { currentUser } = useData();

    // 🔥 2. Naya SaaS Engine connect karenge
    const { fetchSaaSData, addSaaSData, updateSaaSData, deleteSaaSData, isDbLoading } = useSaaSDB();

    // STATES
    const [notes, setNotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGridView, setIsGridView] = useState(true); 
    
    // Search & Archive States
    const [searchQuery, setSearchQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    
    // Modal States
    const [modalVisible, setModalVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedNoteId, setSelectedNoteId] = useState('');
    
    // Form States
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0]); 
    const [isPinned, setIsPinned] = useState(false); 
    const [isSaving, setIsSaving] = useState(false);

    // 🔥 3. LOAD DATA (SAAS IMPLEMENTATION)
    const loadNotes = async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const data = await fetchSaaSData("personal_notes");
            
            // Filter strictly for this user 
            // Note: SaaS Engine usually scopes by companyId, but for notes we strictly scope by userId too.
            const userNotes = data.filter((n: any) => n.userId === (currentUser.uid || currentUser.id));

            // Sorting: Pinned first, then latest edited
            userNotes.sort((a: any, b: any) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
            });

            setNotes(userNotes);
        } catch (error) {
            console.log(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotes();
    }, [currentUser]);


    const toggleRecording = () => {
        Alert.alert("Coming Soon 🎤", "Voice-to-Text feature will be available in the next update!");
    };

    // Filter Logic (Search + Archive)
    const filteredNotes = notes.filter(note => {
        const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              note.content.toLowerCase().includes(searchQuery.toLowerCase());
        const isArchivedNote = note.isArchived || false;
        const matchesTab = showArchived ? isArchivedNote : !isArchivedNote;
        
        return matchesSearch && matchesTab;
    });

    // --- ACTIONS ---
    const openAddModal = () => {
        setIsEditing(false); setTitle(''); setContent('');
        setSelectedColor(NOTE_COLORS[0]); setIsPinned(false); setModalVisible(true);
    };

    const openEditModal = (note: any) => {
        setIsEditing(true); setSelectedNoteId(note.id);
        setTitle(note.title); setContent(note.content);
        setSelectedColor(note.color || NOTE_COLORS[0]);
        setIsPinned(note.isPinned || false); setModalVisible(true);
    };

    // 🔥 4. SAAS SAVE / UPDATE
    const handleSave = async () => {
        if (!title.trim() && !content.trim()) { Alert.alert("Empty", "Please write something."); return; }
        if (!currentUser) return;

        setIsSaving(true);
        try {
            const noteData = {
                title: title || 'Untitled', 
                content: content, 
                color: selectedColor, 
                isPinned: isPinned, 
                updatedAt: new Date().toISOString(), 
                userId: currentUser.uid || currentUser.id,
                isArchived: false 
            };

            if (isEditing) {
                await updateSaaSData("personal_notes", selectedNoteId, noteData);
            } else {
                await addSaaSData("personal_notes", { ...noteData, createdAt: new Date().toISOString() });
            }
            
            setModalVisible(false);
            await loadNotes(); // Reload lists
        } catch (error: any) { 
            Alert.alert("Error", error.message); 
        } finally { 
            setIsSaving(false); 
        }
    };

    // 🔥 5. SAAS DELETE
    const handleDelete = (id: string) => {
        Alert.alert("Delete Note?", "This action cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Delete", 
                style: 'destructive', 
                onPress: async () => {
                    await deleteSaaSData("personal_notes", id);
                    await loadNotes();
                }
            }
        ]);
    };

    // 🔥 6. SAAS TOGGLE ARCHIVE
    const toggleArchive = async (note: any) => {
        try {
            await updateSaaSData("personal_notes", note.id, { 
                isArchived: !note.isArchived,
                isPinned: false 
            });
            await loadNotes();
        } catch (error: any) { Alert.alert("Error", error.message); }
    };

    const handleShare = async (note: any) => {
        try { await Share.share({ message: `*${note.title}*\n\n${note.content}` }); } catch (e) {}
    };

    const formatSmartDate = (isoString: string) => {
        if(!isoString) return '';
        const d = new Date(isoString);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return 'Today, ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    // CARD UI
    const renderNote = ({ item }: any) => (
        <TouchableOpacity 
            style={[styles.card, { backgroundColor: item.color || '#fff9c4' }, !isGridView && { width: '100%' }]} 
            onPress={() => openEditModal(item)} 
            onLongPress={() => handleDelete(item.id)}
            activeOpacity={0.8}
        >
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={isGridView ? 1 : 2}>{item.title}</Text>
                {item.isPinned && <Ionicons name="pin" size={16} color="#d32f2f" style={{marginLeft: 5}} />}
            </View>
            <Text style={styles.cardContent} numberOfLines={isGridView ? 5 : undefined}>{item.content}</Text>
            
            <View style={styles.cardFooter}>
                <Text style={styles.dateText}>{formatSmartDate(item.updatedAt || item.createdAt)}</Text>
                <View style={{flexDirection: 'row', gap: 12}}>
                    <TouchableOpacity onPress={() => handleShare(item)}><Ionicons name="share-social-outline" size={18} color="#555" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleArchive(item)}>
                        <Ionicons name={item.isArchived ? "arrow-undo-outline" : "archive-outline"} size={18} color="#555" />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{showArchived ? 'Archived Notes' : 'My Notes'}</Text>
                
                <View style={{flexDirection: 'row', gap: 15}}>
                    <TouchableOpacity onPress={() => setShowArchived(!showArchived)}>
                        <Ionicons name={showArchived ? "journal" : "archive"} size={22} color={showArchived ? "#3b5998" : "#888"} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setIsGridView(!isGridView)}>
                        <Ionicons name={isGridView ? "list" : "grid"} size={22} color="#3b5998" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Smart Search Bar */}
            <View style={styles.searchContainer}>
                {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" style={{marginLeft: 10}}/> : <Ionicons name="search" size={20} color="#888" style={{marginLeft: 10}} />}
                <TextInput 
                    style={styles.searchInput}
                    placeholder="Search your notes..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholderTextColor="#999"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={20} color="#888" style={{marginRight: 10}} />
                    </TouchableOpacity>
                )}
            </View>

            {/* List */}
            {loading ? (
                <ActivityIndicator size="large" color="#3b5998" style={{marginTop: 50}} />
            ) : (
                <FlatList
                    key={isGridView ? 'GRID' : 'LIST'} 
                    data={filteredNotes}
                    keyExtractor={item => item.id}
                    renderItem={renderNote}
                    contentContainerStyle={{padding: 15, paddingBottom: 100}}
                    numColumns={isGridView ? 2 : 1} 
                    columnWrapperStyle={isGridView ? {justifyContent:'space-between'} : undefined}
                    ListEmptyComponent={
                        <View style={{alignItems:'center', marginTop: 100}}>
                            <Ionicons name={showArchived ? "archive-outline" : "search-outline"} size={60} color="#ccc" />
                            <Text style={{color:'gray', marginTop:10}}>
                                {searchQuery ? 'No notes found.' : showArchived ? 'Archive is empty.' : 'No notes yet. Start writing!'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Floating Add Button */}
            {!showArchived && (
                <TouchableOpacity style={styles.fab} onPress={openAddModal}>
                    <Ionicons name="add" size={30} color="white" />
                </TouchableOpacity>
            )}

            {/* ADD/EDIT MODAL */}
            <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
                    <View style={[styles.modalContainer, { backgroundColor: selectedColor }]}>
                        
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Text style={{color:'#d32f2f', fontSize:16}}>Cancel</Text>
                            </TouchableOpacity>
                            <View style={{flexDirection: 'row', alignItems: 'center', gap: 15}}>
                                <TouchableOpacity onPress={() => setIsPinned(!isPinned)}>
                                    <Ionicons name={isPinned ? "pin" : "pin-outline"} size={22} color={isPinned ? "#d32f2f" : "#555"} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                                    <Text style={{color:'#3b5998', fontWeight:'bold', fontSize:16}}>{isSaving ? 'Saving...' : 'Save'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TextInput 
                            style={styles.titleInput} placeholder="Title" value={title} onChangeText={setTitle} placeholderTextColor="#777"
                        />
                        
                        <View style={{flex: 1, position: 'relative'}}>
                            <TextInput 
                                style={styles.contentInput} 
                                placeholder="Type your note here..." 
                                value={content} 
                                onChangeText={setContent} 
                                multiline 
                                textAlignVertical="top" 
                                placeholderTextColor="#777"
                            />
                            
                            {/* 🔥 DISABLED MIC BUTTON */}
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
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', alignItems:'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0e0e0', margin: 15, borderRadius: 25, height: 45, paddingHorizontal: 5 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: '#333' },

    card: { width: '48%', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: {width: 0, height: 2} },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
    cardTitle: { fontWeight: 'bold', fontSize: 16, color: '#333', flex:1 },
    cardContent: { fontSize: 13, color: '#444', minHeight: 50, marginBottom: 15 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 10 },
    dateText: { fontSize: 10, color: '#777', fontWeight: 'bold' },

    fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#3b5998', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: {width:0, height:2} },

    modalContainer: { flex: 1, padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingTop: 10 },
    titleInput: { fontSize: 22, fontWeight: 'bold', paddingBottom: 10, color:'#333' },
    contentInput: { fontSize: 16, color: '#333', flex: 1, lineHeight: 24 },
    
    floatingMicBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: '#ffffff', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: {width: 0, height: 2} },
    
    colorPickerContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 15, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 30, marginBottom: 20 },
    colorCircle: { width: 35, height: 35, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
    selectedColorCircle: { borderWidth: 3, borderColor: '#3b5998', transform: [{scale: 1.1}] }
});