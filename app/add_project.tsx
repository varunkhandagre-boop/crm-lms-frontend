import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

export default function AddProjectScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se sirf User aur Notification nikala
  const { currentUser, addNotification } = useData(); 

  // 🔥 2. Naya SaaS Engine connect kiya
  const { fetchSaaSData, addSaaSData, isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded State for Organizations
  const [orgList, setOrgList] = useState<any[]>([]);

  // --- FORM STATES ---
  const [name, setName] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [description, setDescription] = useState('');
  
  // Auto-filled fields from Organization
  const [client, setClient] = useState('');
  const [orgId, setOrgId] = useState('');
  
  const [location, setLocation] = useState(''); 
  const [address, setAddress] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filteredOrgs, setFilteredOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 🔥 4. LOAD DATA ON MOUNT
  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              const orgs = await fetchSaaSData("organizations");
              setOrgList(orgs);
              setFilteredOrgs(orgs);
          }
      };
      loadData();
  }, [currentUser]);

  // Search Logic
  const handleSearch = (text: string) => {
      setSearchText(text);
      if (text) {
          const newData = orgList.filter((item: any) => {
              const itemData = item.orgName ? item.orgName.toUpperCase() : (item.name ? item.name.toUpperCase() : '');
              const textData = text.toUpperCase();
              return itemData.indexOf(textData) > -1;
          });
          setFilteredOrgs(newData);
      } else {
          setFilteredOrgs(orgList);
      }
  };

  // Select Organization Logic (Auto-Fill)
  const handleSelectOrg = (org: any) => {
      setClient(org.orgName || org.name || '');
      setOrgId(org.id || ''); 
      setLocation(org.city || '');
      setAddress(org.address || '');
      setState(org.state || '');
      setPincode(org.pincode || '');
      setContactPerson(org.contactPerson || '');
      setMobile(org.mobile || '');
      setEmail(org.email || '');
      
      setModalVisible(false);
  };

  // 🔥 5. SAAS SAVE LOGIC
  const handleSave = async () => {
      if (!name || !client || !totalValue) {
          Alert.alert("Missing Fields", "Please fill Project Name, Client and Order Value.");
          return;
      }

      setLoading(true);

      // Clean payload: Engine automatically injects ID, Company ID, Sender ID, Created At
      const newProject = {
          name, 
          client,
          orgId, 
          location, 
          address,
          state,
          pincode,
          contactPerson,
          mobile,
          email,
          totalValue: Number(totalValue), 
          description,
          status: 'Ongoing',
          totalExpense: 0, 
          totalReceived: 0,
          createdBy: currentUser?.name || 'Unknown',
          role: currentUser?.role || 'Employee'
      };

      try {
          const res = await addSaaSData("projects", newProject);
          
          if (res.success) {
              // 🔥 REAL PUSH NOTIFICATION
              if (addNotification) {
                  await addNotification({
                      title: "New Project Started 🏗️",
                      message: `${currentUser?.name} started project: ${name} for ${client}.`,
                      to: "Admin", // Bhejte samay Manager/Accountant ko bhi notify kar sakte hain
                      route: "/projects",
                      type: "success"
                  });
              }

              Alert.alert("Success", "Project Started Successfully! 🏗️");
              router.back();
          } else {
              Alert.alert("Error", "Could not create project.");
          }
      } catch (error) {
          Alert.alert("Error", "Something went wrong.");
      } finally {
          setLoading(false);
      }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Start New Project</Text>
        <View style={{width:24}} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}} keyboardShouldPersistTaps="handled">
            
            <Text style={styles.label}>Project Name / Site Name *</Text>
            <TextInput 
                style={styles.input} 
                placeholder="e.g. Apollo OT Setup Phase 1" 
                value={name} 
                onChangeText={setName} 
            />

            {/* ORGANIZATION SELECTOR */}
            <Text style={styles.label}>Select Client / Organization *</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setModalVisible(true)}>
                <View>
                    <Text style={{fontSize:16, fontWeight: client ? 'bold' : 'normal', color: client ? '#333' : 'gray'}}>
                        {client ? `🏢 ${client}` : "Tap to select Client"}
                    </Text>
                    {location ? <Text style={{fontSize:12, color:'gray', marginTop: 2}}>📍 {location}</Text> : null}
                </View>
                {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="#3b5998" />}
            </TouchableOpacity>

            {/* AUTO-FILLED DETAILS PREVIEW */}
            {client ? (
                <View style={styles.detailsBox}>
                    <Text style={styles.boxTitle}>Client Details (Auto-filled)</Text>
                    
                    <View style={styles.row}>
                        <View style={{flex:1, marginRight:5}}>
                            <Text style={styles.smallLabel}>City</Text>
                            <TextInput style={styles.smallInput} value={location} onChangeText={setLocation} />
                        </View>
                        <View style={{flex:1, marginLeft:5}}>
                            <Text style={styles.smallLabel}>State</Text>
                            <TextInput style={styles.smallInput} value={state} onChangeText={setState} />
                        </View>
                    </View>

                    <Text style={styles.smallLabel}>Full Address</Text>
                    <TextInput style={styles.smallInput} value={address} onChangeText={setAddress} multiline />

                    <View style={styles.row}>
                        <View style={{flex:1, marginRight:5}}>
                            <Text style={styles.smallLabel}>Contact Person</Text>
                            <TextInput style={styles.smallInput} value={contactPerson} onChangeText={setContactPerson} />
                        </View>
                        <View style={{flex:1, marginLeft:5}}>
                            <Text style={styles.smallLabel}>Mobile</Text>
                            <TextInput style={styles.smallInput} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
                        </View>
                    </View>
                </View>
            ) : null}

            <Text style={styles.label}>Total Order Value (₹) *</Text>
            <TextInput 
                style={styles.input} 
                placeholder="e.g. 500000" 
                keyboardType="numeric" 
                value={totalValue} 
                onChangeText={setTotalValue} 
            />

            <Text style={styles.label}>Description / Notes</Text>
            <TextInput 
                style={[styles.input, {height: 80, textAlignVertical:'top'}]} 
                multiline 
                placeholder="Any specific details regarding this project..." 
                value={description} 
                onChangeText={setDescription} 
            />

            <TouchableOpacity style={[styles.btn, loading && {opacity: 0.7}]} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Start Project</Text>}
            </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* SEARCH MODAL */}
      <Modal visible={modalVisible} animationType="slide">
          <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                      <Ionicons name="arrow-back" size={24} color="#333" />
                  </TouchableOpacity>
                  <TextInput 
                      style={styles.searchInput} 
                      placeholder="Search Organization..." 
                      value={searchText}
                      onChangeText={handleSearch}
                      autoFocus
                  />
                  {searchText.length > 0 && (
                      <TouchableOpacity onPress={() => handleSearch('')}>
                          <Ionicons name="close-circle" size={20} color="gray" />
                      </TouchableOpacity>
                  )}
              </View>
              
              <FlatList 
                  data={filteredOrgs}
                  keyExtractor={item => item.id}
                  renderItem={({item}) => (
                      <TouchableOpacity style={styles.orgItem} onPress={() => handleSelectOrg(item)}>
                          <Text style={styles.orgName}>🏢 {item.orgName || item.name}</Text>
                          <Text style={styles.orgSub}>
                              📍 {item.city || 'Unknown City'} • 👤 {item.contactPerson || 'Unknown Contact'}
                          </Text>
                      </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No client found.</Text>}
              />
          </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  
  label: { marginTop: 15, marginBottom: 5, color: '#555', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#f9f9f9' },
  
  // Dropdown Style
  dropdown: { borderWidth: 1, borderColor: '#3b5998', borderRadius: 8, padding: 12, backgroundColor: '#f0f4ff', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  
  // Auto-filled Box
  detailsBox: { backgroundColor: '#f5f5f5', padding: 10, borderRadius: 8, marginTop: 10, borderWidth:1, borderColor:'#eee' },
  boxTitle: { fontSize: 12, fontWeight:'bold', color:'#3b5998', marginBottom:10 },
  row: { flexDirection:'row', marginBottom:5 },
  smallLabel: { fontSize: 10, color:'gray', marginBottom:2 },
  smallInput: { backgroundColor:'white', borderWidth:1, borderColor:'#ddd', borderRadius:4, padding:5, fontSize:13, color:'#333', marginBottom:5 },

  btn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 30, marginBottom: 50, elevation: 3 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: 'white', paddingTop: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16, backgroundColor: '#f0f0f0', padding: 8, borderRadius: 8 },
  orgItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  orgName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  orgSub: { fontSize: 13, color: 'gray', marginTop: 4 }
});