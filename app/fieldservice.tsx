import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  Image, Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useData } from './context/DataContext';

export default function FieldServiceScreen() {
  const router = useRouter();
  const { serviceList } = useData(); // Data Context se liya

  // --- STATES ---
  const [searchText, setSearchText] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // --- 1. FILTER ONLY FIELD SERVICES ---
  const fieldData = serviceList.filter((item: any) => item.type === 'Field');

  // --- 2. SMART SEARCH & LIMIT LOGIC ---
  const getFilteredData = () => {
    if (!searchText) return itemsPerPage === -1 ? fieldData : fieldData.slice(0, itemsPerPage);
    
    const searchTerms = searchText.toLowerCase().split(' ');
    let filtered = fieldData.filter((item: any) => {
       // Search in TicketNo, Hospital, Issue, Date, Status
       const itemData = `${item.ticketNo} ${item.hospital} ${item.issue} ${item.date} ${item.status}`.toLowerCase();
       return searchTerms.every((term: string) => itemData.includes(term));
    });

    if (itemsPerPage !== -1) return filtered.slice(0, itemsPerPage);
    return filtered;
  };

  const displayList = getFilteredData();

  // --- OPEN DETAILS ---
  const openDetails = (item: any) => {
      setSelectedItem(item);
      setModalVisible(true);
  };

  // --- RENDER CARD (Based on your design) ---
  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.row}>
            {/* Ticket ID */}
            <Text style={styles.boldText}>{item.ticketNo || item.id}</Text>
            
            <View style={{flexDirection:'row'}}>
                {/* Placeholder for AMC since it's not in DB yet */}
                <Text style={styles.badgeGrayBox}>Under AMC</Text>
                <Text style={styles.badgeGreen}>{item.status}</Text>
            </View>
        </View>
        
        <View style={styles.row}>
            <Text style={{color:'gray'}}>{item.date}</Text>
            {/* Action taken as Tag */}
            <Text style={styles.badgeOutline} numberOfLines={1}>
                {item.action ? 'Action Taken' : 'Pending'}
            </Text>
        </View>

        {/* Breakdown Issue */}
        <View style={{flexDirection:'row', marginTop:5}}>
            <Text style={{fontWeight:'bold', marginRight:5, color:'#333'}}>Breakdown:</Text>
            <Text style={{width:'70%', color:'#555'}} numberOfLines={1}>{item.issue}</Text>
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.row}>
            {/* Using Hospital Name here */}
            <Text style={{color:'gray', fontWeight:'bold', flex:1}}>{item.hospital}</Text>
            <Ionicons name="chevron-forward" size={16} color="gray" />
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
        <Text style={styles.headerTitle}>Field Service Report</Text>
        <View style={{width: 24}} /> 
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="gray" />
          <TextInput 
             style={styles.searchInput}
             placeholder="Search Hospital, Ticket, Issue..."
             value={searchText}
             onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                  <Ionicons name="close-circle" size={20} color="gray" />
              </TouchableOpacity>
          )}
      </View>

      {/* LIMIT SELECTOR */}
      <View style={styles.limitContainer}>
          <Text style={{fontSize:12, color:'gray', marginRight:10}}>Show:</Text>
          {[25, 50, 100, -1].map((num) => (
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
          <Text style={{marginLeft:'auto', fontSize:12, color:'gray'}}>Total: {fieldData.length}</Text>
      </View>

      {/* LIST VIEW */}
      <FlatList 
        data={displayList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{padding: 15}}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                <Image source={{ uri: 'https://cdn-icons-png.flaticon.com/512/7486/7486747.png' }} style={{ width: 100, height: 100, opacity: 0.5 }} />
                <Text style={{color:'gray', marginTop:10}}>No Field Reports Found</Text>
            </View>
        }
      />

      {/* --- POPUP MODAL --- */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                      <Text style={styles.modalTitle}>Field Service Details</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}>
                          <Ionicons name="close-circle" size={28} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  {selectedItem && (
                      <View>
                          <DetailRow label="Ticket No" value={selectedItem.ticketNo} icon="ticket" highlight />
                          <DetailRow label="Date" value={selectedItem.date} icon="calendar" />
                          <DetailRow label="Hospital" value={selectedItem.hospital} icon="business" />
                          
                          <View style={styles.divider} />
                          <Text style={{fontSize:12, color:'gray', marginBottom:2}}>Breakdown Issue:</Text>
                          <Text style={{fontSize:14, fontWeight:'500', marginBottom:10}}>{selectedItem.issue}</Text>
                          
                          <Text style={{fontSize:12, color:'gray', marginBottom:2}}>Action Taken:</Text>
                          <Text style={{fontSize:14, fontWeight:'500', marginBottom:10, color:'#3b5998'}}>{selectedItem.action || 'No action recorded yet'}</Text>

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
  limitBtn: { paddingVertical:4, paddingHorizontal:8, borderRadius:4, backgroundColor:'#e0e0e0', marginRight:8 },
  activeLimitBtn: { backgroundColor:'#3b5998' },
  limitText: { fontSize:12, color:'#333' },
  activeLimitText: { color:'white', fontWeight:'bold' },

  // Card Styles (Preserved)
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems:'center' },
  boldText: { fontWeight: 'bold', fontSize: 15, color:'#333' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  
  // Badges
  badgeGreen: { backgroundColor: '#e8f5e9', color: 'green', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight:'bold', marginLeft: 5 },
  badgeGrayBox: { backgroundColor: '#f0f0f0', color: '#333', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 10 },
  badgeOutline: { borderWidth:1, borderColor:'#ddd', color: '#333', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight:'bold' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color:'#3b5998' },
});