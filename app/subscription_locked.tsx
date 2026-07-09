import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Animated, Linking,
    StyleSheet, Text, TouchableOpacity, View
} from 'react-native';
import { useData } from './context/DataContext';

export default function SubscriptionLocked() {
    const router = useRouter();
    const { logout, currentUser } = useData();

    // ✅ 1. Expiry kitne din pehle hui
    const [daysExpired, setDaysExpired] = useState(0);
    const [companyName, setCompanyName] = useState('');
    const [loggingOut, setLoggingOut] = useState(false);

    // ✅ 2. Lock icon animation
    const shakeAnim = new Animated.Value(0);

    useEffect(() => {
        // Company name set karo
        setCompanyName(currentUser?.companyId || '');

        // Shake animation
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 100, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        ]).start();

        // Expiry days calculate karo DataContext se
        // currentUser me companyId hai, usse hum kuch nahi kar sakte yahan
        // But agar aapne expiryDate context me pass ki ho toh:
        // const diff = Math.floor((new Date() - new Date(expiryDate)) / 86400000);
        // setDaysExpired(diff);
    }, []);

    const handleLogout = async () => {
        setLoggingOut(true);
        await logout();
        router.replace('/login' as any);
    };

    // ✅ 3. WhatsApp pe direct message
    const handleWhatsApp = () => {
        const msg = `Hi, My company subscription has expired. Company ID: ${currentUser?.companyId || 'N/A'}. Please help me renew.`;
        Linking.openURL(`https://wa.me/918770530146?text=${encodeURIComponent(msg)}`);
    };

    // ✅ 4. Email open karo
    const handleEmail = () => {
        Linking.openURL(`mailto:support@yourcrm.com?subject=Plan Renewal - ${currentUser?.companyId}&body=Please renew my plan.`);
    };

    // ✅ 5. Call karo
    const handleCall = () => {
        Linking.openURL('tel:+918770530146');
    };

    return (
        <View style={styles.container}>

            {/* TOP RED STRIP */}
            <View style={styles.topStrip}>
                <Text style={styles.stripText}>⚠️ SUBSCRIPTION EXPIRED</Text>
            </View>

            {/* ANIMATED LOCK ICON */}
            <Animated.View style={{ transform: [{ translateX: shakeAnim }], marginTop: 40 }}>
                <View style={styles.iconCircle}>
                    <Ionicons name="lock-closed" size={60} color="#d32f2f" />
                </View>
            </Animated.View>

            {/* TITLE */}
            <Text style={styles.title}>Access Locked</Text>
            <Text style={styles.subtitle}>Your subscription plan has expired</Text>

            {/* INFO CARD */}
            <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                    <Ionicons name="business" size={18} color="#666" />
                    <Text style={styles.infoText}>
                        Company ID: {currentUser?.companyId || 'N/A'}
                    </Text>
                </View>
                <View style={styles.infoRow}>
                    <Ionicons name="person" size={18} color="#666" />
                    <Text style={styles.infoText}>
                        User: {currentUser?.name || 'N/A'}
                    </Text>
                </View>
                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                    <Ionicons name="calendar" size={18} color="#d32f2f" />
                    <Text style={[styles.infoText, { color: '#d32f2f', fontWeight: 'bold' }]}>
                        Plan has expired — Renew to continue
                    </Text>
                </View>
            </View>

            {/* CONTACT SUPPORT */}
            <Text style={styles.sectionTitle}>Contact Support to Renew</Text>

            {/* WHATSAPP BUTTON */}
            <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsApp}>
                <Ionicons name="logo-whatsapp" size={22} color="white" />
                <Text style={styles.whatsappText}>Chat on WhatsApp</Text>
            </TouchableOpacity>

            {/* CALL + EMAIL ROW */}
            <View style={styles.contactRow}>
                <TouchableOpacity style={styles.contactBtn} onPress={handleCall}>
                    <Ionicons name="call" size={20} color="#3b5998" />
                    <Text style={styles.contactBtnText}>Call Us</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.contactBtn} onPress={handleEmail}>
                    <Ionicons name="mail" size={20} color="#3b5998" />
                    <Text style={styles.contactBtnText}>Email Us</Text>
                </TouchableOpacity>
            </View>

            {/* LOGOUT */}
            <TouchableOpacity 
                style={styles.logoutBtn} 
                onPress={handleLogout}
                disabled={loggingOut}
            >
                {loggingOut 
                    ? <ActivityIndicator color="white" size="small" />
                    : <>
                        <Ionicons name="log-out-outline" size={18} color="white" />
                        <Text style={styles.logoutText}>Logout</Text>
                      </>
                }
            </TouchableOpacity>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, alignItems: 'center', 
        backgroundColor: '#fff', paddingHorizontal: 20 
    },
    topStrip: { 
        width: '120%', backgroundColor: '#d32f2f', 
        paddingVertical: 12, alignItems: 'center' 
    },
    stripText: { 
        color: 'white', fontWeight: 'bold', 
        fontSize: 13, letterSpacing: 1 
    },
    iconCircle: { 
        width: 110, height: 110, borderRadius: 55, 
        backgroundColor: '#fdecea', justifyContent: 'center', 
        alignItems: 'center', borderWidth: 2, borderColor: '#d32f2f' 
    },
    title: { 
        fontSize: 26, fontWeight: 'bold', 
        color: '#d32f2f', marginTop: 15 
    },
    subtitle: { 
        color: '#888', fontSize: 14, marginTop: 5 
    },
    infoCard: { 
        width: '100%', backgroundColor: '#f9f9f9', 
        borderRadius: 12, padding: 15, marginTop: 20, 
        borderWidth: 1, borderColor: '#eee' 
    },
    infoRow: { 
        flexDirection: 'row', alignItems: 'center', 
        paddingVertical: 10, borderBottomWidth: 1, 
        borderBottomColor: '#eee', gap: 10 
    },
    infoText: { fontSize: 14, color: '#444', flex: 1 },
    sectionTitle: { 
        fontWeight: 'bold', color: '#333', 
        fontSize: 15, marginTop: 25, marginBottom: 12 
    },
    whatsappBtn: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#25D366', paddingVertical: 14, 
        paddingHorizontal: 30, borderRadius: 12, 
        gap: 10, width: '100%', justifyContent: 'center',
        elevation: 3
    },
    whatsappText: { 
        color: 'white', fontWeight: 'bold', fontSize: 16 
    },
    contactRow: { 
        flexDirection: 'row', gap: 10, 
        width: '100%', marginTop: 10 
    },
    contactBtn: { 
        flex: 1, flexDirection: 'row', alignItems: 'center', 
        justifyContent: 'center', gap: 8, paddingVertical: 12, 
        borderRadius: 10, borderWidth: 1, 
        borderColor: '#3b5998', backgroundColor: '#f0f4ff' 
    },
    contactBtnText: { 
        color: '#3b5998', fontWeight: 'bold', fontSize: 14 
    },
    logoutBtn: { 
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginTop: 25, paddingHorizontal: 40, paddingVertical: 13, 
        backgroundColor: '#333', borderRadius: 25, elevation: 3 
    },
    logoutText: { 
        color: 'white', fontWeight: 'bold', fontSize: 16 
    }
});