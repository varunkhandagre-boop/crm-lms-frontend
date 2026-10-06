import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { useData } from './context/DataContext';
import {
    fetchTemplates,
    MessageTemplate,
} from '../services/api/messageTemplates';
import {
    AudienceContact,
    AudienceFilter,
    cancelMessage,
    fetchAudiencePage,
    fetchAudienceTypes,
    fetchOutboundMessagesPage,
    markEmailSent,
    MessageChannel,
    MessageStatus,
    OutboundMessage,
    sendBroadcast,
} from '../services/api/outboundMessages';
import { useServerPagedList } from '../hooks/useServerPagedList';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

import { TemplatesTab } from '../components/TemplatesTab';
import { useHeaderTop } from '../hooks/useHeaderTop';

export default function MessagingCenterScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'Templates' | 'Pending' | 'History' | 'Broadcast'>('Templates');

        return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor="#3b5998" />

                <View style={[styles.header, { paddingTop: headerTop }]}>
                    <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ padding: 5 }}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Messaging Center</Text>
                    <View style={{ width: 30 }} />
                </View>

                <View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.tabContainer}>
                            {(['Templates', 'Pending', 'History', 'Broadcast'] as const).map((tab) => (
                                <TouchableOpacity
                                    key={tab}
                                    style={[styles.tabBtn, activeTab === tab && styles.activeTabBtn]}
                                    onPress={() => setActiveTab(tab)}
                                >
                                    <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                                        {tab === 'Pending' ? 'Pending Emails' : tab === 'History' ? 'Sent History' : tab}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                </View>

                <View style={{ flex: 1, padding: 10, backgroundColor: '#f4f6f8' }}>
                    {activeTab === 'Templates' && <TemplatesTab />}
                    {activeTab === 'Pending' && <PendingEmailsTab />}
                    {activeTab === 'History' && <SentHistoryTab />}
                    {activeTab === 'Broadcast' && <BroadcastTab />}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

// ====================================================================
// PENDING EMAILS TAB
// ====================================================================
const PendingEmailsTab = () => {
    const { currentUser } = useData();
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Pending emails: due ones only, 20 per page, filtered on the server.
    const [handledCount, setHandledCount] = useState(0);
    const pendingFilters = useMemo(() => ({ channel: 'email' as MessageChannel, status: 'PENDING' as MessageStatus, dueOnly: true }), []);
    const {
        items: pendingList,
        setItems: setPendingList,
        total: pendingTotal,
        loading,
        loadingMore: pendingLoadingMore,
        hasMore: pendingHasMore,
        loadMore: loadMorePending,
        refreshing: pendingRefreshing,
        refresh: refreshPending,
    } = useServerPagedList<{ channel: MessageChannel; status: MessageStatus; dueOnly: boolean }, OutboundMessage>({
        fetchPage: fetchOutboundMessagesPage,
        filters: pendingFilters,
        enabled: !!currentUser?.companyId,
        cacheKey: buildCacheKey('pending_emails_page1', currentUser?.companyId),
    });
    // 🔥 TEMPLATES — cache-first. See hooks/useCachedList.ts.
    const templatesCacheKey = buildCacheKey('email_templates', currentUser?.companyId);
    const {
        data: templates,
        loading: templatesLoading,
        refresh: refreshTemplates,
    } = useCachedList({
        cacheKey: templatesCacheKey,
        enabled: !!currentUser?.companyId,
        fetcher: () => fetchTemplates('email'),
    });

    const onRefresh = async () => {
        setHandledCount(0);
        await Promise.all([refreshPending(), refreshTemplates()]);
    };

    const buildMailto = (msg: OutboundMessage): string | null => {
        const template = templates.find((t) => t.name === msg.templateName);
        if (!template) return null;

        let finalSubject = template.subject || '';
        let finalBody = template.body || '';
        for (const key in msg.variables) {
            const regex = new RegExp(`{${key}}`, 'g');
            const value = msg.variables[key] !== undefined && msg.variables[key] !== null ? String(msg.variables[key]) : '-';
            finalSubject = finalSubject.replace(regex, value);
            finalBody = finalBody.replace(regex, value);
        }
        return `mailto:${msg.to}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(finalBody)}`;
    };

    const handleSendEmail = async (msg: OutboundMessage) => {
        const url = buildMailto(msg);
        if (!url) {
            Alert.alert('Template Missing', `Could not find email template: ${msg.templateName}. Check the Templates tab.`);
            return;
        }
        setProcessingId(msg.id);
        try {
            const canOpen = await Linking.canOpenURL(url);
            if (!canOpen) {
                Alert.alert('No Email App Found', 'Please set up an email app on this device.');
                return;
            }
            await Linking.openURL(url);
            await markEmailSent(msg.id);
            setPendingList((prev) => prev.filter((m) => m.id !== msg.id));
            setHandledCount((n) => n + 1);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not open email app.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleCancel = (id: string) => {
        Alert.alert('Cancel Email', 'Are you sure you want to skip sending this email?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
                    try {
                        await cancelMessage(id);
                        setPendingList((prev) => prev.filter((m) => m.id !== id));
                        setHandledCount((n) => n + 1);
                    } catch (e: any) {
                        Alert.alert('Error', e.message || 'Could not cancel.');
                    }
                }
            },
        ]);
    };

    if (loading) return <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 50 }} />;

    return (
        <View style={{ flex: 1 }}>
            <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>Tap "Send" to open your email app — subject/body are pre-filled.</Text>
            </View>
            <FlatList
                data={pendingList}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 20 }}
                refreshControl={
                    <RefreshControl refreshing={pendingRefreshing} onRefresh={onRefresh} colors={['#1565c0']} tintColor="#1565c0" />
                }
                ListHeaderComponent={pendingTotal - handledCount > 0 ? <Text style={{ textAlign: 'right', fontSize: 12, color: 'gray', marginBottom: 6 }}>Pending: {pendingTotal - handledCount}</Text> : null}
                ListFooterComponent={pendingHasMore ? (
                    <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMorePending} disabled={pendingLoadingMore}>
                        {pendingLoadingMore ? <ActivityIndicator color="#3b5998" /> : <Text style={styles.loadMoreText}>Load more ({pendingTotal - handledCount - pendingList.length} remaining)</Text>}
                    </TouchableOpacity>
                ) : null}
                ListEmptyComponent={
                    <View style={{ alignItems: 'center', marginTop: 50 }}>
                        <Ionicons name="checkmark-done-circle" size={60} color="#ccc" />
                        <Text style={{ color: 'gray', marginTop: 10 }}>All emails are sent! You're caught up.</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.toText}>✉️ {item.to}</Text>
                            <Text style={styles.templateText}>Template: <Text style={{ fontWeight: 'bold' }}>{item.templateName}</Text></Text>
                            <Text style={styles.dateText}>Generated: {new Date(item.createdAt).toLocaleString()}</Text>
                        </View>
                        <View style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginLeft: 10 }}>
                            <TouchableOpacity onPress={() => handleCancel(item.id)}>
                                <Ionicons name="close-circle" size={24} color="#ccc" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.sendBtn} onPress={() => handleSendEmail(item)} disabled={processingId === item.id}>
                                {processingId === item.id ? <ActivityIndicator color="white" size="small" /> : (
                                    <>
                                        <Ionicons name="paper-plane" size={16} color="white" />
                                        <Text style={styles.sendText}>Send</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            />
        </View>
    );
};

