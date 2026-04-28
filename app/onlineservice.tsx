import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (Context DB removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

const ITEMS_PER_PAGE = 20; 

export default function OnlineServiceScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se current user nikala
  const { currentUser } = useData(); 

  // 🔥 2. Naya SaaS Engine
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded Master States
  const [serviceList, setServiceList] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // --- STATES ---
  const [searchText, setSearchText] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // --- PAGINATION STATES ---
  const [visibleLimit, setVisibleLimit] = useState(ITEMS_PER_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);

  // 🔥 4. LOAD SAAS DATA ON MOUNT
  const loadData = async () => {
      if (currentUser?.companyId) {
          const data = await fetchSaaSData("service_calls");
          // Abhi ke liye hum assume kar rahe hain ki "Online" ek status ya property hai,
          // Agar database me "type" field exist karta hai toh we map it accordingly.
          setServiceList(data);
      }
  };

  useEffect(() => {
      loadData();
  }, [currentUser]);

  const onRefresh = async () => {
      setRefreshing(true);
      await loadData();
      setRefreshing(false);
  };

  // --- 1. FILTER ONLY ONLINE SERVICES ---
  const onlineData = useMemo(() => {
     return serviceList ? serviceList.filter((item: any) => item.type === 'Online' || item.serviceType === 'Online') : [];
  }, [serviceList]);

  // --- 2. SMART SEARCH LOGIC (Full Filtered List) ---
  const fullFilteredList = useMemo(() => {
    if (!searchText) return onlineData;
    
    const searchTerms = searchText.toLowerCase().split(' ');
    return onlineData.filter((item: any) => {
       const itemData = `${item.ticketNo || item.scrId || ''} ${item.hospital || item.hospitalName || ''} ${item.issue || item.remark || ''} ${item.date || item.dateIso || ''} ${item.status || ''}`.toLowerCase();
       return searchTerms.every((term: string) => itemData.includes(term));
    });
  }, [searchText, onlineData]);

  // --- 3. DISPLAY LIST (Sliced for View) ---
  const displayList = fullFilteredList.slice(0, visibleLimit);

  useEffect(() => {
    setVisibleLimit(ITEMS_PER_PAGE);
  }, [searchText]);

  const loadMore = () => {
    if (visibleLimit < fullFilteredList.length && !loadingMore) {
        setLoadingMore(true);
        setTimeout(() => {
            setVisibleLimit(prev => prev + ITEMS_PER_PAGE);
            setLoadingMore(false);
        }, 100); 
    }
  };

  const openDetails = (item: any) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.row}>
            <Text style={styles.boldText}>{item.ticketNo || item.scrId || item.id}</Text> 
            <Text style={styles.badgeGreen}>{item.status}</Text>
        </View>
        <Text style={styles.title}>{item.hospital || item.hospitalName}</Text>
        <Text style={{marginBottom:5, color:'gray'}}>{item.date || item.dateIso || item.createdAt?.split('T')[0]}</Text>
        
        <View style={styles.row}>
            <Text style={{color:'gray', fontSize:12}}>Issue: {item.issue || item.remark || 'N/A'}</Text>
        </View>
        
        <View style={styles.divider} />
        <View style={styles.row}>
            <Text style={{fontSize:12, color:'#333'}}>Engineer: {item.engineer || item.senderName || 'Unknown'}</Text>
            <Text style={styles.badgeGray} numberOfLines={1}>{item.action || item.resolutionNote ? 'Action Taken' : 'Pending Action'}</Text>
        </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Online Service Report</Text>
        <View style={{width: 24}} /> 
      </View>

      <View style={styles.searchContainer}>
          {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
          <TextInput 
             style={styles.searchInput}
             placeholder="Search Hospital, Ticket No, Issue..."
             value={searchText}
             onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                  <Ionicons name="close-circle" size={20} color="gray" />
              </TouchableOpacity>
          )}
      </View>

      <View style={styles.limitContainer}>
          <Text style={{marginLeft:'auto', fontSize:12, color:'gray'}}>
              Showing {displayList.length} of {fullFilteredList.length} Records
          </Text>
      </View>

      <FlatList 
        data={displayList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{padding: 15, paddingBottom: 50}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
            loadingMore ? (
                <View style={{paddingVertical: 20}}>
                    <ActivityIndicator size="small" color="#3b5998" />
                </View>
            ) : null
        }
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                    <>
                        <Image source={{ uri: 'https://cdn-icons-png.flaticon.com/512/7486/7486747.png' }} style={{ width: 100, height: 100, opacity: 0.5 }} />
                        <Text style={{color:'gray', marginTop:10}}>No Online Reports Found</Text>
                    </>
                )}
            </View>
        }
      />

      {/* --- POPUP MODAL --- */}
      <Modal visible={modalVisible} transparent={true} animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                    <Text style={styles.modalTitle}>Service Details</Text>
                    <TouchableOpacity onPress={() => setModalVisible(false)}>
                        <Ionicons name="close-circle" size={28} color="#d32f2f" />
                    </TouchableOpacity>
                </View>

                {selectedItem && (
                    <View>
                        <DetailRow label="Ticket No" value={selectedItem.ticketNo || selectedItem.scrId} icon="ticket" />
                        <DetailRow label="Date" value={selectedItem.date || selectedItem.dateIso || selectedItem.createdAt?.split('T')[0]} icon="calendar" />
                        <DetailRow label="Hospital" value={selectedItem.hospital || selectedItem.hospitalName} icon="business" highlight />
                        <View style={styles.divider} />
                        <Text style={{fontSize:12, color:'gray', marginBottom:2}}>Complaint / Issue:</Text>
                        <Text style={{fontSize:14, fontWeight:'500', marginBottom:10}}>{selectedItem.issue || selectedItem.remark}</Text>
                        
                        <Text style={{fontSize:12, color:'gray', marginBottom:2}}>Action Taken:</Text>
                        <Text style={{fontSize:14, fontWeight:'500', marginBottom:10, color:'#3b5998'}}>{selectedItem.action || selectedItem.resolutionNote || 'No Action'}</Text>

                        <DetailRow label="Status" value={selectedItem.status} icon="information-circle" 
                                   color={selectedItem.status === 'Resolved' ? 'green' : 'orange'} />
                    </View>
                )}
            </View>
          </View>
      </Modal>

    </View>
  );
}

