import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
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
import { useData } from './context/DataContext';

export default function AddProjectScreen() {
  const router = useRouter();
  const { addProject, user, orgList } = useData(); // orgList yahan se liya

  // --- FORM STATES ---
  const [name, setName] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [description, setDescription] = useState('');
  
  // Auto-filled fields from Organization
  const [client, setClient] = useState('');
  const [location, setLocation] = useState(''); // City
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

  // Initialize Filtered List
  useEffect(() => {
      setFilteredOrgs(orgList);
  }, [orgList]);

  // Search Logic
  const handleSearch = (text: string) => {
      setSearchText(text);
      if (text) {
          const newData = orgList.filter((item: any) => {
              const itemData = item.orgName ? item.orgName.toUpperCase() : ''.toUpperCase();
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
      setClient(org.orgName || '');
      setLocation(org.city || '');
      setAddress(org.address || '');
      setState(org.state || '');
      setPincode(org.pincode || '');
      setContactPerson(org.contactPerson || '');
      setMobile(org.mobile || '');
      setEmail(org.email || '');
      
      setModalVisible(false);
  };

  const handleSave = async () => {
      if (!name || !client || !totalValue) {
          Alert.alert("Missing Fields", "Please fill Project Name, Client and Order Value.");
          return;
      }

      setLoading(true);
      const newProject = {
          name, // Project Name (e.g. Apollo OT Setup)
          
          // Organization Details
          client,
          location, // City
          address,
          state,
          pincode,
          contactPerson,
          mobile,
          email,

          // Financials
          totalValue: Number(totalValue), // Total Order Value
          description,
          
          // Default System Fields
          status: 'Ongoing',
          totalExpense: 0, 
          totalReceived: 0,
          createdBy: user?.name,
          createdAt: new Date().toISOString()
      };

      await addProject(newProject);
      setLoading(false);
      Alert.alert("Success", "Project Started Successfully! 🏗️");
      router.back();
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
        <ScrollView contentContainerStyle={{padding: 20}}>
            
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
                        {client || "Tap to select Client"}
                    </Text>
                    {location ? <Text style={{fontSize:12, color:'gray'}}>{location}</Text> : null}
                </View>
                <Ionicons name="chevron-down" size={20} color="gray" />
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

            <Text style={styles.label}>Total Order Value (₹) * 

[Image of stack of money]
</Text>
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

            <TouchableOpacity style={styles.btn} onPress={handleSave} disabled={loading}>
                <Text style={styles.btnText}>{loading ? "Creating Project..." : "Start Project"}</Text>
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
              </View>
              
              <FlatList 
                  data={filteredOrgs}
                  keyExtractor={item => item.id}
                  renderItem={({item}) => (
                      <TouchableOpacity style={styles.orgItem} onPress={() => handleSelectOrg(item)}>
                          <Text style={styles.orgName}>{item.orgName}</Text>
                          <Text style={styles.orgSub}>{item.city} • {item.contactPerson}</Text>
                      </TouchableOpacity>
                  )}
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
  dropdown: { borderWidth: 1, borderColor: '#3b5998', borderRadius: 8, padding: 12, backgroundColor: '#e3f2fd', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  
  // Auto-filled Box
  detailsBox: { backgroundColor: '#f5f5f5', padding: 10, borderRadius: 8, marginTop: 10, borderWidth:1, borderColor:'#eee' },
  boxTitle: { fontSize: 12, fontWeight:'bold', color:'#3b5998', marginBottom:10 },
  row: { flexDirection:'row', marginBottom:5 },
  smallLabel: { fontSize: 10, color:'gray', marginBottom:2 },
  smallInput: { backgroundColor:'white', borderWidth:1, borderColor:'#ddd', borderRadius:4, padding:5, fontSize:13, color:'#333', marginBottom:5 },

  btn: { backgroundColor: '#212121', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 30, marginBottom: 50 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: 'white', paddingTop: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16, backgroundColor: '#f0f0f0', padding: 8, borderRadius: 8 },
  orgItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  orgName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  orgSub: { fontSize: 13, color: 'gray', marginTop: 2 }
});