// ====================================================================
// SENT HISTORY TAB
// ====================================================================
const STATUS_COLORS: Record<string, string> = {
    SENT: '#2e7d32',
    FAILED: '#d32f2f',
    PENDING: '#e67e22',
    CANCELLED: '#999',
};

const SentHistoryTab = () => {
    const { currentUser } = useData();
    const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'email'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | MessageStatus>('all');

    // 🔥 SENT HISTORY — server-paged (20 at a time, Load more). This table
    // grows with every message, so it is never downloaded whole.
    const historyFilters = useMemo(() => ({
        channel: channelFilter === 'all' ? undefined : channelFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
    }), [channelFilter, statusFilter]);
    const {
        items: messages,
        total: historyTotal,
        loading,
        loadingMore: historyLoadingMore,
        hasMore: historyHasMore,
        loadMore: loadMoreHistory,
        refreshing: historyRefreshing,
        refresh: refreshHistory,
    } = useServerPagedList<{ channel?: MessageChannel; status?: MessageStatus }, OutboundMessage>({
        fetchPage: fetchOutboundMessagesPage,
        filters: historyFilters,
        enabled: !!currentUser?.companyId,
        cacheKey: channelFilter === 'all' && statusFilter === 'all' ? buildCacheKey('message_history_page1', currentUser?.companyId) : null,
    });

    return (
        <View style={{ flex: 1 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8, maxHeight: 40 }} contentContainerStyle={{ alignItems: 'center' }}>
                {(['all', 'whatsapp', 'email'] as const).map((c) => (
                    <TouchableOpacity key={c} style={[styles.filterChip, channelFilter === c && styles.filterChipActive]} onPress={() => setChannelFilter(c)}>
                        <Text style={[styles.filterChipText, channelFilter === c && { color: 'white' }]}>{c === 'all' ? 'All Channels' : c === 'whatsapp' ? 'WhatsApp' : 'Email'}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, maxHeight: 40 }} contentContainerStyle={{ alignItems: 'center' }}>
                {(['all', 'SENT', 'FAILED', 'PENDING', 'CANCELLED'] as const).map((s) => (
                    <TouchableOpacity key={s} style={[styles.filterChip, statusFilter === s && styles.filterChipActive]} onPress={() => setStatusFilter(s)}>
                        <Text style={[styles.filterChipText, statusFilter === s && { color: 'white' }]}>{s === 'all' ? 'All Status' : s}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {loading ? (
                <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 30 }} />
            ) : (
                <FlatList
                    data={messages}
                    keyExtractor={(item) => item.id}
                    refreshControl={
                        <RefreshControl refreshing={historyRefreshing} onRefresh={refreshHistory} colors={['#3b5998']} tintColor="#3b5998" />
                    }
                    ListEmptyComponent={<Text style={{ textAlign: 'center', color: 'gray', marginTop: 30 }}>No messages found.</Text>}
                    ListHeaderComponent={historyTotal > 0 ? <Text style={{ textAlign: 'right', fontSize: 12, color: 'gray', marginBottom: 6 }}>Total: {historyTotal}</Text> : null}
                    ListFooterComponent={historyHasMore ? (
                        <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreHistory} disabled={historyLoadingMore}>
                            {historyLoadingMore ? <ActivityIndicator color="#3b5998" /> : <Text style={styles.loadMoreText}>Load more ({historyTotal - messages.length} remaining)</Text>}
                        </TouchableOpacity>
                    ) : <View style={{ height: 30 }} />}
                    renderItem={({ item }) => (
                        <View style={styles.historyCard}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                <Ionicons name={item.channel === 'whatsapp' ? 'logo-whatsapp' : 'mail'} size={16} color={item.channel === 'whatsapp' ? '#25D366' : '#1565c0'} />
                                <Text style={styles.historyTo}> {item.to}</Text>
                                <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[item.status] || '#999') + '20' }]}>
                                    <Text style={[styles.statusPillText, { color: STATUS_COLORS[item.status] || '#999' }]}>{item.status}</Text>
                                </View>
                            </View>
                            <Text style={styles.historyTemplate}>Template: {item.templateName}</Text>
                            <Text style={styles.historyDate}>{new Date(item.createdAt).toLocaleString()}</Text>
                            {item.status === 'FAILED' && item.failureReason ? (
                                <Text style={styles.failureReason}>⚠️ {item.failureReason}</Text>
                            ) : null}
                        </View>
                    )}
                />
            )}
        </View>
    );
};

