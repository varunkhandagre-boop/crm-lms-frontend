import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 Phase 4: this is a PUBLIC, unauthenticated form — it does NOT use
// useSaaSDB/useData (no login exists here). It hits a dedicated public
// backend route instead, identified by a companyId in the URL.
//
// ⚠️ KNOWN GAP: the old screen never carried a companyId anywhere, so
// there's no way yet to know which company a submission belongs to.
// Whoever links/embeds this screen needs to pass ?companyId=<uuid> —
// until then this form will show an error instead of silently failing.
import { submitPublicComplaint } from '../services/api/publicComplaints';

export default function CustomerComplaintForm() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const companyId = (params.companyId as string) || '';

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const [formData, setFormData] = useState({
        hospitalName: '',
        contactPerson: '',
        mobile: '',
        machine: '',
        serialNo: '',
        issue: ''
    });

    // 🔥 SUBMIT TICKET LOGIC — via new public backend route (no auth)
    const handleSubmit = async () => {
        if (!formData.hospitalName || !formData.mobile || !formData.issue) {
            Alert.alert("Missing Details", "Please fill Hospital Name, Mobile, and Issue description.");
            return;
        }
        if (!companyId) {
            Alert.alert("Setup Needed", "This form isn't linked to a company yet. Please contact support.");
            return;
        }

        setIsSubmitting(true);
        try {
            await submitPublicComplaint(companyId, formData);
            setIsSuccess(true);
        } catch (error: any) {
            Alert.alert("Error", error?.message || "Could not submit your request. Please try again or call us.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <View style={styles.centerContainer}>
                <Ionicons name="checkmark-circle" size={100} color="#4caf50" />
                <Text style={styles.successTitle}>Request Submitted!</Text>
                <Text style={styles.successText}>
                    Thank you. Our service team will contact you shortly regarding your machine.
                </Text>
                <TouchableOpacity style={styles.btn} onPress={() => setIsSuccess(false)}>
                    <Text style={styles.btnText}>Submit Another Request</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
                
                <View style={styles.headerBox}>
                    <Ionicons name="settings" size={50} color="#3b5998" />
                    <Text style={styles.mainTitle}>Service Request</Text>
                    <Text style={styles.subTitle}>Facing an issue? Let us know below.</Text>
                </View>

                <View style={styles.formCard}>
                    <Text style={styles.label}>Hospital / Clinic Name *</Text>
                    <TextInput 
                        style={styles.input} 
                        placeholder="e.g. City Care Hospital" 
                        value={formData.hospitalName} 
                        onChangeText={t => setFormData({...formData, hospitalName: t})} 
                    />

                    <Text style={styles.label}>Contact Person</Text>
                    <TextInput 
                        style={styles.input} 
                        placeholder="Your Name" 
                        value={formData.contactPerson} 
                        onChangeText={t => setFormData({...formData, contactPerson: t})} 
                    />

                    <Text style={styles.label}>Mobile Number *</Text>
                    <TextInput 
                        style={styles.input} 
                        placeholder="10-digit number" 
                        keyboardType="phone-pad"
                        maxLength={10}
                        value={formData.mobile} 
                        onChangeText={t => setFormData({...formData, mobile: t})} 
                    />

                    <Text style={styles.label}>Machine / Product Name</Text>
                    <TextInput 
                        style={styles.input} 
                        placeholder="Which machine?" 
                        value={formData.machine} 
                        onChangeText={t => setFormData({...formData, machine: t})} 
                    />

                    <Text style={styles.label}>Serial Number</Text>
                    <TextInput 
                        style={styles.input} 
                        placeholder="Check machine back panel" 
                        value={formData.serialNo} 
                        onChangeText={t => setFormData({...formData, serialNo: t})} 
                    />

                    <Text style={styles.label}>Describe the Issue *</Text>
                    <TextInput 
                        style={[styles.input, { height: 100, textAlignVertical: 'top' }]} 
                        placeholder="What is the problem?" 
                        multiline 
                        value={formData.issue} 
                        onChangeText={t => setFormData({...formData, issue: t})} 
                    />

                    <TouchableOpacity 
                        style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }]} 
                        onPress={handleSubmit} 
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.submitBtnText}>Submit Request</Text>
                        )}
                    </TouchableOpacity>
                </View>
                <Text style={{ textAlign: 'center', marginTop: 20, color: 'gray', fontSize: 12 }}>
                    Powered by Your Company CRM
                </Text>
                <View style={{height: 50}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#f4f6f8' },
    successTitle: { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 20 },
    successText: { fontSize: 14, color: 'gray', textAlign: 'center', marginTop: 10, marginBottom: 30 },
    btn: { padding: 15, backgroundColor: '#3b5998', borderRadius: 10, width: '100%', alignItems: 'center' },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    headerBox: { alignItems: 'center', marginBottom: 30 },
    mainTitle: { fontSize: 26, fontWeight: 'bold', color: '#333', marginTop: 10 },
    subTitle: { fontSize: 14, color: 'gray', marginTop: 5 },
    formCard: { backgroundColor: 'white', padding: 20, borderRadius: 15, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    label: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 5, marginTop: 10 },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, backgroundColor: '#f9f9f9', fontSize: 14, color: '#333' },
    submitBtn: { backgroundColor: '#d32f2f', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 25 },
    submitBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16, textTransform: 'uppercase' }
});
