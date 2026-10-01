// ====================================================================
// 5️⃣ TEMPLATES TAB — migrated to Postgres via messageTemplates.ts adapter
// ====================================================================
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import {
    createTemplate,
    deleteTemplate,
    fetchTemplates,
    MessageTemplate,
    updateTemplate,
} from '../services/api/messageTemplates';

export const TemplatesTab = () => {
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');

    const [modalVisible, setModalVisible] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [templateName, setTemplateName] = useState('');
    const [templateType, setTemplateType] = useState<'email' | 'whatsapp'>('email');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [viewData, setViewData] = useState<MessageTemplate | null>(null);

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const data = await fetchTemplates();
            setTemplates(data);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not load templates.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setEditId(null);
        setTemplateName('');
        setTemplateType('email');
        setSubject('');
        setBody('');
    };

    const openAddNew = () => {
        resetForm();
        setModalVisible(true);
    };

    const openEdit = (item: MessageTemplate) => {
        setViewModalVisible(false);
        setEditId(item.id);
        setTemplateName(item.name);
        setTemplateType(item.type);
        setSubject(item.subject || '');
        setBody(item.body);
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!templateName.trim() || !body.trim()) {
            Alert.alert('Required', 'Template Name and Body are required.');
            return;
        }
        if (templateType === 'email' && !subject.trim()) {
            Alert.alert('Required', 'Subject is required for Email templates.');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                name: templateName.trim(),
                type: templateType,
                subject: templateType === 'email' ? subject.trim() : undefined,
                body: body.trim(),
            };
            if (editId) {
                await updateTemplate(editId, payload);
                Alert.alert('Success', 'Template Updated!');
            } else {
                await createTemplate(payload);
                Alert.alert('Success', 'New Template Created!');
            }
            setModalVisible(false);
            loadTemplates();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (id: string) => {
        Alert.alert('Delete Template?', 'Are you sure you want to delete this template?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteTemplate(id);
                        loadTemplates();
                    } catch (e: any) {
                        Alert.alert('Error', e.message || 'Could not delete.');
                    }
                },
            },
        ]);
    };

    const filteredTemplates = templates.filter(
        (t) =>
            (t.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
            (t.subject || '').toLowerCase().includes(searchText.toLowerCase())
    );

    if (loading) return <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 50 }} />;

    return (
        <View style={{ flex: 1 }}>
            <View style={tStyles.superSearchBar}>
                <Ionicons name="search" size={20} color="#3b5998" />
                <TextInput
                    style={tStyles.superSearchInput}
                    placeholder="Search Templates by Name or Subject..."
                    value={searchText}
                    onChangeText={setSearchText}
                />
                {searchText.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchText('')}>
                        <Ionicons name="close-circle" size={20} color="gray" />
                    </TouchableOpacity>
                )}
            </View>

            <FlatList
                data={filteredTemplates}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 100 }}
                ListEmptyComponent={<Text style={{ textAlign: 'center', color: 'gray', marginTop: 50 }}>No templates found. Create one!</Text>}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={tStyles.card}
                        onPress={() => {
                            setViewData(item);
                            setViewModalVisible(true);
                        }}
                    >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                                    <View style={[tStyles.templateBadge, { backgroundColor: item.type === 'email' ? '#e3f2fd' : '#e8f5e9' }]}>
                                        <Ionicons name={item.type === 'email' ? 'mail' : 'logo-whatsapp'} size={12} color={item.type === 'email' ? '#1565c0' : '#2e7d32'} />
                                        <Text style={[tStyles.templateBadgeText, { color: item.type === 'email' ? '#1565c0' : '#2e7d32' }]}>
                                            {item.type === 'email' ? 'EMAIL' : 'WHATSAPP'}
                                        </Text>
                                    </View>
                                    <Text style={{ fontSize: 10, color: 'gray', marginLeft: 10 }}>
                                        Updated: {new Date(item.updatedAt || item.createdAt).toLocaleDateString()}
                                    </Text>
                                </View>
                                <Text style={tStyles.templateName}>{item.name}</Text>
                                {item.type === 'email' && <Text style={tStyles.subjectText} numberOfLines={1}>Sub: {item.subject}</Text>}
                                <Text style={tStyles.bodyPreview} numberOfLines={2}>{item.body.replace(/<[^>]+>/g, '')}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#ccc" />
                        </View>
                        <View style={tStyles.actionRow}>
                            <TouchableOpacity style={tStyles.actionBtn} onPress={() => openEdit(item)}>
                                <Ionicons name="create-outline" size={16} color="#3b5998" />
                                <Text style={{ color: '#3b5998', fontWeight: 'bold', marginLeft: 5 }}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={tStyles.actionBtn} onPress={() => handleDelete(item.id)}>
                                <Ionicons name="trash-outline" size={16} color="#d32f2f" />
                                <Text style={{ color: '#d32f2f', fontWeight: 'bold', marginLeft: 5 }}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                )}
            />

            <TouchableOpacity style={tStyles.fab} onPress={openAddNew}>
                <Ionicons name="add" size={30} color="white" />
            </TouchableOpacity>

            {/* VIEW DETAILS MODAL */}
            <Modal visible={viewModalVisible} animationType="fade" transparent={true}>
                <View style={tStyles.modalOverlay}>
                    <View style={tStyles.viewModalContent}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 10 }}>
                            <Text style={tStyles.modalHeader}>Template Details</Text>
                            <TouchableOpacity onPress={() => setViewModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>
                        {viewData && (
                            <ScrollView style={{ maxHeight: '80%' }} showsVerticalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                    <View style={[tStyles.templateBadge, { backgroundColor: viewData.type === 'email' ? '#e3f2fd' : '#e8f5e9' }]}>
                                        <Ionicons name={viewData.type === 'email' ? 'mail' : 'logo-whatsapp'} size={14} color={viewData.type === 'email' ? '#1565c0' : '#2e7d32'} />
                                        <Text style={[tStyles.templateBadgeText, { color: viewData.type === 'email' ? '#1565c0' : '#2e7d32', fontSize: 12 }]}>
                                            {viewData.type === 'email' ? 'EMAIL TEMPLATE' : 'WHATSAPP TEMPLATE'}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 5 }}>{viewData.name}</Text>
                                {viewData.type === 'email' && <Text style={{ fontSize: 15, color: '#1565c0', fontWeight: 'bold', marginBottom: 15 }}>Subject: {viewData.subject}</Text>}
                                {viewData.type === 'whatsapp' && (
                                    <Text style={{ fontSize: 11, color: '#e65100', marginBottom: 10, fontStyle: 'italic' }}>
                                        Note: this exact name must also be registered + approved on Meta's WhatsApp Business dashboard before it can be sent.
                                    </Text>
                                )}
                                <View style={{ backgroundColor: '#f9f9f9', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#eee', marginTop: 10 }}>
                                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: 'gray', marginBottom: 8 }}>MESSAGE BODY:</Text>
                                    <Text style={{ fontSize: 15, color: '#444', lineHeight: 24 }}>{viewData.body}</Text>
                                </View>
                            </ScrollView>
                        )}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                            <TouchableOpacity style={[tStyles.btn, { backgroundColor: '#3b5998' }]} onPress={() => viewData && openEdit(viewData)}>
                                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>✏️ Edit Template</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ADD/EDIT MODAL */}
            <Modal visible={modalVisible} animationType="slide" transparent={true}>
                <View style={tStyles.modalOverlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={tStyles.modalContentFull}>
                        <View style={tStyles.modalHeaderRow}>
                            <Text style={tStyles.modalHeader}>{editId ? 'Edit Template' : 'New Template'}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close-circle" size={30} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={tStyles.tipBox}>
                                <Text style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold' }}>💡 Smart Variables you can use:</Text>
                                <Text style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                                    {`{customer_name}, {amount}, {bill_no}, {company_name}`}
                                </Text>
                            </View>

                            <Text style={tStyles.label}>Identifier Name (Code) *</Text>
                            <TextInput
                                style={tStyles.input}
                                value={templateName}
                                onChangeText={setTemplateName}
                                placeholder="e.g. order_confirmed"
                                editable={!editId}
                                autoCapitalize="none"
                            />
                            {templateType === 'whatsapp' && (
                                <Text style={{ fontSize: 11, color: '#e65100', marginTop: -8, marginBottom: 12 }}>
                                    ⚠️ Must exactly match an approved template name on Meta's WhatsApp Business dashboard.
                                </Text>
                            )}

                            <Text style={tStyles.label}>Template Type</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                                <TouchableOpacity
                                    style={[tStyles.typeBtn, templateType === 'email' && tStyles.typeBtnActive]}
                                    onPress={() => setTemplateType('email')}
                                    disabled={!!editId}
                                >
                                    <Text style={[tStyles.typeBtnText, templateType === 'email' && { color: 'white' }]}>Email</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[tStyles.typeBtn, templateType === 'whatsapp' && { backgroundColor: '#2e7d32', borderColor: '#2e7d32' }]}
                                    onPress={() => setTemplateType('whatsapp')}
                                    disabled={!!editId}
                                >
                                    <Text style={[tStyles.typeBtnText, templateType === 'whatsapp' && { color: 'white' }]}>WhatsApp</Text>
                                </TouchableOpacity>
                            </View>

                            {templateType === 'email' && (
                                <>
                                    <Text style={tStyles.label}>Email Subject *</Text>
                                    <TextInput
                                        style={tStyles.input}
                                        value={subject}
                                        onChangeText={setSubject}
                                        placeholder="e.g. Payment Received - {company_name}"
                                    />
                                </>
                            )}

                            <Text style={tStyles.label}>{templateType === 'email' ? 'Email Body *' : 'WhatsApp Text *'}</Text>
                            <TextInput
                                style={[tStyles.input, { height: 150, textAlignVertical: 'top' }]}
                                value={body}
                                onChangeText={setBody}
                                placeholder={templateType === 'email' ? 'Hello {customer_name}, ...' : 'Hello {customer_name}, your payment is...'}
                                multiline
                            />

                            <TouchableOpacity style={tStyles.bigSaveBtn} onPress={handleSave} disabled={isSaving}>
                                {isSaving ? <ActivityIndicator color="white" /> : <Text style={tStyles.bigBtnText}>Save Template</Text>}
                            </TouchableOpacity>
                            <View style={{ height: 30 }} />
                        </ScrollView>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
};

