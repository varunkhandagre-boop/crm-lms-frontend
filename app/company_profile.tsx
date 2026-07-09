import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { statesList as allStatesList, districtPincodes, indianStatesAndDistricts } from '../constants/indianStatesData';
import { storage } from '../firebaseConfig';
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

const USE_STORAGE_BUCKET = false; 

export default function CompanyProfileScreen() {
    const router = useRouter();
    
    const { companyProfile, setCompanyProfile, currentUser } = useData();
    const { updateSaaSData, fetchSaaSData, addSaaSData } = useSaaSDB();

    const [loading, setLoading] = useState(true); 
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    
    const [profileDocId, setProfileDocId] = useState<string | null>(null);

    // Modal States
    const [stateModalVisible, setStateModalVisible] = useState(false);
    const [cityModalVisible, setCityModalVisible] = useState(false);
    const [stateSearchQuery, setStateSearchQuery] = useState('');
    const [citySearchQuery, setCitySearchQuery] = useState('');

    const [subscriptionInfo, setSubscriptionInfo] = useState({
        planName: 'Loading...',
        expiryDate: 'Loading...',
        maxEmployees: 10,
        currentEmployees: 0,
        isActive: false
    });

    const [profile, setProfile] = useState({
        companyName: '', shortName: '', tagline: '',
        addressLine: '', city: '', state: '', pincode: '',
        gstNumber: '', email: '', phone: '', landline: '', website: '',  
        logoUrl: '', signatureUrl: '', qrCodeUrl: '', upiId: '',
        bank1_name: '', bank1_acc: '', bank1_ifsc: '', bank1_branch: '',
        bank2_name: '', bank2_acc: '', bank2_ifsc: '', bank2_branch: ''
    });

    useEffect(() => {
        const loadProfileAndSubscription = async () => {
            setLoading(true);
            
            const profiles = await fetchSaaSData("company_profile");
            if (profiles && profiles.length > 0) {
                const cp: any = profiles[0]; 
                setProfileDocId(cp.id); 
                const addr = cp.fullAddress || {};
                setProfile(prev => ({
                    ...prev,
                    companyName: cp.companyName || '', shortName: cp.shortName || '', tagline: cp.tagline || '',
                    addressLine: addr.line || cp.address || '', city: cp.city || addr.city || '', state: cp.state || addr.state || '', pincode: addr.pincode || '',
                    email: cp.contactEmail || cp.email || '', phone: cp.contactPhone || cp.phone || '', landline: cp.landline || '', website: cp.website || '', gstNumber: cp.gstNumber || '',
                    logoUrl: cp.logoUrl || '', signatureUrl: cp.signatureUrl || '', qrCodeUrl: cp.qrCodeUrl || '', upiId: cp.upiId || '',
                    bank1_name: cp.bankDetails1?.bankName || '', bank1_acc: cp.bankDetails1?.accountNo || '', bank1_ifsc: cp.bankDetails1?.ifsc || '', bank1_branch: cp.bankDetails1?.branch || '',
                    bank2_name: cp.bankDetails2?.bankName || '', bank2_acc: cp.bankDetails2?.accountNo || '', bank2_ifsc: cp.bankDetails2?.ifsc || '', bank2_branch: cp.bankDetails2?.branch || '',
                }));
            }

            const myCompany = await fetchSaaSData("companies");
            const myUsers = await fetchSaaSData("users");

            if (myCompany && myCompany.length > 0) {
                const comp: any = myCompany[0];
                let formattedExpiry = 'Unknown';
                if (comp.expiryDate) {
                    const dateObj = new Date(comp.expiryDate);
                    formattedExpiry = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                }
                setSubscriptionInfo({
                    planName: comp.plan || 'Free Trial',
                    expiryDate: formattedExpiry,
                    maxEmployees: comp.maxEmployees || 10,
                    currentEmployees: myUsers.length || 0,
                    isActive: comp.isActive
                });
            }

            setLoading(false);
        };
        
        loadProfileAndSubscription();
    }, []);

    const handleImagePick = async (field: 'logoUrl' | 'signatureUrl' | 'qrCodeUrl') => {
        try {
            if (Platform.OS === 'ios') {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') return Alert.alert("Permission", "Gallery permission required in Settings.");
            }
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: field === 'signatureUrl' ? [3, 1] : [1, 1],
                quality: 0.2,
                base64: true,
            });
            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                if (USE_STORAGE_BUCKET) {
                    updateField(field, asset.uri);
                } else {
                    const b64String = `data:image/jpeg;base64,${asset.base64}`;
                    updateField(field, b64String);
                }
            }
        } catch (error) { Alert.alert("Error", "Could not open gallery."); }
    };

    const handleRemoveImage = (field: string) => {
        Alert.alert("Remove Image", "Are you sure you want to remove this image?", [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: () => updateField(field, '') }
        ]);
    };

    const uploadToFirebaseStorage = async (uri: string, path: string) => {
        if (!uri || !uri.startsWith('file://')) return uri;
        try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, blob);
            return await getDownloadURL(storageRef);
        } catch (error) { return uri; }
    };

    const handleSave = async () => {
        if (!profile.companyName || !profile.shortName) return Alert.alert("Error", "Company Name and Short Name are mandatory!");
        if (!currentUser?.companyId) return Alert.alert("Error", "No Company ID found. Contact support.");

        setSaving(true);
        try {
            let finalLogo = profile.logoUrl;
            let finalSign = profile.signatureUrl;
            let finalQr = profile.qrCodeUrl;

            if (USE_STORAGE_BUCKET) {
                setUploading(true);
                const basePath = `companies/${currentUser.companyId}`;
                if (profile.logoUrl?.startsWith('file://')) finalLogo = await uploadToFirebaseStorage(profile.logoUrl, `${basePath}/logo_${Date.now()}.jpg`);
                if (profile.signatureUrl?.startsWith('file://')) finalSign = await uploadToFirebaseStorage(profile.signatureUrl, `${basePath}/sign_${Date.now()}.jpg`);
                if (profile.qrCodeUrl?.startsWith('file://')) finalQr = await uploadToFirebaseStorage(profile.qrCodeUrl, `${basePath}/qr_${Date.now()}.jpg`);
                setUploading(false);
            }

            const dataToSave = {
                companyName: profile.companyName, shortName: profile.shortName.toUpperCase(), tagline: profile.tagline,
                fullAddress: { line: profile.addressLine, city: profile.city, state: profile.state, pincode: profile.pincode },
                address: `${profile.addressLine}, ${profile.city}, ${profile.state} - ${profile.pincode}`,
                gstNumber: profile.gstNumber, contactEmail: profile.email, contactPhone: profile.phone, landline: profile.landline, website: profile.website,
                logoUrl: finalLogo, signatureUrl: finalSign, qrCodeUrl: finalQr, upiId: profile.upiId,
                bankDetails1: { bankName: profile.bank1_name, accountNo: profile.bank1_acc, ifsc: profile.bank1_ifsc, branch: profile.bank1_branch },
                bankDetails2: { bankName: profile.bank2_name, accountNo: profile.bank2_acc, ifsc: profile.bank2_ifsc, branch: profile.bank2_branch }
            };

            let res;
            if (profileDocId) {
                res = await updateSaaSData("company_profile", profileDocId, dataToSave);
            } else {
                res = await addSaaSData("company_profile", dataToSave);
            }
            
            if (res.success) {
                if(setCompanyProfile) setCompanyProfile({ ...companyProfile, ...dataToSave });
                if(!profileDocId && (res as any).id) setProfileDocId((res as any).id);
                Alert.alert("Success ✅", "Company Profile Updated Successfully!");
            } else {
                Alert.alert("Error", "Could not save company profile.");
            }
        } catch (error: any) {
            Alert.alert("Error", "Could not save: " + error.message);
        } finally {
            setSaving(false);
            setUploading(false);
        }
    };

    const updateField = (field: string, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b5998" /></View>;

    const usagePercent = subscriptionInfo.maxEmployees > 0 
        ? (subscriptionInfo.currentEmployees / subscriptionInfo.maxEmployees) * 100 
        : 0;

    // ✅ MODALS + MAIN UI sab return() ke ANDAR hain
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#3b5998" />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Company Profile ⚙️</Text>
                <View style={{width:24}} /> 
            </View>

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={{flex:1}}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 50} 
            >
                <ScrollView 
                    contentContainerStyle={{padding: 20, paddingBottom: 150}} 
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled" 
                >
                    {/* 0. SUBSCRIPTION INFO CARD */}
                    <View style={[styles.section, { backgroundColor: '#f0f4ff', borderColor: '#d0d9ff', borderWidth: 1 }]}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                            <View>
                                <Text style={{fontSize: 12, color: '#555', fontWeight: 'bold'}}>CURRENT PLAN</Text>
                                <Text style={{fontSize: 18, color: '#3b5998', fontWeight: 'bold'}}>{subscriptionInfo.planName}</Text>
                            </View>
                            <View style={{alignItems: 'flex-end'}}>
                                <Text style={{fontSize: 12, color: '#555', fontWeight: 'bold'}}>VALID TILL</Text>
                                <Text style={{fontSize: 16, color: subscriptionInfo.isActive ? '#2e7d32' : '#d32f2f', fontWeight: 'bold'}}>
                                    {subscriptionInfo.expiryDate}
                                </Text>
                            </View>
                        </View>
                        <View style={{marginTop: 10}}>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5}}>
                                <Text style={{fontSize: 12, color: '#555', fontWeight: 'bold'}}>EMPLOYEES USED</Text>
                                <Text style={{fontSize: 12, color: '#333', fontWeight: 'bold'}}>{subscriptionInfo.currentEmployees} / {subscriptionInfo.maxEmployees}</Text>
                            </View>
                            <View style={{height: 8, backgroundColor: '#ddd', borderRadius: 4, overflow: 'hidden'}}>
                                <View style={{height: '100%', width: `${Math.min(usagePercent, 100)}%`, backgroundColor: usagePercent >= 100 ? '#d32f2f' : '#4caf50'}} />
                            </View>
                            {usagePercent >= 100 && (
                                <Text style={{fontSize: 10, color: '#d32f2f', marginTop: 5, textAlign: 'right'}}>Limit reached. Contact Admin to upgrade.</Text>
                            )}
                        </View>
                        {currentUser?.role === 'Admin' && (
                            <TouchableOpacity 
                                style={{ backgroundColor: '#2e7d32', padding: 12, borderRadius: 8, marginTop: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', elevation: 2 }}
                                onPress={() => router.push({ pathname: '/SubscriptionScreen' as any, params: { companyId: currentUser?.companyId } })}
                            >
                                <Ionicons name="rocket-outline" size={18} color="white" style={{ marginRight: 8 }} />
                                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>Upgrade / Renew Plan</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* 1. BRANDING */}
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>🏢 Branding & Identity</Text>
                        <InputLabel label="Company Name *" />
                        <TextInput style={styles.input} value={profile.companyName} onChangeText={t => updateField('companyName', t)} placeholder="e.g. CleonMed Systems" />
                        <View style={styles.row}>
                            <View style={{flex:1, marginRight:10}}>
                                <InputLabel label="Short Name *" />
                                <TextInput style={styles.input} value={profile.shortName} onChangeText={t => updateField('shortName', t)} placeholder="CLEON" autoCapitalize="characters" />
                            </View>
                            <View style={{flex:1}}>
                                <InputLabel label="GST Number" />
                                <TextInput style={styles.input} value={profile.gstNumber} onChangeText={t => updateField('gstNumber', t)} placeholder="GSTIN..." autoCapitalize="characters" />
                            </View>
                        </View>
                        <InputLabel label="Tagline / Slogan" />
                        <TextInput style={styles.input} value={profile.tagline} onChangeText={t => updateField('tagline', t)} placeholder="e.g. Innovating Healthcare" />
                    </View>

                    {/* 2. ADDRESS */}
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>📍 Address Details</Text>
                        <InputLabel label="Address Line 1" />
                        <TextInput style={[styles.input, {height: 50}]} value={profile.addressLine} onChangeText={t => updateField('addressLine', t)} placeholder="Plot No, Street, Area" />

                        {/* ✅ STATE DROPDOWN */}
                        <InputLabel label="State" />
                        <TouchableOpacity 
                            style={[styles.input, {flexDirection:'row', justifyContent:'space-between', alignItems:'center'}]}
                            onPress={() => setStateModalVisible(true)}
                        >
                            <Text style={{color: profile.state ? '#333' : '#999', fontSize:14}}>
                                {profile.state || "Select State"}
                            </Text>
                            <Ionicons name="chevron-down" size={18} color="#666" />
                        </TouchableOpacity>

                        <View style={styles.row}>
                            <View style={{flex:1, marginRight:10}}>
                                {/* ✅ CITY DROPDOWN */}
                                <InputLabel label="City / District" />
                                <TouchableOpacity 
                                    style={[styles.input, {flexDirection:'row', justifyContent:'space-between', alignItems:'center'}]}
                                    onPress={() => {
                                        if(!profile.state) Alert.alert("Select State", "Please select state first.");
                                        else setCityModalVisible(true);
                                    }}
                                >
                                    <Text style={{color: profile.city ? '#333' : '#999', fontSize:14}}>
                                        {profile.city || "Select City"}
                                    </Text>
                                    <Ionicons name="chevron-down" size={18} color="#666" />
                                </TouchableOpacity>
                            </View>
                            <View style={{flex:1}}>
                                <InputLabel label="Pincode" />
                                <TextInput style={styles.input} value={profile.pincode} onChangeText={t => updateField('pincode', t)} keyboardType="numeric" />
                            </View>
                        </View>
                    </View>

                    {/* 3. CONTACT */}
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>📞 Contact Info</Text>
                        <View style={styles.row}>
                            <View style={{flex:1, marginRight:10}}>
                                <InputLabel label="Mobile" />
                                <TextInput style={styles.input} value={profile.phone} onChangeText={t => updateField('phone', t)} keyboardType="phone-pad" />
                            </View>
                            <View style={{flex:1}}>
                                <InputLabel label="Landline (Office)" />
                                <TextInput style={styles.input} value={profile.landline} onChangeText={t => updateField('landline', t)} keyboardType="phone-pad" />
                            </View>
                        </View>
                        <InputLabel label="Official Email" />
                        <TextInput style={styles.input} value={profile.email} onChangeText={t => updateField('email', t)} keyboardType="email-address" />
                        <InputLabel label="Website URL" />
                        <TextInput style={styles.input} value={profile.website} onChangeText={t => updateField('website', t)} placeholder="www.yourcompany.com" autoCapitalize="none" />
                    </View>

                    {/* 4. BANK 1 */}
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>🏦 Primary Bank Account</Text>
                        <InputLabel label="Bank Name" />
                        <TextInput style={styles.input} value={profile.bank1_name} onChangeText={t => updateField('bank1_name', t)} placeholder="e.g. HDFC Bank" />
                        <InputLabel label="Account Number" />
                        <TextInput style={styles.input} value={profile.bank1_acc} onChangeText={t => updateField('bank1_acc', t)} keyboardType="numeric" />
                        <View style={styles.row}>
                            <View style={{flex:1, marginRight:10}}>
                                <InputLabel label="IFSC Code" />
                                <TextInput style={styles.input} value={profile.bank1_ifsc} onChangeText={t => updateField('bank1_ifsc', t)} autoCapitalize="characters" />
                            </View>
                            <View style={{flex:1}}>
                                <InputLabel label="Branch" />
                                <TextInput style={styles.input} value={profile.bank1_branch} onChangeText={t => updateField('bank1_branch', t)} />
                            </View>
                        </View>
                    </View>

                    {/* 5. BANK 2 */}
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>🏦 Secondary Bank (Optional)</Text>
                        <InputLabel label="Bank Name" />
                        <TextInput style={styles.input} value={profile.bank2_name} onChangeText={t => updateField('bank2_name', t)} placeholder="e.g. SBI Bank" />
                        <InputLabel label="Account Number" />
                        <TextInput style={styles.input} value={profile.bank2_acc} onChangeText={t => updateField('bank2_acc', t)} keyboardType="numeric" />
                        <View style={styles.row}>
                            <View style={{flex:1, marginRight:10}}>
                                <InputLabel label="IFSC Code" />
                                <TextInput style={styles.input} value={profile.bank2_ifsc} onChangeText={t => updateField('bank2_ifsc', t)} autoCapitalize="characters" />
                            </View>
                            <View style={{flex:1}}>
                                <InputLabel label="Branch" />
                                <TextInput style={styles.input} value={profile.bank2_branch} onChangeText={t => updateField('bank2_branch', t)} />
                            </View>
                        </View>
                    </View>

                    {/* 6. IMAGES */}
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>🖼️ Digital Assets</Text>
                        
                        <Text style={styles.imgLabel}>Company Logo</Text>
                        <View style={{alignItems: 'flex-start'}}>
                            <TouchableOpacity onPress={() => handleImagePick('logoUrl')} style={styles.imgBox}>
                                {profile.logoUrl ? (
                                    <Image source={{ uri: profile.logoUrl }} style={styles.previewImg} resizeMode="contain" />
                                ) : (
                                    <View style={styles.placeholder}><Ionicons name="image-outline" size={24} color="#999"/><Text style={styles.phText}>Pick Logo</Text></View>
                                )}
                                <View style={styles.editBadge}><Ionicons name="pencil" size={12} color="white"/></View>
                            </TouchableOpacity>
                            {profile.logoUrl ? (
                                <TouchableOpacity style={styles.deleteBadge} onPress={() => handleRemoveImage('logoUrl')}>
                                    <Ionicons name="trash" size={14} color="white"/>
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        <Text style={styles.imgLabel}>Digital Signature</Text>
                        <View style={{alignItems: 'flex-start'}}>
                            <TouchableOpacity onPress={() => handleImagePick('signatureUrl')} style={[styles.imgBox, {width: 200, height: 80}]}>
                                {profile.signatureUrl ? (
                                    <Image source={{ uri: profile.signatureUrl }} style={styles.previewImg} resizeMode="contain" />
                                ) : (
                                    <View style={styles.placeholder}><Ionicons name="create-outline" size={24} color="#999"/><Text style={styles.phText}>Pick Signature</Text></View>
                                )}
                                <View style={styles.editBadge}><Ionicons name="pencil" size={12} color="white"/></View>
                            </TouchableOpacity>
                            {profile.signatureUrl ? (
                                <TouchableOpacity style={styles.deleteBadge} onPress={() => handleRemoveImage('signatureUrl')}>
                                    <Ionicons name="trash" size={14} color="white"/>
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        <InputLabel label="UPI ID (For Payment Link)" />
                        <TextInput style={styles.input} value={profile.upiId} onChangeText={t => updateField('upiId', t)} placeholder="e.g. business@okicici" />

                        <Text style={styles.imgLabel}>Payment QR Code Image</Text>
                        <View style={{alignItems: 'flex-start'}}>
                            <TouchableOpacity onPress={() => handleImagePick('qrCodeUrl')} style={styles.imgBox}>
                                {profile.qrCodeUrl ? (
                                    <Image source={{ uri: profile.qrCodeUrl }} style={styles.previewImg} resizeMode="contain" />
                                ) : (
                                    <View style={styles.placeholder}><Ionicons name="qr-code-outline" size={24} color="#999"/><Text style={styles.phText}>Pick QR Code</Text></View>
                                )}
                                <View style={styles.editBadge}><Ionicons name="pencil" size={12} color="white"/></View>
                            </TouchableOpacity>
                            {profile.qrCodeUrl ? (
                                <TouchableOpacity style={styles.deleteBadge} onPress={() => handleRemoveImage('qrCodeUrl')}>
                                    <Ionicons name="trash" size={14} color="white"/>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>

                    <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving || uploading}>
                        {saving || uploading ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Save Global Settings</Text>}
                    </TouchableOpacity>
                    
                    <View style={{height: 100}} /> 
                </ScrollView>
            </KeyboardAvoidingView>

            {/* ✅ MODALS - KeyboardAvoidingView ke BAHAR, lekin return() ke ANDAR */}

            {/* STATE MODAL */}
            <Modal visible={stateModalVisible} animationType="slide" transparent={true}>
                <View style={modalStyles.overlay}>
                    <View style={modalStyles.content}>
                        <View style={modalStyles.header}>
                            <Text style={modalStyles.title}>Select State</Text>
                            <TouchableOpacity onPress={() => { setStateModalVisible(false); setStateSearchQuery(''); }}>
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
                            data={allStatesList.filter(s => s.toLowerCase().includes(stateSearchQuery.toLowerCase()))}
                            keyExtractor={item => item}
                            renderItem={({item}) => (
                                <TouchableOpacity style={modalStyles.item} onPress={() => {
                                    updateField('state', item);
                                    updateField('city', '');
                                    setStateSearchQuery('');
                                    setStateModalVisible(false);
                                }}>
                                    <Text style={modalStyles.itemText}>{item}</Text>
                                </TouchableOpacity>
                            )}
                            keyboardShouldPersistTaps="handled"
                        />
                    </View>
                </View>
            </Modal>

            {/* CITY MODAL */}
            <Modal visible={cityModalVisible} animationType="slide" transparent={true}>
                <View style={modalStyles.overlay}>
                    <View style={modalStyles.content}>
                        <View style={modalStyles.header}>
                            <Text style={modalStyles.title}>Select City / District</Text>
                            <TouchableOpacity onPress={() => { setCityModalVisible(false); setCitySearchQuery(''); }}>
                                <Ionicons name="close-circle" size={28} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>
                        <View style={{backgroundColor:'#f0f0f0', borderRadius:8, paddingHorizontal:10, marginBottom:10, flexDirection:'row', alignItems:'center'}}>
                            <Ionicons name="search" size={20} color="gray" />
                            <TextInput 
                                style={{flex:1, padding:10, fontSize:16}} 
                                placeholder="Search City..." 
                                value={citySearchQuery} 
                                onChangeText={setCitySearchQuery} 
                            />
                        </View>
                        <FlatList
                            data={(indianStatesAndDistricts[profile.state] || []).filter((c: string) => c.toLowerCase().includes(citySearchQuery.toLowerCase()))}
                            keyExtractor={item => item}
                            renderItem={({item}) => (
                                <TouchableOpacity style={modalStyles.item} onPress={() => {
                                    updateField('city', item);
                                    if (!profile.pincode) {
                                    updateField('pincode', districtPincodes[item] || '');
                                    }
                                    setCitySearchQuery('');
                                    setCityModalVisible(false);
                                }}>
                                    <Text style={modalStyles.itemText}>{item}</Text>
                                </TouchableOpacity>
                            )}
                            keyboardShouldPersistTaps="handled"
                        />
                    </View>
                </View>
            </Modal>

        </View>
        // ✅ return() yahan khatam hota hai
    );
}

const InputLabel = ({label}: {label: string}) => (
    <Text style={{fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 5}}>{label}</Text>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { backgroundColor: '#3b5998', paddingTop: 50, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation:4 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    section: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 1 },
    sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#3b5998', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
    input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, color: '#333', marginBottom: 15 },
    row: { flexDirection: 'row' },
    saveBtn: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 10, alignItems: 'center', elevation: 3 },
    saveText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    imgLabel: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 5, marginTop: 10 },
    imgBox: { width: 100, height: 100, backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderStyle: 'dashed' },
    previewImg: { width: '100%', height: '100%', borderRadius: 8 },
    placeholder: { alignItems: 'center' },
    phText: { fontSize: 10, color: '#999', marginTop: 4 },
    editBadge: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#e65100', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
    deleteBadge: { position: 'absolute', top: 25, left: 85, backgroundColor: '#d32f2f', width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', elevation: 4, zIndex: 10 }
});

const modalStyles = StyleSheet.create({
    overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
    content: { backgroundColor:'white', borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, maxHeight:'70%' },
    header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15, borderBottomWidth:1, borderBottomColor:'#eee', paddingBottom:10 },
    title: { fontSize:18, fontWeight:'bold', color:'#333' },
    item: { paddingVertical:15, borderBottomWidth:1, borderBottomColor:'#f5f5f5' },
    itemText: { fontSize:16, color:'#333' }
});