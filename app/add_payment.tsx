import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { db } from '../firebaseConfig';
import { useData } from './context/DataContext';

// PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function AddPaymentScreen() {
    const router = useRouter();
    const params = useLocalSearchParams(); 
    
    // 🔥 UPDATED: Added 'companyProfile' here
    const { addPayment, orgList, currentUser, paymentList, orderList = [], companyProfile } = useData();

    const [loading, setLoading] = useState(false);
    
    // FORM STATES
    const [date, setDate] = useState(new Date());
    const [pdcDate, setPdcDate] = useState(new Date());
    
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showPdcDatePicker, setShowPdcDatePicker] = useState(false);

    const [selectedOrg, setSelectedOrg] = useState<any>(null);
    const [showOrgModal, setShowOrgModal] = useState(false);
    const [searchOrg, setSearchOrg] = useState('');

    // ORDER SELECTION STATES
    const [pendingOrders, setPendingOrders] = useState<any[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [showOrderModal, setShowOrderModal] = useState(false);

    const [totalDue, setTotalDue] = useState(''); 
    const [amount, setAmount] = useState('');     
    
    const [mode, setMode] = useState('Cash'); 
    const [bankName, setBankName] = useState('');
    const [refNumber, setRefNumber] = useState(''); 
    
    const [billRef, setBillRef] = useState('');
    const [notes, setNotes] = useState('');

    // --- EFFECT: AUTO-FILL FROM DUE LIST ---
    useEffect(() => {
        if (params.orgName) {
            const org = orgList.find((o: any) => o.name === params.orgName || o.orgName === params.orgName);
            if (org) setSelectedOrg(org);
            else setSelectedOrg({ name: params.orgName });

            if (params.amount) {
                setTotalDue(params.amount as string);
                setAmount(params.amount as string); 
            }
            
            if (params.billNo) setBillRef(params.billNo as string);

            if (params.linkedId && params.source === 'orders') {
                const linkedOrder = orderList.find((o:any) => o.id === params.linkedId);
                if (linkedOrder) {
                    setSelectedOrder(linkedOrder);
                } else {
                    setSelectedOrder({ id: params.linkedId, orderId: 'Linked Order', amount: params.amount });
                }
            }
        }
    }, [params, orgList, orderList]);
    // --- EFFECT: Fetch Pending Orders when Org Changes ---
    useEffect(() => {
        if (selectedOrg) {
            const orgName = selectedOrg.name || selectedOrg.orgName;
            
            // 1. Dropdown List ke liye Orders Filter karo
            const orders = orderList.filter((o: any) => {
                const isOrgMatch = o.hospitalName === orgName;
                const isApproved = o.status === 'Approved' || o.status === 'Completed' || o.status === 'Dispatched';
                const hasBalance = (o.balance !== undefined ? o.balance > 0 : true);
                const isNotPaid = o.paymentStatus !== 'Paid';

                return isOrgMatch && isApproved && isNotPaid && hasBalance;
            });

            setPendingOrders(orders);
            
            // 2. Agar Specific Link nahi hai, to Total Due Auto-Calculate karo
            if (!params.linkedId) {
                setSelectedOrder(null);
                
                // 🔥 FIXED CODE HERE (Types Added)
                const totalOrderDue = orderList
                    .filter((o: any) => 
                        (o.hospitalName === orgName || o.orgId === selectedOrg.id) && 
                        (o.balance === undefined || o.balance > 0) &&
                        (o.status === 'Approved' || o.status === 'Completed' || o.status === 'Dispatched')
                    )
                    .reduce((sum: number, o: any) => {
                        // Agar balance hai to wo lo, nahi to pura amount
                        const val = o.balance !== undefined ? o.balance : o.amount;
                        return sum + parseFloat(val || 0);
                    }, 0);

                setTotalDue(String(totalOrderDue));
            }
        }
    }, [selectedOrg, orderList]);

    const handleSelectOrder = (order: any) => {
        if (order === 'General') {
            setSelectedOrder(null);
            setTotalDue(''); 
        } else {
            setSelectedOrder(order);
            const dueAmt = order.balance !== undefined ? order.balance : order.amount;
            setTotalDue(String(dueAmt));
        }
        setShowOrderModal(false);
    };

    const numberToWords = (num: number) => {
        const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
        const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
        if ((num = num.toString() as any).length > 9) return 'Overflow';
        const n: any = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return; 
        let str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
        return str + 'Only';
    };

    const formatDate = (rawDate: Date) => {
        let day = rawDate.getDate().toString().padStart(2, '0');
        let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
        let year = rawDate.getFullYear();
        return `${day}/${month}/${year}`;
    };

    // 🔥🔥 UPDATED DYNAMIC PDF GENERATOR 🔥🔥
    const generateAndShareReceipt = async (paymentData: any) => {
        try {
            // Customer Address
            let orgAddr = paymentData.orgAddress || '';
            if (!orgAddr) {
                const org = orgList.find((o: any) => o.name === paymentData.orgName || o.orgName === paymentData.orgName);
                if (org) orgAddr = org.address || org.city || '';
            }

            // Payment Mode Table HTML
            let paymentDetailsHTML = `<div><b>${paymentData.mode}</b></div>`;
            if (paymentData.mode !== 'Cash') {
                paymentDetailsHTML += `
                    <div style="margin-top:2px;">Bank: ${paymentData.bankName || '-'}</div>
                    <div>Inst. No: ${paymentData.refNumber || '-'}</div>
                `;
                if (paymentData.pdcDate) {
                    paymentDetailsHTML += `<div>Inst. Date: ${paymentData.pdcDate}</div>`;
                }
            }

            // --- 1. Dynamic Logo Logic ---
            const logoHTML = companyProfile?.logoUrl 
                ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` 
                : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

            // --- 2. Dynamic Signature Logic ---
            const signatureHTML = companyProfile?.signatureUrl 
                ? `<img src="${companyProfile.signatureUrl}" style="height: 50px; margin-top: 10px;" />` 
                : `<div style="font-weight: bold; margin-top: 30px;">Authorized Signatory</div>`;

            // --- 3. Dynamic Bank Footer (Our Company Bank) ---
            const companyBankHTML = companyProfile?.bankDetails1?.accountNo 
                ? `<div style="margin-top: 20px; font-size: 10px; border: 1px dashed #ccc; padding: 10px; background:#f5f5f5;">
                    <b>Our Bank Details:</b> ${companyProfile.bankDetails1.bankName} | 
                    A/C: ${companyProfile.bankDetails1.accountNo} | 
                    IFSC: ${companyProfile.bankDetails1.ifsc}
                   </div>` 
                : '';

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
                  .split-table { width: 100%; margin-top: 15px; border-collapse: collapse; }
                  .split-table td { vertical-align: top; width: 50%; }
                  .amount-wrapper { text-align: left; margin-top: 20px; } 
                  .amount-box { display: inline-block; border: 2px solid #000; padding: 8px 25px; font-weight: bold; font-size: 18px; }
                  .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
                  .sign-box { text-align: center; }
                  .sign-line { border-top: 1px solid #000; width: 150px; margin-bottom: 5px; }
                </style>
              </head>
              <body>
                <div class="header">
                  ${logoHTML}
                  ${companyProfile?.logoUrl ? `<div class="title">${companyProfile.companyName}</div>` : ''}
                  
                  <div class="sub-title">${companyProfile?.address}</div>
<div class="sub-title">
    Phone: ${companyProfile?.contactPhone || companyProfile?.phone} | 
    Email: ${companyProfile?.contactEmail || companyProfile?.email || '-'}
</div>
<div class="sub-title">
    ${companyProfile?.gstNumber ? `GSTIN: ${companyProfile.gstNumber}` : ''}
</div>
                </div>

                <h3 style="text-align: center; text-decoration: underline; margin-bottom: 20px;">PAYMENT RECEIPT</h3>

                <div class="row">
                  <div><span class="label">Receipt No:</span> <b>${paymentData.receiptNo || '-'}</b></div>
                  <div><span class="label">Date:</span> ${new Date(paymentData.date).toLocaleDateString('en-GB')}</div>
                </div>

                <div class="box">
                  <p style="margin-bottom: 15px;">
                    <span class="label">Received with thanks from:</span><br> 
                    <span style="font-size: 16px; font-weight: bold; text-transform: uppercase;">${paymentData.orgName}</span><br>
                    <span style="font-size: 13px;">${orgAddr}</span>
                  </p>
                  <p style="margin-bottom: 15px;">
                    <span class="label">The Sum of Rupees:</span><br> 
                    <i style="text-transform: capitalize;">${numberToWords(paymentData.amount)}</i>
                  </p>
                  <table class="split-table">
                    <tr>
                      <td>
                          <span class="label" style="text-decoration: underline;">Payment Mode Details:</span><br>
                          ${paymentDetailsHTML}
                      </td>
                      <td style="padding-left: 20px;">
                          <span class="label" style="text-decoration: underline;">Against Bill / Invoice No:</span><br>
                          <span style="font-size: 15px; font-weight:500;">${paymentData.billRef || 'On Account'}</span>
                      </td>
                    </tr>
                  </table>
                </div>

                <div class="amount-wrapper">
                    <div style="font-weight:bold; margin-bottom:5px;">Total Payment Received</div>
                    <div class="amount-box">₹ ${paymentData.amount}/-</div>
                </div>

                ${companyBankHTML}

                <div class="footer">
                  <div style="font-size:10px; max-width:250px; color:#333;">
                    *Subject to realisation of Cheque/DD.<br>
                    *This is a computer generated receipt.
                  </div>
                  <div class="sign-box">
                    <div style="margin-bottom: 10px; font-size:12px;">For, ${companyProfile?.companyName}</div>
                    ${signatureHTML}
                    ${!companyProfile?.signatureUrl ? '<div class="sign-line"></div><div style="font-weight: bold;">Accountant Sign</div>' : ''}
                  </div>
                </div>
              </body>
            </html>`;

            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            const cleanName = (paymentData.receiptNo || 'Receipt').replace(/[^a-zA-Z0-9-_]/g, '_');
            const fileName = `${cleanName}_${Date.now()}.pdf`; 
            const newPath = `${(FileSystem as any).cacheDirectory}${fileName}`;
            try {
                await FileSystem.moveAsync({ from: uri, to: newPath });
                await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share ${cleanName}` });
            } catch (error) {
                await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
            }
        } catch (error) { 
            Alert.alert("Error", "Could not generate receipt."); 
        }
    };

    const getRemainingBalance = () => {
        const due = parseFloat(totalDue || '0');
        const paid = parseFloat(amount || '0');
        if (!totalDue || due === 0) return 0;
        return (due - paid).toFixed(2);
    };

    const remainingAmount = getRemainingBalance();

    const handleSubmit = async () => {
        if (!selectedOrg || !amount) {
            Alert.alert("Missing Fields", "Please Select Customer and Amount.");
            return;
        }
        setLoading(true);
        
        const finalOrgName = selectedOrg.name || selectedOrg.orgName || "";
        const finalOrgAddress = selectedOrg.address || selectedOrg.city || ""; 

        const currentYear = new Date().getFullYear();
        const count = paymentList ? paymentList.filter((p: any) => p.date && p.date.startsWith(String(currentYear))).length + 1 : 1;
        
        // 🔥 SHORT NAME FROM PROFILE (Prefix)
        const prefix = companyProfile?.shortName ? companyProfile.shortName.toUpperCase() : 'LMS';
        const receiptNo = `${prefix}-PR-${currentYear}-${String(count).padStart(3, '0')}`;

        const paymentData = {
            date: date.toISOString().split('T')[0],
            orgId: selectedOrg.id,
            orgName: finalOrgName,
            orgAddress: finalOrgAddress,
            
            // Link Data
            orderId: selectedOrder ? selectedOrder.id : null,
            orderRef: selectedOrder ? selectedOrder.orderId : null,
            
            billRef: billRef, 

            totalDueSnapshot: parseFloat(totalDue || '0'), 
            amount: parseFloat(amount),                    
            remainingBalance: (totalDue && parseFloat(totalDue) > 0) ? parseFloat(remainingAmount as string) : 0, 
            mode,
            bankName: (mode !== 'Cash') ? bankName : "",
            refNumber: (mode !== 'Cash') ? refNumber : "",
            pdcDate: (mode !== 'Cash') ? formatDate(pdcDate) : "", 
            notes, receiptNo,
            status: 'Collected',
            senderId: currentUser?.id, userName: currentUser?.name, role: currentUser?.role, createdAt: new Date().toISOString()
        };

        try {
            // 1. Add to Payment Collections History
            await addPayment(paymentData);
            
            const payAmount = parseFloat(amount);

            // 2. UPDATE LOGIC (Merge Order & Manual Due)
            if (params.linkedId && params.source) {
                const sourceCollection = params.source as string; 
                const linkedId = params.linkedId as string;

                const docRef = doc(db, sourceCollection, linkedId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const currentBalance = data.balance !== undefined ? parseFloat(data.balance) : parseFloat(data.amount);
                    const newBalance = currentBalance - payAmount;
                    
                    if (sourceCollection === 'orders') {
                        const payStatus = newBalance <= 0 ? 'Paid' : 'Partial';
                        await updateDoc(docRef, {
                            balance: newBalance,
                            paymentStatus: payStatus,
                            lastPaymentDate: new Date().toISOString()
                        });
                    } else {
                        const newStatus = newBalance <= 0 ? 'Paid' : 'Partial';
                        await updateDoc(docRef, {
                            balance: newBalance,
                            status: newStatus,
                            lastPaymentDate: new Date().toISOString()
                        });
                    }
                }
            } 
            else if (selectedOrder && selectedOrder.id) {
                const currentBalance = selectedOrder.balance !== undefined ? parseFloat(selectedOrder.balance) : parseFloat(selectedOrder.amount);
                const newBalance = currentBalance - payAmount;
                let newStatus = selectedOrder.paymentStatus || 'Pending';
                if (newBalance <= 0) newStatus = 'Paid';
                else newStatus = 'Partial';

                const orderRef = doc(db, 'orders', selectedOrder.id);
                await updateDoc(orderRef, {
                    balance: newBalance,
                    paymentStatus: newStatus,
                    lastPaymentDate: new Date().toISOString()
                });
            }

            Alert.alert("Success ✅", "Payment Saved & Linked! Share Receipt?", [
                { text: "No", onPress: () => router.back(), style: 'cancel' },
                { text: "Yes, Share PDF", onPress: async () => { await generateAndShareReceipt(paymentData); router.back(); }}
            ]);
        } catch (error: any) { Alert.alert("Error", "Failed: " + error.message); } 
        finally { setLoading(false); }
    };

    const onChangeDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowDatePicker(false);
        if (selectedDate) setDate(selectedDate);
    };

    const onChangePdcDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowPdcDatePicker(false);
        if (selectedDate) setPdcDate(selectedDate);
    };

    const filteredOrgs = orgList.filter((o:any) => (o.name || '').toLowerCase().includes(searchOrg.toLowerCase()) || (o.orgName || '').toLowerCase().includes(searchOrg.toLowerCase()) || (o.city || '').toLowerCase().includes(searchOrg.toLowerCase()));

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Add New Payment</Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
                <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    
                    <View style={styles.formCard}>
                        <View style={styles.dateRow}>
                            <Text style={styles.label}>Receiving Date</Text>
                            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                                <Ionicons name="calendar" size={20} color="#3b5998" />
                                <Text style={styles.dateText}>{formatDate(date)}</Text>
                            </TouchableOpacity>
                        </View>
                        {showDatePicker && <DateTimePicker value={date} mode="date" onChange={onChangeDate} />}

                        <Text style={styles.label}>Select Customer *</Text>
                        <TouchableOpacity style={styles.selector} onPress={() => setShowOrgModal(true)}>
                            <View>
                                <Text style={[styles.selectorValue, !selectedOrg && {color:'#999'}]}>{selectedOrg ? (selectedOrg.name || selectedOrg.orgName) : "Choose Party..."}</Text>
                                {selectedOrg && <Text style={{fontSize:11, color:'gray', marginTop:2}}>{selectedOrg.city} • {selectedOrg.contactPerson}</Text>}
                            </View>
                            <Ionicons name="search" size={20} color="#3b5998" />
                        </TouchableOpacity>

                        {/* ORDER LINK DROPDOWN */}
                        {selectedOrg && (
                            <>
                                <Text style={[styles.label, {color:'#d32f2f'}]}>Link to System Order (Optional)</Text>
                                <TouchableOpacity style={styles.orderSelector} onPress={() => setShowOrderModal(true)}>
                                    <View>
                                        <Text style={{fontWeight:'bold', color: selectedOrder ? '#333' : '#555'}}>
                                            {selectedOrder ? `🧾 Linked: ${selectedOrder.orderId || 'Manual Due'}` : "🔘 General Payment / On Account"}
                                        </Text>
                                        {selectedOrder ? (
                                            <Text style={{fontSize:10, color:'green'}}>
                                                Total Due: ₹{selectedOrder.balance !== undefined ? selectedOrder.balance : selectedOrder.amount}
                                            </Text>
                                        ) : (
                                            <Text style={{fontSize:10, color:'gray'}}>Click to choose pending order</Text>
                                        )}
                                    </View>
                                    <Ionicons name="chevron-down" size={20} color="#555" />
                                </TouchableOpacity>
                            </>
                        )}

                        <Text style={styles.sectionTitle}>Payment Details</Text>
                        
                        <Text style={styles.label}>Against Bill No / Invoice Ref (Manual)</Text>
                        <TextInput 
                            style={styles.input} 
                            placeholder="e.g. GST-INV-001" 
                            value={billRef} 
                            onChangeText={setBillRef} 
                        />
                        {selectedOrder && (
                            <Text style={{fontSize:10, color:'gray', marginLeft:5, marginTop:2}}>
                                Linked ID: {selectedOrder.id}
                            </Text>
                        )}

                        <Text style={styles.label}>Total Due Amount (Auto)</Text>
                        <TextInput style={[styles.input, {backgroundColor:'#eee'}]} placeholder="₹ Previous Balance" keyboardType="numeric" value={totalDue} onChangeText={setTotalDue} editable={!selectedOrder} />

                        <Text style={styles.label}>Amount Receiving (₹) *</Text>
                        <TextInput style={[styles.input, {borderColor: 'green', borderWidth: 1.5, color:'green', fontWeight:'bold', fontSize:18}]} placeholder="₹ 0.00" keyboardType="numeric" value={amount} onChangeText={setAmount} />

                        {totalDue && parseFloat(totalDue) > 0 && amount ? (
                            <View style={styles.calcBox}>
                                <Text style={styles.calcText}>Balance after payment: </Text>
                                <Text style={[styles.calcText, {fontWeight:'bold', color: parseFloat(remainingAmount as string) < 0 ? 'green' : '#d32f2f'}]}>
                                    {parseFloat(remainingAmount as string) < 0 ? `+ ₹ ${Math.abs(parseFloat(remainingAmount as string))} (Advance)` : `₹ ${remainingAmount}`}
                                </Text>
                            </View>
                        ) : null}

                        <Text style={styles.label}>Payment Mode</Text>
                        <View style={styles.modeContainer}>
                            {['Cash', 'Cheque', 'NEFT', 'UPI'].map((m) => (
                                <TouchableOpacity key={m} style={[styles.modeBtn, mode === m && styles.activeMode]} onPress={() => setMode(m)}>
                                    <Text style={[styles.modeText, mode === m && {color:'white'}]}>{m}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {mode !== 'Cash' && (
                            <View style={styles.bankBox}>
                                <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="Bank Name" />
                                <TextInput style={[styles.input, {marginTop:10}]} value={refNumber} onChangeText={setRefNumber} placeholder={mode === 'Cheque' ? 'Cheque No' : 'Transaction Ref No'} />
                                
                                <Text style={[styles.label, {marginTop:10}]}>Instrument Date</Text>
                                <TouchableOpacity style={[styles.input, {justifyContent:'center'}]} onPress={() => setShowPdcDatePicker(true)}>
                                    <Text style={{color: '#333'}}>{formatDate(pdcDate)}</Text>
                                </TouchableOpacity>
                                {showPdcDatePicker && <DateTimePicker value={pdcDate} mode="date" onChange={onChangePdcDate} />}
                            </View>
                        )}

                        <Text style={styles.label}>Remarks / Notes</Text>
                        <TextInput style={[styles.input, {height: 80, textAlignVertical:'top'}]} multiline placeholder="Any notes..." value={notes} onChangeText={setNotes} />

                        <TouchableOpacity style={styles.saveBtn} onPress={handleSubmit} disabled={loading}>
                            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save & Generate Receipt</Text>}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* ORG MODAL */}
            <Modal visible={showOrgModal} animationType="slide">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Party</Text>
                        <TouchableOpacity onPress={() => setShowOrgModal(false)}><Ionicons name="close-circle" size={30} color="#d32f2f"/></TouchableOpacity>
                    </View>
                    <View style={styles.searchBox}>
                        <Ionicons name="search" size={20} color="gray" />
                        <TextInput style={styles.searchInputModal} placeholder="Search Name..." value={searchOrg} onChangeText={setSearchOrg} autoFocus />
                    </View>
                    <FlatList
                        data={filteredOrgs}
                        keyExtractor={item => item.id}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.orgItem} onPress={() => { setSelectedOrg(item); setShowOrgModal(false); }}>
                                <View style={{flex:1}}>
                                    <Text style={styles.orgName}>{item.name || item.orgName}</Text>
                                    <Text style={styles.orgSubText}>{item.city ? `📍 ${item.city}` : ''}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color="#ccc" />
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </Modal>

            {/* ORDER MODAL */}
            <Modal visible={showOrderModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContentSmall}>
                        <Text style={styles.modalTitleSmall}>Select Bill / Order</Text>
                        <Text style={{color:'gray', fontSize:12, marginBottom:10}}>Linking helps in incentive calculation.</Text>
                        
                        <ScrollView style={{maxHeight: 300}}>
                            <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectOrder('General')}>
                                <Text style={{fontWeight:'bold', color:'#333'}}>🔘 General / On Account</Text>
                                <Text style={{fontSize:11, color:'gray'}}>Use if unsure about specific bill</Text>
                            </TouchableOpacity>

                            {pendingOrders.map((order, index) => (
                                <TouchableOpacity key={index} style={styles.modalItem} onPress={() => handleSelectOrder(order)}>
                                    <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>{order.orderId || 'No ID'}</Text>
                                        <Text style={{fontWeight:'bold', color:'#d32f2f'}}>Due: ₹{order.balance !== undefined ? order.balance : order.amount}</Text>
                                    </View>
                                    <Text style={{fontSize:11, color:'gray'}}>
                                        Date: {order.date} • Total: {order.amount}
                                    </Text>
                                </TouchableOpacity>
                            ))}

                            {pendingOrders.length === 0 && (
                                <Text style={{textAlign:'center', marginTop:20, color:'gray', fontStyle:'italic'}}>
                                    No Pending Orders Found.
                                </Text>
                            )}
                        </ScrollView>

                        <TouchableOpacity style={styles.closeBtnSmall} onPress={() => setShowOrderModal(false)}>
                            <Text style={{color:'red'}}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 2, alignItems:'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    formCard: { backgroundColor: 'white', padding: 20, borderRadius: 15, elevation: 2 },
    label: { fontSize: 12, fontWeight: 'bold', color: '#777', marginTop: 15, marginBottom: 5 },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#3b5998', marginTop: 20, marginBottom: 5, textTransform:'uppercase' },
    input: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eee', fontSize: 15, color: '#333' },
    selector: { backgroundColor: '#f0f4ff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#d1d9ff', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
    selectorValue: { fontSize: 15, fontWeight: 'bold', color: '#3b5998' },
    
    orderSelector: { backgroundColor: '#fff3e0', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ffe0b2', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },

    dateRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
    dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f4ff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d1d9ff' },
    dateText: { marginLeft: 10, fontSize: 14, color: '#3b5998', fontWeight: 'bold' },
    modeContainer: { flexDirection: 'row', gap: 10, marginTop: 5 },
    modeBtn: { flex:1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f0f0f0', alignItems:'center' },
    activeMode: { backgroundColor: '#27ae60' },
    modeText: { fontSize: 12, fontWeight: 'bold', color: '#555' },
    bankBox: { backgroundColor: '#fff9f0', padding: 12, borderRadius: 10, marginTop: 10 },
    saveBtn: { backgroundColor: '#3b5998', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 30 },
    saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    calcBox: { flexDirection:'row', justifyContent:'space-between', backgroundColor:'#ffebee', padding:10, borderRadius:8, marginTop:5 },
    calcText: { fontSize:12, color:'#333' },
    
    modalContainer: { flex: 1, backgroundColor: 'white', padding: 20, paddingTop: 50 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    searchBox: { flexDirection:'row', alignItems:'center', backgroundColor: '#f0f2f5', paddingHorizontal: 10, borderRadius: 10, marginBottom: 15, height: 50 },
    searchInputModal: { flex: 1, marginLeft: 10, fontSize: 16 },
    orgItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
    orgName: { fontWeight: 'bold', fontSize: 16 },
    orgSubText: { color: 'gray', fontSize: 12, marginTop: 2 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding:20 },
    modalContentSmall: { width: '90%', backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '60%' },
    modalTitleSmall: { fontSize: 18, fontWeight: 'bold', marginBottom: 5, color:'#3b5998', textAlign:'center' },
    modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    closeBtnSmall: { marginTop: 15, alignItems: 'center', padding: 10 }
});