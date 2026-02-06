import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { db, storage } from '../firebaseConfig';
import { useData } from './context/DataContext';

const USE_STORAGE_BUCKET = false; 

export default function CompanyProfileScreen() {
    const router = useRouter();
    const { setCompanyProfile } = useData();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [profile, setProfile] = useState({
        companyName: '', shortName: '', tagline: '',
        addressLine: '', city: '', state: '', pincode: '',
        gstNumber: '', email: '', phone: '', landline: '', website: '',  
        logoUrl: '', signatureUrl: '', qrCodeUrl: '', upiId: '',
        bank1_name: '', bank1_acc: '', bank1_ifsc: '', bank1_branch: '',
        bank2_name: '', bank2_acc: '', bank2_ifsc: '', bank2_branch: ''
    });

    useEffect(() => { fetchCompanyProfile(); }, []);

    const fetchCompanyProfile = async () => {
        setLoading(true);
        try {
            const docRef = doc(db, "company_profile", "main_profile");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const addr = data.fullAddress || {};
                setProfile({
                    ...profile,
                    companyName: data.companyName || '', shortName: data.shortName || '', tagline: data.tagline || '',
                    addressLine: addr.line || data.address || '', city: addr.city || '', state: addr.state || '', pincode: addr.pincode || '',
                    email: data.contactEmail || data.email || '', phone: data.contactPhone || data.phone || '', landline: data.landline || '', website: data.website || '', gstNumber: data.gstNumber || '',
                    logoUrl: data.logoUrl || '', signatureUrl: data.signatureUrl || '', qrCodeUrl: data.qrCodeUrl || '', upiId: data.upiId || '',
                    bank1_name: data.bankDetails1?.bankName || '', bank1_acc: data.bankDetails1?.accountNo || '', bank1_ifsc: data.bankDetails1?.ifsc || '', bank1_branch: data.bankDetails1?.branch || '',
                    bank2_name: data.bankDetails2?.bankName || '', bank2_acc: data.bankDetails2?.accountNo || '', bank2_ifsc: data.bankDetails2?.ifsc || '', bank2_branch: data.bankDetails2?.branch || '',
                });
            }
        } catch (error) { console.log("Error fetching profile:", error); } 
        finally { setLoading(false); }
    };

    const handleImagePick = async (field: 'logoUrl' | 'signatureUrl' | 'qrCodeUrl') => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return Alert.alert("Permission", "Gallery permission required.");

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
    };

    // 🔥 NEW: Image Delete Function
    const handleRemoveImage = (field: string) => {
        Alert.alert("Remove Image", "Are you sure you want to remove this image?", [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Remove", 
                style: "destructive", 
                onPress: () => updateField(field, '') // Empty string set kar dega
            }
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

        setSaving(true);
        try {
            let finalLogo = profile.logoUrl;
            let finalSign = profile.signatureUrl;
            let finalQr = profile.qrCodeUrl;

            if (USE_STORAGE_BUCKET) {
                if (profile.logoUrl?.startsWith('file://')) {
                    setUploading(true);
                    finalLogo = await uploadToFirebaseStorage(profile.logoUrl, `company/logo_${Date.now()}.jpg`);
                }
                if (profile.signatureUrl?.startsWith('file://')) {
                    setUploading(true);
                    finalSign = await uploadToFirebaseStorage(profile.signatureUrl, `company/sign_${Date.now()}.jpg`);
                }
                if (profile.qrCodeUrl?.startsWith('file://')) {
                    setUploading(true);
                    finalQr = await uploadToFirebaseStorage(profile.qrCodeUrl, `company/qr_${Date.now()}.jpg`);
                }
                setUploading(false);
            }

            const docRef = doc(db, "company_profile", "main_profile");
            const dataToSave = {
                companyName: profile.companyName, shortName: profile.shortName.toUpperCase(), tagline: profile.tagline,
                fullAddress: { line: profile.addressLine, city: profile.city, state: profile.state, pincode: profile.pincode },
                address: `${profile.addressLine}, ${profile.city}, ${profile.state} - ${profile.pincode}`,
                gstNumber: profile.gstNumber, contactEmail: profile.email, contactPhone: profile.phone, landline: profile.landline, website: profile.website,
                logoUrl: finalLogo, signatureUrl: finalSign, qrCodeUrl: finalQr, upiId: profile.upiId,
                updatedAt: new Date().toISOString(),
                bankDetails1: { bankName: profile.bank1_name, accountNo: profile.bank1_acc, ifsc: profile.bank1_ifsc, branch: profile.bank1_branch },
                bankDetails2: { bankName: profile.bank2_name, accountNo: profile.bank2_acc, ifsc: profile.bank2_ifsc, branch: profile.bank2_branch }
            };

            await setDoc(docRef, dataToSave, { merge: true });
            if(setCompanyProfile) setCompanyProfile(dataToSave);
            Alert.alert("Success ✅", "Company Profile Updated Successfully!");
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

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#3b5998" />
            
            {/* Header fixed rahega */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Company Profile ⚙️</Text>
                <View style={{width:24}} /> 
            </View>

            {/* 🔥 FIX: Keyboard Handling */}
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={{flex:1}}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 50} // Header ki height adjust karne ke liye
            >
                <ScrollView 
                    contentContainerStyle={{padding: 20, paddingBottom: 150}} // 🔥 Bottom padding badha di
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled" // Taps miss nahi honge
                >
                    
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
                        <View style={styles.row}>
                            <View style={{flex:1, marginRight:10}}>
                                <InputLabel label="City" />
                                <TextInput style={styles.input} value={profile.city} onChangeText={t => updateField('city', t)} />
                            </View>
                            <View style={{flex:1}}>
                                <InputLabel label="Pincode" />
                                <TextInput style={styles.input} value={profile.pincode} onChangeText={t => updateField('pincode', t)} keyboardType="numeric" />
                            </View>
                        </View>
                        <InputLabel label="State" />
                        <TextInput style={styles.input} value={profile.state} onChangeText={t => updateField('state', t)} />
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
                        
                        {/* LOGO */}
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

                        {/* SIGNATURE */}
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

                        {/* UPI & QR */}
                        <InputLabel label="UPI ID (For Payment Link)" />
                        <TextInput 
                            style={styles.input} 
                            value={profile.upiId} 
                            onChangeText={t => updateField('upiId', t)} 
                            placeholder="e.g. business@okicici" 
                        />

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
                    
                    {/* 🔥 EXTRA SPACE AT BOTTOM */}
                    <View style={{height: 100}} /> 
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
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
    
    // IMAGE STYLES
    imgLabel: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 5, marginTop: 10 },
    imgBox: { width: 100, height: 100, backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderStyle: 'dashed' },
    previewImg: { width: '100%', height: '100%', borderRadius: 8 },
    placeholder: { alignItems: 'center' },
    phText: { fontSize: 10, color: '#999', marginTop: 4 },
    editBadge: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#e65100', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
    
    // 🔥 NEW DELETE BADGE STYLE
    deleteBadge: { 
        position: 'absolute', 
        top: 25, // Adjusted to overlap nicely on top-right of image
        left: 85, // Adjust based on box width
        backgroundColor: '#d32f2f', 
        width: 26, 
        height: 26, 
        borderRadius: 13, 
        justifyContent: 'center', 
        alignItems: 'center', 
        elevation: 4, 
        zIndex: 10 
    }
});