const DetailRow = ({label, value, icon, highlight, color}: any) => (
  <View style={{flexDirection:'row', alignItems:'center', marginBottom:12}}>
      <View style={{width:30}}><Ionicons name={icon} size={20} color="#3b5998" /></View>
      <View style={{flex:1}}>
          <Text style={{fontSize:11, color:'gray'}}>{label}</Text>
          <Text style={{fontSize:15, fontWeight: highlight ? 'bold' : '500', color: color ? color : (highlight ? '#3b5998' : '#333')}}>
              {value}
          </Text>
      </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },

  searchContainer: { flexDirection: 'row', alignItems:'center', backgroundColor:'white', margin:15, marginBottom:10, padding:10, borderRadius:8, elevation:2 },
  searchInput: { flex:1, marginLeft:10, fontSize:15 },

  limitContainer: { flexDirection:'row', alignItems:'center', paddingHorizontal:15, marginBottom:10 },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, alignItems:'center' },
  title: { fontWeight: 'bold', fontSize: 15, marginBottom: 5, width:'70%' },
  boldText: { fontWeight: 'bold', color:'#3b5998' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  badgeGreen: { backgroundColor: '#e8f5e9', color: 'green', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 11, fontWeight:'bold' },
  badgeGray: { backgroundColor: '#f0f0f0', color: '#333', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 11, fontWeight:'600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998' },
});