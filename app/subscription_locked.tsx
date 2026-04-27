import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth } from '../firebaseConfig';

export default function SubscriptionLocked() {
    const router = useRouter();

    const handleLogout = async () => {
        await signOut(auth);
        router.replace('/login');
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
                <Text style={styles.cardTitle}>Contact Admin</Text>
                <Text style={styles.cardText}>📞 +91 98765 43210</Text>
                <Text style={styles.cardText}>📧 support@mycrm.com</Text>
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
    card: { backgroundColor: '#f5f5f5', padding: 20, borderRadius: 10, width: '100%', marginTop: 30, alignItems: 'center' },
    cardTitle: { fontWeight: 'bold', fontSize: 18, marginBottom: 10 },
    cardText: { fontSize: 16, color: '#333', marginBottom: 5 },
    btn: { marginTop: 40, paddingHorizontal: 30, paddingVertical: 12, backgroundColor: '#333', borderRadius: 25 },
    btnText: { color: 'white', fontWeight: 'bold' }
});