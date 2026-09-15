import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

// 🔥 SAAS IMPORTS (organizations still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 6: orders (Phase 3), payment dues, payment collections now via new backend API
import { listOrders } from '../services/api/orders';
import { createPaymentCollection } from '../services/api/paymentCollections';
import { listPaymentDues } from '../services/api/paymentDues';

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fetchOrganizations } from '../services/api/organizations';
import { urlToBase64Image } from '../utils/pdfImageHelper';

export default function AddPaymentScreen() {
    const router = useRouter();
    const params = useLocalSearchParams(); 
    
    const { currentUser, companyProfile, addNotification } = useData();
    const { fetchSaaSData, isDbLoading } = useSaaSDB();

    const [orgList, setOrgList] = useState<any[]>([]);
    const [orderList, setOrderList] = useState<any[]>([]);
    const [dueList, setDueList] = useState<any[]>([]);

    const [loading, setLoading] = useState(false);
    
    const [date, setDate] = useState(new Date());
    const [pdcDate, setPdcDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showPdcDatePicker, setShowPdcDatePicker] = useState(false);

    const [selectedOrg, setSelectedOrg] = useState<any>(null);
    const [showOrgModal, setShowOrgModal] = useState(false);
    const [searchOrg, setSearchOrg] = useState('');

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

    const [filteredOrgs, setFilteredOrgs] = useState<any[]>([]);
    const hasPrefilledFromParams = React.useRef(false);

    // 🔥 LOAD DATA — orders + payment dues via new API; organizations via Firestore
    useEffect(() => {
        const loadData = async () => {
            if (currentUser?.companyId) {
                const [orgs, orders, dues] = await Promise.all([
                    fetchOrganizations({ limit: 200 }),
                    listOrders(),          // was: fetchSaaSData("orders")
                    listPaymentDues(),      // was: fetchSaaSData("payment_dues")
                ]);
                setOrgList(orgs);
                setOrderList(orders);
                setDueList(dues);
                setFilteredOrgs(orgs);
            }
        };
        loadData();
    }, [currentUser]);

    // PRE-FILL FROM PARAMS — runs only once. `params` from useLocalSearchParams
    // is a new object identity on every render, so depending on it directly
    // would re-run this effect (and stomp the user's typed amount) on every
    // keystroke elsewhere on the screen. A ref-guard runs it exactly once,
    // as soon as orgList/orderList are ready.
    useEffect(() => {
        if (hasPrefilledFromParams.current) return;
        if (params.orgName && orgList.length > 0) {
            hasPrefilledFromParams.current = true;
            const org = orgList.find((o: any) => o.name === params.orgName || o.orgName === params.orgName);
            if (org) setSelectedOrg(org);
            else setSelectedOrg({ name: params.orgName });

            if (params.amount) {
                setTotalDue(params.amount as string);
                setAmount(params.amount as string); 
            }
            if (params.billNo) setBillRef(params.billNo as string);

            if (params.linkedId && orderList.length > 0) {
                const linkedOrder = orderList.find((o:any) => o.id === params.linkedId);
                
                if (linkedOrder) {
                    setSelectedOrder({ ...linkedOrder, collectionName: 'orders' });
                } else {
                    const isManual = params.source === 'payment_dues';
                    setSelectedOrder({ 
                        id: params.linkedId, 
                        orderId: isManual ? 'Manual Due' : 'Linked Order', 
                        amount: params.amount,
                        collectionName: params.source || 'payment_dues'
                    });
                }
            }
        }
    }, [params, orgList, orderList]);

    // BULLETPROOF ORDER & MANUAL DUE MATCHER (unchanged logic, now fed by API data)
    useEffect(() => {
        if (selectedOrg && orderList.length > 0) {
            const targetOrgName = (selectedOrg.name || selectedOrg.orgName || "").trim().toLowerCase();
            
            const validOrders = orderList.filter((o: any) => {
                const orderOrgId = o.orgId || '';
                const selectedId = selectedOrg.id || '';
                const isIdMatch = orderOrgId !== '' && selectedId !== '' && orderOrgId === selectedId;
                
                const orderHospName = (o.hospitalName || o.orgName || "").trim().toLowerCase();
                const isNameMatch = orderHospName === targetOrgName;
                
                if (!isIdMatch && !isNameMatch) return false;

                const rawBal = o.balance !== undefined ? o.balance : o.amount;
                const currentBal = parseFloat(String(rawBal).replace(/[^0-9.-]/g, '')) || 0;
                if (currentBal <= 0) return false;

                const oStatus = (o.status || '').trim().toLowerCase();
                const payStatus = (o.paymentStatus || '').trim().toLowerCase();
                const payMode = (o.paymentMode || '').trim().toLowerCase();

                if (oStatus === 'collected' || payStatus === 'paid') return false;
                if (!['approved', 'dispatched', 'billed'].includes(oStatus)) return false;
                if (payMode === 'cash') return false; 

                return true;
            }).map((o:any) => ({...o, collectionName: 'orders'}));

            const validManualDues = (dueList || []).filter((d: any) => {
                if (d.type !== 'Manual') return false;

                const dueOrgId = d.orgId || '';
                const selectedId = selectedOrg.id || '';
                const isIdMatch = dueOrgId !== '' && selectedId !== '' && dueOrgId === selectedId;
                
                const dueHospName = (d.hospitalName || d.orgName || "").trim().toLowerCase();
                const isNameMatch = dueHospName === targetOrgName;
                
                if (!isIdMatch && !isNameMatch) return false;

                const rawBal = d.balance !== undefined ? d.balance : d.amount;
                const currentBal = parseFloat(String(rawBal).replace(/[^0-9.-]/g, '')) || 0;
                if (currentBal <= 0) return false;
                
                const payStatus = (d.paymentStatus || '').trim().toLowerCase();
                if (payStatus === 'paid') return false;

                return true;
            }).map((d:any) => ({...d, collectionName: 'payment_dues'})); 

            const combinedList = [...validOrders, ...validManualDues];

            combinedList.sort((a: any, b: any) => {
                const idA = a.orderId || '';
                const idB = b.orderId || '';
                return idB.localeCompare(idA);
            });

            setPendingOrders(combinedList);
            
            if (!params.linkedId) {
                if (!selectedOrder || selectedOrder.orderId === 'General') {
                    const totalOrderDue = combinedList.reduce((sum: number, o: any) => {
                        const rawBal = o.balance !== undefined ? o.balance : o.amount;
                        return sum + (parseFloat(String(rawBal).replace(/[^0-9.-]/g, '')) || 0);
                    }, 0);
                    setTotalDue(totalOrderDue > 0 ? String(totalOrderDue) : '');
                }
            }
        } else {
            setPendingOrders([]);
            setTotalDue('');
        }
    }, [selectedOrg, orderList, dueList]);

    const handleSelectOrder = (order: any) => {
        if (order === 'General') {
            setSelectedOrder(null);
            const totalOrderDue = pendingOrders.reduce((sum: number, o: any) => {
                const val = o.balance !== undefined ? o.balance : o.amount;
                return sum + parseFloat(val || 0);
            }, 0);
            setTotalDue(totalOrderDue > 0 ? String(totalOrderDue) : ''); 
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

    const generateAndShareReceipt = async (paymentData: any) => {
        try {
            let orgAddr = paymentData.orgAddress || '';
            if (!orgAddr) {
                const org = orgList.find((o: any) => o.name === paymentData.orgName || o.orgName === paymentData.orgName);
                if (org) orgAddr = org.address || org.city || '';
            }

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

                        const logoBase64 = await urlToBase64Image(companyProfile?.logoUrl);
            const signatureBase64 = await urlToBase64Image(companyProfile?.signatureUrl);

            const logoHTML = logoBase64 
                ? `<img src="${logoBase64}" style="height: 60px; margin-bottom: 10px;" />` 
                : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

            const signatureHTML = signatureBase64 
                ? `<img src="${signatureBase64}" style="height: 50px; margin-top: 10px;" />` 
                : `<div style="font-weight: bold; margin-top: 30px;">Authorized Signatory</div>`;

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
                  .header { display: flex; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
                  .header-logo { flex: 0 0 auto; width: 100px; }
                  .header-details { flex: 1; text-align: center; }
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
                  <div class="header-logo">${logoHTML}</div>
                  <div class="header-details">
                    <div class="title">${companyProfile?.companyName || 'MY COMPANY'}</div>
                    <div class="sub-title">${companyProfile?.address || ''}</div>
                    <div class="sub-title">
                      Phone: ${companyProfile?.contactPhone || companyProfile?.phone || '-'} | 
                      Email: ${companyProfile?.contactEmail || companyProfile?.email || companyProfile?.companyEmail || '-'}
                    </div>
                    ${companyProfile?.gstNumber ? `<div class="sub-title">GSTIN: ${companyProfile.gstNumber}</div>` : ''}
                  </div>
                  <div style="flex: 0 0 auto; width: 100px;"></div>
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
                      <td><span class="label" style="text-decoration: underline;">Payment Mode:</span><br>${paymentDetailsHTML}</td>
                      <td style="padding-left: 20px;"><span class="label" style="text-decoration: underline;">Against:</span><br><span style="font-size: 15px; font-weight:500;">${paymentData.billRef || paymentData.orderRef || 'On Account'}</span></td>
                    </tr>
                  </table>
                </div>
                <div class="amount-wrapper">
                    <div style="font-weight:bold; margin-bottom:5px;">Total Payment Received</div>
                    <div class="amount-box">₹ ${paymentData.amount}/-</div>
                </div>
                ${companyBankHTML}
                <div class="footer">
                  <div style="font-size:10px; max-width:250px; color:#333;">*Computer Generated Receipt.</div>
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
            const newPath = `${FileSystem.cacheDirectory}${fileName}`;
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

    // 🔥 SAVE LOGIC — via new backend API. Backend now atomically updates the
    // linked order/due balance inside the same transaction as the payment
    // insert, so the old client-side "3. CASCADING DUES UPDATE" block and
    // manual receiptNo generation are both gone — the backend handles them.
    const handleSubmit = async () => {
        if (!selectedOrg || !amount) {
            Alert.alert("Missing Fields", "Please Select Customer and Amount.");
            return;
        }
        
        setLoading(true);
        
        const finalOrgName = selectedOrg.name || selectedOrg.orgName || "";
        const finalOrgAddress = selectedOrg.address || selectedOrg.city || ""; 

        let linkedOrderId: string | undefined;
        let linkedDueId: string | undefined;
        if (selectedOrder && selectedOrder.id) {
            const collectionName = selectedOrder.collectionName || (selectedOrder.orderId === 'Manual Due' ? 'payment_dues' : 'orders');
            if (collectionName === 'orders') linkedOrderId = selectedOrder.id;
            else linkedDueId = selectedOrder.id;
        }

        try {
            const saved = await createPaymentCollection({
                date: date.toISOString(),
                orgId: selectedOrg.id || undefined,
                orgName: finalOrgName,
                orgAddress: finalOrgAddress,
                linkedOrderId,
                linkedDueId,
                billRef,
                totalDueSnapshot: parseFloat(totalDue || '0'),
                amount: parseFloat(amount),
                mode: mode as any,
                bankName: mode !== 'Cash' ? bankName : undefined,
                refNumber: mode !== 'Cash' ? refNumber : undefined,
                pdcDate: mode !== 'Cash' ? formatDate(pdcDate) : undefined,
                notes,
            });

            if (addNotification) {
                await addNotification({
                    title: "Payment Received 💰",
                    message: `₹${saved.amount} received from ${saved.orgName}. Receipt: ${saved.receiptNo}`,
                    to: "Admin",
                    type: "success",
                    route: "/payment_collections"
                });
            }

            Alert.alert("Success ✅", "Payment Saved & Linked! Share Receipt?", [
                { text: "No", onPress: () => router.back(), style: 'cancel' },
                { text: "Yes, Share PDF", onPress: async () => { await generateAndShareReceipt(saved); router.back(); }}
            ]);
        } catch (error: any) { 
            Alert.alert("Error", "Failed: " + (error?.message || 'Unknown error')); 
        } finally { 
            setLoading(false); 
        }
    };

    const onChangeDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowDatePicker(false);
        if (selectedDate) setDate(selectedDate);
    };

    const onChangePdcDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowPdcDatePicker(false);
        if (selectedDate) setPdcDate(selectedDate);
    };

    const handleSearch = (text: string) => {
        setSearchOrg(text);
        if (text) {
            const lowerText = text.toLowerCase();
            const newData = orgList.filter((item: any) => {
                const orgName = (item.orgName || item.name || '').toLowerCase();
                const city = (item.city || '').toLowerCase();
                return orgName.includes(lowerText) || city.includes(lowerText);
            });
            setFilteredOrgs(newData);
        } else {
            setFilteredOrgs(orgList);
        }
    };

    const handleSelectOrg = (org: any) => {
        setSelectedOrg(org);
        setShowOrgModal(false); 
        setSearchOrg('');       
    };

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
                            {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="#3b5998" />}
                        </TouchableOpacity>

                        {selectedOrg && (
                            <>
                                <Text style={[styles.label, {color:'#d32f2f'}]}>Link to System Order (Optional)</Text>
                                <TouchableOpacity style={styles.orderSelector} onPress={() => setShowOrderModal(true)}>
                                    <View>
                                        <Text style={{fontWeight:'bold', color: selectedOrder ? '#333' : '#555'}}>
                                            {selectedOrder ? `🧾 Linked: ${selectedOrder.orderId || 'Manual Due'} (${selectedOrder.status})` : "🔘 General Payment / On Account"}
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
                        <TextInput style={styles.input} placeholder="e.g. GST-INV-001" value={billRef} onChangeText={setBillRef} />
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

            <Modal visible={showOrgModal} animationType="slide">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Party</Text>
                        <TouchableOpacity onPress={() => setShowOrgModal(false)}><Ionicons name="close-circle" size={30} color="#d32f2f"/></TouchableOpacity>
                    </View>
                    <View style={styles.searchBox}>
                        <Ionicons name="search" size={20} color="gray" />
                        <TextInput style={styles.searchInputModal} placeholder="Search Name..." value={searchOrg} onChangeText={handleSearch} autoFocus />
                    </View>
                    <FlatList
                        data={filteredOrgs}
                        keyExtractor={item => item.id}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.orgItem} onPress={() => handleSelectOrg(item)}>
                                <View style={styles.orgIcon}>
                                    <Ionicons name="business" size={20} color="#3b5998" />
                                </View>
                                <View style={{flex:1}}>
                                    <Text style={styles.orgName}>{item.name || item.orgName}</Text>
                                    <Text style={styles.orgSubText}>{item.city ? `📍 ${item.city}` : ''} {item.contactPerson ? `• ${item.contactPerson}` : ''}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color="#ccc" />
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </Modal>

            <Modal visible={showOrderModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContentSmall}>
                        <Text style={styles.modalTitleSmall}>Select Bill / Order</Text>
                        <Text style={{color:'gray', fontSize:12, marginBottom:10}}>Linking helps in balance calculation.</Text>
                        
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
                                        Date: {order.date} • Total: {order.amount} • {order.status}
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
    orgIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e3f2fd', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    orgName: { fontWeight: 'bold', fontSize: 16 },
    orgSubText: { color: 'gray', fontSize: 12, marginTop: 2 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding:20 },
    modalContentSmall: { width: '90%', backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '60%' },
    modalTitleSmall: { fontSize: 18, fontWeight: 'bold', marginBottom: 5, color:'#3b5998', textAlign:'center' },
    modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    closeBtnSmall: { marginTop: 15, alignItems: 'center', padding: 10 }
});
