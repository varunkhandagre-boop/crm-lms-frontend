import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (users + office_machines still Firestore — office_machines
// is explicitly out of scope for this phase, see spareParts.ts adapter note)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 3: spare parts catalog + stock now go through the new backend API
import { issueStock as apiIssueStock, listSpareParts } from '../services/api/spareParts';
import { fetchTeamMembers } from '../services/api/users';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

export default function SparePartsScreen() {
  const router = useRouter();
  
  const { currentUser } = useData();

  // 🔥 SaaS Engine kept for users + office_machines only
  const { fetchSaaSData, addSaaSData, deleteSaaSData, isDbLoading } = useSaaSDB();

  // sparePartsList now comes from useCachedList below (cache-first)
  // userList now comes from useCachedList below (cache-first, shared 'team_members' key)

  const [activeTab, setActiveTab] = useState<'Parts' | 'StockList'>('Parts'); 
  const [stockSubTab, setStockSubTab] = useState<'OfficeStock' | 'SpareList'>('OfficeStock'); 
  
  const [searchText, setSearchText] = useState('');
  
  const [modalVisible, setModalVisible] = useState(false);
  const [newMachineName, setNewMachineName] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [machinesList, setMachinesList] = useState<any[]>([]);

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedPart, setSelectedPart] = useState<any>(null);
  
  const [machineDetailVisible, setMachineDetailVisible] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<any>(null);

  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [issueQty, setIssueQty] = useState('');

  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
      setVisibleCount(20);
  }, [activeTab, stockSubTab, searchText]);

  const userRole = (currentUser?.role || '').toLowerCase();
  const isAdmin = userRole.includes('admin') || userRole.includes('manager') || userRole.includes('store') || userRole.includes('superadmin');

  // 🔥 SPARE PARTS — cache-first (instant from AsyncStorage, then
  // background refresh). See hooks/useCachedList.ts.
  const sparePartsCacheKey = buildCacheKey('spare_parts', currentUser?.companyId);
  const {
      data: sparePartsList,
      loading: sparePartsLoading,
      refreshing: sparePartsRefreshing,
      refresh: refreshSpareParts,
  } = useCachedList({
      cacheKey: sparePartsCacheKey,
      enabled: !!currentUser?.companyId,
      fetcher: listSpareParts, // was: fetchSaaSData("spare_parts")
  });

  // 🔥 Users — cache-first, shares the SAME 'team_members' cache key as
  // manage_team.tsx/employee_timeline.tsx.
  const { data: userList, refresh: refreshUsersForSpareParts } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });

  // office_machines — unchanged plain fetch-on-mount (stays Firestore CRUD,
  // out of scope for this pass).
  const loadRest = async () => {
      if (currentUser?.companyId) {
          const machines = await fetchSaaSData("office_machines");
          setMachinesList(machines);
      }
  };

  useEffect(() => {
      loadRest();
  }, [currentUser]);

  const onRefresh = async () => {
      await Promise.all([refreshSpareParts(), loadRest(), refreshUsersForSpareParts()]);
  };


  const getCatalogList = () => {
      if (!sparePartsList) return [];
      return sparePartsList.filter((item: any) => 
          (item.partName && item.partName.toLowerCase().includes(searchText.toLowerCase())) ||
          (item.partNo && item.partNo.toLowerCase().includes(searchText.toLowerCase()))
      );
  };

  const getEmployeeStock = () => {
      let stockData: any[] = [];
      sparePartsList.forEach((part: any) => {
          if (part.stockHolders) {
              Object.keys(part.stockHolders).forEach((uid) => {
                  const qty = part.stockHolders[uid];
                  if (qty > 0) {
                      const empName = userList.find((u:any) => u.uid === uid || u.id === uid)?.name || 'Unknown';
                      if(!isAdmin && uid !== (currentUser?.uid || currentUser?.id)) return;

                      stockData.push({
                          ...part, 
                          uniqueId: part.id + uid, 
                          empName: empName,
                          empQty: qty
                      });
                  }
              });
          }
      });
      if (searchText) {
          stockData = stockData.filter(item => 
              item.partName.toLowerCase().includes(searchText.toLowerCase()) || 
              item.empName.toLowerCase().includes(searchText.toLowerCase())
          );
      }
      return stockData;
  };

  const catalogList = getCatalogList();
  const employeeStockList = getEmployeeStock();

  let currentList: any[] = [];
  if (activeTab === 'Parts') {
      currentList = employeeStockList;
  } else if (activeTab === 'StockList') {
      if (stockSubTab === 'OfficeStock') {
          currentList = machinesList;
          if (searchText) {
              currentList = currentList.filter(item => item.name.toLowerCase().includes(searchText.toLowerCase()));
          }
      }
      else currentList = catalogList;
  }

  const renderedList = currentList.slice(0, visibleCount);

  // --- ADD MACHINE (still Firestore — office_machines out of scope) ---
  const handleAddMachine = async () => {
      if (!newMachineName || !newQuantity) {
          Alert.alert("Error", "Please fill Name and Quantity");
          return;
      }
      setLoading(true);
      try {
          const res = await addSaaSData("office_machines", {
              name: newMachineName,
              quantity: parseInt(newQuantity) || 1,
              addedBy: currentUser?.name,
              createdAt: new Date().toISOString()
          });
          if (res.success) {
              setModalVisible(false);
              setNewMachineName('');
              setNewQuantity('');
              await loadRest();
              Alert.alert("Success", "Machine Added to Office Stock List");
          } else {
              Alert.alert("Error", "Failed to add machine.");
          }
      } catch (e: any) {
          Alert.alert("Error", e.message);
      } finally {
          setLoading(false);
      }
  };

  // --- DELETE MACHINE (still Firestore) ---
  const handleDeleteMachine = async (id: string) => {
      Alert.alert("Confirm", "Delete this machine?", [
          { text: "Cancel" },
          { text: "Delete", style: 'destructive', onPress: async () => {
              const res = await deleteSaaSData("office_machines", id);
              if (res.success) {
                  setMachinesList(prev => prev.filter(m => m.id !== id));
              } else {
                  Alert.alert("Error", "Could not delete.");
              }
          }}
      ]);
  };

  // 🔥 ISSUE STOCK — via new backend API (server does the stock math + concurrency-safe)
  const handleIssueStock = async () => {
      if (!selectedEmpId || !issueQty) {
          Alert.alert("Error", "Select Employee and Quantity");
          return;
      }
      const qty = parseInt(issueQty);
      if (qty <= 0) return;

      setLoading(true);
      try {
          await apiIssueStock(selectedPart.id, selectedEmpId, qty);
          setIssueModalVisible(false);
          setDetailsModalVisible(false);
          await refreshSpareParts();
          Alert.alert("Success", "Stock Issued to Employee!");
      } catch (e: any) {
          Alert.alert("Error", e?.message || "Failed to issue stock.");
      } finally {
          setLoading(false);
      }
  };

  const openPartDetails = (item: any) => {
      const myQty = item.empQty !== undefined ? item.empQty : (item.stockHolders?.[currentUser?.uid || currentUser?.id] || 0);
      const officeQty = item.officeStock || 0;
      
      setSelectedPart({ ...item, myQty, officeQty });
      setDetailsModalVisible(true);
  };

  const openMachineDetails = (item: any) => {
      setSelectedMachine(item);
      setMachineDetailVisible(true);
  };

  const renderStockItem = ({item}: any) => (
      <TouchableOpacity style={styles.stockCard} onPress={() => openPartDetails(item)}>
          <View style={{flex:1}}>
              <Text style={styles.itemName}>{item.partName}</Text>
              <Text style={styles.itemSub}>PN: {item.partNo}</Text>
          </View>
          <View style={{alignItems:'flex-end'}}>
              <View style={styles.empBadge}>
                  <Ionicons name="person" size={10} color="#1b5e20" />
                  <Text style={styles.empName}>{item.empName}</Text>
              </View>
              <Text style={styles.qtyText}>Qty: {item.empQty}</Text>
          </View>
      </TouchableOpacity>
  );

  const renderMachineItem = ({item}: any) => (
      <TouchableOpacity style={styles.machineCard} onPress={() => openMachineDetails(item)}>
          <View style={{flexDirection:'row', alignItems:'center', flex:1}}>
              <View style={styles.iconBox}>
                  <Ionicons name="print-outline" size={22} color="#0d47a1" />
              </View>
              <View style={{marginLeft:10, flex:1}}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.qtyLabel}>
                      Qty: <Text style={styles.bigStockText}>{item.quantity}</Text>
                  </Text>
              </View>
          </View>
          {isAdmin && (
              <TouchableOpacity onPress={() => handleDeleteMachine(item.id)} style={{padding:5}}>
                  <Ionicons name="trash-outline" size={20} color="#d32f2f" />
              </TouchableOpacity>
          )}
      </TouchableOpacity>
  );

  const renderCatalogItem = ({item}: any) => (
      <TouchableOpacity style={styles.card} onPress={() => openPartDetails(item)}>
          <View style={styles.cardHeader}>
              <View style={{flex:1}}>
                  <Text style={styles.partName}>{item.partName}</Text>
                  <Text style={styles.partNo}>PN: {item.partNo}</Text>
              </View>
              <View style={styles.priceTag}>
                  <Text style={styles.priceText}>₹{item.price}</Text>
              </View>
          </View>
          <Text style={styles.modelText} numberOfLines={1}>For: {item.compatibleModels}</Text>
          <View style={{flexDirection:'row', marginTop:8, alignItems:'center'}}>
              <Text style={{fontSize:12, color:'#555'}}>Office Stock: </Text>
              <Text style={styles.bigStockTextOrange}>{item.officeStock || 0}</Text>
          </View>
      </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
        <View style={styles.header}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Spare Parts</Text>
            </View>

            {isAdmin && (
                <TouchableOpacity 
                    style={styles.addButton}
                    onPress={() => {
                        if (activeTab === 'StockList' && stockSubTab === 'SpareList') router.push('/add_spare_part' as any);
                        else if (activeTab === 'StockList' && stockSubTab === 'OfficeStock') setModalVisible(true);
                        else Alert.alert("Info", "Switch to 'Stock List' to add items.");
                    }}
                >
                    <Ionicons name="add" size={18} color="white" />
                    <Text style={styles.addButtonText}>
                        {activeTab === 'StockList' && stockSubTab === 'OfficeStock' ? 'Add Machine' : (stockSubTab === 'SpareList' && activeTab === 'StockList' ? 'Add Part' : 'Add')}
                    </Text>
                </TouchableOpacity>
            )}
        </View>

        <View style={styles.tabContainer}>
            <TouchableOpacity style={[styles.tab, activeTab === 'Parts' && styles.activeTab]} onPress={() => setActiveTab('Parts')}>
                <Text style={[styles.tabText, activeTab === 'Parts' && styles.activeTabText]}>Spare Parts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, activeTab === 'StockList' && styles.activeTab]} onPress={() => setActiveTab('StockList')}>
                <Text style={[styles.tabText, activeTab === 'StockList' && styles.activeTabText]}>Stock List</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
            {isDbLoading ? <ActivityIndicator size="small" color="#3b5998"/> : <Ionicons name="search" size={20} color="gray" />}
            <TextInput style={styles.input} placeholder="Search..." value={searchText} onChangeText={setSearchText} />
            {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="gray"/></TouchableOpacity>}
        </View>

        {activeTab === 'StockList' && (
            <View style={styles.subTabContainer}>
                <TouchableOpacity style={[styles.subTab, stockSubTab === 'OfficeStock' && styles.activeSubTab]} onPress={() => setStockSubTab('OfficeStock')}>
                    <Text style={[styles.subTabText, stockSubTab === 'OfficeStock' && styles.activeSubTabText]}>Office Stock List</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.subTab, stockSubTab === 'SpareList' && styles.activeSubTab]} onPress={() => setStockSubTab('SpareList')}>
                    <Text style={[styles.subTabText, stockSubTab === 'SpareList' && styles.activeSubTabText]}>Spare Part List</Text>
                </TouchableOpacity>
            </View>
        )}

        <FlatList 
            data={renderedList}
            keyExtractor={(item, index) => item.uniqueId || item.id || index.toString()}
            contentContainerStyle={{padding:15, paddingBottom: 100}}
            refreshControl={
                <RefreshControl refreshing={sparePartsRefreshing} onRefresh={onRefresh} colors={['#3b5998']} tintColor="#3b5998" />
            }
            ListEmptyComponent={
                <View style={{alignItems: 'center', marginTop: 50}}>
                    {sparePartsLoading ? <ActivityIndicator size="large" color="#3b5998" /> : <Text style={styles.emptyText}>No Items Found.</Text>}
                </View>
            }
            renderItem={
                activeTab === 'Parts' ? renderStockItem : 
                (stockSubTab === 'OfficeStock' ? renderMachineItem : renderCatalogItem)
            }
            ListFooterComponent={
                <View style={{ paddingBottom: 80 }}>
                    {visibleCount < currentList.length ? (
                        <TouchableOpacity 
                            onPress={() => setVisibleCount(prev => prev + 20)} 
                            style={{
                                padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 15, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', elevation: 1
                            }}
                        >
                            <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                                👇 Load More Records ({currentList.length - visibleCount} remaining)
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        currentList.length > 0 ? (
                            <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                                --- End of List ---
                            </Text>
                        ) : null
                    )}
                </View>
            }
        />

        {/* --- ADD MACHINE MODAL --- */}
        <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Add Office Machine</Text>
                    <Text style={styles.label}>Machine Name</Text>
                    <TextInput style={styles.inputBox} placeholder="e.g. Printer" value={newMachineName} onChangeText={setNewMachineName} />
                    <Text style={styles.label}>Quantity</Text>
                    <TextInput style={styles.inputBox} placeholder="e.g. 5" value={newQuantity} onChangeText={setNewQuantity} keyboardType="numeric" />
                    <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:25}}>
                        <TouchableOpacity style={[styles.btn, {backgroundColor:'#9e9e9e'}]} onPress={() => setModalVisible(false)}>
                            <Text style={{color:'white', fontWeight:'bold'}}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, {backgroundColor:'#3b5998'}]} onPress={handleAddMachine} disabled={loading}>
                            {loading ? <ActivityIndicator color="white"/> : <Text style={{color:'white', fontWeight:'bold'}}>Add Machine</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>

        {/* --- PART DETAILS POPUP --- */}
        <Modal visible={detailsModalVisible} transparent animationType="fade" onRequestClose={() => setDetailsModalVisible(false)}>
            <View style={styles.modalOverlay}>
                <View style={styles.detailsContent}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                        <Text style={styles.modalTitle}>Part Details</Text>
                        <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                            <Ionicons name="close-circle" size={30} color="#d32f2f" />
                        </TouchableOpacity>
                    </View>

                    {selectedPart && (
                        <ScrollView>
                            <DetailRow label="Part Name" value={selectedPart.partName} full />
                            <DetailRow label="Part Number" value={selectedPart.partNo} />
                            <DetailRow label="Price" value={`₹ ${selectedPart.price}`} color="#e65100" />
                            <View style={styles.divider} />
                            
                            <Text style={styles.sectionHeader}>STOCK STATUS</Text>
                            <View style={styles.stockRow}>
                                <View style={[styles.myStockBox, {padding:15}]}>
                                    <Text style={styles.myStockLabel}>
                                        {selectedPart.empName ? `${selectedPart.empName.toUpperCase()}'S STOCK` : 'MY STOCK'}
                                    </Text>
                                    <Text style={[styles.myStockValue, {fontSize:24}]}>{selectedPart.myQty}</Text>
                                </View>
                                <View style={[styles.officeStockBox, {padding:15}]}>
                                    <Text style={styles.officeStockLabel}>OFFICE STOCK</Text>
                                    <Text style={[styles.officeStockValue, {fontSize:24}]}>{selectedPart.officeStock || 0}</Text>
                                </View>
                            </View>

                            {isAdmin && (selectedPart.officeStock > 0) && (
                                <TouchableOpacity 
                                    style={styles.issueBtn} 
                                    onPress={() => setIssueModalVisible(true)}
                                >
                                    <Ionicons name="paper-plane-outline" size={20} color="white" />
                                    <Text style={{color:'white', fontWeight:'bold', marginLeft:10}}>Issue to Employee</Text>
                                </TouchableOpacity>
                            )}
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>

        {/* --- MACHINE DETAILS POPUP --- */}
        <Modal visible={machineDetailVisible} transparent animationType="fade" onRequestClose={() => setMachineDetailVisible(false)}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                        <Text style={styles.modalTitle}>Office Stock Details</Text>
                        <TouchableOpacity onPress={() => setMachineDetailVisible(false)}>
                            <Ionicons name="close-circle" size={28} color="#d32f2f" />
                        </TouchableOpacity>
                    </View>
                    
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {selectedMachine && (
                            <View>
                                <DetailRow label="Item Name" value={selectedMachine.name} /> 
                                <DetailRow label="Quantity" value={selectedMachine.quantity} />
                                <DetailRow label="Added By" value={selectedMachine.addedBy || 'Admin'} />
                                <DetailRow label="Date Added" value={selectedMachine.createdAt?.split('T')[0] || '-'} />
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>

        {/* --- ISSUE STOCK MODAL --- */}
        <Modal visible={issueModalVisible} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Issue Stock to Employee</Text>
                    
                    <Text style={styles.label}>Select Employee</Text>
                    <ScrollView style={{maxHeight:150, borderWidth:1, borderColor:'#ddd', borderRadius:5, marginBottom:10}}>
                        {userList.map((u:any) => (
                            <TouchableOpacity 
                                key={u.id} 
                                style={[styles.empItem, selectedEmpId === (u.uid || u.id) && {backgroundColor:'#e3f2fd'}]}
                                onPress={() => setSelectedEmpId(u.uid || u.id)}
                            >
                                <Text style={{fontWeight: selectedEmpId === (u.uid || u.id) ? 'bold' : 'normal'}}>{u.name}</Text>
                                {selectedEmpId === (u.uid || u.id) && <Ionicons name="checkmark" size={16} color="#3b5998"/>}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <Text style={styles.label}>Quantity to Issue</Text>
                    <TextInput 
                        style={styles.inputBox} 
                        placeholder="e.g. 1" 
                        value={issueQty} 
                        onChangeText={setIssueQty} 
                        keyboardType="numeric"
                    />

                    <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:20}}>
                        <TouchableOpacity style={[styles.btn, {backgroundColor:'gray'}]} onPress={() => setIssueModalVisible(false)}>
                            <Text style={{color:'white'}}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, {backgroundColor:'#3b5998'}]} onPress={handleIssueStock} disabled={loading}>
                            {loading ? <ActivityIndicator color="white"/> : <Text style={{color:'white'}}>Confirm Issue</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>

    </View>
  );
}

const DetailRow = ({label, value, full, color}: any) => (
    <View style={{
        flexDirection: full ? 'column' : 'row', 
        justifyContent: 'space-between', 
        marginBottom: 12,
        borderBottomWidth: full ? 0 : 1, 
        borderBottomColor: '#f0f0f0',
        paddingBottom: full ? 0 : 8
    }}>
        <Text style={{
            color:'gray', 
            fontSize:13, 
            width: full ? '100%' : '35%', 
            marginBottom: full ? 4 : 0
        }}>
            {label}
        </Text>
        <Text style={{
            fontWeight:'bold', 
            fontSize: 15, 
            color: color || '#333', 
            flex: 1, 
            textAlign: full ? 'left' : 'right',
            flexWrap: 'wrap' 
        }}>
            {value}
        </Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: 'white', paddingTop: 50, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
    
    addButton: { flexDirection:'row', backgroundColor:'#3b5998', paddingHorizontal:12, paddingVertical:6, borderRadius:5, alignItems:'center' },
    addButtonText: { color:'white', fontWeight:'bold', fontSize:12, marginLeft:4 },

    tabContainer: { flexDirection: 'row', backgroundColor: 'white', paddingHorizontal: 15 },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
    activeTab: { borderBottomColor: '#3b5998' },
    tabText: { color: 'gray', fontWeight: '600' },
    activeTabText: { color: '#3b5998', fontWeight: 'bold' },

    subTabContainer: { flexDirection: 'row', padding: 10, justifyContent:'center' },
    subTab: { paddingVertical: 6, paddingHorizontal: 15, borderRadius: 20, backgroundColor: '#e0e0e0', marginHorizontal: 5 },
    activeSubTab: { backgroundColor: '#3b5998' },
    subTabText: { fontSize: 12, fontWeight: '600', color: '#555' },
    activeSubTabText: { color: 'white' },

    searchBar: { margin: 15, backgroundColor: 'white', padding: 10, borderRadius: 8, flexDirection: 'row', elevation: 2, alignItems:'center' },
    input: { flex: 1, marginLeft: 10, color:'black' },
    emptyText: { textAlign:'center', marginTop:30, color:'gray' },

    stockCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation: 2 },
    empBadge: { flexDirection:'row', backgroundColor:'#e8f5e9', paddingHorizontal:8, paddingVertical:4, borderRadius:4, alignItems:'center', marginBottom:5 },
    empName: { fontSize:10, fontWeight:'bold', color:'#1b5e20', marginLeft:4 },
    qtyText: { fontSize:14, fontWeight:'bold', color:'#333' },

    machineCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation: 2 },
    iconBox: { backgroundColor:'#e3f2fd', padding:10, borderRadius:8 },
    qtyLabel: { fontSize: 12, color: 'gray', marginTop:2 },

    card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    partName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    partNo: { fontSize: 12, color: 'gray' },
    priceTag: { backgroundColor: '#fff3e0', padding: 5, borderRadius: 5 },
    priceText: { color: '#e65100', fontWeight: 'bold' },
    modelText: { fontSize: 12, color: '#555', marginTop: 5, fontStyle: 'italic' },
    itemName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    itemSub: { fontSize: 12, color: 'gray', marginTop: 2 },

    bigStockText: { fontSize: 18, fontWeight: 'bold', color: '#0d47a1', marginLeft: 5 },
    bigStockTextOrange: { fontSize: 18, fontWeight: 'bold', color: '#e65100', marginLeft: 5 },

    modalOverlay: { 
        flex: 1, 
        backgroundColor: 'rgba(0,0,0,0.6)', 
        justifyContent: 'center', 
        alignItems: 'center',
        padding: 20
    },
    modalContent: { 
        width: '90%', 
        backgroundColor: 'white', 
        borderRadius: 15, 
        padding: 20, 
        elevation:10,
        maxHeight: '80%'
    },
    detailsContent: { width: '90%', backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '80%' },
    
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#3b5998' },
    label: { fontSize: 13, color: '#555', marginTop: 10, marginBottom: 5, fontWeight:'600' },
    inputBox: { borderWidth: 1, borderColor: '#ddd', borderRadius: 5, padding: 10, backgroundColor: '#f9f9f9', fontSize:16, color:'black' },
    btn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5 },

    divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
    modelBox: { backgroundColor:'#f9f9f9', padding:10, borderRadius:8, borderWidth:1, borderColor:'#eee' },
    
    sectionHeader: { fontWeight:'bold', marginBottom:8, color:'#777', fontSize:12, marginTop:10 },
    stockRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
    myStockBox: { flex: 0.48, backgroundColor: '#e8f5e9', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#c8e6c9' },
    myStockLabel: { fontSize: 10, color: '#1b5e20', fontWeight: 'bold' },
    myStockValue: { fontSize: 18, color: '#1b5e20', fontWeight: 'bold' },
    officeStockBox: { flex: 0.48, backgroundColor: '#e3f2fd', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#bbdefb' },
    officeStockLabel: { fontSize: 10, color: '#0d47a1', fontWeight: 'bold' },
    officeStockValue: { fontSize: 18, color: '#0d47a1', fontWeight: 'bold' },

    issueBtn: { marginTop: 20, backgroundColor: '#1565c0', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    empItem: { padding: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' }
});
