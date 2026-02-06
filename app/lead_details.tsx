import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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

export default function LeadDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { leadsList, updateLead, addLeadActivity, user } = useData();

  const [lead, setLead] = useState<any>(null);
  const [note, setNote] = useState(''); 

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [currentType, setCurrentType] = useState(''); 
  const [options, setOptions] = useState<string[]>([]);
  const [tempSelection, setTempSelection] = useState<string | null>(null); 
  const [changeReason, setChangeReason] = useState(''); 

  useEffect(() => {
    const found = leadsList.find((l: any) => l.id === id);
    if (found) {
      setLead(found);
    }
  }, [id, leadsList]);

  // --- ACTIONS ---
  const handleCall = () => {
      if (lead?.mobile) Linking.openURL(`tel:${lead.mobile}`);
      else Alert.alert("No Number", "Mobile number not available.");
  };

  const openOptionModal = (type: string) => {
    setCurrentType(type);
    setTempSelection(null); 
    setChangeReason('');    
    setModalVisible(true);
    
    if (type === 'Status') setOptions(["Open", "Replied", "Follow up", "Converted", "Lost"]);
    else if (type === 'Stage') setOptions(["New", "Introduction", "Technical Review", "Quotation", "Order Negotiation", "Price Review"]);
  };

  const confirmUpdate = async () => {
    if (!tempSelection) return;
    const field = currentType === 'Status' ? 'status' : 'stage';

    await updateLead(id as string, { 
        [field]: tempSelection,
        lastUpdated: new Date().toISOString()
    });

    if (addLeadActivity) {
      await addLeadActivity(id as string, {
        type: 'System', // Mark as System Update
        msg: `${currentType} changed to ${tempSelection}`, 
        changeNote: changeReason,
        by: user?.name
      });
    }
    setModalVisible(false);
  };

  const saveGeneralNote = async () => {
    if (!note.trim()) return;
    if (addLeadActivity) {
      await addLeadActivity(id as string, {
        type: 'Note', // Mark as User Note
        msg: note,
        by: user?.name
      });
    }
    setNote('');
  };

  // 🔥 RENDER TIMELINE ITEM (CHAT STYLE)
  const renderHistoryItem = (item: any, index: number) => {
      const isSystem = item.type === 'System' || item.type === 'Status Change' || item.type === 'Stage Change' || item.type === 'New Lead';
      
      if (isSystem) {
          // 🔹 SYSTEM BADGE (Center)
          return (
              <View key={index} style={styles.systemLogBox}>
                  <Text style={styles.systemLogText}>
                      {item.type === 'New Lead' ? '✨ New Lead Created' : '🔄 Update'} • {item.by}
                  </Text>
                  <Text style={styles.systemLogMain}>{item.msg}</Text>
                  {item.changeNote ? <Text style={styles.systemNote}>"{item.changeNote}"</Text> : null}
                  <Text style={styles.tinyDate}>{item.date}</Text>
              </View>
          );
      } else {
          // 💬 CHAT BUBBLE (Note)
          return (
              <View key={index} style={styles.chatBubble}>
                  <View style={styles.chatHeader}>
                      <Text style={styles.chatUser}>{item.by}</Text>
                      <Text style={styles.chatDate}>{item.date}</Text>
                  </View>
                  <Text style={styles.chatText}>{item.msg}</Text>
              </View>
          );
      }
  };

  if (!lead) return <View style={styles.container}><Text style={{padding:20}}>Loading...</Text></View>;
  
  // Combine Note + Requirements for display
  const reqList = lead.requirements && lead.requirements.length > 0 ? lead.requirements.join(', ') : lead.product;
  const history = lead.history ? [...lead.history].reverse() : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{padding:5}}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lead Timeline</Text>
        <TouchableOpacity onPress={handleCall} style={styles.callBtn}>
            <Ionicons name="call" size={18} color="white" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
        <ScrollView style={styles.content} contentContainerStyle={{paddingBottom: 80}}>

          {/* 1. TOP CARD (Basic Info) */}
          <View style={styles.card}>
            <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                <View style={{flex:1}}>
                    <Text style={styles.orgName}>{lead.org}</Text>
                    <Text style={styles.subText}>{lead.contactPerson}</Text>
                    <Text style={styles.subText}>{lead.city || 'No City'} • {lead.mobile}</Text>
                </View>
                <View style={{alignItems:'flex-end'}}>
                     <View style={[styles.statusTag, {backgroundColor: lead.isHot ? '#ffebee' : '#e3f2fd'}]}>
                         <Text style={{color: lead.isHot ? '#d32f2f' : '#1976d2', fontWeight:'bold', fontSize:10}}>
                             {lead.isHot ? '🔥 HOT' : lead.type}
                         </Text>
                     </View>
                </View>
            </View>
            
            <View style={styles.divider}/>
            
            {reqList && (
                <View style={styles.reqBox}>
                    <Ionicons name="cube-outline" size={16} color="#555" />
                    <Text style={styles.reqText}>{reqList}</Text>
                </View>
            )}
            
            <View style={styles.row}>
                <TouchableOpacity style={styles.actionPill} onPress={() => openOptionModal('Status')}>
                    <Text style={styles.pillLabel}>Status</Text>
                    <Text style={styles.pillValue}>{lead.status}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionPill} onPress={() => openOptionModal('Stage')}>
                    <Text style={styles.pillLabel}>Stage</Text>
                    <Text style={[styles.pillValue, {color:'#3b5998'}]}>{lead.stage || 'New'}</Text>
                </TouchableOpacity>
            </View>
          </View>

          {/* 2. ADD NOTE INPUT */}
          <View style={styles.inputSection}>
            <TextInput
                style={styles.input}
                placeholder="Type a note or meeting summary..."
                multiline
                value={note}
                onChangeText={setNote}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={saveGeneralNote}>
                <Ionicons name="send" size={20} color="white" />
            </TouchableOpacity>
          </View>

          {/* 3. TIMELINE HISTORY */}
          <Text style={styles.sectionHeader}>ACTIVITY TIMELINE</Text>
          <View style={styles.timelineContainer}>
              {history.map((item: any, index: number) => renderHistoryItem(item, index))}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL FOR STATUS/STAGE CHANGE */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Update {currentType}</Text>
                
                {!tempSelection ? (
                     <FlatList
                        data={options}
                        keyExtractor={item => item}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.modalItem} onPress={() => setTempSelection(item)}>
                                <Text style={[styles.modalItemText, lead[currentType === 'Status' ? 'status' : 'stage'] === item && {fontWeight:'bold', color:'#3b5998'}]}>{item}</Text>
                                {lead[currentType === 'Status' ? 'status' : 'stage'] === item && <Ionicons name="checkmark" size={18} color="#3b5998"/>}
                            </TouchableOpacity>
                        )}
                    />
                ) : (
                    <View>
                        <Text style={{color:'gray', marginBottom:5}}>Changing to: <Text style={{fontWeight:'bold', color:'#333'}}>{tempSelection}</Text></Text>
                        <TextInput 
                            style={styles.reasonInput}
                            placeholder="Add a remark (Required)..."
                            value={changeReason}
                            onChangeText={setChangeReason}
                            multiline
                        />
                        <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:15}}>
                             <TouchableOpacity onPress={() => setTempSelection(null)} style={{padding:10}}>
                                 <Text style={{color:'gray'}}>Back</Text>
                             </TouchableOpacity>
                             <TouchableOpacity 
                                onPress={confirmUpdate} 
                                style={[styles.confirmBtn, !changeReason.trim() && {backgroundColor:'#ccc'}]}
                                disabled={!changeReason.trim()}
                             >
                                 <Text style={{color:'white', fontWeight:'bold'}}>Update</Text>
                             </TouchableOpacity>
                        </View>
                    </View>
                )}
                 {!tempSelection && <TouchableOpacity onPress={() => setModalVisible(false)} style={{alignItems:'center', marginTop:15}}><Text style={{color:'red'}}>Cancel</Text></TouchableOpacity>}
            </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f4f8' }, // Light gray bg
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 3, alignItems:'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  callBtn: { backgroundColor:'#4caf50', padding:8, borderRadius:20 },

  content: { padding: 15 },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 1 },
  orgName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  subText: { color: 'gray', fontSize: 13, marginTop: 2 },
  statusTag: { paddingHorizontal:8, paddingVertical:4, borderRadius:6 },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  reqBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f9f9f9', padding:8, borderRadius:6, marginBottom:10 },
  reqText: { color:'#555', marginLeft:5, fontSize:13, fontWeight:'600' },

  row: { flexDirection:'row', justifyContent:'space-between', gap:10 },
  actionPill: { flex:1, backgroundColor:'#f5f7fa', padding:10, borderRadius:8, alignItems:'center', borderWidth:1, borderColor:'#e1e4e8' },
  pillLabel: { fontSize:11, color:'gray', marginBottom:2 },
  pillValue: { fontSize:14, fontWeight:'bold', color:'#333' },

  // Chat Input
  inputSection: { flexDirection:'row', alignItems:'center', backgroundColor:'white', borderRadius:25, paddingHorizontal:5, paddingVertical:5, elevation:2, marginBottom:20 },
  input: { flex:1, paddingHorizontal:15, fontSize:14, maxHeight:80 },
  sendBtn: { backgroundColor:'#3b5998', width:40, height:40, borderRadius:20, justifyContent:'center', alignItems:'center' },

  sectionHeader: { fontSize:12, fontWeight:'bold', color:'#888', marginBottom:10, textAlign:'center' },
  timelineContainer: { paddingBottom: 20 },

  // System Badge
  systemLogBox: { alignSelf:'center', backgroundColor:'#e3f2fd', paddingVertical:6, paddingHorizontal:15, borderRadius:15, marginBottom:15, alignItems:'center', maxWidth:'90%' },
  systemLogText: { fontSize:10, color:'#1565c0', fontWeight:'bold', marginBottom:2 },
  systemLogMain: { fontSize:12, color:'#0d47a1', fontWeight:'600', textAlign:'center' },
  systemNote: { fontSize:11, color:'#546e7a', fontStyle:'italic', marginTop:2 },
  tinyDate: { fontSize:9, color:'#90a4ae', marginTop:4 },

  // Chat Bubble
  chatBubble: { alignSelf:'flex-start', backgroundColor:'white', padding:12, borderRadius:12, borderTopLeftRadius:2, marginBottom:10, maxWidth:'85%', elevation:1, marginLeft:5 },
  chatHeader: { flexDirection:'row', justifyContent:'space-between', marginBottom:5, width:'100%' },
  chatUser: { fontSize:11, fontWeight:'bold', color:'#e65100', marginRight:10 },
  chatDate: { fontSize:10, color:'gray' },
  chatText: { fontSize:14, color:'#333', lineHeight:20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 300 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection:'row', justifyContent:'space-between' },
  modalItemText: { fontSize: 16, color: '#555' },
  
  reasonInput: { backgroundColor:'#f9f9f9', borderRadius:8, padding:10, height:80, textAlignVertical:'top', borderWidth:1, borderColor:'#eee' },
  confirmBtn: { backgroundColor:'#3b5998', padding:12, borderRadius:8, alignItems:'center' }
});