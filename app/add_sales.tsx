import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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

// 🔥 SAAS IMPORTS (Direct Firebase DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

export default function AddSalesScreen() {
    const router = useRouter();
    
    // 🔥 1. Context se sirf user aur notification engine nikala
    const { currentUser, addNotification } = useData(); 

    // 🔥 2. Naya SaaS Engine connect kiya
    const { fetchSaaSData, addSaaSData, isDbLoading } = useSaaSDB();

    // 🔥 3. Lazy Loaded Lists
    const [orgList, setOrgList] = useState<any[]>([]);
    const [productList, setProductList] = useState<any[]>([]);

    // --- FORM STATES ---
    const [hospital, setHospital] = useState(''); 
    const [orgId, setOrgId] = useState('');

    const [person, setPerson] = useState(''); 
    const [mobile, setMobile] = useState('');
    const [email, setEmail] = useState(''); 
    const [city, setCity] = useState('');
    const [address, setAddress] = useState('');

    const [product, setProduct] = useState('');
    const [discussion, setDiscussion] = useState('');
    const [outcome, setOutcome] = useState('Interested');
    
    const [nextDate, setNextDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Modal States
    const [modalVisible, setModalVisible] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filteredData, setFilteredData] = useState<any[]>([]);
    const [currentModalType, setCurrentModalType] = useState('');

    // 🔥 VOICE TO TEXT STATES & REFS
    const [isRecording, setIsRecording] = useState(false);
    const originalDiscussionRef = useRef(''); // बोलने से पहले का टेक्स्ट सेव रखने के लिए

    // Sirf Cold Call wale options
    const outcomeOptions = ['Interested', 'Not Interested', 'Follow Up', 'Demo Planned'];

    // 🔥 4. LOAD DATA ON MOUNT
    useEffect(() => {
        const loadData = async () => {
            if (currentUser?.companyId) {
                const [orgs, prods] = await Promise.all([
                    fetchSaaSData("organizations"),
                    fetchSaaSData("products")
                ]);
                setOrgList(orgs);
                setProductList(prods);
            }
        };
        loadData();
    }, [currentUser]);

    // --- 🎤 VOICE TO TEXT SETUP (DUMMY FUNCTION FOR NOW) ---
    const toggleRecording = () => {
        Alert.alert("Coming Soon 🎤", "Voice-to-Text feature will be available in the next update!");
    };
    // ---------------------------------

    const getProductOptions = () => {
        const dbProducts = productList.map((p: any) => p.model ? `${p.name} - ${p.model}` : p.name);
        return [...dbProducts, "Other"];
    };

    const formatDate = (rawDate: Date) => {
        let day = rawDate.getDate().toString().padStart(2, '0');
        let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
        let year = rawDate.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const getCurrentLocation = async () => {
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return null;
            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            return { lat: location.coords.latitude, lng: location.coords.longitude, timestamp: new Date().toISOString() };
        } catch (error) { return null; }
    };

    const openModal = (type: string, data: any[]) => {
        setCurrentModalType(type);
        setFilteredData(data);
        setSearchText('');
        setModalVisible(true);
    };

    const handleSearch = (text: string) => {
        setSearchText(text);
        let sourceData: any[] = [];
        if(currentModalType === 'Hospital') sourceData = orgList;
        else if(currentModalType === 'Outcome') sourceData = outcomeOptions;
        else if(currentModalType === 'Product') sourceData = getProductOptions();

        if (text) {
            const newData = sourceData.filter(item => {
                if (typeof item === 'string') return item.toLowerCase().includes(text.toLowerCase());
                return (item.orgName || item.name || '').toLowerCase().includes(text.toLowerCase()) || 
                       (item.city || '').toLowerCase().includes(text.toLowerCase());
            });
            setFilteredData(newData);
        } else {
            setFilteredData(sourceData);
        }
    };

    const handleSelect = (item: any) => {
        if (currentModalType === 'Hospital') {
            if (typeof item !== 'string') {
                setHospital(item.orgName || item.name); 
                setOrgId(item.id || ''); 
                setPerson(item.contactPerson || '');
                setMobile(item.mobile || '');
                setEmail(item.email || '');
                setCity(item.city || '');
                setAddress(item.address || '');
            } else {
                setHospital(item); setOrgId(''); 
            }
        }
        else if (currentModalType === 'Product') setProduct(item);
        else if (currentModalType === 'Outcome') setOutcome(item);
        
        setModalVisible(false);
    };

    const triggerAutomatedMessages = async (data: any) => {
        console.log(`\n🚀 [AUTOMATION TRIGGERED] Sending New Lead message to: ${data.person}`);
    };

    // 🔥 5. SAAS SAVE LOGIC
    const handleSave = async () => {
        if (isSubmitting) return;
        if (!hospital || !discussion) return Alert.alert("Missing Fields", "Hospital and Discussion are required.");

        setIsSubmitting(true);
        const locationData = await getCurrentLocation();
        const nextDateISO = nextDate.toISOString().split('T')[0];

        // 1. CREATE DSR (Visit Record)
        const newVisit = {
            visitType: 'Cold Call', 
            hospital, orgName: hospital, orgId,
            person, mobile, city, address, product, discussion, outcome,
            nextFollowUp: nextDateISO,
            date: new Date().toISOString().split('T')[0],
            dateIso: new Date().toISOString().split('T')[0],
            location: locationData || null,
        };

        try {
            const res = await addSaaSData("sales_reports", newVisit);

            if (res.success) {
                // 2. LEAD MANAGEMENT LOGIC (AUTO CONVERT)
                const isPositiveOutcome = ['Interested', 'Demo Planned', 'Follow Up'].includes(outcome);

                if (isPositiveOutcome) {
                    let leadStage = outcome === 'Demo Planned' ? 'Technical Review' : 'Introduction';
                    
                    const newLeadData = {
                        org: hospital, orgName: hospital, orgId: orgId,
                        contactPerson: person, mobile: mobile, email: email, address: address || city, city: city,
                        product: product, requirements: product && product !== 'Other' ? [product] : [],
                        status: outcome, stage: leadStage, type: 'Warm', isHot: false,
                        source: 'Cold Call', nextDate: nextDateISO, date: new Date().toISOString().split('T')[0],
                        discussion: `Cold Call Converted to Lead.\nStatus: ${outcome}\nNote: ${discussion}`
                    };

                    await addSaaSData("leads", newLeadData);
                    if(mobile) triggerAutomatedMessages({ hospital, person, mobile, email });
                }

                // 3. PUSH NOTIFICATION
                if (addNotification) {
                    await addNotification({
                        title: "New Cold Call 📍",
                        message: `${currentUser?.name} visited ${hospital} (${outcome}).`,
                        to: "Admin", 
                        route: "/sales", 
                        type: "info"
                    });
                }

                Alert.alert("Success", "Cold Call Logged Successfully!");
                router.back();
            } else {
                Alert.alert("Error", "Could not log cold call.");
            }
        } catch (error) {
            Alert.alert("Error", "Something went wrong.");
        } finally {
            setIsSubmitting(false); 
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>New Cold Call</Text>
                <View style={{width:24}} /> 
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}>
                <ScrollView style={styles.contentContainer} contentContainerStyle={{paddingBottom: 100}} keyboardShouldPersistTaps="handled">
                    
                    <Text style={styles.infoText}>💡 Only use this for new places. For existing leads, update from the Leads section.</Text>

                    <Text style={styles.label}>Hospital / Clinic *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Hospital', orgList)}>
                        <Text style={{color: hospital ? '#333' : 'gray', flex:1}}>{hospital || "Search..."}</Text>
                        {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
                    </TouchableOpacity>

                    {hospital ? (
                        <View style={styles.autoFillBox}>
                            <Text style={styles.autoFillHeader}>CLIENT DETAILS</Text>
                            <View style={styles.row}>
                                <View style={styles.col}>
                                    <Text style={styles.label}>Contact Person</Text>
                                    <TextInput style={styles.inputGray} value={person} onChangeText={setPerson} />
                                </View>
                                <View style={styles.col}>
                                    <Text style={styles.label}>City</Text>
                                    <TextInput style={styles.inputGray} value={city} onChangeText={setCity} />
                                </View>
                            </View>
                            <Text style={styles.label}>Mobile Number (For Alerts)</Text>
                            <TextInput style={styles.inputGray} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="e.g., 9876543210" />
                        </View>
                    ) : null}

                    <Text style={styles.label}>Product Discussed</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Product', getProductOptions())}>
                        <Text style={{color: product ? '#333' : 'gray', flex:1}}>{product || "Select Product..."}</Text>
                        <Ionicons name="cube-outline" size={20} color="gray" />
                    </TouchableOpacity>
                    
                    {product === 'Other' && (
                        <TextInput style={[styles.inputGray, {marginBottom:15, borderColor:'#3b5998'}]} placeholder="Type Product Name..." onChangeText={setProduct} />
                    )}

                    <View style={styles.row}>
                        <View style={styles.col}>
                            <Text style={styles.label}>Outcome / Status</Text>
                            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Outcome', outcomeOptions)}>
                                <Text style={{color:'#333', fontWeight:'bold'}} numberOfLines={1}>{outcome}</Text>
                                <Ionicons name="caret-down" size={14} color="gray" />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.col}>
                            <Text style={styles.label}>Next Follow Up</Text>
                            <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                                <Text style={{color:'#333', fontWeight:'bold'}}>{formatDate(nextDate)}</Text>
                                <Ionicons name="calendar" size={16} color="#3b5998" />
                            </TouchableOpacity>
                            {showDatePicker && <DateTimePicker value={nextDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if(d) setNextDate(d); }} />}
                        </View>
                    </View>

                    <Text style={styles.label}>Discussion Summary *</Text>
                    <View style={styles.voiceInputContainer}>
                        <TextInput 
                            style={styles.voiceTextInput} 
                            multiline 
                            placeholder="Type here..."
                            value={discussion}
                            onChangeText={setDiscussion}
                        />
                        <TouchableOpacity 
                            onPress={toggleRecording} 
                            style={styles.micBtn}
                        >
                            <Ionicons 
                                name="mic-off-outline" 
                                size={24} 
                                color="gray" 
                            />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={[styles.saveButton, isSubmitting && {backgroundColor:'#9fa8da'}]} onPress={handleSave} disabled={isSubmitting}>
                        {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Submit Cold Call</Text>}
                    </TouchableOpacity>
                    
                    <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                        📍 Location will be captured automatically.
                    </Text>
                    
                    <View style={{height: 100}} />
                </ScrollView>
            </KeyboardAvoidingView>

            {/* SEARCH MODAL */}
            <Modal visible={modalVisible} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select {currentModalType}</Text>
                        <View style={styles.modalSearchBox}>
                            <Ionicons name="search" size={20} color="gray" />
                            <TextInput style={{flex:1, marginLeft:10}} placeholder="Search..." value={searchText} onChangeText={handleSearch} autoFocus={true}/>
                        </View>
                        <FlatList 
                            data={filteredData}
                            keyExtractor={(item, index) => index.toString()}
                            renderItem={({item}) => (
                                <TouchableOpacity style={styles.modalItem} onPress={() => handleSelect(item)}>
                                    {currentModalType === 'Hospital' && typeof item !== 'string' ? (
                                        <View style={{flexDirection:'row', alignItems:'center'}}>
                                            <View style={styles.iconBox}><Ionicons name='business' size={20} color="#3b5998" /></View>
                                            <View style={{marginLeft:10}}>
                                                <Text style={styles.modalMainText}>{item.orgName || item.org || item.name}</Text>
                                                <Text style={styles.modalSubText}>{item.city || 'No City'}</Text>
                                            </View>
                                        </View>
                                    ) : (
                                        <Text style={styles.modalText}>{typeof item === 'string' ? item : (item.name)}</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No Data Found</Text>}
                        />
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                            <Text style={{color:'red', fontWeight:'bold'}}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
    contentContainer: { padding: 20 },
    
    infoText: { backgroundColor: '#fff3e0', color: '#e65100', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 15, fontWeight: 'bold' },
    label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13, marginTop:10 },
    autoFillBox: { backgroundColor: '#f0f8ff', padding: 10, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#d0eaff' },
    autoFillHeader: { fontSize:11, color:'#3b5998', fontWeight:'bold', marginBottom:8, letterSpacing: 1 },

    dropdown: { backgroundColor: '#fff', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, flexDirection:'row', justifyContent:'space-between', alignItems:'center', height:50 },
    inputGray: { backgroundColor: '#fff', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, fontSize:15 },
    
    voiceInputContainer: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fff', paddingRight: 10 },
    voiceTextInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', height: 100, textAlignVertical: 'top', padding: 12, fontSize: 15 },
    micBtn: { marginTop: 15, padding: 10, backgroundColor: '#e3f2fd', borderRadius: 25 },

    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    col: { width: '48%' },
    
    saveButton: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
    saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { width:'100%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '75%' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginBottom:10 },
    modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
    modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalText: { fontSize: 16, color: '#333' },
    closeBtn: { marginTop: 15, alignItems:'center', padding: 12 },

    iconBox: { width: 35, height: 35, borderRadius: 8, justifyContent:'center', alignItems:'center', backgroundColor:'#e3f2fd' },
    modalMainText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
    modalSubText: { fontSize: 12, color: 'gray' }
});