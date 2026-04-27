import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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

// FIREBASE IMPORTS (🔥 doc, updateDoc added)
import { collection, doc, getDocs, query, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// PDF IMPORTS
import * as Print from 'expo-print';

export default function OrderListScreen() {
  const router = useRouter();
  const { orderList, user, updateOrderStatus, addNotification, companyProfile } = useData();

  // STATES
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  // 🔥 CHANGED: 'Year' changed to 'FY'
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  
  // 🔥 ADMIN EDIT STATES
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('All'); 
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  const isAdmin = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr'].includes(user?.role || '');
  // 🔥 ONLY PURE ADMIN CAN EDIT (Or add 'Manager' here if you want)
  const isStrictAdmin = user?.role === 'Admin' || user?.role === 'Manager'; 

  useEffect(() => {
      if (viewMode === 'Day') {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, searchText, statusFilter, selectedEmployee]);

  useEffect(() => {
    if (isAdmin) {
      const fetchEmployees = async () => {
        try {
          const q = query(collection(db, "users"));
          const querySnapshot = await getDocs(q);
          const usersData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'Unknown User'
          }));
          setEmployees([{ id: 'All', name: 'All Staff' }, ...usersData]);
        } catch (error) {
          console.log("Error fetching employees:", error);
        }
      };
      fetchEmployees();
    }
  }, [user]);

  const parseDate = (dateStr: any) => {
      if (!dateStr) return 0;
      if (typeof dateStr === 'number') return dateStr; 
      if (dateStr instanceof Date) return dateStr.getTime(); 

      if (typeof dateStr === 'string') {
          let cleanStr = dateStr.replace(/\./g, '/').replace(/-/g, '/');
          const parts = cleanStr.split('/');
          
          if (parts.length === 3 && parts[0].length === 4) {
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1; 
              const day = parseInt(parts[2]);
              return new Date(year, month, day).getTime();
          }
          if (parts.length === 3 && parts[2].length === 4) {
              const day = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1;
              const year = parseInt(parts[2]);
              return new Date(year, month, day).getTime();
          }
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  // 🔥 CHANGED: FY Navigation Logic
  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (viewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  // 🔥 CHANGED: Header Title to show Financial Year
  const getHeaderDate = () => {
      if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (viewMode === 'FY') {
          const currentMonth = currentDate.getMonth(); 
          const currentYear = currentDate.getFullYear();
          
          const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
          const fyEndYear = fyStartYear + 1;
          
          return `FY ${fyStartYear.toString().slice(-2)}-${fyEndYear.toString().slice(-2)}`;
      }
      return "All Time";
  };

  // --- PDF GENERATOR ---
  const generateOrderPDF = async (orderData: any) => {
    setGeneratingPdf(true);
    try {
        const logoHTML = companyProfile?.logoUrl 
            ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` 
            : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = companyProfile?.signatureUrl 
            ? `<img src="${companyProfile.signatureUrl}" style="height: 50px; margin-top: 10px;" />` 
            : `<div style="font-weight: bold; margin-top: 30px;">Authorized Signatory</div>`;

        const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 30px; border: 2px solid #333; }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
              .title { font-size: 22px; font-weight: bold; color: #1a237e; text-transform: uppercase; }
              .sub-title { font-size: 12px; margin-top: 2px; color: #333; line-height: 1.4; }
              .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
              .label { font-weight: bold; color: #444; }
              .box { border: 1px solid #000; padding: 15px; margin-top: 10px; background-color: #fcfcfc; }
              .amount-box { display: inline-block; border: 2px solid #000; padding: 8px 25px; font-weight: bold; font-size: 18px; margin-top: 10px; }
              .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
              .sign-box { text-align: center; }
            </style>
          </head>
          <body>
            <div class="header">
              ${logoHTML}
              ${companyProfile?.logoUrl ? `<div class="title">${companyProfile.companyName}</div>` : ''}
              <div class="sub-title">${companyProfile?.address || ''}</div>
              <div class="sub-title">Phone: ${companyProfile?.contactPhone || '-'} | Email: ${companyProfile?.contactEmail || '-'}</div>
              <div class="sub-title">${companyProfile?.gstNumber ? `GSTIN: ${companyProfile.gstNumber}` : ''}</div>
            </div>
            <h3 style="text-align: center; text-decoration: underline;">ORDER ACKNOWLEDGEMENT</h3>
            <div class="row">
              <div><span class="label">Order ID:</span> <b>${orderData.orderId}</b></div>
              <div><span class="label">Date:</span> ${new Date(orderData.date).toLocaleDateString('en-GB')}</div>
            </div>
            <div class="box">
              <div class="label" style="text-decoration: underline; margin-bottom: 5px;">Client Details:</div>
              <div style="font-size: 16px; font-weight: bold;">${orderData.hospitalName}</div>
              <div>${orderData.address || ''}, ${orderData.city || ''}</div>
              <div style="margin-top: 5px;">Contact: ${orderData.contactPerson || ''} (${orderData.mobile || ''})</div>
            </div>
            <div class="box">
              <div class="label" style="text-decoration: underline; margin-bottom: 5px;">Order Details:</div>
              <div><span class="label">PO Number:</span> ${orderData.poNumber}</div>
              <div style="margin-top: 5px;"><span class="label">Product Config:</span><br>${orderData.productDetails?.replace(/\n/g, '<br>') || ''}</div>
            </div>
            <div class="box">
              <div><span class="label">Payment Terms:</span> ${orderData.paymentTerms || 'Standard'}</div>
              <div><span class="label">Delivery Terms:</span> ${orderData.deliveryTerms || 'Standard'}</div>
              ${orderData.notes ? `<div style="margin-top:5px;"><span class="label">Notes:</span> ${orderData.notes}</div>` : ''}
            </div>
            <div style="text-align: right; margin-top: 20px;">
              <div style="font-weight: bold;">Total Order Value</div>
              <div class="amount-box">₹ ${Number(orderData.amount).toLocaleString('en-IN')}/-</div>
            </div>
            <div class="footer">
              <div>* This is a computer generated document.</div>
              <div class="sign-box">
                <div style="margin-bottom: 5px;">Booked By: <b>${orderData.senderName}</b></div>
                ${signatureHTML}
              </div>
            </div>
          </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `Order_${orderData.orderId}.pdf`;
        const newPath = `${FileSystem.cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Order PDF` });
        } catch (error) {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
    } catch (error) {
        Alert.alert("Error", "Could not generate PDF");
    } finally {
        setGeneratingPdf(false);
    }
  };

  const handleOpenFile = async (url: string) => {
      if (!url) return;
      try {
          if (url.startsWith('http')) {
              Linking.openURL(url);
              return;
          }
          if (!(await Sharing.isAvailableAsync())) return;
          if (url.startsWith('file://') || url.startsWith('/')) {
              const cacheDir = (FileSystem as any).cacheDirectory;
              let extension = 'jpg'; 
              if (url.toLowerCase().includes('.pdf')) extension = 'pdf';
              else if (url.toLowerCase().includes('.png')) extension = 'png';
              const newPath = `${cacheDir}temp_share_${Date.now()}.${extension}`;

              try {
                  await FileSystem.copyAsync({ from: url, to: newPath });
                  await Sharing.shareAsync(newPath, { mimeType: extension === 'pdf' ? 'application/pdf' : 'image/jpeg' });
              } catch (copyError) {
                  await Sharing.shareAsync(url);
              }
          } 
      } catch (e: any) { Alert.alert("Error", "Could not open file."); }
  };

  // 🔥 CHANGED: Filter logic to process Financial Year (April 1 to March 31)
  const getFilteredData = () => {
      let data = orderList ? [...orderList] : [];

      if (isAdmin && selectedEmployee !== 'All') {
          const targetName = selectedEmployeeName.toLowerCase().trim();
          data = data.filter((item: any) => 
              (item.senderId === selectedEmployee) || 
              (item.userId === selectedEmployee) ||
              (item.senderName && item.senderName.toLowerCase().trim().includes(targetName)) ||
              (item.userName && item.userName.toLowerCase().trim().includes(targetName)) ||
              (item.bookedBy && item.bookedBy.toLowerCase().trim().includes(targetName))
          );
      } 
      else if (!isAdmin) {
          data = data.filter((item: any) => item.senderId === user?.uid || item.bookedBy === user?.name);
      }

      if (statusFilter !== 'All') data = data.filter((item: any) => item.status === statusFilter);

      if (searchText) {
          const term = searchText.toLowerCase();
          data = data.filter((item: any) => {
              const fullString = `${item.hospitalName || ''} ${item.poNumber || ''} ${item.orderId || ''} ${item.productDetails || ''} ${item.amount || ''} ${item.status || ''} ${item.senderName || item.userName || ''} ${item.bookedBy || ''}`.toLowerCase();
              return fullString.includes(term);
          });
      }

      if (viewMode !== 'All') {
          const targetYear = currentDate.getFullYear();
          const targetMonth = currentDate.getMonth();
          const targetDay = currentDate.getDate();

          // Calculate FY Boundaries
          const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
          const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); // April 1st
          const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); // March 31st

          data = data.filter((item: any) => {
              const ts = parseDate(item.date || item.createdAt);
              if (ts === 0) return false;
              const itemDate = new Date(ts);
              
              if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
              if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
              if (viewMode === 'FY') return ts >= fyStartDate && ts <= fyEndDate;
              return true;
          });
      }

      data.sort((a: any, b: any) => parseDate(b.date) - parseDate(a.date));
      return data;
  };

  const fullList = getFilteredData(); 
  const renderedList = fullList.slice(0, visibleCount);

  const handleUpdateStatus = async (newStatus: string) => {
      if (!selectedOrder || !updateOrderStatus) return;
      Alert.alert("Confirm", `Mark as ${newStatus}?`, [
          { text: "Cancel", style: "cancel" },
          { 
              text: "Yes", 
              onPress: async () => {
                  setIsUpdating(true);
                  try {
                      await updateOrderStatus(selectedOrder.id, newStatus, selectedOrder);
                      if (addNotification && selectedOrder.senderId) {
                          await addNotification({
                              title: `Order ${newStatus}`, 
                              message: `Order for ${selectedOrder.hospitalName} (PO: ${selectedOrder.poNumber}) has been ${newStatus}.`,
                              type: newStatus === 'Approved' ? 'success' : newStatus === 'Rejected' ? 'alert' : 'info',
                              userId: selectedOrder.senderId,
                              to: selectedOrder.senderName, 
                              route: '/orders'
                          });
                      }
                      setModalVisible(false);
                  } catch (error) { Alert.alert("Error", "Failed to update status."); } 
                  finally { setIsUpdating(false); }
              }
          }
      ]);
  };

  // 🔥 1. OPEN EDIT MODAL FUNCTION
  const openEditModal = (item: any) => {
      setEditData({
          id: item.id,
          hospitalName: item.hospitalName || '',
          poNumber: item.poNumber || '',
          amount: item.amount ? item.amount.toString() : '',
          productDetails: item.productDetails || '',
          paymentTerms: item.paymentTerms || '',
          deliveryTerms: item.deliveryTerms || '',
          notes: item.notes || '',
          status: item.status || 'Pending'
      });
      setEditModalVisible(true);
  };

  // 🔥 2. SAVE EDITED DATA TO FIREBASE
  const handleSaveEdit = async () => {
      if (!editData.id) return;
      if (!editData.hospitalName || !editData.amount) {
          Alert.alert("Error", "Hospital Name and Amount are mandatory.");
          return;
      }
      setIsSavingEdit(true);
      try {
          const docRef = doc(db, "orders", editData.id);
          await updateDoc(docRef, {
              hospitalName: editData.hospitalName,
              poNumber: editData.poNumber,
              amount: parseFloat(editData.amount),
              productDetails: editData.productDetails,
              paymentTerms: editData.paymentTerms,
              deliveryTerms: editData.deliveryTerms,
              notes: editData.notes,
              status: editData.status // Allows admin to manually change status from edit too
          });
          Alert.alert("Success", "Order details updated successfully!");
          setEditModalVisible(false);
      } catch (error: any) {
          Alert.alert("Error", "Could not update order. " + error.message);
      } finally {
          setIsSavingEdit(false);
      }
  };

  const userRole = user?.role?.toLowerCase() || '';
  const canApprove = ['admin', 'manager', 'accountant', 'account'].includes(userRole);
  const isStore = ['store', 'store keeper'].includes(userRole);

  const openDetails = (item: any) => {
      setSelectedOrder(item);
      setModalVisible(true);
  };

  const renderItem = ({ item }: any) => {
      const isApproved = item.status === 'Approved' || item.status === 'Completed' || item.status === 'Dispatched';
      const isRejected = item.status === 'Rejected';

      return (
        <TouchableOpacity style={[styles.card, isApproved && styles.cardApproved, isRejected && styles.cardRejected]} onPress={() => openDetails(item)}>
            <View style={styles.cardHeader}>
                <View style={{flex:1}}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <Text style={styles.hospitalName} numberOfLines={1}>{item.hospitalName}</Text>
                        
                        {/* 🔥 EDIT BUTTON FOR ADMIN ONLY */}
                        {isStrictAdmin && (
                            <TouchableOpacity style={{marginLeft: 10}} onPress={() => openEditModal(item)}>
                                <Ionicons name="create" size={18} color="#d32f2f" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {item.city ? (
                        <Text style={{fontSize: 11, color: 'gray', marginBottom: 2}}>
                            <Ionicons name="location-outline" size={11} color="gray" /> {item.city}
                        </Text>
                    ) : null}
                    <Text style={styles.poNumber}>PO: {item.poNumber}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isApproved ? '#e8f5e9' : (isRejected ? '#ffebee' : '#fff3e0') }]}>
                    <Text style={{color: isApproved ? 'green' : (isRejected ? 'red' : 'orange'), fontWeight:'bold', fontSize:10}}>
                        {item.status}
                    </Text>
                </View>
            </View>

            <Text style={styles.productText} numberOfLines={1}>📦 {item.productDetails}</Text>

            <View style={styles.row}>
                <Text style={styles.amount}>₹ {item.amount}</Text>
                <Text style={styles.date}>{item.date}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.footer}>
                <View style={{flex: 1}}>
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Ionicons name="person" size={14} color="#3b5998" />
                        <Text style={{color:'#3b5998', fontWeight:'bold', fontSize:12, marginLeft:5}}>
                             {item.senderName || item.userName || 'Unknown'}
                        </Text>
                    </View>

                    {item.bookedBy && item.bookedBy !== item.senderName && (
                        <Text style={{fontSize: 10, color: 'gray', marginLeft: 20}}>
                            (Entry by: {item.bookedBy})
                        </Text>
                    )}
                </View>

                {item.poFileUri ? (
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Ionicons name="attach" size={16} color="gray" />
                        <Text style={{fontSize:10, color:'gray'}}>File</Text>
                    </View>
                ) : null}
            </View>
        </TouchableOpacity>
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Order Bookings</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_order' as any)}>
            <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <View style={{backgroundColor:'white', paddingBottom:10, marginBottom:5}}>
          {/* 🔥 CHANGED: Year tab mapped to FY */}
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'FY', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {isAdmin && (
            <View style={{paddingHorizontal: 15, marginBottom: 10}}>
               <TouchableOpacity style={styles.employeeFilterBtn} onPress={() => setShowEmployeePicker(true)}>
                   <Ionicons name="people" size={18} color="#2e7d32" />
                   <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                       {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
                   </Text>
                   <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:'auto'}}/>
               </TouchableOpacity>
            </View>
          )}

          {viewMode !== 'All' && (
              <View style={styles.dateNav}>
                  <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                  <Text style={styles.monthText}>{getHeaderDate()}</Text>
                  <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
              </View>
          )}

          <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color="gray" />
              <TextInput style={styles.searchInput} placeholder="Search Hospital, PO, ID..." value={searchText} onChangeText={setSearchText} />
              {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="gray" /></TouchableOpacity>
              )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingLeft:15, paddingVertical:10}}>
              {['All', 'Pending', 'Approved', 'Rejected', 'Dispatched'].map(s => (
                  <TouchableOpacity key={s} style={[styles.filterChip, statusFilter === s && styles.activeChip]} onPress={() => setStatusFilter(s)}>
                      <Text style={[styles.chipText, statusFilter === s && {color:'white'}]}>{s}</Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>
          
          <Text style={{textAlign:'right', fontSize:12, color:'gray', paddingRight:15}}>
              Total: <Text style={{fontWeight:'bold', color:'#3b5998'}}>{fullList.length}</Text>
          </Text>
      </View>

      <FlatList 
          data={renderedList}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          // 🔥 CHANGED: Increased paddingBottom so the list content scroll further up
          contentContainerStyle={{padding: 5, paddingBottom: 100}} 
          ListEmptyComponent={<Text style={{textAlign:'center', marginTop:50, color:'gray'}}>No Orders Found</Text>}
          ListFooterComponent={
            // 🔥 CHANGED: Wrapped Footer in a View with Extra padding Bottom
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < fullList.length ? (
                    <TouchableOpacity onPress={() => setVisibleCount(prev => prev + 20)} style={styles.loadMoreBtn}>
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({fullList.length - visibleCount} remaining)</Text>
                    </TouchableOpacity>
                ) : (fullList.length > 0 ? <Text style={styles.endListText}>--- End of List ---</Text> : null)}
            </View>
        }
      />

      {/* ========================================== */}
      {/* 🔥 ADMIN EDIT MODAL 🔥 */}
      {/* ========================================== */}
      <Modal visible={editModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={styles.modalTitle}>Edit Order (Admin)</Text>
                      <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                          <Ionicons name="close-circle" size={28} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                      <Text style={styles.inputLabel}>Client / Hospital Name *</Text>
                      <TextInput style={styles.editInput} value={editData.hospitalName} onChangeText={t => setEditData({...editData, hospitalName: t})} />

                      <Text style={styles.inputLabel}>PO Number</Text>
                      <TextInput style={styles.editInput} value={editData.poNumber} onChangeText={t => setEditData({...editData, poNumber: t})} />

                      <Text style={styles.inputLabel}>Amount (₹) *</Text>
                      <TextInput style={styles.editInput} keyboardType="numeric" value={editData.amount} onChangeText={t => setEditData({...editData, amount: t})} />

                      <Text style={styles.inputLabel}>Status</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10}}>
                          {['Pending', 'Approved', 'Rejected', 'Dispatched', 'Completed'].map(st => (
                              <TouchableOpacity 
                                  key={st} 
                                  style={[styles.statusChip, editData.status === st && {backgroundColor: '#3b5998', borderColor: '#3b5998'}]}
                                  onPress={() => setEditData({...editData, status: st})}
                              >
                                  <Text style={{color: editData.status === st ? 'white' : '#555', fontSize: 12}}>{st}</Text>
                              </TouchableOpacity>
                          ))}
                      </ScrollView>

                      <Text style={styles.inputLabel}>Product Details</Text>
                      <TextInput style={[styles.editInput, {height: 80, textAlignVertical: 'top'}]} multiline value={editData.productDetails} onChangeText={t => setEditData({...editData, productDetails: t})} />

                      <Text style={styles.inputLabel}>Payment Terms</Text>
                      <TextInput style={styles.editInput} value={editData.paymentTerms} onChangeText={t => setEditData({...editData, paymentTerms: t})} />

                      <Text style={styles.inputLabel}>Delivery Terms</Text>
                      <TextInput style={styles.editInput} value={editData.deliveryTerms} onChangeText={t => setEditData({...editData, deliveryTerms: t})} />

                      <Text style={styles.inputLabel}>Notes</Text>
                      <TextInput style={[styles.editInput, {height: 60, textAlignVertical: 'top'}]} multiline value={editData.notes} onChangeText={t => setEditData({...editData, notes: t})} />
                  </ScrollView>

                  <TouchableOpacity 
                      style={[styles.saveEditBtn, isSavingEdit && {opacity: 0.6}]} 
                      onPress={handleSaveEdit}
                      disabled={isSavingEdit}
                  >
                      {isSavingEdit ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Save Changes</Text>}
                  </TouchableOpacity>
              </View>
          </KeyboardAvoidingView>
      </Modal>

      {/* DETAILS MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}>
                      <Text style={styles.modalTitle}>Order Details</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={30} color="#d32f2f" /></TouchableOpacity>
                  </View>

                  {selectedOrder && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          <View style={styles.section}>
                              <Text style={styles.hospitalNameLarge}>{selectedOrder.hospitalName}</Text>
                              <Text style={{color:'gray', fontSize:12}}>{selectedOrder.address}, {selectedOrder.city}</Text>
                              <View style={styles.idRow}>
                                  <View style={styles.badge}><Text style={styles.badgeText}>ID: {selectedOrder.orderId || 'N/A'}</Text></View>
                                  <View style={[styles.badge, {backgroundColor:'#e3f2fd'}]}><Text style={[styles.badgeText, {color:'#1565c0'}]}>PO: {selectedOrder.poNumber}</Text></View>
                              </View>
                          </View>

                          <View style={styles.divider}/>

                          <Text style={styles.sectionHeader}>💼 Sales Team</Text>
                          <DetailRow label="Sales Person" value={selectedOrder.senderName} highlight />
                          {selectedOrder.bookedBy && selectedOrder.bookedBy !== selectedOrder.senderName && (
                              <DetailRow label="Entry By" value={selectedOrder.bookedBy} />
                          )}

                          <Text style={styles.sectionHeader}>👤 Client Contact</Text>
                          <DetailRow label="Name" value={selectedOrder.contactPerson} />
                          <DetailRow label="Mobile" value={selectedOrder.mobile} />
                          <DetailRow label="Email" value={selectedOrder.email} />

                          <Text style={styles.sectionHeader}>📦 Order Info</Text>
                          <DetailRow label="Amount" value={`₹ ${selectedOrder.amount}`} highlight />
                          <DetailRow label="Date" value={selectedOrder.date} />
                          <View style={styles.textBox}>
                              <Text style={styles.textLabel}>Products:</Text>
                              <Text style={styles.textValue}>{selectedOrder.productDetails}</Text>
                          </View>
                          <DetailRow label="Payment" value={selectedOrder.paymentTerms} />
                          <DetailRow label="Delivery" value={selectedOrder.deliveryTerms} />

                          {selectedOrder.notes ? (
                              <View style={styles.textBox}>
                                  <Text style={styles.textLabel}>Notes:</Text>
                                  <Text style={styles.textValue}>{selectedOrder.notes}</Text>
                              </View>
                          ) : null}

                          {selectedOrder.poFileUri && (
                              <TouchableOpacity style={styles.fileBox} onPress={() => handleOpenFile(selectedOrder.poFileUri)}>
                                  <Ionicons name="document-attach" size={20} color="#3b5998" />
                                  <Text style={{marginLeft:10, flex:1, color:'#3b5998', textDecorationLine:'underline'}}>
                                      {selectedOrder.poFileName || 'Download Attachment'}
                                  </Text>
                                  <Ionicons name="open-outline" size={16} color="green" />
                              </TouchableOpacity>
                          )}

                          <TouchableOpacity 
                              style={{flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:'#e3f2fd', padding:12, borderRadius:8, marginTop:20, borderWidth:1, borderColor:'#2196f3'}}
                              onPress={() => generateOrderPDF(selectedOrder)}
                              disabled={generatingPdf}
                          >
                              {generatingPdf ? (
                                <ActivityIndicator color="#1565c0" size="small" />
                              ) : (
                                <>
                                  <Ionicons name="document-text-outline" size={20} color="#1565c0" />
                                  <Text style={{color:'#1565c0', fontWeight:'bold', marginLeft:8}}>Share Order PDF</Text>
                                </>
                              )}
                          </TouchableOpacity>
                          
                          <View style={styles.divider}/>
                          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                              <Text style={{color:'gray'}}>Status:</Text>
                              <Text style={{fontWeight:'bold', color:'#333', fontSize:16}}>{selectedOrder.status}</Text>
                          </View>

                          {canApprove && selectedOrder.status === 'Pending' && (
                              <View style={styles.actionRow}>
                                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#d32f2f', opacity: isUpdating ? 0.6 : 1}]} onPress={() => handleUpdateStatus('Rejected')} disabled={isUpdating}>
                                      <Text style={styles.btnText}>Reject</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#2e7d32', opacity: isUpdating ? 0.6 : 1}]} onPress={() => handleUpdateStatus('Approved')} disabled={isUpdating}>
                                      {isUpdating ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Approve</Text>}
                                  </TouchableOpacity>
                              </View>
                          )}
                          
                          {isStore && selectedOrder.status === 'Approved' && (
                              <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#1976d2', marginTop:15, opacity: isUpdating ? 0.6 : 1}]} onPress={() => handleUpdateStatus('Dispatched')} disabled={isUpdating}>
                                  {isUpdating ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Mark as Dispatched</Text>}
                              </TouchableOpacity>
                          )}
                      </ScrollView>
                  )}
              </View>
          </View>
      </Modal>

      <Modal visible={showEmployeePicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Employee View</Text>
                  <FlatList 
                    data={employees} 
                    keyExtractor={item => item.id} 
                    renderItem={({item}) => (
                      <TouchableOpacity 
                        style={styles.pickerItem} 
                        onPress={() => { 
                            setSelectedEmployee(item.id); 
                            setSelectedEmployeeName(item.name);
                            setShowEmployeePicker(false); 
                        }}
                      >
                          <View style={{flexDirection:'row', alignItems:'center'}}>
                             <Ionicons name="person-circle" size={24} color="#555" style={{marginRight:10}}/>
                             <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                          </View>
                          {selectedEmployee === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                      </TouchableOpacity>
                  )} />
              </View>
          </TouchableOpacity>
      </Modal>

    </View>
  );
}

const DetailRow = ({label, value, icon, highlight}: any) => (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom:10}}>
        {icon && <View style={{width:30}}><Ionicons name={icon} size={20} color="#3b5998" /></View>}
        <View style={{flex: 1, flexDirection:'row', justifyContent: 'space-between', paddingRight: 10}}>
            <Text style={{fontSize:12, color:'gray'}}>{label}</Text>
            <Text style={{fontSize:14, fontWeight:'bold', color: highlight ? '#2e7d32' : '#333', maxWidth:'70%', textAlign:'right'}}>{value || '-'}</Text>
        </View>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingTop: 50, backgroundColor: 'white', elevation: 4, alignItems:'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  addBtn: { backgroundColor:'#3b5998', padding:8, borderRadius:20 },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 10, borderRadius: 8, padding: 2, marginBottom: 5 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#2e7d32', marginBottom:10 },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 6, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', marginHorizontal: 15, paddingHorizontal: 10, borderRadius: 8, height:36, alignItems:'center' },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  filterChip: { paddingHorizontal:15, paddingVertical:6, backgroundColor:'#eee', borderRadius:20, marginRight:10 },
  activeChip: { backgroundColor:'#3b5998' },
  chipText: { fontSize:12, color:'#555' },
  
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 2, borderLeftWidth:4, borderLeftColor:'#ff9800' },
  cardApproved: { borderLeftColor: '#4caf50' },
  cardRejected: { borderLeftColor: '#f44336' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName: { fontWeight: 'bold', fontSize: 16, color: '#333', flex:1 },
  poNumber: { fontSize: 12, color: 'gray' },
  statusBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:4, marginLeft: 10 },
  productText: { fontSize: 13, color: '#555', marginTop: 8, fontStyle: 'italic' },
  row: { flexDirection:'row', justifyContent:'space-between', marginTop:10 },
  amount: { fontWeight:'bold', fontSize:16, color:'#333' },
  date: { color:'gray', fontSize:12 },
  divider: { height:1, backgroundColor:'#eee', marginVertical:10 },
  footer: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', padding: 10 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight:'85%', width:'100%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
  hospitalNameLarge: { fontSize:18, fontWeight:'bold', color:'#333' },
  sectionHeader: { fontSize:14, fontWeight:'bold', color:'#3b5998', marginTop:15, marginBottom:10, backgroundColor:'#e3f2fd', padding:5, borderRadius:5 },
  section: { marginBottom: 10 },
  idRow: { flexDirection:'row', gap:10, marginTop:5 },
  badge: { backgroundColor:'#eee', paddingHorizontal:8, paddingVertical:2, borderRadius:4 },
  badgeText: { fontSize:11, fontWeight:'bold', color:'#555' },
  textBox: { backgroundColor:'#f9f9f9', padding:10, borderRadius:8, marginBottom:10 },
  textLabel: { fontSize:11, color:'gray', marginBottom:2 },
  textValue: { fontSize:13, color:'#333' },
  
  fileBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#e0f7fa', padding:12, borderRadius:8, marginTop:5, borderWidth:1, borderColor:'#26c6da' },
  
  actionRow: { flexDirection:'row', justifyContent:'space-between', marginTop: 20, paddingBottom: 20 },
  actionBtn: { flex:0.48, padding:12, borderRadius:8, alignItems:'center', justifyContent:'center' },
  btnText: { color:'white', fontWeight:'bold' },

  // EDIT MODAL STYLES 🔥
  inputLabel: { fontSize: 12, color: 'gray', marginTop: 10, marginBottom: 5, fontWeight: 'bold' },
  editInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, color: '#333', backgroundColor: '#f9f9f9' },
  saveEditBtn: { backgroundColor: '#d32f2f', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', marginRight: 10 },

  loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  endListText: { textAlign: 'center', padding: 20, color: '#aaa', fontSize: 12, fontStyle: 'italic' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});