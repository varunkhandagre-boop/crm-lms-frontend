import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// 🔥 SAAS IMPORTS (Direct Firebase imports removed)
import { useData } from './context/DataContext';

export default function SubscriptionLocked() {
    const router = useRouter();

    // 🔥 1. SaaS Centralized Logout
    const { logout } = useData();

    const handleLogout = async () => {
        await logout();
        router.replace('/login' as any);
    };

    return (
        <View style={styles.container}>
            <Ionicons name="lock-closed" size={80} color="#d32f2f" />
            <Text style={styles.title}>Plan Expired</Text>
            <Text style={styles.message}>
                Your company's subscription plan has expired. 
                {"\n"}Please contact support to renew your services.
            </Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Contact Support</Text>
                <Text style={styles.cardText}>📞 +91 87705 30146</Text>
                <Text style={styles.cardText}>📧 support@yourcrm.com</Text>
            </View>

            <TouchableOpacity style={styles.btn} onPress={handleLogout}>
                <Text style={styles.btnText}>Logout</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' },
    title: { fontSize: 28, fontWeight: 'bold', color: '#d32f2f', marginTop: 20 },
    message: { textAlign: 'center', color: '#555', marginTop: 10, fontSize: 16, lineHeight: 24 },
    card: { backgroundColor: '#f5f5f5', padding: 20, borderRadius: 10, width: '100%', marginTop: 30, alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
    cardTitle: { fontWeight: 'bold', fontSize: 18, marginBottom: 10, color: '#333' },
    cardText: { fontSize: 16, color: '#555', marginBottom: 5 },
    btn: { marginTop: 40, paddingHorizontal: 30, paddingVertical: 12, backgroundColor: '#333', borderRadius: 25, elevation: 3 },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});