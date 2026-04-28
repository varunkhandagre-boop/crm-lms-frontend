import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
// Firebase Authentication zaroori hai naye accounts banate waqt
import { initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

// 🔥 SAAS IMPORTS (Firestore direct calls removed)
import { firebaseConfig } from '../firebaseConfig'; // Still need config for secondary Auth
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

export default function ManageTeamScreen() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'Users' | 'Permissions' | 'Holidays' | 'Tracking'>('Users'); 
    
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#2c3e50" />
            
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity 
                    onPress={() => {
                        if (router.canGoBack()) router.back();
                        else router.replace('/');
                    }} 
                    style={{padding:5}}
                >
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Admin Control</Text>
                <View style={{width:30}}/>
            </View>

            {/* TABS */}
            <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexGrow: 1}}>
                    <View style={styles.tabContainer}>
                        {['Users', 'Permissions', 'Holidays', 'Tracking'].map((tab) => (
                            <TouchableOpacity 
                                key={tab} 
                                style={[styles.tabBtn, activeTab === tab && styles.activeTabBtn]} 
                                onPress={() => setActiveTab(tab as any)}
                            >
                                <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                                    {tab === 'Tracking' ? 'Live Map' : tab}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </View>

            {/* CONTENT AREA */}
            <View style={{flex:1, padding:10, backgroundColor: '#f4f6f8'}}>
                {activeTab === 'Users' && <UsersTab />}
                {activeTab === 'Permissions' && <PermissionsTab />}
                {activeTab === 'Holidays' && <HolidaysTab />}
                {activeTab === 'Tracking' && <TrackingTab />}
            </View>
        </View>
    );
}

// ====================================================================
// 1️⃣ USERS TAB (SAAS UPDATED)
// ====================================================================
const UsersTab = () => {
    const { currentUser } = useData();
    const { fetchSaaSData, updateSaaSData, addSaaSData } = useSaaSDB();
    
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [editData, setEditData] = useState<any>(null);

    const [visibleCount, setVisibleCount] = useState(15);

    const [formData, setFormData] = useState({
        name: "", email: "", mobile: "", role: "Sales Executive",
        empId: "", joiningDate: "", monthlyTarget: "0", yearlyLeaves: "18", 
        password: "",
        personalEmail: "", personalMobile: "", bloodGroup: "",
        address: "", city: "", state: "", permanentAddress: "",
        bankName: "", accountNo: "", ifscCode: "",
        aadhar: "", pan: "",
        assetNotes: ""
    });

    useEffect(() => { fetchUsers(); }, [currentUser]);

    const fetchUsers = async () => {
        if (!currentUser?.companyId) return;
        setLoading(true);
        try {
            let data = await fetchSaaSData("users");
            
            data.sort((a: any, b: any) => {
                if (a.status === 'Disabled' && b.status !== 'Disabled') return 1;
                if (a.status !== 'Disabled' && b.status === 'Disabled') return -1;
                return 0; 
            });

            setUsers(data);
        } catch (e) { Alert.alert("Error", "Could not load users"); }
        setLoading(false);
    };

    const renderedUsers = users.slice(0, visibleCount);

    const handleSave = async () => {
        if(!formData.email || !formData.name) return Alert.alert("Missing Info", "Name & Email required");
        if(!editData && !formData.password) return Alert.alert("Missing Info", "Password required for new user");

        setIsProcessing(true);
        try {
            const bankDetailsString = `${formData.bankName} - ${formData.accountNo} (${formData.ifscCode})`;
            const payload: any = { 
                ...formData, 
                bankDetails: bankDetailsString,
                monthlyTarget: Number(formData.monthlyTarget),
                yearlyLeaves: Number(formData.yearlyLeaves),
                companyId: currentUser?.companyId // Explicitly ensuring SaaS tie
            };

            if (formData.password) {
                payload.password = formData.password; 
            } else {
                delete payload.password;
            }

            if (editData) {
                await updateSaaSData("users", editData.id, payload);
                Alert.alert("Success", "User Details Updated!");
            } else {
                // Secondary App Auth creation logic remains same as it hits global Auth
                const secondaryApp = initializeApp(firebaseConfig, "Secondary");
                const secondaryAuth = getAuth(secondaryApp);
                await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password);
                await signOut(secondaryAuth);

                // Need custom ID for Users collection, we simulate by passing email as custom ID flag 
                // Since our SaaS engine uses addDoc by default, we modify slightly or let it auto ID. 
                // Assuming your auth maps emails to custom doc IDs, we use the SaaS addData.
                // NOTE: If your DB strictly requires doc ID to be email, you might need a custom endpoint.
                // Assuming standard SaaS approach here:
                payload.id = formData.email.toLowerCase();
                payload.status = "Active";
                await addSaaSData("users", payload); 
                
                Alert.alert("Success", `User Created: ${formData.empId}`);
            }
            setModalVisible(false);
            fetchUsers();
        } catch (e: any) {
            Alert.alert("Error", e.message);
        }
        setIsProcessing(false);
    };

    const handleDisable = async (user: any) => {
        const isDisabled = user.status === 'Disabled';
        const action = isDisabled ? "Activate" : "Disable";
        Alert.alert(
            `Confirm ${action}?`, 
            isDisabled ? "Do you want to re-activate this employee?" : "This user will be disabled and moved to the bottom.", 
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: isDisabled ? "Activate" : "Disable User", 
                    style: isDisabled ? "default" : "destructive", 
                    onPress: async () => {
                        await updateSaaSData("users", user.id, { status: isDisabled ? "Active" : "Disabled" });
                        fetchUsers();
                    }
                }
            ]
        );
    };

    const openEdit = (user: any) => {
        setEditData(user);
        setFormData({
            ...user,
            password: "",
            monthlyTarget: String(user.monthlyTarget || 0),
            yearlyLeaves: String(user.yearlyLeaves || 18)
        });
        setModalVisible(true);
    };

    const openAdd = () => {
        setEditData(null);
        const randomId = `EMP-${new Date().getFullYear()}-${Math.floor(Math.random()*1000)}`;
        setFormData({
            name: "", email: "", mobile: "", role: "Sales Executive", empId: randomId, joiningDate: new Date().toISOString().split('T')[0],
            password: "", city: "", monthlyTarget: "0", yearlyLeaves: "18",
            personalEmail: "", personalMobile: "", bloodGroup: "", address: "", state: "", permanentAddress: "",
            bankName: "", accountNo: "", ifscCode: "", aadhar: "", pan: "", assetNotes: ""
        });
        setModalVisible(true);
    };

    if(loading) return <ActivityIndicator size="large" color="#2c3e50" style={{marginTop: 50}} />;

    return (
        <View style={{flex:1}}>
            <FlatList 
                data={renderedUsers}
                keyExtractor={item => item.id}
                contentContainerStyle={{paddingBottom: 80}}
                renderItem={({item}) => {
                    const isDisabled = item.status === 'Disabled';
                    return (
                        <TouchableOpacity style={[styles.card, isDisabled && {opacity: 0.6, backgroundColor: '#f0f0f0'}]} onPress={() => openEdit(item)}>
                            <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                <View>
                                    <Text style={[styles.cardTitle, isDisabled && {color: 'gray', textDecorationLine: 'line-through'}]}>
                                        {item.name} {isDisabled && "(Disabled)"}
                                    </Text>
                                    <Text style={styles.cardSubtitle}>{item.role} • {item.empId}</Text>
                                </View>
                                <Ionicons name="create-outline" size={20} color="#3b5998" />
                            </View>
                            <View style={{marginTop:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                                <Text style={{fontSize:12, color:'#555'}}>{item.mobile} | {item.city}</Text>
                                <TouchableOpacity onPress={() => handleDisable(item)} hitSlop={{top:10, bottom:10, left:10, right:10}}>
                                    <Ionicons name={isDisabled ? "refresh-circle" : "ban"} size={22} color={isDisabled ? "green" : "#e74c3c"} />
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    );
                }}
                ListFooterComponent={
                    visibleCount < users.length ? (
                        <TouchableOpacity 
                            onPress={() => setVisibleCount(prev => prev + 15)} 
                            style={{
                                padding: 12, 
                                backgroundColor: '#e3f2fd', 
                                alignItems: 'center', 
                                marginVertical: 10, 
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: '#90caf9'
                            }}
                        >
                            <Text style={{fontWeight:'bold', color:'#1565c0'}}>
                                👇 Show More Users ({users.length - visibleCount} remaining)
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        users.length > 0 ? (
                            <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12}}>
                                --- End of Users ---
                            </Text>
                        ) : null
                    )
                }
            />
            
            <TouchableOpacity style={styles.fab} onPress={openAdd}>
                <Ionicons name="add" size={30} color="white" />
            </TouchableOpacity>

            <Modal visible={modalVisible} animationType="slide" transparent>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                    <View style={styles.modalContentFull}>
                        <View style={styles.modalHeaderRow}>
                            <Text style={styles.modalHeader}>{editData ? "Edit Details" : "New Onboarding"}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color="#333"/></TouchableOpacity>
                        </View>
                        
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.sectionHeader}>🏢 Official Info</Text>
                            <Text style={styles.label}>Role</Text>
                            <View style={styles.pickerRow}>
                                {["Admin", "Sales Executive", "Service Engineer", "Accountant", "Store Keeper", "Hr", "Manager"].map(r => (
                                    <TouchableOpacity key={r} onPress={() => setFormData({...formData, role: r})} style={[styles.roleChip, formData.role === r && styles.activeRoleChip]}>
                                        <Text style={{fontSize:10, color: formData.role === r ? 'white' : '#333'}}>{r}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.inputRow}>
                                <View style={{flex:1}}><Text style={styles.label}>Emp ID</Text><TextInput style={[styles.input, {backgroundColor:'#eee'}]} value={formData.empId} editable={false} /></View>
                                <View style={{flex:1}}><Text style={styles.label}>Joining Date</Text><TextInput style={styles.input} value={formData.joiningDate} onChangeText={t=>setFormData({...formData, joiningDate:t})} placeholder="YYYY-MM-DD"/></View>
                            </View>

                            <Text style={styles.label}>Full Name</Text>
                            <TextInput style={styles.input} value={formData.name} onChangeText={t=>setFormData({...formData, name:t})} />
                            <Text style={styles.label}>Official Email</Text>
                            <TextInput style={[styles.input, editData && {backgroundColor:'#eee'}]} value={formData.email} onChangeText={t=>setFormData({...formData, email:t})} editable={!editData} autoCapitalize="none" />

                            <Text style={[styles.label, {color: '#e67e22'}]}>{editData ? "Reset Password" : "Create Password"}</Text>
                            <TextInput style={[styles.input, {borderColor: '#e67e22'}]} value={formData.password} onChangeText={t=>setFormData({...formData, password:t})} placeholder={editData ? "Enter new password" : "Min 6 chars"} />

                            <View style={styles.inputRow}>
                                <View style={{flex:1}}><Text style={styles.label}>Mobile</Text><TextInput style={styles.input} value={formData.mobile} onChangeText={t=>setFormData({...formData, mobile:t})} keyboardType="phone-pad" /></View>
                                <View style={{flex:1}}><Text style={styles.label}>City</Text><TextInput style={styles.input} value={formData.city} onChangeText={t=>setFormData({...formData, city:t})} /></View>
                            </View>
                            <View style={styles.inputRow}>
                                <View style={{flex:1}}><Text style={styles.label}>Target</Text><TextInput style={styles.input} value={String(formData.monthlyTarget)} onChangeText={t=>setFormData({...formData, monthlyTarget:t})} keyboardType="numeric" /></View>
                                <View style={{flex:1}}><Text style={styles.label}>Leaves</Text><TextInput style={styles.input} value={String(formData.yearlyLeaves)} onChangeText={t=>setFormData({...formData, yearlyLeaves:t})} keyboardType="numeric" /></View>
                            </View>

                            <Text style={styles.sectionHeader}>👤 Personal</Text>
                            <View style={styles.inputRow}>
                                <View style={{flex:1}}><Text style={styles.label}>Personal Mobile</Text><TextInput style={styles.input} value={formData.personalMobile} onChangeText={t=>setFormData({...formData, personalMobile:t})} keyboardType="phone-pad" /></View>
                                <View style={{flex:1}}><Text style={styles.label}>Blood Group</Text><TextInput style={styles.input} value={formData.bloodGroup} onChangeText={t=>setFormData({...formData, bloodGroup:t})} /></View>
                            </View>

                            <Text style={styles.label}>Personal Email</Text>
                            <TextInput style={styles.input} value={formData.personalEmail} onChangeText={t=>setFormData({...formData, personalEmail:t})} keyboardType="email-address" placeholder="Optional" />
                            
                            <Text style={styles.sectionHeader}>📍 Address</Text>
                            <Text style={styles.label}>Current Address</Text>
                            <TextInput style={styles.input} value={formData.address} onChangeText={t=>setFormData({...formData, address:t})} placeholder="Full Address" multiline />
                            
                            <Text style={styles.label}>State</Text>
                            <TextInput style={styles.input} value={formData.state} onChangeText={t=>setFormData({...formData, state:t})} placeholder="State" />

                            <Text style={styles.label}>Permanent Address</Text>
                            <TextInput style={styles.input} value={formData.permanentAddress} onChangeText={t=>setFormData({...formData, permanentAddress:t})} placeholder="Permanent Address" multiline />

                            <Text style={styles.sectionHeader}>🏦 Bank & Docs</Text>
                            <TextInput style={styles.input} value={formData.bankName} onChangeText={t=>setFormData({...formData, bankName:t})} placeholder="Bank Name" />
                            <View style={styles.inputRow}>
                                <View style={{flex:1}}><Text style={styles.label}>Account No</Text><TextInput style={styles.input} value={formData.accountNo} onChangeText={t=>setFormData({...formData, accountNo:t})} keyboardType="numeric" /></View>
                                <View style={{flex:1}}><Text style={styles.label}>IFSC</Text><TextInput style={styles.input} value={formData.ifscCode} onChangeText={t=>setFormData({...formData, ifscCode:t})} autoCapitalize="characters" /></View>
                            </View>
                            <View style={styles.inputRow}>
                                <View style={{flex:1}}><Text style={styles.label}>Aadhar</Text><TextInput style={styles.input} value={formData.aadhar} onChangeText={t=>setFormData({...formData, aadhar:t})} keyboardType="numeric" /></View>
                                <View style={{flex:1}}><Text style={styles.label}>PAN</Text><TextInput style={styles.input} value={formData.pan} onChangeText={t=>setFormData({...formData, pan:t})} autoCapitalize="characters" /></View>
                            </View>

                            <Text style={styles.sectionHeader}>💻 Assets</Text>
                            <TextInput style={[styles.input, {height:60}]} value={formData.assetNotes} onChangeText={t=>setFormData({...formData, assetNotes:t})} multiline placeholder="Laptop, Toolkit details..." />
                            <View style={{height:30}}/>
                        </ScrollView>

                        <View style={styles.bottomFooter}>
                            <TouchableOpacity style={styles.bigSaveBtn} onPress={handleSave} disabled={isProcessing}>
                                {isProcessing ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.bigBtnText}>{editData ? "Update Details" : "Save Employee"}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
};

// ====================================================================
// 2️⃣ PERMISSIONS TAB (SAAS UPDATED)
// ====================================================================
const PermissionsTab = () => {
    const { currentUser } = useData();
    const { fetchSaaSData, updateSaaSData, addSaaSData } = useSaaSDB();
    
    const [autoEnabled, setAutoEnabled] = useState(true); 
    const [editMode, setEditMode] = useState<'Role' | 'User'>('Role');
    const [roles, setRoles] = useState(["Admin", "Sales Executive", "Service Engineer", "Manager", "Accountant", "Store Keeper", "Hr"]);
    const [users, setUsers] = useState<any[]>([]);
    
    const [selectedTarget, setSelectedTarget] = useState("Sales Executive"); 
    const [permissions, setPermissions] = useState<any>({});
    
    const allModules = [
        { category: "📊 DASHBOARD & BASICS", items: [{ key: "dashboard", label: "Main Dashboard" }, { key: "calendar", label: "Calendar" }, { key: "map_view", label: "Live Map" }] },
        { category: "📞 SALES & LEADS", items: [{ key: "leads", label: "Leads Master" }, { key: "quotations", label: "Quotations / Estimates" }, { key: "orders", label: "Order Booking" }, { key: "visits", label: "Visits" }, { key: "demos", label: "Demos" }, { key: "sales_analysis", label: "Analysis" }, { key: "catalogs", label: "Catalogs" }, { key: "sales_team_report", label: "Sales Calc" }] },
        { category: "🛠️ SERVICE & SUPPORT", items: [{ key: "tickets", label: "Service Tickets" }, { key: "service_reports", label: "Service Analysis" }, { key: "pms", label: "PMS Schedule" }, { key: "installation", label: "Installation" }, { key: "amc_cmc", label: "AMC / CMC" }, { key: "spares", label: "Spare Parts" }] },
        { category: "📦 OPERATIONS", items: [{ key: "courier", label: "Courier" }, { key: "organizations", label: "Projects" }, { key: "asset_history", label: "Machine/OrgName Details" }, { key: "company_profile", label: "Company Profile" }] },
        { category: "💰 FINANCE", items: [{ key: "payment_due", label: "Payment Dues" }, { key: "payment_coll", label: "Collections" }, { key: "expenses", label: "Expense Claims" }, { key: "advance", label: "Advance" }] },
        { category: "📝 HR & TEAM", items: [{ key: "attendance", label: "Attendance" }, { key: "leave", label: "Leaves" }, { key: "travel", label: "Travel Logs" }] },
        { category: "⚙️ ADMIN CONTROL", items: [{ key: "users", label: "Manage Users" }, { key: "settings", label: "App Settings" }] }
    ];

    useEffect(() => {
        if (!currentUser?.companyId) return;

        const loadData = async () => {
            const usersData = await fetchSaaSData("users");
            setUsers(usersData);

            // Using global settings object for now. In pure SaaS, this should be "company_settings" collection
            // Assumed "settings" collection has docs with custom IDs. Let's use our custom SaaS engine standard.
            try {
               const permData: any[] = await fetchSaaSData("settings_permissions");
               if (permData && permData.length > 0) {
                   setPermissions(permData[0].data || permData[0]); 
               }
            } catch(e) {}
        };
        loadData();
    }, [currentUser]);

    const getSwitchValue = (key: string) => {
        if (editMode === 'Role') {
            return permissions[selectedTarget]?.[key] === true;
        } else {
            const userSpecific = permissions[selectedTarget]?.[key];
            if (userSpecific !== undefined) {
                return userSpecific === true;
            }
            const currentUserObj = users.find(u => u.id === selectedTarget || u.email === selectedTarget);
            const userRole = currentUserObj ? currentUserObj.role : null;
            if (userRole) {
                return permissions[userRole]?.[key] === true;
            }
            return false;
        }
    };

    const togglePerm = (key: string) => {
        const currentValue = getSwitchValue(key); 
        setPermissions((prev: any) => {
            const newPerms = { ...prev };
            if (!newPerms[selectedTarget]) {
                newPerms[selectedTarget] = {};
            }
            newPerms[selectedTarget][key] = !currentValue;
            return newPerms;
        });
    };

    const savePerms = async () => {
        try {
            await addSaaSData("settings_permissions", { data: permissions, id: 'main' });
            Alert.alert("Success ✅", `Permissions updated for ${selectedTarget}!`);
        } catch (e: any) {
            Alert.alert("Error", "Could not save permissions.");
        }
    };

    return (
        <View style={{flex:1}}>
            <Text style={{marginBottom:10, fontWeight:'bold', color:'#555'}}>Select {editMode === 'Role' ? "Role" : "Employee"} to Edit:</Text>
            
            <View style={{flexDirection:'row', backgroundColor:'white', borderRadius:10, padding:5, marginBottom:15, elevation:2}}>
                <TouchableOpacity onPress={() => { setEditMode('Role'); setSelectedTarget(roles[0]); }} style={{flex:1, padding:10, borderRadius:8, backgroundColor: editMode === 'Role' ? '#2c3e50' : 'transparent', alignItems:'center'}}>
                    <Text style={{color: editMode === 'Role' ? 'white' : '#555', fontWeight:'bold'}}>By Role (Group)</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => { 
                        setEditMode('User'); 
                        if(users.length > 0) setSelectedTarget(users[0].id || users[0].email); 
                    }} 
                    style={{flex:1, padding:10, borderRadius:8, backgroundColor: editMode === 'User' ? '#2c3e50' : 'transparent', alignItems:'center'}}>
                    <Text style={{color: editMode === 'User' ? 'white' : '#555', fontWeight:'bold'}}>By Specific User</Text>
                </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10, maxHeight:50}}>
                {editMode === 'Role' ? (
                    roles.map(r => (
                        <TouchableOpacity key={r} onPress={() => setSelectedTarget(r)} style={[styles.roleChip, selectedTarget === r && styles.activeRoleChip, {paddingHorizontal:15, paddingVertical:8, marginRight:10}]}>
                            <Text style={{color: selectedTarget === r ? 'white' : '#333'}}>{r}</Text>
                        </TouchableOpacity>
                    ))
                ) : (
                    users.map((u, i) => (
                        <TouchableOpacity 
                            key={i} 
                            onPress={() => setSelectedTarget(u.id || u.email)} 
                            style={[
                                styles.roleChip, 
                                selectedTarget === (u.id || u.email) && styles.activeRoleChip, 
                                {paddingHorizontal:15, paddingVertical:8, marginRight:10}
                            ]}
                        >
                            <Text style={{color: selectedTarget === (u.id || u.email) ? 'white' : '#333'}}>
                                {u.name}
                            </Text>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            <ScrollView style={{flex:1, backgroundColor:'white', borderRadius:10, padding:10}} showsVerticalScrollIndicator={false}>
                {editMode === 'User' && (
                    <Text style={{backgroundColor:'#fff3e0', padding:10, marginBottom:10, fontSize:12, color:'#e67e22', borderRadius:5}}>
                        ℹ️ Showing effective permissions (Specific User Override {'>'} Role Default).
                    </Text>
                )}

                {allModules.map((group, index) => (
                    <View key={index} style={{marginBottom: 20}}>
                        <Text style={{backgroundColor: '#f0f4ff', padding: 8, fontWeight: 'bold', color: '#3b5998', borderRadius: 5, marginBottom: 5, fontSize: 13}}>{group.category}</Text>
                        {group.items.map((mod) => (
                            <View key={mod.key} style={styles.permRow}>
                                <Text style={{fontSize:15, color: '#333'}}>{mod.label}</Text>
                                <Switch 
                                    value={getSwitchValue(mod.key)}
                                    onValueChange={() => togglePerm(mod.key)}
                                    trackColor={{false: '#eee', true: '#a5d6a7'}}
                                    thumbColor={getSwitchValue(mod.key) ? '#2e7d32' : '#f4f3f4'}
                                />
                            </View>
                        ))}
                    </View>
                ))}
            </ScrollView>
            
            <View style={{alignItems: 'center', marginTop: 15, marginBottom: 60}}>
                <TouchableOpacity style={styles.smallSaveBtn} onPress={savePerms}>
                    <Text style={{color:'white', fontWeight:'bold', fontSize: 14}}>
                        💾 Save for {editMode === 'Role' ? "Role" : "User"}
                    </Text>
                </TouchableOpacity>
            </View>

        </View>
    );
};

// ====================================================================
// 3️⃣ HOLIDAYS TAB (SAAS UPDATED)
// ====================================================================
const HolidaysTab = () => {
    const { currentUser } = useData();
    const { fetchSaaSData, addSaaSData, deleteSaaSData } = useSaaSDB();

    const [holidays, setHolidays] = useState<any[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [newHoliday, setNewHoliday] = useState({ date: new Date(), name: "", type: "Holiday" });
    const [showPicker, setShowPicker] = useState(false);

    useEffect(() => { fetchHolidays(); }, [currentUser]);

    const fetchHolidays = async () => {
        if (!currentUser?.companyId) return;
        const data = await fetchSaaSData("holidays");
        data.sort((a:any, b:any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setHolidays(data);
    };

    const addHoliday = async () => {
        if (!newHoliday.name) return Alert.alert("Error", "Enter Occasion Name");
        const dateStr = newHoliday.date.toISOString().split('T')[0];
        await addSaaSData("holidays", { ...newHoliday, date: dateStr, dateIso: dateStr });
        setModalVisible(false);
        setNewHoliday({ date: new Date(), name: "", type: "Holiday" });
        fetchHolidays();
    };

    const deleteHoliday = async (id: string) => {
        await deleteSaaSData("holidays", id);
        fetchHolidays();
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowPicker(Platform.OS === 'ios'); 
        if (selectedDate) setNewHoliday({ ...newHoliday, date: selectedDate });
        if (Platform.OS === 'android') setShowPicker(false);
    };

    return (
        <View style={{flex:1}}>
            <FlatList 
                data={holidays}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                    <View style={styles.card}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <View style={{backgroundColor:'#e3f2fd', padding:10, borderRadius:8, marginRight:12, alignItems:'center', width:60}}>
                                <Text style={{fontWeight:'bold', color:'#1565c0'}}>{new Date(item.date).getDate()}</Text>
                                <Text style={{fontSize:10, color:'#1565c0'}}>{new Date(item.date).toLocaleString('default', {month:'short'})}</Text>
                            </View>
                            <View style={{flex:1}}>
                                <Text style={styles.cardTitle}>{item.name}</Text>
                                <Text style={{fontSize:12, color:'gray'}}>{item.type}</Text>
                            </View>
                            <TouchableOpacity onPress={() => deleteHoliday(item.id)}><Ionicons name="trash-outline" size={20} color="#e74c3c"/></TouchableOpacity>
                        </View>
                    </View>
                )}
            />
            <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}><Ionicons name="add" size={30} color="white" /></TouchableOpacity>

            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalHeader}>Add Holiday</Text>
                        <Text style={styles.label}>Select Date</Text>
                        <TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.input, {justifyContent:'center'}]}>
                            <Text style={{color:'#333'}}>{newHoliday.date.toDateString()}</Text>
                        </TouchableOpacity>
                        {showPicker && <DateTimePicker value={newHoliday.date} mode="date" display="default" onChange={onDateChange} />}
                        <TextInput style={styles.input} placeholder="Occasion Name" value={newHoliday.name} onChangeText={t=>setNewHoliday({...newHoliday, name:t})} />
                        <View style={styles.pickerRow}>
                            {["Holiday", "Optional", "Event"].map(type => (
                                <TouchableOpacity key={type} onPress={() => setNewHoliday({...newHoliday, type})} style={[styles.roleChip, newHoliday.type === type && styles.activeRoleChip]}>
                                    <Text style={{color: newHoliday.type === type ? 'white' : '#333', fontSize:12}}>{type}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={{flexDirection:'row', gap:10, marginTop:15}}>
                            <TouchableOpacity style={[styles.btn, {backgroundColor:'gray'}]} onPress={()=>setModalVisible(false)}><Text style={{color:'white'}}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, {backgroundColor:'#27ae60'}]} onPress={addHoliday}><Text style={{color:'white'}}>Add</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

// ====================================================================
// 4️⃣ TRACKING TAB (SAAS UPDATED)
// ====================================================================
const TrackingTab = () => {
    const { currentUser } = useData();
    const { fetchSaaSData } = useSaaSDB();

    const [locations, setLocations] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState("All");
    const [loading, setLoading] = useState(false);
    
    // 📅 Date Filter State
    const [mapDate, setMapDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    useEffect(() => {
        const loadUsers = async () => {
            if (currentUser?.companyId) {
                const uData = await fetchSaaSData("users");
                setUsers(uData.map((d:any) => d.name));
            }
        };
        loadUsers();
    }, [currentUser]);

    useEffect(() => {
        fetchLocations();
    }, [mapDate, selectedUser]); 

    const fetchLocations = async () => {
        if (!currentUser?.companyId) return;
        setLoading(true);
        try {
            const year = mapDate.getFullYear();
            const month = String(mapDate.getMonth() + 1).padStart(2, '0');
            const day = String(mapDate.getDate()).padStart(2, '0');
            const dateQuery = `${year}-${month}-${day}`; 

            // Custom Fetch logic since useSaaSDB fetches entire collection
            // For production with massive tracking logs, you should pass a specific query to the hook
            // But for now, we filter locally from the tenant's data
            let data = await fetchSaaSData("location_logs");
            data = data.filter((d:any) => d.date === dateQuery || d.dateIso === dateQuery);

            if (selectedUser !== "All") {
                data = data.filter((d:any) => d.userName === selectedUser || d.name === selectedUser);
            }

            data.sort((a:any, b:any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            setLocations(data);
            
        } catch (e: any) {
            Alert.alert("Error", "Could not fetch location logs.");
        }
        setLoading(false);
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) setMapDate(selectedDate);
        if (Platform.OS === 'android') setShowDatePicker(false);
    };

    return (
        <View style={{flex: 1, borderRadius: 10, overflow: 'hidden'}}>
            
            {/* 🛠️ FILTERS HEADER */}
            <View style={{backgroundColor: 'white', padding: 10, elevation: 2}}>
                
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                    <View>
                        <Text style={{fontSize: 10, color: 'gray', fontWeight:'bold'}}>SELECT DATE</Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{flexDirection:'row', alignItems:'center', marginTop:2}}>
                            <Ionicons name="calendar" size={18} color="#3b5998" />
                            <Text style={{fontWeight:'bold', fontSize:16, marginLeft:5, color:'#333'}}>
                                {mapDate.toDateString()}
                            </Text>
                            <Ionicons name="chevron-down" size={14} color="gray" style={{marginLeft:5}} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={fetchLocations} style={{backgroundColor: '#2c3e50', padding: 8, borderRadius: 5}}>
                        <Ionicons name="refresh" size={18} color="white" />
                    </TouchableOpacity>
                </View>

                {showDatePicker && (
                    <DateTimePicker value={mapDate} mode="date" display="default" onChange={onDateChange} />
                )}

                <Text style={{fontSize: 10, color: 'gray', fontWeight:'bold', marginBottom:5}}>SELECT EMPLOYEE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 5}}>
                    <TouchableOpacity onPress={() => setSelectedUser("All")} style={[styles.roleChip, selectedUser === "All" && styles.activeRoleChip, {marginRight: 5}]}>
                        <Text style={{color: selectedUser === "All" ? 'white' : '#333', fontSize: 11}}>All Staff</Text>
                    </TouchableOpacity>
                    {users.map((u, i) => (
                        <TouchableOpacity key={i} onPress={() => setSelectedUser(u)} style={[styles.roleChip, selectedUser === u && styles.activeRoleChip, {marginRight: 5}]}>
                            <Text style={{color: selectedUser === u ? 'white' : '#333', fontSize: 11}}>{u}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* 🗺️ MAP VIEW */}
            <View style={{flex: 1}}>
                {loading && <ActivityIndicator size="large" color="#3b5998" style={{position:'absolute', top: 20, alignSelf:'center', zIndex:10}} />}
                
                <MapView
                    style={{flex: 1}}
                    provider={PROVIDER_GOOGLE} 
                    initialRegion={{
                        latitude: 20.5937, 
                        longitude: 78.9629,
                        latitudeDelta: 15,
                        longitudeDelta: 15,
                    }}
                    region={locations.length > 0 ? {
                        latitude: locations[locations.length-1].latitude,
                        longitude: locations[locations.length-1].longitude,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                    } : undefined}
                >
                    {locations.length > 1 && (
                        <Polyline
                            coordinates={locations.map(l => ({ latitude: l.latitude, longitude: l.longitude }))}
                            strokeColor="#3498db" 
                            strokeWidth={4}
                        />
                    )}

                    {locations.map((loc, index) => {
                        if (!loc.latitude || !loc.longitude) return null;

                        let pinColor = 'cyan'; 
                        let title = "Path";
                        let zIndex = 1;

                        if (index === 0) { 
                            pinColor = 'green'; title = "Start"; zIndex = 10;
                        } else if (index === locations.length - 1) {
                            pinColor = 'red'; title = "Current/End"; zIndex = 10;
                        } else if (['Order','Lead','Visit'].includes(loc.type)) {
                            pinColor = 'orange'; title = loc.type; zIndex = 5;
                        }

                        return (
                            <Marker
                                key={index}
                                coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
                                title={`${title}: ${loc.userName}`}
                                description={new Date(loc.timestamp).toLocaleTimeString()}
                                pinColor={pinColor}
                                zIndex={zIndex}
                            />
                        );
                    })}
                </MapView>
                
                {locations.length === 0 && !loading && (
                     <View style={{position:'absolute', bottom: 20, alignSelf:'center', backgroundColor:'rgba(255,255,255,0.9)', padding:10, borderRadius:8}}>
                         <Text style={{color:'gray', fontSize:12}}>No logs found for this date.</Text>
                     </View>
                )}
            </View>

            <View style={{backgroundColor: 'white', padding: 8, flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderColor: '#eee'}}>
                <Text style={{fontSize: 10, color: 'green', fontWeight:'bold'}}>● START</Text>
                <Text style={{fontSize: 10, color: 'cyan', fontWeight:'bold'}}>● PATH</Text>
                <Text style={{fontSize: 10, color: 'red', fontWeight:'bold'}}>● END</Text>
                <Text style={{fontSize: 10, color: 'orange', fontWeight:'bold'}}>● VISITS</Text>
            </View>
        </View>
    );
};

// ====================================================================
// 🎨 STYLES
// ====================================================================
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { backgroundColor: '#2c3e50', padding: 15, paddingTop: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    
    tabContainer: { flexDirection: 'row', backgroundColor: 'white', elevation: 2 },
    tabBtn: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent', minWidth: 100 }, 
    activeTabBtn: { borderBottomColor: '#3498db' },
    tabText: { color: 'gray', fontWeight: '600' },
    activeTabText: { color: '#3498db', fontWeight: 'bold' },

    card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 1 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    cardSubtitle: { fontSize: 12, color: 'gray', marginTop: 2 },

    fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#2c3e50', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 5 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20, elevation: 5 },
    modalContentFull: { backgroundColor: 'white', borderRadius: 10, padding: 20, flex:1, marginVertical:40 },
    modalHeaderRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15, borderBottomWidth:1, borderBottomColor:'#eee', paddingBottom:10 },
    modalHeader: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },
    
    sectionHeader: { fontSize: 14, fontWeight: 'bold', color: '#3498db', marginTop: 15, marginBottom: 5, borderBottomWidth:1, borderBottomColor:'#f0f0f0', paddingBottom:3 },
    
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: '#f9f9f9' },
    inputRow: { flexDirection:'row', gap:10 },
    label: { fontSize: 12, color: '#555', marginBottom: 5, fontWeight: 'bold' },
    btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
    
    pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
    roleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#eee', borderWidth: 1, borderColor: '#ddd' },
    activeRoleChip: { backgroundColor: '#3498db', borderColor: '#3498db' },

    permRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
    smallSaveBtn: {
        backgroundColor: '#2c3e50', paddingVertical: 10, paddingHorizontal: 30, borderRadius: 30, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25
    },

    bottomFooter: { marginTop: 10, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#eee', paddingBottom: 5 },
    bigSaveBtn: { backgroundColor: '#27ae60', paddingVertical: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center', width: '100%', elevation: 3 },
    bigBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1 }
});