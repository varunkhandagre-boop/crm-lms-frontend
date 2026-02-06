import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    FlatList,
    Linking,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useData } from './context/DataContext';

export default function OrganizationScreen() {
  const router = useRouter();
  const { orgList } = useData();

  // --- STATES ---
  const [searchText, setSearchText] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10); 
  const [selectedOrg, setSelectedOrg] = useState<any>(null); 
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  // --- 🔥 SORTING (A-Z) & SUPER SEARCH ---
  const getFilteredData = () => {
    // 1. Safety Check
    let data = orgList ? [...orgList] : [];

    // 2. 🔥 Sorting: Alphabetical (A to Z)
    data.sort((a: any, b: any) => {
        const nameA = (a.name || a.orgName || "").toLowerCase();
        const nameB = (b.name || b.orgName || "").toLowerCase();
        
        if (nameA < nameB) return -1; // A pehle aayega
        if (nameA > nameB) return 1;  // B baad me aayega
        return 0;
    });

    // 3. Super Search (Name, City, State, Type, Mobile)
    if (searchText) {
        const term = searchText.toLowerCase();
        data = data.filter((item: any) => {
           return (
              (item.name && item.name.toLowerCase().includes(term)) ||
              (item.orgName && item.orgName.toLowerCase().includes(term)) ||
              (item.city && item.city.toLowerCase().includes(term)) ||
              (item.state && item.state.toLowerCase().includes(term)) ||
              (item.type && item.type.toLowerCase().includes(term)) ||
              (item.mobile && item.mobile.toString().includes(term))
           );
        });
    }

    // 4. Limit Logic
    if (itemsPerPage !== -1) {
        return data.slice(0, itemsPerPage);
    }
    return data;
  };

  const displayList = getFilteredData();

  const openDetails = (item: any) => {
      setSelectedOrg(item);
      setDetailsModalVisible(true);
  };

  const handleCall = (number: string) => {
      if(number) Linking.openURL(`tel:${number}`);
  };

  // --- RENDER ITEM ---
  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <View style={{flex:1}}>
                <Text style={styles.orgName} numberOfLines={1}>{item.name || item.orgName}</Text>
                <Text style={styles.subText}>
                    {item.type} • {item.city}{item.state ? `, ${item.state}` : ''}
                </Text>
            </View>
            {/* Initial Circle (A, B, C...) */}
            <View style={styles.initialsCircle}>
                <Text style={styles.initialsText}>{(item.name || item.orgName || 'O').charAt(0).toUpperCase()}</Text>
            </View>
        </View>

        <View style={styles.divider} />
        
        <View style={styles.equipGrid}>
            <View style={styles.equipCol}>
                <Text style={styles.equipText}>Ventilator : {item.equipment?.ventilator || 0}</Text>
                <Text style={styles.equipText}>Compressor : {item.equipment?.compressor || 0}</Text>
            </View>
            <View style={styles.equipCol}>
                <Text style={styles.equipText}>Anesthesia : {item.equipment?.anesthesia || 0}</Text>
                <Text style={styles.equipText}>Monitor : {item.equipment?.monitor || 0}</Text>
            </View>
            <View style={styles.equipCol}>
                <Text style={styles.equipText}>Bubble : {item.equipment?.bubble || 0}</Text>
            </View>
        </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
             <View style={{flexDirection:'row', alignItems:'center'}}>
                 <TouchableOpacity onPress={() => router.back()} style={{marginRight:10}}>
                     <Ionicons name="arrow-back" size={24} color="#3b5998" />
                 </TouchableOpacity>
                 <Text style={styles.headerTitle}>Organizations</Text>
             </View>
             
             <View style={{flexDirection:'row'}}>
                 <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/')}>
                     <Ionicons name="home" size={20} color="#3b5998" />
                 </TouchableOpacity>
                 <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_organization')}>
                     <Ionicons name="add" size={20} color="white" />
                     <Text style={{color:'white', fontWeight:'bold', marginLeft:2}}>Add New</Text>
                 </TouchableOpacity>
             </View>
        </View>

        {/* SEARCH BAR */}
        <View style={styles.searchRow}>
            <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="gray" />
                <TextInput 
                    style={styles.input}
                    placeholder="Search Name, City, State..."
                    value={searchText}
                    onChangeText={setSearchText}
                />
                {searchText.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchText('')}>
                        <Ionicons name="close-circle" size={18} color="gray" />
                    </TouchableOpacity>
                )}
            </View>
        </View>

        {/* LIMIT SELECTOR */}
        <View style={styles.limitContainer}>
            <Text style={{fontSize:12, color:'gray', marginRight:10}}>Show:</Text>
            {[10, 25, 50, -1].map((num) => (
                <TouchableOpacity 
                    key={num} 
                    style={[styles.limitBtn, itemsPerPage === num && styles.activeLimitBtn]} 
                    onPress={() => setItemsPerPage(num)}
                >
                    <Text style={[styles.limitText, itemsPerPage === num && styles.activeLimitText]}>
                        {num === -1 ? 'All' : num}
                    </Text>
                </TouchableOpacity>
            ))}
            <Text style={{marginLeft:'auto', fontSize:12, color:'gray'}}>Total: {orgList?.length || 0}</Text>
        </View>
      </View>

      {/* LIST */}
      <FlatList 
        data={displayList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.contentContainer}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                <Ionicons name="business-outline" size={80} color="#ddd" />
                <Text style={{color:'gray', marginTop:10}}>No Organization Found</Text>
            </View>
        }
      />

      {/* DETAIL MODAL */}
      <Modal visible={detailsModalVisible} transparent={true} animationType="fade">
          
          {/* 👇 KeyboardAvoidingView HATA DIYA (Zarurat nahi hai) */}
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  {selectedOrg && (
                      <>
                          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                              <Text style={styles.modalTitle} numberOfLines={1}>{selectedOrg.name || selectedOrg.orgName}</Text>
                              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                                  <Ionicons name="close-circle" size={28} color="#d32f2f" />
                              </TouchableOpacity>
                          </View>

                          <DetailRow label="Type" value={selectedOrg.type} icon="briefcase" />
                          <DetailRow label="Location" value={`${selectedOrg.city}, ${selectedOrg.state || ''}`} icon="location" />
                          <DetailRow label="Address" value={selectedOrg.address1} icon="map" />
                          
                          <View style={styles.divider} />
                          
                          <Text style={{fontWeight:'bold', color:'#555', marginBottom:10}}>Contact Person:</Text>
                          <DetailRow label="Name" value={selectedOrg.contactPerson} icon="person" />
                          
                          <TouchableOpacity onPress={() => handleCall(selectedOrg.mobile)}>
                             <DetailRow label="Mobile" value={selectedOrg.mobile || 'N/A'} icon="call" highlight />
                          </TouchableOpacity>
                          
                          <DetailRow label="Email" value={selectedOrg.email || 'N/A'} icon="mail" />
                          
                          <View style={styles.divider} />
                          
                          <TouchableOpacity 
                              style={styles.editBtn} 
                              onPress={() => {
                                  setDetailsModalVisible(false);
                                  router.push({ 
                                      pathname: '/add_organization', 
                                      params: { editId: selectedOrg.id } 
                                  });
                              }}
                          >
                              <Ionicons name="create" size={18} color="white" />
                              <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>Edit Details</Text>
                          </TouchableOpacity>
                      </>
                  )}
              </View>
          </View>

      </Modal>
    </View>
  );
}

