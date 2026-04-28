import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
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
import { auth } from '../firebaseConfig';

// 🔥 SAAS IMPORTS (Direct Firestore imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';

export default function RegisterCompanyScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // 🔥 Naya SaaS Engine
    const { addSaaSData } = useSaaSDB();

    // Form State
    const [companyName, setCompanyName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    
    // New Fields
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [gstNumber, setGstNumber] = useState('');
    const [employeesCount, setEmployeesCount] = useState('10'); 

    const handleRegister = async () => {
        if (!companyName || !ownerName || !email || !password || !mobile || !city) {
            Alert.alert("Missing Fields", "Please fill all required details (City is must).");
            return;
        }

        setLoading(true);
        try {
            const cleanEmail = email.trim().toLowerCase();
            const cleanEmpCount = employeesCount ? Number(employeesCount) : 10;

            // 1. Create Auth User (Maintains Firebase Auth base)
            await createUserWithEmailAndPassword(auth, cleanEmail, password);

            // 2. Dates Calculation 
            const companyId = `COMP-${Date.now()}`;
            const startDate = new Date();
            const expiryDate = new Date();
            expiryDate.setDate(startDate.getDate() + 7); 

            // 3. Create COMPANY Document via SaaS Engine
            // SaaS DB hook handles the custom ID if we pass it, otherwise we'll adapt.
            // Since we need exact IDs, we use addSaaSData with custom ID mapping or adapt it
            const companyData = {
                id: companyId, // Used as custom doc ID in our SaaS hook
                companyName: companyName,
                ownerName: ownerName,
                ownerEmail: cleanEmail,
                ownerMobile: mobile,
                address: address || "",
                city: city,
                state: state || "",
                gstNumber: gstNumber || "",
                maxEmployees: cleanEmpCount,
                isActive: false, 
                plan: 'Pending Approval', 
                startDate: startDate.toISOString(),
                expiryDate: expiryDate.toISOString(),
                createdAt: new Date().toISOString()
            };
            await addSaaSData("companies", companyData);

            // 4. Create USER Document via SaaS Engine
            const userData = {
                id: cleanEmail, // SaaS hook reads this to set custom ID
                name: ownerName,
                email: cleanEmail,
                mobile: mobile,
                role: 'Admin', 
                companyId: companyId, 
                companyName: companyName,
                createdAt: new Date().toISOString(),
                status: 'Active'
            };
            await addSaaSData("users", userData);

            Alert.alert(
                "Registration Successful ✅", 
                "Your account is created but requires Super Admin approval. Please contact support.", 
                [
                    { 
                        text: "Go to Login", 
                        onPress: () => {
                            router.replace('/login' as any);
                        } 
                    }
                ],
                { cancelable: false } 
            );

        } catch (error: any) {
            let msg = error.message;
            if (msg.includes("email-already-in-use")) msg = "Email already registered.";
            Alert.alert("Registration Failed", msg);
        }
        setLoading(false);
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Register Organization</Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.sectionHeader}>Basic Info</Text>
                    <TextInput style={styles.input} placeholder="Company Name *" value={companyName} onChangeText={setCompanyName} />
                    <TextInput style={styles.input} placeholder="Owner Name *" value={ownerName} onChangeText={setOwnerName} />
                    <TextInput 
                        style={styles.input} 
                        placeholder="Official Email (Login ID) *" 
                        keyboardType="email-address" 
                        autoCapitalize="none" 
                        value={email} 
                        onChangeText={(text) => setEmail(text.toLowerCase())} 
                    />
                    <TextInput style={styles.input} placeholder="Password *" secureTextEntry value={password} onChangeText={setPassword} />
                    <TextInput style={styles.input} placeholder="Mobile Number *" keyboardType="phone-pad" maxLength={10} value={mobile} onChangeText={setMobile} />

                    <Text style={styles.sectionHeader}>Address & Legal</Text>
                    <TextInput style={styles.input} placeholder="Full Address" value={address} onChangeText={setAddress} />
                    <View style={{flexDirection:'row', gap:10}}>
                        <TextInput style={[styles.input, {flex:1}]} placeholder="City *" value={city} onChangeText={setCity} />
                        <TextInput style={[styles.input, {flex:1}]} placeholder="State" value={state} onChangeText={setState} />
                    </View>
                    <TextInput style={styles.input} placeholder="GST Number (Optional)" value={gstNumber} onChangeText={setGstNumber} autoCapitalize="characters" />

                    <Text style={styles.sectionHeader}>Setup</Text>
                    <Text style={{color:'#666', marginBottom:5}}>Initial Employee Limit</Text>
                    <TextInput style={styles.input} placeholder="Max Employees (Default: 10)" keyboardType="numeric" value={employeesCount} onChangeText={setEmployeesCount} />

                    <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Register Company</Text>}
                    </TouchableOpacity>
                </View>
                <View style={{height: 50}} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9f9f9' },
    scroll: { flexGrow: 1, padding: 20 },
    header: { flexDirection: 'row', alignItems: 'center', marginTop: 40, marginBottom: 20 },
    backBtn: { padding: 5, marginRight: 10 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
    sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#3b5998', marginTop: 15, marginBottom: 10 },
    form: { width: '100%' },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, fontSize: 16, backgroundColor: '#fff', marginBottom: 10 },
    btn: { backgroundColor: '#3b5998', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 30, elevation: 2 },
    btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});