import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    FlatList,
    Linking,
    Modal,
    ScrollView,
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
  const [selectedOrg, setSelectedOrg] = useState<any>(null); 
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
      setVisibleCount(20);
  }, [searchText]);

  const getFilteredData = () => {
    let data = orgList ? [...orgList] : [];

    data.sort((a: any, b: any) => {
        const nameA = (a.name || a.orgName || "").toLowerCase();
        const nameB = (b.name || b.orgName || "").toLowerCase();
        
        if (nameA < nameB) return -1; 
        if (nameA > nameB) return 1;  
        return 0;
    });

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

    return data;
  };

  const fullList = getFilteredData(); 
  const renderedList = fullList.slice(0, visibleCount);

  const openDetails = (item: any) => {
      setSelectedOrg(item);
      setDetailsModalVisible(true);
  };

  const handleCall = (number: string) => {
      if(number) Linking.openURL(`tel:${number}`);
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <View style={{flex:1}}>
                <Text style={styles.orgName} numberOfLines={1}>{item.name || item.orgName}</Text>
                <Text style={styles.subText}>
                    {item.type} • {item.city}{item.state ? `, ${item.state}` : ''}
                </Text>
            </View>
            <View style={styles.initialsCircle}>
                <Text style={styles.initialsText}>{(item.name || item.orgName || 'O').charAt(0).toUpperCase()}</Text>
            </View>
        </View>

        {item.contactPerson && (
             <View style={{marginTop: 8, flexDirection: 'row', alignItems: 'center'}}>
                 <Ionicons name="person-outline" size={14} color="#555" />
                 <Text style={{fontSize: 12, color: '#555', marginLeft: 5}}>{item.contactPerson} ({item.mobile})</Text>
             </View>
        )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
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

        <View style={styles.limitContainer}>
            <Text style={{marginLeft:'auto', fontSize:12, color:'gray'}}>
                Total Records: <Text style={{fontWeight:'bold', color:'#3b5998'}}>{fullList.length}</Text>
            </Text>
        </View>
      </View>

      <FlatList 
        data={renderedList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.contentContainer}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                <Ionicons name="business-outline" size={80} color="#ddd" />
                <Text style={{color:'gray', marginTop:10}}>No Organization Found</Text>
            </View>
        }
        // 🔥 FIX: Added paddingBottom: 80 wrapper around the footer
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < fullList.length ? (
                    <TouchableOpacity 
                        onPress={() => setVisibleCount(prev => prev + 20)} 
                        style={styles.loadMoreBtn}
                    >
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                            👇 Load More Records ({fullList.length - visibleCount} remaining)
                        </Text>
                    </TouchableOpacity>
                ) : (
                    fullList.length > 0 ? (
                        <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                            --- End of List ---
                        </Text>
                    ) : null
                )}
            </View>
        }
      />

      <Modal visible={detailsModalVisible} transparent={true} animationType="fade">
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

                          <ScrollView showsVerticalScrollIndicator={false} style={{maxHeight: '80%'}}>
                              <DetailRow label="GST Number" value={selectedOrg.gstNumber} icon="document-text" highlight />
                              <DetailRow label="Type" value={selectedOrg.type} icon="briefcase" />
                              <DetailRow label="Territory" value={selectedOrg.territory} icon="map" />
                              <DetailRow label="Total Beds" value={selectedOrg.beds} icon="bed" />
                              
                              <View style={styles.divider} />
                              
                              <Text style={{fontWeight:'bold', color:'#555', marginBottom:10}}>Address Details:</Text>
                              <DetailRow label="Address" value={selectedOrg.address1} icon="home" />
                              <DetailRow label="Location" value={`${selectedOrg.city}, ${selectedOrg.state || ''}`} icon="location" />
                              <DetailRow label="Pincode" value={selectedOrg.pincode} icon="pin" />
                              
                              <View style={styles.divider} />
                              
                              <Text style={{fontWeight:'bold', color:'#555', marginBottom:10}}>Contact Details:</Text>
                              <DetailRow label="Person Name" value={selectedOrg.contactPerson} icon="person" />
                              <DetailRow label="Designation" value={selectedOrg.designation} icon="id-card" />
                              
                              <TouchableOpacity onPress={() => handleCall(selectedOrg.mobile)}>
                                 <DetailRow label="Mobile" value={selectedOrg.mobile || 'N/A'} icon="call" highlight />
                              </TouchableOpacity>
                              
                              <DetailRow label="Email" value={selectedOrg.email || 'N/A'} icon="mail" />
                          </ScrollView>

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
  
  contentContainer: { padding: 15, paddingBottom: 120 }, 
  
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2, borderLeftWidth:4, borderLeftColor:'#3b5998' },
  orgName: { fontWeight: 'bold', fontSize: 16, marginBottom: 2, color:'#333' },
  subText: { color: 'gray', fontSize: 12, marginBottom: 2 },
  initialsCircle: { width:35, height:35, borderRadius:20, backgroundColor:'#e8eaf6', justifyContent:'center', alignItems:'center' },
  initialsText: { color:'#3b5998', fontWeight:'bold', fontSize:16 },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  
  limitContainer: { flexDirection:'row', alignItems:'center', paddingHorizontal:15, marginTop:10, paddingBottom:5 },
  loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998', marginBottom:10, flex:1 },
  editBtn: { flexDirection:'row', backgroundColor:'#3b5998', padding:12, borderRadius:8, justifyContent:'center', alignItems:'center', marginTop:10 }
});