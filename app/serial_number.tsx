import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Keyboard,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { useData } from './context/DataContext';

export default function SerialNumberScreen() {
  const router = useRouter();
  const { installList, serviceCallList } = useData();

  // STATES
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]); // 🔥 Suggestions List
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Two Views: 'LIST' (Multiple machines) or 'DETAILS' (One machine history)
  const [viewMode, setViewMode] = useState<'IDLE' | 'LIST' | 'DETAILS'>('IDLE');
  
  const [machineList, setMachineList] = useState<any[]>([]); 
  const [selectedMachine, setSelectedMachine] = useState<any>(null); 
  const [timeline, setTimeline] = useState<any[]>([]);
  const [modelFilter, setModelFilter] = useState('');

  // --- 🔥 1. LIVE SEARCH & SUGGESTIONS ---
  const handleSearchInput = (text: string) => {
      setSearchInput(text);
      
      if (text.length > 0) {
          const lowerText = text.toLowerCase();
          // Filter machines matching Serial No OR Hospital OR Product
          const matches = installList.filter((item: any) => 
              (item.serialNo && item.serialNo.toLowerCase().includes(lowerText)) ||
              (item.hospital && item.hospital.toLowerCase().includes(lowerText)) ||
              (item.product && item.product.toLowerCase().includes(lowerText))
          ).slice(0, 5); // Limit to top 5 suggestions

          setSuggestions(matches);
          setShowSuggestions(true);
      } else {
          setSuggestions([]);
          setShowSuggestions(false);
      }
  };

  // --- 🔥 2. SELECT SUGGESTION (DIRECT OPEN) ---
  const handleSelectSuggestion = (machine: any) => {
      setSearchInput(machine.serialNo); // Put exact serial in box
      setShowSuggestions(false); // Hide list
      Keyboard.dismiss(); // Close keyboard
      openHistory(machine); // Directly open history
  };

  // --- 3. MASTER SEARCH (Manual Button Click) ---
  const handleMasterSearch = () => {
      setShowSuggestions(false);
      if (!searchInput.trim()) return;

      const lowerQuery = searchInput.toLowerCase();

      // Check 1: Direct Serial Match?
      const directMatch = installList.find((item: any) => item.serialNo.toLowerCase() === lowerQuery);

      if (directMatch) {
          openHistory(directMatch);
      } else {
          // Check 2: Filter List
          const matches = installList.filter((item: any) => 
              item.hospital.toLowerCase().includes(lowerQuery) || 
              item.product.toLowerCase().includes(lowerQuery) ||
              item.serialNo.toLowerCase().includes(lowerQuery)
          );

          if (matches.length > 0) {
              setMachineList(matches);
              setViewMode('LIST');
          } else {
              setMachineList([]);
              setViewMode('LIST'); 
          }
      }
  };

  // --- 4. OPEN HISTORY TIMELINE ---
  const openHistory = (machine: any) => {
      setSelectedMachine(machine);
      
      // Find Services
      const services = serviceCallList.filter((item: any) => 
          item.serialNo.toLowerCase() === machine.serialNo.toLowerCase()
      );

      // Create Events
      const events = [
          {
              type: 'Installation',
              date: machine.date,
              title: 'Machine Installed',
              desc: `Installed by ${machine.engineer}`,
              status: 'Success',
              icon: 'checkmark-circle'
          },
          ...services.map((s: any) => ({
              type: 'Service',
              date: s.date,
              title: s.status === 'Open' ? 'Ticket Raised' : 'Service Done',
              desc: s.remark,
              status: s.status,
              icon: 'construct'
          }))
      ];

      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTimeline(events);
      setViewMode('DETAILS');
  };

  const getWarrantyStatus = (expiryDate: string) => {
      const today = new Date();
      const expiry = new Date(expiryDate);
      if (expiry > today) return { label: 'Active Warranty', color: '#4caf50', bg: '#e8f5e9' };
      return { label: 'Warranty Expired', color: '#d32f2f', bg: '#ffebee' };
  };

  const renderMachineListItem = ({ item }: any) => (
      <TouchableOpacity style={styles.listItem} onPress={() => openHistory(item)}>
          <View style={styles.listIcon}>
              <Ionicons name="medical" size={24} color="#3b5998" />
          </View>
          <View style={{flex:1}}>
              <Text style={styles.listTitle}>{item.product}</Text>
              <Text style={styles.listSub}>{item.hospital}</Text>
              <Text style={styles.listSerial}>S/N: {item.serialNo}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>
  );

  return (
    <TouchableWithoutFeedback onPress={() => setShowSuggestions(false)}>
        <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
            <TouchableOpacity onPress={() => viewMode === 'DETAILS' ? setViewMode('LIST') : router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
                {viewMode === 'DETAILS' ? 'Machine History' : 'Find Machine'}
            </Text>
            <View style={{width:24}} /> 
        </View>

        {/* SEARCH BAR SECTION */}
        {viewMode !== 'DETAILS' && (
            <View style={{zIndex: 10}}> 
                <View style={styles.searchSection}>
                    <Text style={styles.label}>Enter Serial Number or Hospital</Text>
                    <View style={styles.searchBox}>
                        <TextInput 
                            style={styles.input}
                            placeholder="Start typing..."
                            value={searchInput}
                            onChangeText={handleSearchInput}
                            onSubmitEditing={handleMasterSearch}
                        />
                        <TouchableOpacity style={styles.searchBtn} onPress={handleMasterSearch}>
                            <Ionicons name="search" size={20} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 🔥 AUTOCOMPLETE DROPDOWN 🔥 */}
                {showSuggestions && suggestions.length > 0 && (
                    <View style={styles.suggestionList}>
                        {suggestions.map((item, index) => (
                            <TouchableOpacity 
                                key={index} 
                                style={styles.suggestionItem} 
                                onPress={() => handleSelectSuggestion(item)}
                            >
                                <Ionicons name="barcode-outline" size={18} color="gray" />
                                <View style={{marginLeft: 10}}>
                                    <Text style={styles.sugSerial}>{item.serialNo}</Text>
                                    <Text style={styles.sugText}>{item.hospital} - {item.product}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>
        )}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            
            {/* STATE 1: IDLE */}
            {viewMode === 'IDLE' && (
                <View style={styles.centerState}>
                    <Ionicons name="search" size={60} color="#ddd" />
                    <Text style={{color:'gray', marginTop:10}}>Type above to find a machine</Text>
                </View>
            )}

            {/* STATE 2: LIST VIEW */}
            {viewMode === 'LIST' && (
                <View>
                    <Text style={styles.sectionHeader}>Found {machineList.length} Machine(s)</Text>
                    
                    {/* Local Filter */}
                    {machineList.length > 5 && (
                        <TextInput 
                            style={styles.subFilter} 
                            placeholder="Filter by Model..." 
                            value={modelFilter}
                            onChangeText={setModelFilter}
                        />
                    )}

                    {machineList.length === 0 ? (
                        <View style={styles.centerState}>
                            <Text style={{color:'red'}}>No Machines Found</Text>
                        </View>
                    ) : (
                        machineList
                            .filter(m => m.product.toLowerCase().includes(modelFilter.toLowerCase()))
                            .map((item, index) => (
                            <View key={index}>{renderMachineListItem({item})}</View>
                            ))
                    )}
                </View>
            )}

            {/* STATE 3: DETAILS VIEW */}
            {viewMode === 'DETAILS' && selectedMachine && (
                <>
                    {/* MACHINE INFO */}
                    <View style={styles.machineCard}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                                <View style={styles.iconBox}>
                                    <Ionicons name="hardware-chip-outline" size={30} color="#3b5998" />
                                </View>
                                <View style={{flex:1, marginLeft:15}}>
                                    <Text style={styles.machineName}>{selectedMachine.product}</Text>
                                    <Text style={styles.serialText}>S/N: {selectedMachine.serialNo}</Text>
                                </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                <View>
                                    <Text style={styles.infoLabel}>Hospital</Text>
                                    <Text style={styles.infoValue}>{selectedMachine.hospital}</Text>
                                </View>
                                <View style={{alignItems:'flex-end'}}>
                                    <Text style={styles.infoLabel}>Warranty Till</Text>
                                    <Text style={styles.infoValue}>{selectedMachine.warrantyExpiry}</Text>
                                </View>
                        </View>
                        <View style={[styles.warrantyBadge, {backgroundColor: getWarrantyStatus(selectedMachine.warrantyExpiry).bg}]}>
                            <Text style={{color: getWarrantyStatus(selectedMachine.warrantyExpiry).color, fontWeight:'bold', fontSize:12}}>
                                {getWarrantyStatus(selectedMachine.warrantyExpiry).label}
                            </Text>
                        </View>
                    </View>

                    {/* TIMELINE */}
                    <Text style={styles.sectionHeader}>History Timeline</Text>
                    
                    <View style={styles.timelineContainer}>
                        {timeline.map((item, index) => (
                            <View key={index} style={styles.timelineItem}>
                                <View style={styles.timelineLeft}>
                                    <View style={[styles.dot, item.type === 'Installation' ? styles.dotGreen : styles.dotBlue]}>
                                        <Ionicons name={item.icon as any} size={12} color="white" />
                                    </View>
                                    {index !== timeline.length - 1 && <View style={styles.line} />}
                                </View>
                                <View style={styles.timelineContent}>
                                    <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                        <Text style={styles.eventTitle}>{item.title}</Text>
                                        <Text style={styles.eventDate}>{item.date}</Text>
                                    </View>
                                    <Text style={styles.eventDesc}>{item.desc}</Text>
                                    <Text style={[styles.tag, {color: item.status==='Closed'?'green':'orange'}]}>{item.status}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                    
                    <TouchableOpacity style={styles.newSearchBtn} onPress={() => {setViewMode('IDLE'); setSearchInput('');}}>
                        <Text style={{color:'#3b5998', fontWeight:'bold'}}>Start New Search</Text>
                    </TouchableOpacity>
                </>
            )}
            
            <View style={{height: 100}} />
        </ScrollView>
        </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  
  searchSection: { padding: 20, backgroundColor: 'white', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 3, marginBottom:10 },
  label: { fontWeight: '600', color: '#555', marginBottom: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 10, overflow: 'hidden', borderWidth:1, borderColor:'#e0e0e0' },
  input: { flex: 1, padding: 12, fontSize: 16, color: '#333' },
  searchBtn: { backgroundColor: '#3b5998', padding: 12, alignItems: 'center', justifyContent: 'center', width: 50 },

  // 🔥 SUGGESTION BOX STYLE
  suggestionList: { 
      position: 'absolute', 
      top: 95, // Adjust based on search box height
      left: 20, 
      right: 20, 
      backgroundColor: 'white', 
      borderRadius: 10, 
      elevation: 10, 
      shadowColor: '#000', 
      shadowOpacity: 0.2, 
      shadowRadius: 5, 
      maxHeight: 200,
      zIndex: 999 
  },
  suggestionItem: { 
      flexDirection:'row', 
      alignItems:'center', 
      padding: 12, 
      borderBottomWidth: 1, 
      borderBottomColor: '#eee' 
  },
  sugSerial: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
  sugText: { color: 'gray', fontSize: 12 },

  content: { padding: 20 },
  centerState: { alignItems: 'center', marginTop: 50 },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#555', marginBottom: 10, marginTop:10 },

  // List Item Styles
  listItem: { flexDirection:'row', alignItems:'center', backgroundColor:'white', padding:15, borderRadius:10, marginBottom:10, elevation:1 },
  listIcon: { width:40, height:40, backgroundColor:'#e3f2fd', borderRadius:20, justifyContent:'center', alignItems:'center', marginRight:15 },
  listTitle: { fontWeight:'bold', fontSize:16, color:'#333' },
  listSub: { color:'gray', fontSize:13 },
  listSerial: { color:'#3b5998', fontWeight:'bold', fontSize:12, marginTop:2 },
  subFilter: { backgroundColor:'white', padding:10, borderRadius:8, marginBottom:15, borderWidth:1, borderColor:'#ddd' },

  // Machine Details Card
  machineCard: { backgroundColor: 'white', borderRadius: 12, padding: 20, elevation: 3, marginBottom: 25 },
  iconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#e3f2fd', justifyContent: 'center', alignItems: 'center' },
  machineName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  serialText: { color: 'gray', fontSize: 14, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  infoLabel: { fontSize: 11, color: 'gray', marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#333' },
  warrantyBadge: { marginTop: 15, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },

  // Timeline
  timelineContainer: { paddingLeft: 10 },
  timelineItem: { flexDirection: 'row', marginBottom: 0 },
  timelineLeft: { alignItems: 'center', width: 30, marginRight: 10 },
  dot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  dotGreen: { backgroundColor: '#4caf50' },
  dotBlue: { backgroundColor: '#3b5998' },
  line: { width: 2, backgroundColor: '#ddd', flex: 1, marginVertical: -2 },
  
  timelineContent: { flex: 1, backgroundColor: 'white', borderRadius: 8, padding: 15, marginBottom: 20, elevation: 2 },
  eventTitle: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  eventDate: { fontSize: 12, color: 'gray' },
  eventDesc: { fontSize: 13, color: '#666', marginTop: 5, fontStyle: 'italic' },
  tag: { fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', marginTop:5 },
  
  newSearchBtn: { alignSelf:'center', marginTop:20, padding:10 },
});