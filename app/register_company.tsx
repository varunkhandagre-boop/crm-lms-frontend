import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

// 🔥 SAAS IMPORTS
import { useData } from './context/DataContext';

// 🔥 INDIAN STATES & DISTRICTS DATA
import { districtPincodes, indianStatesAndDistricts } from '../constants/indianStatesData';

import { registerCompanyOnBackend } from '../services/api/registration';

export default function RegisterCompanyScreen() {
    const router = useRouter();
    // "Buy now" on the landing page opens /register_company?plan=<id>&team=<n>;
    // both are handed to the plan screen so that plan is already selected.
    const { plan: wantedPlan, team: wantedTeam } = useLocalSearchParams<{ plan?: string; team?: string }>();
    const isBuying = typeof wantedPlan === 'string' && wantedPlan.length > 0;
    const teamFromLink = typeof wantedTeam === 'string' && /^\d{1,4}$/.test(wantedTeam) && Number(wantedTeam) > 0 ? wantedTeam : '';
    const { login } = useData();
    const [loading, setLoading] = useState(false);

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
    const [city, setCity] = useState(''); 
    const [pinCode, setPinCode] = useState('');
    const [gstNumber, setGstNumber] = useState('');
    const [employeesCount, setEmployeesCount] = useState(teamFromLink || '10'); 

    // Dropdown Modal States
    const [stateModalVisible, setStateModalVisible] = useState(false);
    const [districtModalVisible, setDistrictModalVisible] = useState(false);

    const statesList = Object.keys(indianStatesAndDistricts).sort(); 
    const districtsList = state ? indianStatesAndDistricts[state] : [];

    const handleRegister = async () => {
        if (!companyName || !ownerName || !email || !password || !mobile || !state || !city) {
            Alert.alert("Missing Fields", "Please fill all required details including State and City/District.");
            return;
        }

        if (password.length < 8) {
            Alert.alert("Weak Password", "Password must be at least 8 characters.");
            return;
        }

        setLoading(true);
        try {
            const cleanEmail = email.trim().toLowerCase();
            const cleanEmpCount = employeesCount ? Number(employeesCount) : 10;

            // One call creates the company (7-day free trial) and its Admin user.
            const { company } = await registerCompanyOnBackend({
                companyName: companyName.trim(),
                ownerName: ownerName.trim(),
                email: cleanEmail,
                password,
                mobile: mobile.trim(),
                address: address || undefined,
                state,
                city,
                pincode: pinCode || undefined,
                gstNumber: gstNumber || undefined,
                employeeLimit: cleanEmpCount,
            });
            const companyId = company.id;

            // Signed in before the alert, so the plan screen's API calls have a token.
            await login(cleanEmail, password);

            // 6. Success aur direct login option
            // 🔥 LINKED TO SUBSCRIPTION: User register hote hi direct Subscription page par jayega data lekar
            Alert.alert(
                isBuying ? "Account Created ✅" : "Registration Successful ✅",
                isBuying
                    ? "Your company account is ready. Next, pay for your plan."
                    : "Your organization is registered. Please select your subscription plan to proceed.",
                [
                    { 
                        text: isBuying ? "Continue to Payment" : "Choose Plan",
                        onPress: () => {
                            // Isse companyId automatic naye screen par send ho jayegi
                            router.replace({
                                pathname: '/SubscriptionScreen' as any,
                                params: {
                                    companyId: companyId,
                                    ...(typeof wantedPlan === 'string' && wantedPlan ? { planId: wantedPlan } : {}),
                                    ...(typeof wantedTeam === 'string' && wantedTeam ? { team: wantedTeam } : {}),
                                }
                            });
                        } 
                    }
                ],
                { cancelable: false } 
            );

        } catch (error: any) {
            Alert.alert("Registration Failed", error?.message || "Could not register. Please try again.");
        }
        setLoading(false);
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.title}>{isBuying ? 'Create Your Account' : 'Register Organization'}</Text>
                </View>

                {isBuying && (
                    <View style={styles.buyNote}>
                        <Text style={styles.buyNoteTitle}>Step 1 of 2: create your company account</Text>
                        <Text style={styles.buyNoteText}>Step 2 is payment for the plan you chose. You can start using the app right away while we confirm your payment.</Text>
                    </View>
                )}

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
                    
                    <View style={{flexDirection:'row', gap:10, marginBottom: 10}}>
                        
                        <TouchableOpacity style={[styles.input, styles.dropdownBtn, {flex:1}]} onPress={() => setStateModalVisible(true)}>
                            <Text style={{color: state ? '#333' : '#999', fontSize: 16}}>
                                {state || "Select State *"}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#666" />
                        </TouchableOpacity>

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
                    {/* GST Number ke BAAD ye add karo */}
<TextInput 
    style={styles.input} 
    placeholder="Pin Code" 
    value={pinCode} 
    onChangeText={setPinCode}  // manually change kar sakta hai
    keyboardType="numeric" 
    maxLength={6}
/>

                    <Text style={styles.sectionHeader}>Setup</Text>
                    <Text style={{color:'#666', marginBottom:5}}>Initial Employee Limit</Text>
                    <TextInput style={styles.input} placeholder="Max Employees (Default: 10)" keyboardType="numeric" value={employeesCount} onChangeText={setEmployeesCount} />

                    <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>{isBuying ? 'Continue to Payment' : 'Start 7-Day Free Trial'}</Text>}
                    </TouchableOpacity>
                </View>
                <View style={{height: 50}} />
            </ScrollView>

            {/* STATE SELECTION MODAL */}
            <Modal visible={stateModalVisible} animationType="slide" transparent={true}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select State</Text>
                            <TouchableOpacity onPress={() => setStateModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>
                        
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
                                    setStateSearchQuery(''); 
                                    setStateModalVisible(false);
                                }}>
                                    <Text style={styles.modalListText}>{item}</Text>
                                </TouchableOpacity>
                            )}
                            keyboardShouldPersistTaps="handled"
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>
            </Modal>

            {/* DISTRICT SELECTION MODAL */}
            <Modal visible={districtModalVisible} animationType="slide" transparent={true}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select District</Text>
                            <TouchableOpacity onPress={() => setDistrictModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>
                        
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
                                    setPinCode(districtPincodes[item] || '');
                                    setDistrictSearchQuery(''); 
                                    setDistrictModalVisible(false);
                                }}>
                                    <Text style={styles.modalListText}>{item}</Text>
                                </TouchableOpacity>
                            )}
                            keyboardShouldPersistTaps="handled"
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>
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
    dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    modalListItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
    modalListText: { fontSize: 16, color: '#333' },
    btn: { backgroundColor: '#3b5998', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 20, elevation: 2 },
    btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    buyNote: { backgroundColor: '#EEF3FB', borderColor: '#C9D6EE', borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 16 },
    buyNoteTitle: { fontSize: 15, fontWeight: 'bold', color: '#3b5998' },
    buyNoteText: { fontSize: 14, color: '#555', marginTop: 4, lineHeight: 20 }
});
