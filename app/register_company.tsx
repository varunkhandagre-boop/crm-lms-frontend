import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
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
import { auth } from '../firebaseConfig';

// 🔥 SAAS IMPORTS
import { useSaaSDB } from '../hooks/useSaaSDB';

// 🔥 INDIAN STATES & DISTRICTS DATA (Aap isme aur add kar sakte hain)
const indianStatesAndDistricts: any = {
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik", "Aurangabad", "Solapur", "Amravati", "Kolhapur", "Navi Mumbai"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar", "Junagadh"],
    "Karnataka": ["Bengaluru", "Mysuru", "Mangaluru", "Hubli", "Belagavi", "Gulbarga", "Davanagere"],
    "Delhi": ["Central Delhi", "New Delhi", "North Delhi", "South Delhi", "West Delhi", "East Delhi"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli", "Tiruppur", "Vellore"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut", "Prayagraj", "Noida"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Ramagundam"],
    "West Bengal": ["Kolkata", "Howrah", "Darjeeling", "Siliguri", "Asansol", "Durgapur"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner", "Ajmer"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain", "Sagar"]
};

export default function RegisterCompanyScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // 🔥 Naya SaaS Engine
    const { addSaaSData } = useSaaSDB();

    // Form State
    const [stateSearchQuery, setStateSearchQuery] = useState('');
    const [districtSearchQuery, setDistrictSearchQuery] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    
    const [address, setAddress] = useState('');
    const [state, setState] = useState('');
    const [city, setCity] = useState(''); // Working as District
    const [gstNumber, setGstNumber] = useState('');
    const [employeesCount, setEmployeesCount] = useState('10'); 

    // Dropdown Modal States
    const [stateModalVisible, setStateModalVisible] = useState(false);
    const [districtModalVisible, setDistrictModalVisible] = useState(false);

    const statesList = Object.keys(indianStatesAndDistricts);
    const districtsList = state ? indianStatesAndDistricts[state] : [];

    const handleRegister = async () => {
        if (!companyName || !ownerName || !email || !password || !mobile || !state || !city) {
            Alert.alert("Missing Fields", "Please fill all required details including State and City/District.");
            return;
        }

        setLoading(true);
        try {
            const cleanEmail = email.trim().toLowerCase();
            const cleanEmpCount = employeesCount ? Number(employeesCount) : 10;

            // 1. Create Auth User (Yeh auto-login kar deta hai)
            await createUserWithEmailAndPassword(auth, cleanEmail, password);

            const companyId = `COMP-${Date.now()}`;
            const startDate = new Date();
            const expiryDate = new Date();
            expiryDate.setDate(startDate.getDate() + 7); 

            // 2. Create COMPANY Document 
            const companyData = {
                id: companyId, 
                companyId: companyId, 
                companyName: companyName,
                ownerName: ownerName,
                ownerEmail: cleanEmail,
                ownerMobile: mobile,
                address: address || "",
                city: city, 
                state: state,
                gstNumber: gstNumber || "",
                maxEmployees: cleanEmpCount,
                isActive: false, 
                plan: 'Pending Approval', 
                startDate: startDate.toISOString(),
                expiryDate: expiryDate.toISOString(),
                createdAt: new Date().toISOString(),
                senderId: cleanEmail, 
                senderName: ownerName 
            };
            
            const companyRes = await addSaaSData("companies", companyData, true);
            if (!companyRes.success) throw new Error(companyRes.error);

            // 3. Create USER Document 
            const userData = {
                id: cleanEmail, 
                name: ownerName,
                email: cleanEmail,
                mobile: mobile,
                role: 'Admin', 
                companyId: companyId, 
                companyName: companyName,
                createdAt: new Date().toISOString(),
                status: 'Active',
                senderId: cleanEmail,
                senderName: ownerName
            };
            
            const userRes = await addSaaSData("users", userData, true);
            if (!userRes.success) throw new Error(userRes.error);

            // 🔥 4. FIX 2: CREATE DEFAULT COMPANY PROFILE 
            const profileData = {
                companyId: companyId,
                companyName: companyName,
                shortName: companyName, // Branding ke liye
                ownerName: ownerName,
                email: cleanEmail,
                mobile: mobile,
                address: address || "",
                city: city,
                state: state,
                gstNumber: gstNumber || "",
                createdAt: new Date().toISOString(),
                senderId: cleanEmail,
                senderName: ownerName
            };
            await addSaaSData("company_profile", profileData, true);

            // 🔥 5. FIX 1: FORCE LOGOUT (Auto-login bypass block karne ke liye)
            await auth.signOut();

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
                    
                    {/* 🔥 NEW PROFESSIONAL DROPDOWNS FOR STATE & DISTRICT */}
                    <View style={{flexDirection:'row', gap:10, marginBottom: 10}}>
                        
                        {/* STATE SELECTOR */}
                        <TouchableOpacity style={[styles.input, styles.dropdownBtn, {flex:1}]} onPress={() => setStateModalVisible(true)}>
                            <Text style={{color: state ? '#333' : '#999', fontSize: 16}}>
                                {state || "Select State *"}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#666" />
                        </TouchableOpacity>

                        {/* DISTRICT/CITY SELECTOR */}
                        <TouchableOpacity 
                            style={[styles.input, styles.dropdownBtn, {flex:1}, !state && {backgroundColor: '#f0f0f0'}]} 
                            onPress={() => {
                                if(!state) Alert.alert("Select State", "Please select a state first.");
                                else setDistrictModalVisible(true);
                            }}
                            activeOpacity={state ? 0.7 : 1}
                        >
                            <Text style={{color: city ? '#333' : '#999', fontSize: 16}}>
                                {city || "Select District *"}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#666" />
                        </TouchableOpacity>

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

            {/* 🔥 STATE SELECTION MODAL WITH SEARCH */}
            <Modal visible={stateModalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select State</Text>
                            <TouchableOpacity onPress={() => setStateModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>
                        
                        {/* 🔍 Search Bar */}
                        <View style={{backgroundColor:'#f0f0f0', borderRadius:8, paddingHorizontal:10, marginBottom:10, flexDirection:'row', alignItems:'center'}}>
                            <Ionicons name="search" size={20} color="gray" />
                            <TextInput 
                                style={{flex:1, padding:10, fontSize:16}} 
                                placeholder="Search State..." 
                                value={stateSearchQuery}
                                onChangeText={setStateSearchQuery}
                            />
                        </View>

                        <FlatList
                            data={statesList.filter(s => s.toLowerCase().includes(stateSearchQuery.toLowerCase()))}
                            keyExtractor={(item) => item}
                            renderItem={({item}) => (
                                <TouchableOpacity style={styles.modalListItem} onPress={() => {
                                    setState(item);
                                    setCity(''); 
                                    setStateSearchQuery(''); // Clear search
                                    setStateModalVisible(false);
                                }}>
                                    <Text style={styles.modalListText}>{item}</Text>
                                </TouchableOpacity>
                            )}
                            keyboardShouldPersistTaps="handled"
                        />
                    </View>
                </View>
            </Modal>

            {/* 🔥 DISTRICT SELECTION MODAL WITH SEARCH */}
            <Modal visible={districtModalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select District</Text>
                            <TouchableOpacity onPress={() => setDistrictModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>
                        
                        {/* 🔍 Search Bar */}
                        <View style={{backgroundColor:'#f0f0f0', borderRadius:8, paddingHorizontal:10, marginBottom:10, flexDirection:'row', alignItems:'center'}}>
                            <Ionicons name="search" size={20} color="gray" />
                            <TextInput 
                                style={{flex:1, padding:10, fontSize:16}} 
                                placeholder="Search District..." 
                                value={districtSearchQuery}
                                onChangeText={setDistrictSearchQuery}
                            />
                        </View>

                        <FlatList
                            data={districtsList.filter((d: string) => d.toLowerCase().includes(districtSearchQuery.toLowerCase()))}
                            keyExtractor={(item) => item}
                            renderItem={({item}) => (
                                <TouchableOpacity style={styles.modalListItem} onPress={() => {
                                    setCity(item);
                                    setDistrictSearchQuery(''); // Clear search
                                    setDistrictModalVisible(false);
                                }}>
                                    <Text style={styles.modalListText}>{item}</Text>
                                </TouchableOpacity>
                            )}
                            keyboardShouldPersistTaps="handled"
                        />
                    </View>
                </View>
            </Modal>

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
    
    // Dropdown Styles
    dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 },
    
    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    modalListItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
    modalListText: { fontSize: 16, color: '#333' },

    btn: { backgroundColor: '#3b5998', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 20, elevation: 2 },
    btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});