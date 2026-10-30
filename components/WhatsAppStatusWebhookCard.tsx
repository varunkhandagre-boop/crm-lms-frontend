import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { fetchStatusWebhook, regenerateStatusWebhook, StatusWebhook } from '../services/api/automationSettings';

type Provider = 'meta_cloud' | 'aisensy' | 'wati';

const STEPS: Record<Provider, string[]> = {
    meta_cloud: [
        'Open developers.facebook.com → your app → WhatsApp → Configuration.',
        'Webhook → Edit: paste the Webhook URL as "Callback URL" and the Verify Token as "Verify token" → Verify and save.',
        'Webhook fields → Manage → subscribe to "messages".',
    ],
    wati: [
        'Open Wati → Webhooks → Add Webhook.',
        'Paste the Webhook URL and turn on: Template message sent, Message delivered, Message read, Template message failed.',
        'Save.',
    ],
    aisensy: [
        'Open AiSensy → Manage → Webhooks (if you don\'t see it, ask AiSensy support to enable webhooks for your plan).',
        'Add the Webhook URL and choose the message status events (sent, delivered, read, failed).',
        'Save.',
    ],
};

// WhatsApp & Email Settings → shows the company's status-webhook URL, so Sent
// History can show ✓✓ Delivered and Read for WhatsApp messages.
export default function WhatsAppStatusWebhookCard({ provider }: { provider: Provider }) {
    const [hook, setHook] = useState<StatusWebhook | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    // Folded by default: it is a one-time setup, not something to fill each visit.
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open || hook) return;
        fetchStatusWebhook().then(setHook).catch((e) => setError(e.message || 'Could not load the webhook URL.'));
    }, [open, hook]);

    const copy = async (text: string, what: string) => {
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', `${what} copied.`);
    };

    const regenerate = () => {
        Alert.alert('New webhook URL?', 'The old URL stops working. You must paste the new one in your WhatsApp provider again.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Make new URL', style: 'destructive', onPress: async () => {
                    setBusy(true);
                    try { setHook(await regenerateStatusWebhook()); } catch (e: any) { Alert.alert('Error', e.message || 'Could not change the URL.'); } finally { setBusy(false); }
                },
            },
        ]);
    };

    return (
        <View style={styles.card}>
            <TouchableOpacity style={styles.titleRow} onPress={() => setOpen((o) => !o)}>
                <Ionicons name="checkmark-done" size={20} color="#34B7F1" />
                <Text style={styles.title}>Delivered & Read status (optional)</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#888" />
            </TouchableOpacity>
            {!open ? (
                <Text style={styles.hint}>One-time setup in your WhatsApp provider for ✓✓ ticks in Sent History. Tap to see the Webhook URL.</Text>
            ) : (<>
            <Text style={styles.hint}>
                Connect this once and Sent History shows ✓✓ Delivered and Read for each WhatsApp message, and messages that never reached the phone move to Failed with the reason. Works for messages sent after it is connected.
            </Text>

            {!hook ? (
                error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#3b5998" style={{ marginVertical: 12 }} />
            ) : (
                <>
                    <Text style={styles.label}>Webhook URL</Text>
                    <View style={styles.valueRow}>
                        <Text style={styles.value} selectable>{hook.url}</Text>
                        <TouchableOpacity onPress={() => copy(hook.url, 'Webhook URL')} style={styles.iconBtn}><Ionicons name="copy-outline" size={18} color="#3b5998" /></TouchableOpacity>
                    </View>
                    {provider === 'meta_cloud' ? (
                        <>
                            <Text style={styles.label}>Verify Token (Meta only)</Text>
                            <View style={styles.valueRow}>
                                <Text style={styles.value} selectable>{hook.verifyToken}</Text>
                                <TouchableOpacity onPress={() => copy(hook.verifyToken, 'Verify Token')} style={styles.iconBtn}><Ionicons name="copy-outline" size={18} color="#3b5998" /></TouchableOpacity>
                            </View>
                        </>
                    ) : null}

                    <Text style={styles.label}>Steps</Text>
                    {STEPS[provider].map((s, i) => (
                        <Text key={i} style={styles.step}>{i + 1}. {s}</Text>
                    ))}

                    <View style={styles.btnRow}>
                        <TouchableOpacity style={styles.outlineBtn} onPress={() => Share.share({ message: provider === 'meta_cloud' ? `Webhook URL: ${hook.url}\nVerify Token: ${hook.verifyToken}` : `Webhook URL: ${hook.url}` })}>
                            <Ionicons name="share-social-outline" size={16} color="#3b5998" />
                            <Text style={styles.outlineText}>Share</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.outlineBtn} onPress={regenerate} disabled={busy}>
                            {busy ? <ActivityIndicator size="small" color="#c62828" /> : <Ionicons name="refresh" size={16} color="#c62828" />}
                            <Text style={[styles.outlineText, { color: '#c62828' }]}>New URL</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.hint}>Keep this URL private — anyone with it can change message statuses.</Text>
                </>
            )}
            </>)}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#eee' },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    title: { flex: 1, fontSize: 15, fontWeight: 'bold', color: '#333', marginLeft: 8 },
    hint: { fontSize: 11, color: '#777', marginTop: 6, lineHeight: 16 },
    error: { fontSize: 12, color: '#c62828', marginTop: 10 },
    label: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 6, marginTop: 12 },
    valueRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingLeft: 10 },
    // Long URL / token with no spaces: let it wrap anywhere (web would overflow the box).
    value: { flex: 1, minWidth: 0, fontSize: 12, color: '#333', paddingVertical: 10, ...(Platform.OS === 'web' ? ({ wordBreak: 'break-all' } as any) : null) },
    iconBtn: { padding: 10 },
    step: { fontSize: 12, color: '#444', lineHeight: 18, marginBottom: 4 },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    outlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#ccd', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'white' },
    outlineText: { fontSize: 13, fontWeight: '600', color: '#3b5998' },
});
