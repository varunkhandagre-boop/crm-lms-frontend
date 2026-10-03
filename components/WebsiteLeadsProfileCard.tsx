import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { getWebsiteLeadSettings, updateWebsiteLeadSettings, WebsiteLeadSettings, websiteFormSnippet } from '../services/api/websiteLeads';

/**
 * Company Profile → "Website Leads": the company's own link for its website
 * form, the website addresses allowed to use it, and a one-tap message to send
 * to the website developer. Admin only (the API enforces it too).
 */
export default function WebsiteLeadsProfileCard() {
    const [settings, setSettings] = useState<WebsiteLeadSettings | null>(null);
    const [domainsText, setDomainsText] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getWebsiteLeadSettings()
            .then((s) => { setSettings(s); setDomainsText(s.domains.map((d) => `www.${d}`).join(', ')); })
            .catch((e) => setError(e?.message || 'Could not load'))
            .finally(() => setLoading(false));
    }, []);

    const saveDomains = async () => {
        setSaving(true);
        try {
            const list = domainsText.split(/[,\s]+/).map((d) => d.trim()).filter(Boolean);
            const updated = await updateWebsiteLeadSettings({ domains: list });
            setSettings(updated);
            setDomainsText(updated.domains.map((d) => `www.${d}`).join(', '));
            Alert.alert('Saved ✅', updated.domains.length ? `Leads will be accepted from: ${updated.domains.join(', ')}` : 'Website list cleared.');
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const shareLink = () => settings && Share.share({ message: settings.endpointUrl });

    const shareSetup = () => {
        if (!settings) return;
        const site = settings.domains[0] ? `www.${settings.domains[0]}` : '(our website)';
        Share.share({
            message:
`Website enquiry form → LMS CRM (for ${site})

1) Send every form submission as JSON with an HTTP POST to:
${settings.endpointUrl}
Header: Content-Type: application/json

2) Fields: name (required), phone (required, 10 digits), organisation, city, product_interest, message, page.
Optional: "type": "lead" (or "catalog" for a brochure download), "source", and "attribution": { "first_touch": { utm_source, utm_medium, utm_campaign, gclid, fbclid } }.

3) Any 2xx reply = saved. Show your thank-you message then.

Or paste this ready-made form into any page:

${websiteFormSnippet(settings.endpointUrl)}`,
        });
    };

    if (loading) return <View style={styles.section}><ActivityIndicator color="#3b5998" /></View>;
    if (error) return <View style={styles.section}><Text style={styles.muted}>Website Leads: {error}</Text></View>;
    if (!settings) return null;

    return (
        <View style={styles.section}>
            <Text style={styles.sectionHeader}>🌐 Website Leads</Text>
            <Text style={styles.muted}>
                Connect your company website: every enquiry form on it becomes a lead in this app automatically, with a notification.
            </Text>

            <Text style={styles.label}>1. Your website address</Text>
            <TextInput
                style={styles.input}
                value={domainsText}
                onChangeText={setDomainsText}
                placeholder="www.yourcompany.com"
                autoCapitalize="none"
                keyboardType="url"
            />
            <Text style={styles.hint}>Several websites? Separate them with commas. Only these websites can send leads.</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={saveDomains} disabled={saving}>
                {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Save website</Text>}
            </TouchableOpacity>

            <Text style={styles.label}>2. Your website-lead link</Text>
            <View style={styles.linkBox}>
                <Text selectable style={styles.linkText}>{settings.endpointUrl}</Text>
            </View>
            <View style={styles.row}>
                <TouchableOpacity style={styles.outlineBtn} onPress={shareLink}>
                    <Ionicons name="share-social-outline" size={16} color="#3b5998" />
                    <Text style={styles.outlineText}>Share link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.outlineBtn, { marginLeft: 8 }]} onPress={shareSetup}>
                    <Ionicons name="code-slash-outline" size={16} color="#3b5998" />
                    <Text style={styles.outlineText}>Send setup to developer</Text>
                </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
                Send the setup to whoever manages your website. It has the link, the fields and a ready-made form they can paste.
            </Text>

            <Text style={styles.label}>3. Who gets the leads</Text>
            <Text style={{ color: '#333', fontWeight: 'bold' }}>{settings.effectiveAssignee?.name || '—'}</Text>
            <Text style={styles.hint}>Change it in Leads → three-dot menu → Website Leads.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    section: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 1 },
    sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#3b5998', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
    muted: { fontSize: 12, color: '#666', marginBottom: 6 },
    label: { fontSize: 12, fontWeight: 'bold', color: '#555', marginTop: 12, marginBottom: 5 },
    hint: { fontSize: 11, color: 'gray', marginTop: 4 },
    input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, color: '#333' },
    saveBtn: { backgroundColor: '#3b5998', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 8 },
    saveText: { color: 'white', fontWeight: 'bold' },
    linkBox: { backgroundColor: '#f0f4ff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#d0d9ff' },
    linkText: { fontSize: 12, color: '#1a237e' },
    row: { flexDirection: 'row', marginTop: 8 },
    outlineBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#3b5998', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    outlineText: { color: '#3b5998', fontWeight: 'bold', fontSize: 12, marginLeft: 5 },
});
