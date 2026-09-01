import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// 🔥 SAAS IMPORTS (kept for isDbLoading UX only; data itself is API-backed now)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 4: service calls now via new backend API
import { listServiceCalls } from '../services/api/serviceCalls';

const ITEMS_PER_PAGE = 20; 

export default function FieldServiceScreen() {
  const router = useRouter();

  const { currentUser } = useData();
  const { isDbLoading } = useSaaSDB();

  const [serviceList, setServiceList] = useState<any[]>([]);

  const [searchText, setSearchText] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const [visibleLimit, setVisibleLimit] = useState(ITEMS_PER_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);

  // 🔥 LOAD DATA — via new backend API
  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              const services = await listServiceCalls(); // was: fetchSaaSData("service_calls")
              setServiceList(services);
          }
      };
      loadData();
  }, [currentUser]);

  // Same client-side "Field" filter as before — the app never actually sets
  // a distinct Field/Online type on creation (see Phase 4 migration notes),
  // this behavior is preserved unchanged rather than redesigned.
  const fieldData = useMemo(() => {
    return serviceList ? serviceList.filter((item: any) => item.type === 'Field' || item.serviceType === 'Field' || item.serviceType === 'AMC' || item.serviceType === 'CMC' || item.serviceType === 'Breakdown') : [];
  }, [serviceList]);

  const fullFilteredList = useMemo(() => {
    if (!searchText) return fieldData;

    const searchTerms = searchText.toLowerCase().split(' ');
    return fieldData.filter((item: any) => {
      const itemData = `${item.ticketNo || item.id || ''} ${item.hospital || item.hospitalName || ''} ${item.issue || item.remark || ''} ${item.date || ''} ${item.status || ''}`.toLowerCase();
      return searchTerms.every((term: string) => itemData.includes(term));
    });
  }, [searchText, fieldData]);

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
      }, 200);
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

        <View style={{ flexDirection: 'row' }}>
          <Text style={styles.badgeGrayBox}>{item.serviceType || 'Under AMC'}</Text>
          <Text style={styles.badgeGreen}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={{ color: 'gray' }}>{item.date}</Text>
        <Text style={styles.badgeOutline} numberOfLines={1}>
          {item.action || item.resolutionNote ? 'Action Taken' : 'Pending'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 5 }}>
        <Text style={{ fontWeight: 'bold', marginRight: 5, color: '#333' }}>Breakdown:</Text>
        <Text style={{ width: '70%', color: '#555' }} numberOfLines={1}>{item.issue || item.remark}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text style={{ color: 'gray', fontWeight: 'bold', flex: 1 }}>{item.hospital || item.hospitalName}</Text>
        <Ionicons name="chevron-forward" size={16} color="gray" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Field Service Report</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchContainer}>
        {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
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

      <View style={styles.limitContainer}>
        <Text style={{ marginLeft: 'auto', fontSize: 12, color: 'gray' }}>
          Showing {Math.min(visibleLimit, fullFilteredList.length)} of {fullFilteredList.length}
        </Text>
      </View>

      <FlatList
        data={displayList}
        keyExtractor={(item, index) => item.id || index.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 15, paddingBottom: 50 }}
        
        onEndReached={loadMore}
        onEndReachedThreshold={0.5} 
        
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {loadingMore ? (
                    <View style={{ paddingVertical: 20 }}>
                        <ActivityIndicator size="small" color="#3b5998" />
                    </View>
                ) : (
                    visibleLimit < fullFilteredList.length ? (
                        <Text style={{textAlign:'center', color:'gray', fontSize:12, padding:10}}>Scroll down to load more...</Text>
                    ) : (
                        fullFilteredList.length > 0 ? <Text style={{textAlign:'center', color:'#ccc', fontSize:12, padding:20}}>--- End of List ---</Text> : null
                    )
                )}
            </View>
        }
        
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                <>
                    <Ionicons name="construct-outline" size={80} color="#ddd" />
                    <Text style={{ color: 'gray', marginTop: 10 }}>No Field Reports Found</Text>
                </>
            )}
          </View>
        }
      />

      <Modal visible={modalVisible} transparent={true} animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={styles.modalTitle}>Field Service Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#d32f2f" />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <View>
                <DetailRow label="Ticket No" value={selectedItem.ticketNo || selectedItem.scrId || selectedItem.id} icon="ticket" highlight />
                <DetailRow label="Date" value={selectedItem.date} icon="calendar" />
                <DetailRow label="Hospital" value={selectedItem.hospital || selectedItem.hospitalName} icon="business" />

                <View style={styles.divider} />
                <Text style={{ fontSize: 12, color: 'gray', marginBottom: 2 }}>Breakdown Issue:</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 10 }}>{selectedItem.issue || selectedItem.remark}</Text>

                <Text style={{ fontSize: 12, color: 'gray', marginBottom: 2 }}>Action Taken:</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 10, color: '#3b5998' }}>{selectedItem.action || selectedItem.resolutionNote || 'No action recorded yet'}</Text>

                <DetailRow label="Status" value={selectedItem.status} icon="information-circle"
                  color={selectedItem.status === 'Resolved' || selectedItem.status === 'Closed' ? 'green' : 'orange'} />
              </View>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const DetailRow = ({ label, value, icon, highlight, color }: any) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
    <View style={{ width: 30 }}><Ionicons name={icon} size={20} color="#3b5998" /></View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: 'gray' }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: highlight ? 'bold' : '500', color: color ? color : (highlight ? '#3b5998' : '#333') }}>
        {value}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 15, marginBottom: 10, padding: 10, borderRadius: 8, elevation: 2 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },

  limitContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 10 },
  
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  boldText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },

  badgeGreen: { backgroundColor: '#e8f5e9', color: 'green', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight: 'bold', marginLeft: 5 },
  badgeGrayBox: { backgroundColor: '#f0f0f0', color: '#333', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 10 },
  badgeOutline: { borderWidth: 1, borderColor: '#ddd', color: '#333', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
});
