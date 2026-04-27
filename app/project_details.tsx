import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// LIBRARIES
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// FIREBASE
import { addDoc, collection, deleteDoc, doc, increment, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

const CloseButton = ({onPress}: any) => (
    <TouchableOpacity onPress={onPress}>
        <Ionicons name="close" size={28} color="black" />
    </TouchableOpacity>
);

const DetailRow = ({label, value}:any) => (
    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:8, borderBottomWidth:1, borderBottomColor:'#f0f0f0', paddingBottom:5}}>
        <Text style={{color:'gray'}}>{label}</Text>
        <Text style={{fontWeight:'bold', color:'#333'}}>{value}</Text>
    </View>
);

export default function ProjectDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const rawId = params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId; 

  const { user } = useData();

  const [project, setProject] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Expenses' | 'Order'>('Overview'); 
  const [loading, setLoading] = useState(true);
  
  const [searchText, setSearchText] = useState('');

  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [combinedHistory, setCombinedHistory] = useState<any[]>([]);

  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  
  const [deliveryModalVisible, setDeliveryModalVisible] = useState(false);
  const [selectedItemForDelivery, setSelectedItemForDelivery] = useState<any>(null);
  const [deliveryMode, setDeliveryMode] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedDetailItem, setSelectedDetailItem] = useState<any>(null);
  const [detailType, setDetailType] = useState(''); 

  const [expAmount, setExpAmount] = useState('');
  const [expNote, setExpNote] = useState('');
  const [expCategory, setExpCategory] = useState('Civil/Vendor');

  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Bank Transfer');
  const [payNote, setPayNote] = useState('');

  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('');
  const [itemValue, setItemValue] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  // 🔥 PROJECT EDIT STATES (Order Value & Description Edit)
  const [editProjectModalVisible, setEditProjectModalVisible] = useState(false);
  const [editTotalValue, setEditTotalValue] = useState('');
  const [editDescription, setEditDescription] = useState(''); // 🔥 New State for Description
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
      setVisibleCount(20);
  }, [searchText]);

  const categories = ['Civil/Vendor', 'Labor Wages', 'Food/Daily', 'Travel', 'Local Purchase', 'Other'];
  const payModes = ['Bank Transfer', 'Cheque', 'Cash', 'UPI'];

  useEffect(() => {
      if (!id) return;
      
      const qProject = query(collection(db, "projects"), where("id", "==", id as string));
      
      const unsubProject = onSnapshot(qProject, (querySnapshot) => {
          if (!querySnapshot.empty) {
              const docSnap = querySnapshot.docs[0];
              setProject({ ...docSnap.data(), docId: docSnap.id });
              setLoading(false);
          } else {
              Alert.alert("Data Error", `Project not found for ID: ${id}`);
              router.back();
          }
      });

      const qExp = query(collection(db, "project_expenses"), where("projectId", "==", id));
      const unsubExpenses = onSnapshot(qExp, (s) => setExpensesList(s.docs.map(d => ({ id: d.id, ...d.data(), type: 'Expense' }))));
      
      const qPay = query(collection(db, "project_payments"), where("projectId", "==", id));
      const unsubPayments = onSnapshot(qPay, (s) => setPaymentsList(s.docs.map(d => ({ id: d.id, ...d.data(), type: 'Payment' }))));
      
      const qItems = query(collection(db, "project_items"), where("projectId", "==", id));
      const unsubItems = onSnapshot(qItems, (s) => setItemsList(s.docs.map(d => ({ id: d.id, ...d.data(), type: 'Item' }))));
      
      return () => { unsubProject(); unsubExpenses(); unsubPayments(); unsubItems(); };
  }, [id]);

  useEffect(() => {
      const history = [...expensesList, ...paymentsList, ...itemsList];
      history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setCombinedHistory(history);
  }, [expensesList, paymentsList, itemsList]);

  const filterList = (list: any[]) => {
    if (!searchText) return list;
    const lower = searchText.toLowerCase();
    return list.filter((item: any) => 
        (item.category && item.category.toLowerCase().includes(lower)) ||
        (item.note && item.note.toLowerCase().includes(lower)) ||
        (item.name && item.name.toLowerCase().includes(lower)) ||
        (item.mode && item.mode.toLowerCase().includes(lower)) ||
        (item.amount && item.amount.toString().includes(lower))
    );
  };

  const exportToExcel = async () => {
      try {
          let csvContent = "Date,Type,Category/Mode,Description,Amount/Qty,Added By\n";
          combinedHistory.forEach(item => {
              const date = new Date(item.date).toLocaleDateString('en-GB');
              const type = item.type;
              const cat = item.category || item.mode || item.name || '-';
              const desc = (item.note || item.status || '-').replace(/,/g, ' '); 
              const val = item.amount ? `Rs.${item.amount}` : item.qty;
              const user = item.addedBy || '-';
              csvContent += `${date},${type},${cat},${desc},${val},${user}\n`;
          });

          const fileName = `${project.name.replace(/\s+/g, '_')}_Report.csv`;
          const dir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
          const fileUri = dir + fileName;

          await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
          
          if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(fileUri);
          } else {
              Alert.alert("Error", "Sharing not available");
          }
      } catch (error: any) {
          console.log(error);
          Alert.alert("Note", "File generated but sharing failed. Check permissions.");
      }
  };

  const handleAddExpense = async () => {
      if (!expAmount || !expNote) return Alert.alert("Missing", "Details required.");
      setIsSaving(true);
      try {
          const amount = parseFloat(expAmount);
          await addDoc(collection(db, "project_expenses"), { 
              projectId: id, 
              orgId: project?.orgId || '',       
              orgName: project?.client || '',    
              amount, 
              category: expCategory, 
              note: expNote, 
              date: new Date().toISOString(), 
              addedBy: user?.name 
          });
          await updateDoc(doc(db, "projects", project.docId), { totalExpense: increment(amount) });
          setExpenseModalVisible(false); setExpAmount(''); setExpNote('');
      } catch (e:any) { Alert.alert("Error", e.message); }
      setIsSaving(false);
  };

  const handleAddPayment = async () => {
      if (!payAmount) return Alert.alert("Missing", "Amount required.");
      setIsSaving(true);
      try {
          const amount = parseFloat(payAmount);
          await addDoc(collection(db, "project_payments"), { 
              projectId: id, 
              orgId: project?.orgId || '',       
              orgName: project?.client || '',    
              amount, 
              mode: payMode, 
              note: payNote, 
              date: new Date().toISOString(), 
              addedBy: user?.name 
          });
          await updateDoc(doc(db, "projects", project.docId), { totalReceived: increment(amount) });
          setPaymentModalVisible(false); setPayAmount(''); setPayNote('');
      } catch (e:any) { Alert.alert("Error", e.message); }
      setIsSaving(false);
  };

  const handleAddItem = async () => {
      if (!itemName) return Alert.alert("Missing", "Name required.");
      setIsSaving(true);
      try {
          await addDoc(collection(db, "project_items"), { 
              projectId: id, 
              orgId: project?.orgId || '',       
              orgName: project?.client || '',    
              name: itemName, 
              qty: itemQty || '1', 
              value: itemValue || '0', 
              status: 'Pending', 
              addedBy: user?.name, 
              date: new Date().toISOString() 
          });
          setItemModalVisible(false); setItemName(''); setItemQty(''); setItemValue('');
      } catch (e:any) { Alert.alert("Error", e.message); }
      setIsSaving(false);
  };

  const confirmDelivery = async () => {
      if (!deliveryMode) return Alert.alert("Missing", "Mode required.");
      setIsSaving(true);
      try {
          await updateDoc(doc(db, "project_items", selectedItemForDelivery.id), { status: 'Delivered', deliveredBy: user?.name, deliveryMode, deliveryDate: deliveryDate.toISOString() });
          setDeliveryModalVisible(false); setSelectedItemForDelivery(null);
      } catch (e: any) { Alert.alert("Error", e.message); }
      setIsSaving(false);
  };

  const openDetailsPopup = (item: any) => { setSelectedDetailItem(item); setDetailType(item.type); setDetailModalVisible(true); };
  
  const deleteItem = async (col: string, itemId: string) => {
      Alert.alert("Delete", "Are you sure?", [
          { text: "Cancel" }, 
          { text: "Delete", onPress: async () => { 
              await deleteDoc(doc(db, col, itemId)); 
              setDetailModalVisible(false); 
          } }
      ]);
  };

  // 🔥 UPDATE PROJECT LOGIC (Value + Description)
  const openEditProject = () => {
      setEditTotalValue(project.totalValue?.toString() || '0');
      setEditDescription(project.description || ''); // 🔥 Initialize with existing desc
      setEditProjectModalVisible(true);
  };

  const handleUpdateProjectDetails = async () => {
      if (!editTotalValue) {
          Alert.alert("Error", "Order Value cannot be empty");
          return;
      }
      setIsUpdatingProject(true);
      try {
          await updateDoc(doc(db, "projects", project.docId), { 
              totalValue: Number(editTotalValue),
              description: editDescription // 🔥 Update description in Firebase
          });
          setEditProjectModalVisible(false);
          Alert.alert("Success", "Project details updated successfully! ✅");
      } catch (error: any) {
          Alert.alert("Error", "Could not update project details. " + error.message);
      } finally {
          setIsUpdatingProject(false);
      }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1565c0" /></View>;
  if (!project) return <View style={styles.center}><Text>Project not found.</Text></View>;

  const renderTabContent = () => {
      const profit = (project.totalReceived || 0) - (project.totalExpense || 0);
      const pendingAmount = (project.totalValue || 0) - (project.totalReceived || 0);

      if (activeTab === 'Overview') {
          const displayHistory = filterList(combinedHistory);
          const renderedHistory = displayHistory.slice(0, visibleCount);

          return (
              <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 100}}>
                  <View style={styles.card}>
                      <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                          <Text style={styles.cardLabel}>Financials</Text>
                          <TouchableOpacity onPress={exportToExcel} style={{flexDirection:'row', alignItems:'center'}}>
                              <Ionicons name="download-outline" size={16} color="#1565c0" />
                              <Text style={{color:'#1565c0', fontWeight:'bold', fontSize:12, marginLeft:4}}>Excel</Text>
                          </TouchableOpacity>
                      </View>
                      <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:10}}>
                          <View>
                              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                  <Text style={styles.subLabel}>Order Value</Text>
                                  {(user?.role === 'Admin' || user?.role === 'Manager' || user?.role === 'Accountant' || user?.role === 'Account') && (
                                      <TouchableOpacity onPress={openEditProject} style={{marginLeft: 8, padding: 2}}>
                                          <Ionicons name="pencil" size={14} color="#1565c0" />
                                      </TouchableOpacity>
                                  )}
                              </View>
                              <Text style={[styles.bigValue, {color:'#1565c0'}]}>₹ {project.totalValue?.toLocaleString()}</Text>
                          </View>
                          <View style={{alignItems:'flex-end'}}>
                              <Text style={styles.subLabel}>Balance</Text>
                              <Text style={[styles.bigValue, {color:'#ff9800'}]}>₹ {pendingAmount.toLocaleString()}</Text>
                          </View>
                      </View>
                      <View style={styles.divider} />
                      <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                           <Text style={{color:'#4caf50', fontWeight:'bold'}}>Recd: ₹{project.totalReceived?.toLocaleString() || 0}</Text>
                           <Text style={{color:'#d32f2f', fontWeight:'bold'}}>Exp: ₹{project.totalExpense?.toLocaleString() || 0}</Text>
                      </View>
                  </View>

                  {/* 🔥 PROJECT DESCRIPTION / ORDER DETAILS CARD */}
                  {project.description ? (
                      <View style={styles.card}>
                          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                              <Text style={styles.cardLabel}>Order Description / Scope</Text>
                              {(user?.role === 'Admin' || user?.role === 'Manager') && (
                                  <TouchableOpacity onPress={openEditProject}>
                                      <Ionicons name="pencil" size={14} color="#1565c0" />
                                  </TouchableOpacity>
                              )}
                          </View>
                          <Text style={{color: '#333', marginTop: 8, lineHeight: 20}}>{project.description}</Text>
                      </View>
                  ) : null}

                  <View style={[styles.card, {backgroundColor: profit >= 0 ? '#e8f5e9' : '#ffebee'}]}>
                      <Text style={styles.cardLabel}>Net Profit / Loss</Text>
                      <Text style={[styles.profitValue, {color: profit >= 0 ? 'green' : 'red'}]}>{profit >= 0 ? '+' : ''} ₹ {profit.toLocaleString()}</Text>
                  </View>
                  
                  <Text style={styles.sectionTitle}>Activity Timeline</Text>
                  {renderedHistory.map((item, index) => {
                      let cardColor = '#fff';
                      let borderColor = '#eee';
                      let iconName = 'ellipse';
                      let iconColor = '#aaa';
                      let badge = '';

                      if(item.type === 'Expense') {
                          cardColor = '#fff5f5'; borderColor = '#ffcdd2'; iconName = 'arrow-up-circle'; iconColor = '#d32f2f'; badge='EXPENSE';
                      } else if (item.type === 'Payment') {
                          cardColor = '#f1f8e9'; borderColor = '#c8e6c9'; iconName = 'arrow-down-circle'; iconColor = '#388e3c'; badge='PAYMENT';
                      } else {
                          cardColor = '#e3f2fd'; borderColor = '#bbdefb'; iconName = 'cube'; iconColor = '#1976d2'; badge='ORDER';
                      }

                      return (
                        <TouchableOpacity key={index} style={[styles.advItem, {backgroundColor: cardColor, borderColor: borderColor}]} onPress={() => openDetailsPopup(item)}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:5}}>
                                <View style={{flexDirection:'row', alignItems:'center'}}>
                                    <Ionicons name={iconName as any} size={16} color={iconColor} />
                                    <Text style={{fontSize:10, fontWeight:'bold', color:iconColor, marginLeft:5}}>{badge}</Text>
                                </View>
                                <Text style={{fontSize:10, color:'#777'}}>{new Date(item.date).toLocaleDateString('en-GB')}</Text>
                            </View>
                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                                <View style={{flex:1}}>
                                    <Text style={{fontWeight:'bold', color:'#333', fontSize:13}}>{item.type === 'Item' ? item.name : (item.category || item.mode)}</Text>
                                    <Text style={{fontSize:11, color:'#666'}} numberOfLines={1}>{item.note || item.status || '-'}</Text>
                                </View>
                                <Text style={{fontWeight:'bold', fontSize:14, color:'#333'}}>
                                    {item.type === 'Item' ? `Qty: ${item.qty}` : `₹ ${item.amount}`}
                                </Text>
                            </View>
                        </TouchableOpacity>
                      );
                  })}
                  
                  {visibleCount < displayHistory.length && (
                      <TouchableOpacity 
                          onPress={() => setVisibleCount(prev => prev + 20)} 
                          style={{
                              padding: 12, 
                              backgroundColor: '#fff', 
                              alignItems: 'center', 
                              marginVertical: 10, 
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: '#ddd'
                          }}
                      >
                          <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                              👇 Load More Records ({displayHistory.length - visibleCount} remaining)
                          </Text>
                      </TouchableOpacity>
                  )}
              </ScrollView>
          );
      }

      if (activeTab === 'Expenses') return (
          <View style={{flex:1}}>
              <View style={styles.actionRow}><Text style={styles.rowTitle}>Site Expenses</Text><TouchableOpacity style={styles.smallBtn} onPress={() => setExpenseModalVisible(true)}><Ionicons name="add" size={18} color="white" /><Text style={styles.btnTxt}>Add Expense</Text></TouchableOpacity></View>
              <FlatList 
                  data={filterList(expensesList)} 
                  keyExtractor={i=>i.id} 
                  contentContainerStyle={{paddingBottom: 100}} 
                  renderItem={({item}) => (
                      <TouchableOpacity style={styles.listItem} onPress={() => openDetailsPopup(item)}>
                          <View style={[styles.iconBox, {backgroundColor:'#ff9800'}]}><Ionicons name="receipt" size={18} color="white" /></View>
                          <View style={{flex:1, marginLeft:10}}><Text style={styles.listTitle}>{item.category}</Text><Text style={styles.listSub} numberOfLines={1}>{item.note}</Text><Text style={styles.listDate}>{new Date(item.date).toLocaleDateString('en-GB')}</Text></View>
                          <Text style={[styles.amountText, {color:'#d32f2f'}]}>- ₹{item.amount}</Text>
                      </TouchableOpacity>
                  )} 
              />
          </View>
      );

      if (activeTab === 'Order') return (
          <ScrollView style={{flex:1}} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 100}}>
              <View style={styles.actionRow}><Text style={styles.rowTitle}>Payments</Text><TouchableOpacity style={[styles.smallBtn, {backgroundColor:'#4caf50'}]} onPress={() => setPaymentModalVisible(true)}><Ionicons name="cash" size={18} color="white" /><Text style={styles.btnTxt}>Receive</Text></TouchableOpacity></View>
              {filterList(paymentsList).map((item:any) => (
                  <TouchableOpacity key={item.id} style={styles.listItem} onPress={() => openDetailsPopup(item)}>
                      <View style={[styles.iconBox, {backgroundColor:'#4caf50'}]}><Ionicons name="wallet" size={18} color="white" /></View>
                      <View style={{flex:1, marginLeft:10}}><Text style={styles.listTitle}>{item.mode}</Text><Text style={styles.listSub}>{item.note || 'Recd'}</Text><Text style={styles.listDate}>{new Date(item.date).toLocaleDateString('en-GB')}</Text></View>
                      <Text style={[styles.amountText, {color:'#388e3c'}]}>+ ₹{item.amount}</Text>
                  </TouchableOpacity>
              ))}
              <View style={styles.sectionDivider} />
              <View style={styles.actionRow}><Text style={styles.rowTitle}>Order Items</Text><TouchableOpacity style={[styles.smallBtn, {backgroundColor:'#1565c0'}]} onPress={() => setItemModalVisible(true)}><Ionicons name="cube" size={18} color="white" /><Text style={styles.btnTxt}>Add Item</Text></TouchableOpacity></View>
              {filterList(itemsList).map((item:any) => (
                  <TouchableOpacity key={item.id} style={styles.productItem} onPress={() => openDetailsPopup(item)}>
                      <View style={{flex:1}}><Text style={styles.prodName}>{item.name}</Text><Text style={styles.prodQty}>Qty: {item.qty} {item.value ? `(₹${item.value})` : ''}</Text>{item.status === 'Delivered' && <Text style={{fontSize:10, color:'gray'}}>Via {item.deliveryMode}</Text>}</View>
                      <TouchableOpacity style={[styles.statusPill, {backgroundColor: item.status === 'Delivered' ? '#e8f5e9' : '#ffebee'}]} onPress={() => { if(item.status!=='Delivered') { setSelectedItemForDelivery(item); setDeliveryModalVisible(true); }}}>
                          <Text style={{color: item.status === 'Delivered' ? 'green' : 'red', fontSize:11, fontWeight:'bold'}}>{item.status}</Text>
                      </TouchableOpacity>
                  </TouchableOpacity>
              ))}
          </ScrollView>
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>
            <View style={{marginLeft:15}}>
                <Text style={styles.headerTitle}>{project.name}</Text>
                <Text style={styles.headerSub}>{project.location} • {project.client}</Text>
                {(project.contactPerson || project.mobile) && (
                    <View style={{flexDirection:'row', alignItems:'center', marginTop:2}}>
                        <Ionicons name="person" size={10} color="#bbdefb" /><Text style={styles.headerContact}> {project.contactPerson} </Text>
                        <Ionicons name="call" size={10} color="#bbdefb" style={{marginLeft:5}} /><Text style={styles.headerContact}> {project.mobile}</Text>
                    </View>
                )}
            </View>
        </View>
      </View>

      <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="gray" />
          <TextInput style={{flex:1, marginLeft:10}} placeholder="Search expenses, payments, items..." value={searchText} onChangeText={setSearchText} />
          {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="gray" /></TouchableOpacity>}
      </View>

      <View style={styles.tabContainer}>
          {['Overview', 'Expenses', 'Order'].map((t) => (
            <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.activeTab]} onPress={() => setActiveTab(t as any)}>
                <Text style={[styles.tabText, activeTab === t && styles.activeTabText]}>{t === 'Order' ? 'Order/Pay' : t}</Text>
            </TouchableOpacity>
          ))}
      </View>

      <View style={styles.content}>{renderTabContent()}</View>

      {/* MODALS */}
      <Modal visible={expenseModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between'}}><Text style={styles.modalTitle}>Add Expense</Text><CloseButton onPress={()=>setExpenseModalVisible(false)}/></View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:15}}>{categories.map(c=><TouchableOpacity key={c} style={[styles.chip, expCategory===c&&styles.activeChip]} onPress={()=>setExpCategory(c)}><Text style={[styles.chipText, expCategory===c&&{color:'white'}]}>{c}</Text></TouchableOpacity>)}</ScrollView>
                  <TextInput style={styles.input} placeholder="Amount (₹)" keyboardType="numeric" value={expAmount} onChangeText={setExpAmount} />
                  <TextInput style={[styles.input, {height:60, textAlignVertical: 'top'}]} placeholder="Note" multiline value={expNote} onChangeText={setExpNote} />
                  <TouchableOpacity onPress={handleAddExpense} style={styles.saveBtn} disabled={isSaving}><Text style={{color:'white'}}>Save</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={paymentModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between'}}><Text style={styles.modalTitle}>Receive Payment</Text><CloseButton onPress={()=>setPaymentModalVisible(false)}/></View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:15}}>{payModes.map(m=><TouchableOpacity key={m} style={[styles.chip, payMode===m&&{backgroundColor:'#4caf50'}]} onPress={()=>setPayMode(m)}><Text style={[styles.chipText, payMode===m&&{color:'white'}]}>{m}</Text></TouchableOpacity>)}</ScrollView>
                  <TextInput style={styles.input} placeholder="Amount (₹)" keyboardType="numeric" value={payAmount} onChangeText={setPayAmount} />
                  <TextInput style={[styles.input, {height:60, textAlignVertical: 'top'}]} placeholder="Note" multiline value={payNote} onChangeText={setPayNote} />
                  <TouchableOpacity onPress={handleAddPayment} style={[styles.saveBtn, {backgroundColor:'#4caf50'}]} disabled={isSaving}><Text style={{color:'white'}}>Receive</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={itemModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between'}}><Text style={styles.modalTitle}>Add Item</Text><CloseButton onPress={()=>setItemModalVisible(false)}/></View>
                  <TextInput style={styles.input} placeholder="Item Name" value={itemName} onChangeText={setItemName} />
                  <View style={{flexDirection:'row'}}>
                      <TextInput style={[styles.input, {flex:1, marginRight:5}]} placeholder="Qty (e.g. 5)" value={itemQty} onChangeText={setItemQty} />
                      <TextInput style={[styles.input, {flex:1, marginLeft:5}]} placeholder="Value ₹ (Opt)" keyboardType="numeric" value={itemValue} onChangeText={setItemValue} />
                  </View>
                  <TouchableOpacity onPress={handleAddItem} style={[styles.saveBtn, {backgroundColor:'#1565c0'}]} disabled={isSaving}><Text style={{color:'white'}}>Add Item</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={deliveryModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between'}}><Text style={styles.modalTitle}>Mark Delivered</Text><CloseButton onPress={()=>setDeliveryModalVisible(false)}/></View>
                  <TextInput style={styles.input} placeholder="Delivery Mode (Courier/Hand)" value={deliveryMode} onChangeText={setDeliveryMode} />
                  <TouchableOpacity style={styles.input} onPress={()=>setShowDatePicker(true)}><Text>{deliveryDate.toLocaleDateString()}</Text></TouchableOpacity>
                  {showDatePicker && <DateTimePicker value={deliveryDate} mode="date" onChange={(e,d)=>{setShowDatePicker(false);if(d)setDeliveryDate(d)}} />}
                  <TouchableOpacity onPress={confirmDelivery} style={[styles.saveBtn, {backgroundColor:'#4caf50'}]} disabled={isSaving}><Text style={{color:'white'}}>Confirm</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={detailModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}><Text style={styles.modalTitle}>{detailType} Details</Text><CloseButton onPress={()=>setDetailModalVisible(false)}/></View>
                  {selectedDetailItem && (
                      <View>
                          <DetailRow label="Added By" value={selectedDetailItem.addedBy} />
                          <DetailRow label="Date" value={new Date(selectedDetailItem.date).toLocaleDateString('en-GB')} />
                          {detailType==='Item' && <><DetailRow label="Item" value={selectedDetailItem.name} /><DetailRow label="Qty" value={selectedDetailItem.qty} /><DetailRow label="Value" value={selectedDetailItem.value ? `₹${selectedDetailItem.value}` : '-'} /></>}
                          {(detailType==='Expense' || detailType==='Payment') && <View style={{backgroundColor:'#eee', padding:10, borderRadius:8, marginVertical:10, alignItems:'center'}}><Text style={{fontSize:24, fontWeight:'bold', color: detailType==='Expense'?'red':'green'}}>₹ {selectedDetailItem.amount}</Text></View>}
                          <Text style={styles.label}>Notes</Text><Text style={{backgroundColor:'#f9f9f9', padding:10, borderRadius:8}}>{selectedDetailItem.note || selectedDetailItem.mode || selectedDetailItem.category || 'No Details'}</Text>
                          {selectedDetailItem.status === 'Delivered' && <View style={{marginTop:15, backgroundColor:'#e8f5e9', padding:10}}><Text style={{color:'green', fontWeight:'bold'}}>✅ Delivered via {selectedDetailItem.deliveryMode}</Text><Text style={{fontSize:11}}>on {new Date(selectedDetailItem.deliveryDate).toLocaleDateString()}</Text></View>}
                          <TouchableOpacity style={{alignSelf:'center', marginTop:20}} onPress={()=>{
                              const col = detailType==='Expense'?'project_expenses':detailType==='Payment'?'project_payments':'project_items';
                              deleteItem(col, selectedDetailItem.id); 
                          }}><Text style={{color:'red', fontWeight:'bold'}}>Delete Entry</Text></TouchableOpacity>
                      </View>
                  )}
              </View>
          </View>
      </Modal>

      {/* 🔥 EDIT PROJECT ORDER VALUE & DESCRIPTION MODAL */}
      <Modal visible={editProjectModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                      <Text style={styles.modalTitle}>Update Project Details</Text>
                      <CloseButton onPress={() => setEditProjectModalVisible(false)}/>
                  </View>
                  
                  <Text style={styles.label}>Order Value (₹)</Text>
                  <TextInput 
                      style={styles.input} 
                      placeholder="Enter new amount" 
                      keyboardType="numeric" 
                      value={editTotalValue} 
                      onChangeText={setEditTotalValue} 
                  />

                  <Text style={styles.label}>Order Details / Description</Text>
                  <TextInput 
                      style={[styles.input, {height: 80, textAlignVertical: 'top'}]} 
                      multiline 
                      placeholder="Add notes about new items or changes..." 
                      value={editDescription} 
                      onChangeText={setEditDescription} 
                  />

                  <TouchableOpacity 
                      onPress={handleUpdateProjectDetails} 
                      style={[styles.saveBtn, {backgroundColor:'#1565c0', marginTop: 10}]} 
                      disabled={isUpdatingProject}
                  >
                      {isUpdatingProject ? (
                          <ActivityIndicator color="white" />
                      ) : (
                          <Text style={{color:'white', fontWeight: 'bold', textAlign: 'center'}}>Save Changes</Text>
                      )}
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex:1, justifyContent:'center', alignItems:'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#1565c0', paddingTop: 50, elevation: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  headerSub: { fontSize: 12, color: '#bbdefb' },
  headerContact: { fontSize: 11, color: '#bbdefb', fontWeight: 'bold' },
  searchBar: { flexDirection:'row', alignItems:'center', backgroundColor:'white', margin:10, paddingHorizontal:10, borderRadius:8, elevation:2, height:45 },
  tabContainer: { flexDirection: 'row', backgroundColor: 'white', elevation: 2 },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#1565c0' },
  tabText: { fontWeight: '600', color: 'gray' },
  activeTabText: { color: '#1565c0', fontWeight: 'bold' },
  content: { flex: 1, padding: 15 },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
  cardLabel: { fontSize: 12, color: 'gray', fontWeight: 'bold', textTransform: 'uppercase' },
  subLabel: { fontSize: 11, color: '#555' },
  bigValue: { fontSize: 20, fontWeight: 'bold', marginTop: 2 },
  profitValue: { fontSize: 24, fontWeight: 'bold', marginTop: 5 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#333', marginTop: 10 },
  advItem: { padding:12, marginBottom:10, borderRadius:8, borderWidth:1 },
  actionRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  rowTitle: { fontWeight:'bold', color:'#555' },
  smallBtn: { flexDirection:'row', backgroundColor:'#d32f2f', paddingHorizontal:12, paddingVertical:6, borderRadius:20, alignItems:'center' },
  btnTxt: { color:'white', marginLeft:5, fontWeight:'bold', fontSize:12 },
  listItem: { flexDirection:'row', alignItems:'center', backgroundColor:'white', padding:12, borderRadius:8, marginBottom:8, elevation:1 },
  iconBox: { width:35, height:35, borderRadius:18, justifyContent:'center', alignItems:'center' },
  listTitle: { fontWeight:'bold', fontSize:14, color:'#333' },
  listSub: { fontSize:12, color:'#555', flex:1 },
  listDate: { fontSize:10, color:'#888', marginTop:2 },
  amountText: { fontWeight:'bold', fontSize:15 },
  productItem: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'white', padding:15, borderRadius:8, marginBottom:8, elevation:1 },
  prodName: { fontWeight:'bold', fontSize:15, color:'#333' },
  prodQty: { fontSize:12, color:'#555', marginTop:2 },
  statusPill: { flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:5, borderRadius:20 },
  sectionDivider: { height:1, backgroundColor:'#ccc', marginVertical:20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: 'white', borderRadius: 15, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom:15 },
  label: { marginBottom: 8, fontWeight: '600', color: '#555' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#f9f9f9', marginBottom:15 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee', marginRight: 8 },
  activeChip: { backgroundColor: '#333' },
  chipText: { fontSize: 12, color: '#333' },
  modalBtns: { flexDirection:'row', justifyContent:'flex-end', marginTop:10 },
  saveBtn: { backgroundColor: '#d32f2f', paddingHorizontal:20, paddingVertical:10, borderRadius:8, width:'100%', alignItems:'center' },
});