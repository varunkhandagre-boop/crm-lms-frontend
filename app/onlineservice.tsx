import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useData } from './context/DataContext';

const ITEMS_PER_PAGE = 20; // Number of items to load per scroll

export default function OnlineServiceScreen() {
  const router = useRouter();
  const { serviceList } = useData(); // Get all services

  // --- STATES ---
  const [searchText, setSearchText] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // --- PAGINATION STATES ---
  const [visibleLimit, setVisibleLimit] = useState(ITEMS_PER_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);

  // --- 1. FILTER ONLY ONLINE SERVICES ---
  const onlineData = useMemo(() => {
     return serviceList ? serviceList.filter((item: any) => item.type === 'Online') : [];
  }, [serviceList]);

  // --- 2. SMART SEARCH LOGIC (Full Filtered List) ---
  const fullFilteredList = useMemo(() => {
    if (!searchText) return onlineData;
    
    const searchTerms = searchText.toLowerCase().split(' ');
    return onlineData.filter((item: any) => {
       // Search in TicketNo, Hospital, Issue, Date, Status
       const itemData = `${item.ticketNo || ''} ${item.hospital || ''} ${item.issue || ''} ${item.date || ''} ${item.status || ''}`.toLowerCase();
       return searchTerms.every((term: string) => itemData.includes(term));
    });
  }, [searchText, onlineData]);

  // --- 3. DISPLAY LIST (Sliced for View) ---
  const displayList = fullFilteredList.slice(0, visibleLimit);

  // Reset pagination when search changes
  useEffect(() => {
    setVisibleLimit(ITEMS_PER_PAGE);
  }, [searchText]);

  const loadMore = () => {
    if (visibleLimit < fullFilteredList.length && !loadingMore) {
        setLoadingMore(true);
        setTimeout(() => {
            setVisibleLimit(prev => prev + ITEMS_PER_PAGE);
            setLoadingMore(false);
        }, 100); // Slight delay for smooth UI
    }
  };

  // --- OPEN DETAILS ---
  const openDetails = (item: any) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  // --- RENDER CARD ---
  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.row}>
            {/* Display Ticket No as ID */}
            <Text style={styles.boldText}>{item.ticketNo || item.id}</Text> 
            <Text style={styles.badgeGreen}>{item.status}</Text>
        </View>
        <Text style={styles.title}>{item.hospital}</Text>
        <Text style={{marginBottom:5, color:'gray'}}>{item.date}</Text>
        
        <View style={styles.row}>
            <Text style={{color:'gray', fontSize:12}}>Issue: {item.issue}</Text>
        </View>
        
        <View style={styles.divider} />
        <View style={styles.row}>
            <Text style={{fontSize:12, color:'#333'}}>Engineer: Nilesh Lokhande</Text>
            {/* Display Action as a Tag */}
            <Text style={styles.badgeGray} numberOfLines={1}>{item.action ? 'Action Taken' : 'Pending Action'}</Text>
        </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Online Service Report</Text>
        <View style={{width: 24}} /> 
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="gray" />
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

      {/* TOTAL COUNT INDICATOR */}
      <View style={styles.limitContainer}>
          <Text style={{marginLeft:'auto', fontSize:12, color:'gray'}}>
              Showing {displayList.length} of {fullFilteredList.length} Records
          </Text>
      </View>

      {/* LIST VIEW */}
      <FlatList 
        data={displayList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{padding: 15, paddingBottom: 50}}
        
        // Smart Pagination Props
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
                <Image source={{ uri: 'https://cdn-icons-png.flaticon.com/512/7486/7486747.png' }} style={{ width: 100, height: 100, opacity: 0.5 }} />
                <Text style={{color:'gray', marginTop:10}}>No Online Reports Found</Text>
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
                        <DetailRow label="Ticket No" value={selectedItem.ticketNo} icon="ticket" />
                        <DetailRow label="Date" value={selectedItem.date} icon="calendar" />
                        <DetailRow label="Hospital" value={selectedItem.hospital} icon="business" highlight />
                        <View style={styles.divider} />
                        <Text style={{fontSize:12, color:'gray', marginBottom:2}}>Complaint / Issue:</Text>
                        <Text style={{fontSize:14, fontWeight:'500', marginBottom:10}}>{selectedItem.issue}</Text>
                        
                        <Text style={{fontSize:12, color:'gray', marginBottom:2}}>Action Taken:</Text>
                        <Text style={{fontSize:14, fontWeight:'500', marginBottom:10, color:'#3b5998'}}>{selectedItem.action || 'No Action'}</Text>

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

// Helper Components
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

  // Search
  searchContainer: { flexDirection: 'row', alignItems:'center', backgroundColor:'white', margin:15, marginBottom:10, padding:10, borderRadius:8, elevation:2 },
  searchInput: { flex:1, marginLeft:10, fontSize:15 },

  // Limit
  limitContainer: { flexDirection:'row', alignItems:'center', paddingHorizontal:15, marginBottom:10 },

  // Card Styles (Your Design)
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, alignItems:'center' },
  title: { fontWeight: 'bold', fontSize: 15, marginBottom: 5, width:'70%' },
  boldText: { fontWeight: 'bold', color:'#3b5998' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  badgeGreen: { backgroundColor: '#e8f5e9', color: 'green', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 11, fontWeight:'bold' },
  badgeGray: { backgroundColor: '#f0f0f0', color: '#333', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 11, fontWeight:'600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998' },
});