// ====================================================================
// BROADCAST TAB
// ====================================================================
type Audience = 'Customers' | 'Leads' | 'Both';
type Channel = 'WhatsApp' | 'Email' | 'Both';


const BroadcastTab = () => {
    const { currentUser } = useData();
    const [audience, setAudience] = useState<Audience>('Customers');
    const [channel, setChannel] = useState<Channel>('Both');
    const [subject, setSubject] = useState('');
    const [messageBody, setMessageBody] = useState('');

    const [searchText, setSearchText] = useState('');
    const [selectedType, setSelectedType] = useState('All');
    // Selection: by default everyone matching the filter is selected ("all
    // except these"); after "Deselect all" only hand-picked contacts are.
    const [selectAllMatching, setSelectAllMatching] = useState(true);
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
    const [picked, setPicked] = useState<Map<string, AudienceContact>>(new Map());
    const [isSending, setIsSending] = useState(false);
    const [testContact, setTestContact] = useState('');

    // 🔥 AUDIENCE — built and filtered on the server (one row per mobile/email),
    // 50 at a time. Was: every organization (500) + every lead (1000, with
    // full history) downloaded and filtered on the phone.
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 400);
        return () => clearTimeout(t);
    }, [searchText]);
    const audienceFilter = useMemo<AudienceFilter>(() => ({
        audience: audience === 'Customers' ? 'customers' : audience === 'Leads' ? 'leads' : 'both',
        type: selectedType === 'All' ? undefined : selectedType,
        search: debouncedSearch || undefined,
    }), [audience, selectedType, debouncedSearch]);
    const {
        items: contacts,
        total: matchingTotal,
        loading: loadingContacts,
        loadingMore: contactsLoadingMore,
        hasMore: contactsHasMore,
        loadMore: loadMoreContacts,
        refreshing: contactsRefreshing,
        refresh: onRefreshContacts,
    } = useServerPagedList<AudienceFilter, AudienceContact>({
        fetchPage: fetchAudiencePage,
        filters: audienceFilter,
        enabled: !!currentUser?.companyId,
        pageSize: 50,
    });

    // A new filter starts a new selection: everyone matching it.
    useEffect(() => {
        setSelectAllMatching(true);
        setExcludedIds(new Set());
        setPicked(new Map());
    }, [audienceFilter]);

    const [orgTypes, setOrgTypes] = useState<string[]>([]);
    useEffect(() => {
        if (!currentUser?.companyId) return;
        fetchAudienceTypes().then(setOrgTypes).catch(() => {});
    }, [currentUser?.companyId]);
    const availableTypes = ['All', ...(audience === 'Customers' ? orgTypes : [...orgTypes, 'Lead'])];

    const isSelected = (id: string) => (selectAllMatching ? !excludedIds.has(id) : picked.has(id));
    const selectedCount = selectAllMatching ? Math.max(0, matchingTotal - excludedIds.size) : picked.size;

    const toggleSelection = (c: AudienceContact) => {
        if (selectAllMatching) {
            const next = new Set(excludedIds);
            if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
            setExcludedIds(next);
        } else {
            const next = new Map(picked);
            if (next.has(c.id)) next.delete(c.id); else next.set(c.id, c);
            setPicked(next);
        }
    };

    const toggleSelectAll = () => {
        if (selectAllMatching && excludedIds.size === 0) {
            setSelectAllMatching(false);
            setPicked(new Map());
        } else {
            setSelectAllMatching(true);
            setExcludedIds(new Set());
        }
    };

    // targets = explicit list (test / hand-picked); 'audience' = everyone
    // matching the filter except the unticked ones (resolved on the server).
    const runBroadcast = async (targets: { name: string; email?: string; phone?: string }[] | 'audience') => {
        setIsSending(true);
        try {
            const apiChannel = channel === 'WhatsApp' ? 'whatsapp' : channel === 'Email' ? 'email' : 'both';
            const shared = { broadcast_subject: subject, broadcast_message: messageBody };
            const result = targets === 'audience'
                ? await sendBroadcast({
                    channel: apiChannel, templateName: 'bulk_broadcast',
                    audienceFilter, excludeIds: Array.from(excludedIds), variables: shared,
                })
                : await sendBroadcast({
                    channel: apiChannel, templateName: 'bulk_broadcast',
                    recipients: targets.map((t) => ({
                        email: t.email || undefined,
                        phone: t.phone || undefined,
                        variables: { customer_name: t.name, ...shared },
                    })),
                });
            const sent = result.results.filter((r) => r.status === 'SENT').length;
            const failed = result.results.filter((r) => r.status === 'FAILED').length;
            const pending = result.results.filter((r) => r.status === 'PENDING').length;
            Alert.alert('Broadcast Complete', `Total: ${result.total}\n✅ Sent: ${sent}\n⏳ Queued: ${pending}\n❌ Failed: ${failed}`);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Broadcast failed.');
        } finally {
            setIsSending(false);
        }
    };

    const handleSendTest = () => {
        if (!messageBody.trim()) { Alert.alert('Required', 'Please write a message to test.'); return; }
        if (!testContact.trim()) { Alert.alert('Required', 'Enter a phone number or email to send the test to.'); return; }
        const isEmail = testContact.includes('@');
        Alert.alert('Test Mode 🧪', `Sending a test message to ${testContact}.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Send Test', onPress: () => runBroadcast([{ name: 'Test', email: isEmail ? testContact.trim() : undefined, phone: !isEmail ? testContact.trim() : undefined }]) },
        ]);
    };

    const handleSendBroadcast = () => {
        if (!messageBody.trim()) { Alert.alert('Required', 'Please write a message.'); return; }
        if (channel !== 'WhatsApp' && !subject.trim()) { Alert.alert('Required', 'Please enter a subject (used for email).'); return; }
        if (selectedCount === 0) { Alert.alert('Empty List', 'Please select at least one contact.'); return; }
        Alert.alert('Double Confirmation ⚠️', `Send this message to ${selectedCount} contacts via ${channel}?`, [
            { text: 'No, Cancel', style: 'cancel' },
            {
                text: 'Yes, Send 🔥', style: 'destructive', onPress: () => runBroadcast(
                    selectAllMatching
                        ? 'audience'
                        : Array.from(picked.values()).map((t) => ({ name: t.name, email: t.email || undefined, phone: t.mobile || undefined }))
                )
            },
        ]);
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 30 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl refreshing={contactsRefreshing} onRefresh={onRefreshContacts} colors={['#3b5998']} tintColor="#3b5998" />
                }
            >
                <View style={styles.infoBanner}>
                    <Text style={styles.infoBannerText}>Uses the "bulk_broadcast" template (create both email + whatsapp types in the Templates tab first).</Text>
                </View>

                <Text style={styles.sectionTitle}>1. Audience</Text>
                <View style={styles.pillRow}>
                    {(['Customers', 'Leads', 'Both'] as Audience[]).map((a) => (
                        <TouchableOpacity key={a} style={[styles.pill, audience === a && styles.pillActive]} onPress={() => setAudience(a)}>
                            <Text style={[styles.pillText, audience === a && { color: 'white' }]}>{a}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={styles.sectionTitle}>2. Channel</Text>
                <View style={styles.pillRow}>
                    {(['WhatsApp', 'Email', 'Both'] as Channel[]).map((c) => (
                        <TouchableOpacity key={c} style={[styles.pill, channel === c && styles.pillActive]} onPress={() => setChannel(c)}>
                            <Text style={[styles.pillText, channel === c && { color: 'white' }]}>{c}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={styles.sectionTitle}>3. Message</Text>
                {channel !== 'WhatsApp' && <TextInput style={styles.input} placeholder="Subject (for Email)" value={subject} onChangeText={setSubject} />}
                <TextInput style={[styles.input, { height: 90, textAlignVertical: 'top' }]} placeholder="Type your broadcast message..." value={messageBody} onChangeText={setMessageBody} multiline />

                <View style={styles.testRow}>
                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Test phone or email" value={testContact} onChangeText={setTestContact} autoCapitalize="none" />
                    <TouchableOpacity style={styles.testBtn} onPress={handleSendTest} disabled={isSending}>
                        <Text style={styles.testBtnText}>Test</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.sectionTitle}>4. Recipients ({selectedCount} of {matchingTotal} selected)</Text>
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={18} color="gray" />
                    <TextInput style={styles.searchInput} placeholder="Search name, org, mobile..." value={searchText} onChangeText={setSearchText} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8, maxHeight: 40 }} contentContainerStyle={{ alignItems: 'center' }}>
                    {availableTypes.map((t) => (
                        <TouchableOpacity key={t} style={[styles.filterChip, selectedType === t && styles.filterChipActive]} onPress={() => setSelectedType(t)}>
                            <Text style={[styles.filterChipText, selectedType === t && { color: 'white' }]}>{t}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <TouchableOpacity onPress={toggleSelectAll} style={{ marginBottom: 8 }}>
                    <Text style={{ color: '#3b5998', fontWeight: 'bold', fontSize: 12 }}>
                        {selectAllMatching && excludedIds.size === 0 ? `Deselect all (${matchingTotal})` : `Select all matching (${matchingTotal})`}
                    </Text>
                </TouchableOpacity>

                {loadingContacts ? <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 20 }} /> : (
                    <FlatList
                        data={contacts}
                        keyExtractor={(item) => item.id}
                        scrollEnabled={false}
                        ListEmptyComponent={<Text style={{ textAlign: 'center', color: 'gray', marginTop: 20 }}>No contacts found.</Text>}
                        ListFooterComponent={contactsHasMore ? (
                            <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreContacts} disabled={contactsLoadingMore}>
                                {contactsLoadingMore ? <ActivityIndicator color="#3b5998" /> : <Text style={styles.loadMoreText}>Load more ({matchingTotal - contacts.length} remaining)</Text>}
                            </TouchableOpacity>
                        ) : null}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.contactRow} onPress={() => toggleSelection(item)}>
                                <Ionicons name={isSelected(item.id) ? 'checkbox' : 'square-outline'} size={22} color={isSelected(item.id) ? '#2e7d32' : '#ccc'} />
                                <View style={{ marginLeft: 10, flex: 1 }}>
                                    <Text style={styles.contactName}>{item.name} {item.orgName ? `(${item.orgName})` : ''}</Text>
                                    <Text style={styles.contactSub}>{item.mobile || '—'} {item.email ? `• ${item.email}` : ''}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                )}

                <TouchableOpacity style={styles.broadcastSendBtn} onPress={handleSendBroadcast} disabled={isSending}>
                    {isSending ? <ActivityIndicator color="white" /> : <Text style={styles.broadcastSendBtnText}>🔥 Send Broadcast</Text>}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
    loadMoreText: { fontWeight: 'bold', color: '#3b5998' },
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { backgroundColor: '#3b5998', padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    tabContainer: { flexDirection: 'row', backgroundColor: 'white', elevation: 2 },
    tabBtn: { paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent', minWidth: 100 },
    activeTabBtn: { borderBottomColor: '#3b5998' },
    tabText: { color: 'gray', fontWeight: '600', fontSize: 13 },
    activeTabText: { color: '#3b5998', fontWeight: 'bold' },

    infoBanner: { backgroundColor: '#e3f2fd', padding: 12, borderRadius: 10, marginBottom: 10 },
    infoBannerText: { color: '#1565c0', fontWeight: '600', fontSize: 12, lineHeight: 17 },

    card: { flexDirection: 'row', backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 1 },
    toText: { fontSize: 15, fontWeight: 'bold', color: '#333' },
    templateText: { fontSize: 13, color: '#555', marginTop: 5 },
    dateText: { fontSize: 11, color: 'gray', marginTop: 5 },
    sendBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1565c0', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, marginTop: 10, minWidth: 70, justifyContent: 'center' },
    sendText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },

    filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', marginRight: 6 },
    filterChipActive: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
    filterChipText: { fontSize: 11, fontWeight: '600', color: '#555' },

    historyCard: { backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 8, elevation: 1 },
    historyTo: { fontWeight: 'bold', color: '#333', fontSize: 13, flex: 1 },
    statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    statusPillText: { fontSize: 10, fontWeight: 'bold' },
    historyTemplate: { fontSize: 12, color: '#666', marginTop: 3 },
    historyDate: { fontSize: 11, color: '#999', marginTop: 2 },
    failureReason: { fontSize: 11, color: '#d32f2f', marginTop: 4, fontStyle: 'italic' },

    sectionTitle: { fontSize: 13, fontWeight: '700', color: '#555', marginTop: 14, marginBottom: 8, textTransform: 'uppercase' },
    pillRow: { flexDirection: 'row', gap: 8 },
    pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'white', borderWidth: 1.5, borderColor: '#ddd' },
    pillActive: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
    pillText: { fontSize: 13, fontWeight: '600', color: '#555' },
    input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10, fontSize: 14 },
    testRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 6 },
    testBtn: { backgroundColor: '#e67e22', paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center' },
    testBtnText: { color: 'white', fontWeight: 'bold' },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ddd', height: 42, gap: 8, marginBottom: 10 },
    searchInput: { flex: 1, fontSize: 13 },
    contactRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 6, elevation: 1 },
    contactName: { fontSize: 13, fontWeight: 'bold', color: '#333' },
    contactSub: { fontSize: 11, color: '#777', marginTop: 2 },
    broadcastSendBtn: { backgroundColor: '#d32f2f', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 20, elevation: 3 },
    broadcastSendBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