// Helper Component
const DetailRow = ({label, value, icon, highlight}: any) => (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom:12}}>
        <View style={{width:30}}><Ionicons name={icon} size={20} color={highlight ? "green" : "#3b5998"} /></View>
        <View style={{flex:1}}>
            <Text style={{fontSize:11, color:'gray'}}>{label}</Text>
            <Text style={{fontSize:14, fontWeight:'500', color: highlight ? 'green' : '#333'}}>{value || 'N/A'}</Text>
        </View>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: 'white', paddingTop: 40, paddingBottom: 10, elevation: 4 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, marginBottom: 15 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
  iconBtn: { borderWidth:1, borderColor:'#3b5998', borderRadius:5, padding:6, marginRight:10 },
  addBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#3b5998', borderRadius:5, paddingHorizontal:12, paddingVertical:7 },
  searchRow: { flexDirection: 'row', paddingHorizontal: 15, justifyContent: 'space-between' },
  searchBar: { flex: 1, backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, flexDirection:'row', alignItems:'center', height:45, borderWidth:1, borderColor:'#e0e0e0' },
  input: { flex:1, marginLeft:10, fontSize:15, color:'black' },
  contentContainer: { padding: 15, paddingBottom: 100 },
  
  // Card Styles
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2, borderLeftWidth:4, borderLeftColor:'#3b5998' },
  orgName: { fontWeight: 'bold', fontSize: 16, marginBottom: 2, color:'#333' },
  subText: { color: 'gray', fontSize: 12, marginBottom: 2 },
  initialsCircle: { width:35, height:35, borderRadius:20, backgroundColor:'#e8eaf6', justifyContent:'center', alignItems:'center' },
  initialsText: { color:'#3b5998', fontWeight:'bold', fontSize:16 },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  equipGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  equipCol: { flex: 1 },
  equipText: { fontSize: 11, color: '#555', marginBottom: 3 },
  
  // Limit Styles
  limitContainer: { flexDirection:'row', alignItems:'center', paddingHorizontal:15, marginTop:15, paddingBottom:5 },
  limitBtn: { paddingVertical:4, paddingHorizontal:10, borderRadius:15, backgroundColor:'#e0e0e0', marginRight:8 },
  activeLimitBtn: { backgroundColor:'#3b5998' },
  limitText: { fontSize:12, color:'#333' },
  activeLimitText: { color:'white', fontWeight:'bold' },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998', marginBottom:10, flex:1 },
  editBtn: { flexDirection:'row', backgroundColor:'#3b5998', padding:12, borderRadius:8, justifyContent:'center', alignItems:'center', marginTop:10 }
});