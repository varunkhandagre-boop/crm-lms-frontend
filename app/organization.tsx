import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (No Direct Firebase DB calls)
import { useData } from './context/DataContext';

// 🔥 Phase 10: organizations now come from Postgres via these adapters
import { fetchOrganizations, deleteOrganization } from '../services/api/organizations';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

export default function OrganizationScreen() {
  const router = useRouter();
  
  // 🔥 Context se Sirf User (Baaki SaaS engine handle karega)
  const { currentUser, user } = useData(); 
  const activeUser = currentUser || user;

  // orgList now comes from useCachedList below (cache-first)

  // --- STATES ---
  const [searchText, setSearchText] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<any>(null); 
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); 

  const [visibleCount, setVisibleCount] = useState(20);

  // 🔥 ROLE CHECK
  const userRole = (activeUser?.role || '').toLowerCase().trim();
  const isStrictAdmin = ['admin', 'manager', 'superadmin'].includes(userRole);

  useEffect(() => {
      setVisibleCount(20);
  }, [searchText]);

  // 🔥 ORGANIZATIONS — cache-first (instant from AsyncStorage, then
  // background refresh). See hooks/useCachedList.ts.
  const orgsCacheKey = buildCacheKey('organizations', activeUser?.companyId);
  const {
      data: orgList,
      setData: setOrgList,
      loading: isDbLoading,
      refreshing: orgsRefreshing,
      refresh: refreshOrgs,
  } = useCachedList({
      cacheKey: orgsCacheKey,
      enabled: !!activeUser?.companyId,
      fetcher: fetchOrganizations, // Phase 10
  });

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
      else Alert.alert("Error", "No mobile number available.");
  };

  // 🔥 Phase 10: DELETEs via deleteOrganization()
  const handleDeleteOrg = async () => {
      if (!selectedOrg) return;
      Alert.alert(
          "Delete Organization?",
          "Are you sure you want to permanently delete this organization? (Note: It may break linked reports)",
          [
              { text: "Cancel", style: "cancel" },
              {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                      setIsDeleting(true);
                      try {
                          const res = await deleteOrganization(selectedOrg.id);
                          if (res.success) {
                              setOrgList(prev => prev.filter(o => o.id !== selectedOrg.id));
                              setDetailsModalVisible(false);
                              Alert.alert("Deleted", "Organization has been deleted.");
                          } else {
                              Alert.alert("Error", "Could not delete organization.");
                          }
                      } catch (error: any) {
                          Alert.alert("Error", error.message);
                      } finally {
                          setIsDeleting(false);
                      }
                  }
              }
          ]
      );
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
            <View style={{flex:1, paddingRight: 10}}>
                <Text style={styles.orgName} numberOfLines={1}>{item.name || item.orgName}</Text>
                
                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                    <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{item.type || 'Clinic'}</Text>
                    </View>
                    <Text style={styles.subText} numberOfLines={1}>
                        📍 {item.city}{item.state ? `, ${item.state}` : ''}
                    </Text>
                </View>
            </View>
            <View style={styles.initialsCircle}>
                <Text style={styles.initialsText}>{(item.name || item.orgName || 'O').charAt(0).toUpperCase()}</Text>
            </View>
        </View>

        <View style={styles.divider} />

        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
             <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                 <Ionicons name="person-circle-outline" size={16} color="#555" />
                 <Text style={{fontSize: 12, color: '#444', marginLeft: 5}} numberOfLines={1}>
                     {item.contactPerson || 'No Contact Person'}
                 </Text>
             </View>
             
             {item.mobile ? (
                 <TouchableOpacity 
                     onPress={() => handleCall(item.mobile)} 
                     style={styles.quickCallBtn}
                 >
                     <Ionicons name="call" size={12} color="#2e7d32" />
                     <Text style={{fontSize: 11, color: '#2e7d32', fontWeight: 'bold', marginLeft: 4}}>Call</Text>
                 </TouchableOpacity>
             ) : (
                 <Text style={{fontSize: 10, color: '#aaa', fontStyle: 'italic'}}>No Number</Text>
             )}
        </View>
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
                {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
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
        refreshControl={
            <RefreshControl refreshing={orgsRefreshing} onRefresh={refreshOrgs} colors={['#3b5998']} tintColor="#3b5998" />
        }
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                    <>
                        <Ionicons name="business-outline" size={80} color="#ddd" />
                        <Text style={{color:'gray', marginTop:10}}>No Organization Found</Text>
                    </>
                )}
            </View>
        }
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

                          {/* 🔥 ADMIN ONLY EDIT & DELETE BUTTONS */}
                          {isStrictAdmin && (
                              <View style={{flexDirection: 'row', gap: 10, marginTop: 15, paddingTop: 10, borderTopWidth: 1, borderColor: '#eee'}}>
                                  <TouchableOpacity 
                                      style={[styles.editBtn, {flex: 1}]} 
                                      onPress={() => {
                                          setDetailsModalVisible(false);
                                          router.push({ 
                                              pathname: '/add_organization', 
                                              params: { editId: selectedOrg.id } 
                                          });
                                      }}
                                  >
                                      <Ionicons name="create" size={18} color="white" />
                                      <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>Edit</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity 
                                      style={[styles.deleteBtn, {flex: 1}]} 
                                      onPress={handleDeleteOrg}
                                      disabled={isDeleting}
                                  >
                                      {isDeleting ? <ActivityIndicator size="small" color="white" /> : (
                                          <>
                                              <Ionicons name="trash-outline" size={18} color="white" />
                                              <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>Delete</Text>
                                          </>
                                      )}
                                  </TouchableOpacity>
                              </View>
                          )}
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
  subText: { color: 'gray', fontSize: 12, marginLeft: 8 },
  
  typeBadge: { backgroundColor: '#e3f2fd', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 10, color: '#1565c0', fontWeight: 'bold' },

  initialsCircle: { width:35, height:35, borderRadius:20, backgroundColor:'#e8eaf6', justifyContent:'center', alignItems:'center' },
  initialsText: { color:'#3b5998', fontWeight:'bold', fontSize:16 },
  
  quickCallBtn: { backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },

  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  
  limitContainer: { flexDirection:'row', alignItems:'center', paddingHorizontal:15, marginTop:10, paddingBottom:5 },
  loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998', marginBottom:10, flex:1 },
  
  editBtn: { flexDirection:'row', backgroundColor:'#3b5998', padding:12, borderRadius:8, justifyContent:'center', alignItems:'center' },
  deleteBtn: { flexDirection:'row', backgroundColor:'#d32f2f', padding:12, borderRadius:8, justifyContent:'center', alignItems:'center' }
});
