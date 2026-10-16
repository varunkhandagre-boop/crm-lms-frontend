import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { onUpdateRequired } from '../services/api/client';
import { AppVersionStatus, checkAppVersion } from '../services/api/appVersion';
import { APP_PLATFORM, APP_VERSION } from '../utils/appVersion';

const DISMISSED_KEY = 'app_update_dismissed_version';
const RECHECK_MS = 6 * 60 * 60 * 1000; // when the app comes back to the front

type Prompt =
    | { kind: 'required'; message: string; storeUrl: string | null }
    | { kind: 'available'; status: AppVersionStatus };

/**
 * Phone builds only. Asks the server on start (and when the app returns to the
 * front, at most every 6 h) whether a newer version exists:
 * - below the minimum version → full-screen "Update required" (no way past it);
 *   also shown when any API call answers 426 APP_UPDATE_REQUIRED.
 * - below the latest version → "Update available" once per new version (Later).
 */
export default function AppUpdateGate() {
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    const lastCheck = useRef(0);

    const runCheck = useCallback(async () => {
        lastCheck.current = Date.now();
        const status = await checkAppVersion();
        if (!status) return;
        if (status.updateRequired) {
            setPrompt({ kind: 'required', message: status.message, storeUrl: status.storeUrl });
            return;
        }
        if (!status.updateAvailable || !status.latestVersion) {
            setPrompt(p => (p?.kind === 'required' ? null : p)); // the minimum was lowered again
            return;
        }
        let dismissed: string | null = null;
        try { dismissed = await AsyncStorage.getItem(DISMISSED_KEY); } catch { /* storage unavailable */ }
        if (dismissed === status.latestVersion) return;
        setPrompt(p => (p?.kind === 'required' ? p : { kind: 'available', status }));
    }, []);

    useEffect(() => {
        if (!APP_PLATFORM) return;
        // Deferred so the first check never sets state inside the effect itself.
        const first = setTimeout(runCheck, 0);
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active' && Date.now() - lastCheck.current > RECHECK_MS) runCheck();
        });
        const off = onUpdateRequired(info => setPrompt({ kind: 'required', message: info.message, storeUrl: info.storeUrl }));
        return () => { clearTimeout(first); sub.remove(); off(); };
    }, [runCheck]);

    if (!APP_PLATFORM || !prompt) return null;

    const storeUrl = prompt.kind === 'required' ? prompt.storeUrl : prompt.status.storeUrl;
    const storeName = Platform.OS === 'ios' ? 'App Store' : 'Play Store';
    const openStore = () => {
        if (storeUrl) Linking.openURL(storeUrl).catch(() => {});
    };

    if (prompt.kind === 'required') {
        return (
            <View style={styles.blocker} accessibilityViewIsModal>
                <View style={styles.iconCircle}>
                    <Ionicons name="cloud-download" size={46} color="#1565c0" />
                </View>
                <Text style={styles.blockTitle}>Update required</Text>
                <Text style={styles.blockText}>{prompt.message}</Text>
                <Text style={styles.versionText}>Installed version: {APP_VERSION}</Text>
                {storeUrl ? (
                    <TouchableOpacity style={styles.primaryBtn} onPress={openStore} accessibilityRole="button">
                        <Ionicons name={Platform.OS === 'ios' ? 'logo-apple-appstore' : 'logo-google-playstore'} size={18} color="white" style={{ marginRight: 8 }} />
                        <Text style={styles.primaryText}>Update from {storeName}</Text>
                    </TouchableOpacity>
                ) : (
                    <Text style={styles.blockText}>Open the {storeName} and update LMS CRM.</Text>
                )}
            </View>
        );
    }

    const later = async () => {
        try { await AsyncStorage.setItem(DISMISSED_KEY, prompt.status.latestVersion ?? ''); } catch { /* storage unavailable */ }
        setPrompt(null);
    };

    return (
        <Modal transparent animationType="fade" visible onRequestClose={later}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <View style={styles.cardHead}>
                        <Ionicons name="sparkles" size={22} color="#1565c0" />
                        <Text style={styles.cardTitle}>New version {prompt.status.latestVersion}</Text>
                    </View>
                    <Text style={styles.cardText}>{prompt.status.message}</Text>
                    <Text style={styles.versionText}>You have {APP_VERSION}</Text>
                    <View style={styles.row}>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={later} accessibilityRole="button">
                            <Text style={styles.secondaryText}>Later</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.primaryBtn, styles.rowBtn, !storeUrl && { opacity: 0.5 }]}
                            disabled={!storeUrl}
                            onPress={() => { openStore(); later(); }}
                            accessibilityRole="button"
                        >
                            <Text style={styles.primaryText}>Update now</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    blocker: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 100000,
        elevation: 100,
        backgroundColor: '#f4f7fb',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
    },
    iconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center' },
    blockTitle: { fontSize: 22, fontWeight: 'bold', color: '#0d47a1', marginTop: 18 },
    blockText: { fontSize: 15, color: '#444', textAlign: 'center', lineHeight: 22, marginTop: 10 },
    versionText: { fontSize: 12, color: '#888', marginTop: 8, textAlign: 'center' },
    primaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#1565c0', paddingVertical: 13, paddingHorizontal: 22, borderRadius: 12, marginTop: 22,
    },
    primaryText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
    card: { backgroundColor: 'white', borderRadius: 16, padding: 20, maxWidth: 420, width: '100%', alignSelf: 'center' },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#0d47a1' },
    cardText: { fontSize: 14, color: '#444', lineHeight: 21, marginTop: 10 },
    row: { flexDirection: 'row', gap: 10, marginTop: 4 },
    rowBtn: { flex: 1 },
    secondaryBtn: {
        flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 22,
        borderWidth: 1.5, borderColor: '#cfd8dc', borderRadius: 12, paddingVertical: 13,
    },
    secondaryText: { color: '#455a64', fontWeight: 'bold', fontSize: 15 },
});