const tStyles = StyleSheet.create({
    superSearchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 12, marginBottom: 12, elevation: 1, height: 44, gap: 8 },
    superSearchInput: { flex: 1, fontSize: 14 },
    card: { backgroundColor: 'white', padding: 14, borderRadius: 10, marginBottom: 10, elevation: 1 },
    templateBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, gap: 4 },
    templateBadgeText: { fontSize: 10, fontWeight: 'bold' },
    templateName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    subjectText: { fontSize: 12, color: '#1565c0', marginTop: 2 },
    bodyPreview: { fontSize: 12, color: '#777', marginTop: 4 },
    actionRow: { flexDirection: 'row', gap: 15, marginTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 },
    actionBtn: { flexDirection: 'row', alignItems: 'center' },
    fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#2c3e50', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 5 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    viewModalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20, elevation: 5, maxHeight: '85%' },
    modalContentFull: { backgroundColor: 'white', borderRadius: 10, padding: 20, flex: 1, marginVertical: 40 },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
    modalHeader: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
    tipBox: { backgroundColor: '#fff3e0', padding: 10, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#ffcc80' },
    label: { fontSize: 12, color: '#555', marginBottom: 5, fontWeight: 'bold' },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: '#f9f9f9' },
    typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
    typeBtnActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
    typeBtnText: { fontWeight: 'bold', color: '#333' },
    bigSaveBtn: { backgroundColor: '#27ae60', paddingVertical: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 10, elevation: 3 },
    bigBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1 },
    btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
});
