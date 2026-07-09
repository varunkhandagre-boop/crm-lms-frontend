import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (No direct Firebase DB imports)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

// PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function PaymentCollection() {
    const router = useRouter();

    // 🔥 1. Context se User aur Profile nikala
    const { currentUser, companyProfile } = useData();

    // 🔥 2. Naya SaaS Engine connect kiya (fetch, update, delete)
    const { fetchSaaSData, updateSaaSData, deleteSaaSData, isDbLoading } = useSaaSDB();

    // 🔥 3. Lazy Loaded Master States
    const [paymentList, setPaymentList] = useState<any[]>([]);
    const [orgList, setOrgList] = useState<any[]>([]);
    const [userList, setUserList] = useState<any[]>([]);

    const [historySearch, setHistorySearch] = useState(''); 
    const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
    const [historyDate, setHistoryDate] = useState(new Date()); 
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<any>(null); 
    
    // EDIT STATES
    const [isEditing, setIsEditing] = useState(false);
    const [editAmount, setEditAmount] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editModeVal, setEditModeVal] = useState('Cash');
    const [editRefNumber, setEditRefNumber] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);

    const [selectedEmployee, setSelectedEmployee] = useState('All');
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [showBankModal, setShowBankModal] = useState(false);
    const [showEditModeModal, setShowEditModeModal] = useState(false); 

    const [visibleCount, setVisibleCount] = useState(20);
    const paymentModes = ['Cash', 'UPI', 'NEFT', 'RTGS', 'Cheque'];

    const userRole = currentUser?.role ? currentUser.role.toLowerCase() : '';
    const isAdmin = ['admin', 'manager', 'account', 'accountant', 'hr', 'superadmin'].includes(userRole);
    // 🔥 NEW: STRICT ADMIN CHECK FOR DELETE POWER
    const isStrictAdmin = ['admin', 'manager', 'superadmin'].includes(userRole);

    useEffect(() => {
        if (viewMode === 'Day') setVisibleCount(500); 
        else setVisibleCount(20); 
    }, [viewMode, historyDate, historySearch, selectedEmployee]);

    // 🔥 4. LOAD SAAS DATA ON MOUNT
    const loadData = async () => {
        if (currentUser?.companyId) {
            const [payments, orgs, users] = await Promise.all([
                fetchSaaSData("payment_collections"),
                fetchSaaSData("organizations"),
                fetchSaaSData("users")
            ]);
            setPaymentList(payments);
            setOrgList(orgs);
            setUserList(users);
        }
    };

    useEffect(() => {
        loadData();
    }, [currentUser]);

    const qrImageSource = companyProfile?.qrCodeUrl 
        ? { uri: companyProfile.qrCodeUrl } 
        : require('../assets/images/icon.png'); 
        
    const myUpiId = companyProfile?.upiId || "No UPI ID Set"; 

    const bankAccounts = useMemo(() => {
        const banks = [];
        if (companyProfile?.bankDetails1?.accountNo) {
            banks.push({ 
                id: 1, label: "Primary Account", name: companyProfile.companyName, 
                bank: companyProfile.bankDetails1.bankName, branch: companyProfile.bankDetails1.branch,
                acNo: companyProfile.bankDetails1.accountNo, ifsc: companyProfile.bankDetails1.ifsc 
            });
        }
        if (companyProfile?.bankDetails2?.accountNo) {
            banks.push({ 
                id: 2, label: "Secondary Account", name: companyProfile.companyName, 
                bank: companyProfile.bankDetails2.bankName, branch: companyProfile.bankDetails2.branch,
                acNo: companyProfile.bankDetails2.accountNo, ifsc: companyProfile.bankDetails2.ifsc 
            });
        }
        return banks;
    }, [companyProfile]);

    // 🔥 SMART LABEL HELPER
    const getRefLabel = (mode: string) => {
        if (mode === 'UPI') return 'UPI Transaction ID';
        if (mode === 'NEFT' || mode === 'RTGS') return 'UTR Number';
        if (mode === 'Cheque') return 'Cheque Number';
        return 'Reference Number';
    };

    // Reset Edit State
    useEffect(() => {
        if (selectedHistoryItem) {
            setIsEditing(false);
            setEditAmount(selectedHistoryItem.amount?.toString() || '');
            setEditNotes(selectedHistoryItem.notes || '');
            setEditModeVal(selectedHistoryItem.mode || 'Cash');
            setEditRefNumber(selectedHistoryItem.refNumber || '');
        }
    }, [selectedHistoryItem]);

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

    const getFullOrgDetails = (item: any) => {
        if (!orgList || !item) return null;
        return orgList.find((o: any) => 
            (item.orgId && o.id === item.orgId) || 
            o.name === item.orgName || 
            o.orgName === item.orgName
        );
    };

    const generateAndShareReceipt = async (paymentData: any) => {
        setGeneratingPdf(true);
        try {
            let orgAddr = paymentData.orgAddress || '';
            if (!orgAddr) {
                const org = getFullOrgDetails(paymentData);
                if (org) orgAddr = org.address || org.city || '';
            }

            let paymentDetailsHTML = `<div><b>${paymentData.mode}</b></div>`;
            if (paymentData.mode !== 'Cash') {
                paymentDetailsHTML += `
                    <div style="margin-top:2px;">Bank: ${paymentData.bankName || '-'}</div>
                    <div>${getRefLabel(paymentData.mode)}: ${paymentData.refNumber || '-'}</div>
                `;
                if (paymentData.pdcDate) {
                    paymentDetailsHTML += `<div>Inst. Date: ${paymentData.pdcDate}</div>`;
                }
            }

            const logoHTML = companyProfile?.logoUrl 
                ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` 
                : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

            const signatureHTML = companyProfile?.signatureUrl 
                ? `<img src="${companyProfile.signatureUrl}" style="height: 50px; margin-top: 10px;" />` 
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
                  
                  <div class="sub-title">${companyProfile?.address || ''}</div>
                  
                  <div class="sub-title">
                    Phone: ${companyProfile?.contactPhone || companyProfile?.phone || '-'} | 
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
            const newPath = `${(FileSystem as any).cacheDirectory}${fileName}`;
            try {
                await FileSystem.moveAsync({ from: uri, to: newPath });
                await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share ${cleanName}` });
            } catch (error) {
                await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
            }
        } catch (error) { 
            Alert.alert("Error", "Could not generate receipt."); 
        } finally {
            setGeneratingPdf(false);
        }
    };

    // 🔥 5. SAAS ENGINE UPDATE LOGIC
    const handleUpdate = async () => {
        if (!selectedHistoryItem) return;
        setLoading(true);
        try {
            const res = await updateSaaSData("payment_collections", selectedHistoryItem.id, {
                amount: parseFloat(editAmount) || 0,
                notes: editNotes,
                mode: editModeVal,
                refNumber: editRefNumber
            });

            if (res.success) {
                setPaymentList(prev => prev.map(item => item.id === selectedHistoryItem.id ? { 
                    ...item, 
                    amount: parseFloat(editAmount) || 0,
                    notes: editNotes,
                    mode: editModeVal,
                    refNumber: editRefNumber
                } : item));
                
                Alert.alert("Success", "Receipt Updated!");
                setIsEditing(false);
                setSelectedHistoryItem(null); 
            } else {
                Alert.alert("Error", "Could not update payment.");
            }
        } catch (error: any) {
            Alert.alert("Error", "Could not update payment.");
        } finally {
            setLoading(false);
        }
    };

    // 🔥 NEW: ADMIN DELETE FUNCTION (WITH SAFE REVERSE LOGIC)
    const handleDeletePayment = async () => {
        if (!selectedHistoryItem) return;
        Alert.alert(
            "Delete Payment?",
            "Are you sure? This will delete the receipt and ADD the amount back to the pending due.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Delete & Reverse", 
                    style: "destructive", 
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const paymentAmt = parseFloat(selectedHistoryItem.amount) || 0;
                            const linkedId = selectedHistoryItem.linkedId;

                            // 1. REVERSE THE BALANCE IN DUES / ORDERS
                            const [dues, orders] = await Promise.all([
                                fetchSaaSData("payment_dues"),
                                fetchSaaSData("orders")
                            ]);

                            let targetDoc: any = null;
                            let targetCollection = '';

                            // Match by ID, OrderRef, or BillNo
                            targetDoc = dues.find((d: any) => d.id === linkedId || d.id === selectedHistoryItem.orderId || d.billNo === selectedHistoryItem.billRef);
                            if (targetDoc) targetCollection = 'payment_dues';

                            if (!targetDoc) {
                                targetDoc = orders.find((o: any) => o.id === linkedId || o.id === selectedHistoryItem.orderId || o.orderId === selectedHistoryItem.orderRef || o.billNo === selectedHistoryItem.billRef);
                                if (targetDoc) targetCollection = 'orders';
                            }

                            if (targetDoc && targetCollection) {
                                const currentBal = parseFloat(targetDoc.balance !== undefined ? targetDoc.balance : targetDoc.amount) || 0;
                                const currentRec = parseFloat(targetDoc.received) || 0;
                                const totalAmt = parseFloat(targetDoc.amount) || 0;
                                
                                const newBalance = currentBal + paymentAmt;
                                const newReceived = Math.max(0, currentRec - paymentAmt);
                                const newPaymentState = newBalance >= totalAmt ? 'Pending' : 'Partial';

                                if (targetCollection === 'orders') {
                                    // 🔥 FIX: Order ka main status nahi chhedna hai (wo Billed hi rehna chahiye)
                                    // Sirf balance aur paymentStatus badlenge
                                    await updateSaaSData(targetCollection, targetDoc.id, {
                                        balance: newBalance,
                                        received: newReceived,
                                        paymentStatus: newPaymentState
                                    });
                                } else {
                                    // Manual due ke liye main status badalna theek hai
                                    await updateSaaSData(targetCollection, targetDoc.id, {
                                        balance: newBalance,
                                        received: newReceived,
                                        status: newPaymentState
                                    });
                                }
                            }

                            // 2. DELETE THE PAYMENT ENTRY
                            const res = await deleteSaaSData("payment_collections", selectedHistoryItem.id);
                            
                            if(res.success) {
                                setPaymentList(prev => prev.filter(item => item.id !== selectedHistoryItem.id));
                                setSelectedHistoryItem(null);
                                Alert.alert("Deleted & Reversed", "Payment deleted and due balance restored successfully.");
                            } else {
                                Alert.alert("Error", "Failed to delete payment.");
                            }
                        } catch (error: any) {
                            Alert.alert("Error", error.message);
                        } finally {
                            setLoading(false);
                        }
                    } 
                }
            ]
        );
    };

    const getModeStyles = (mode: string) => {
        switch (mode) {
            case 'Cash': return { bg: '#e8f5e9', text: '#2e7d32', icon: 'cash' };
            case 'Cheque': return { bg: '#e3f2fd', text: '#1565c0', icon: 'document-text' };
            case 'UPI': return { bg: '#fff3e0', text: '#e65100', icon: 'qr-code' };
            case 'NEFT': 
            case 'RTGS': return { bg: '#f3e5f5', text: '#7b1fa2', icon: 'globe' };
            default: return { bg: '#eee', text: '#333', icon: 'card' };
        }
    };

    const employeeList = useMemo(() => {
        if (!isAdmin) return [];
        if (userList && userList.length > 0) {
            const names = userList.map((u: any) => u.name).filter((n: any) => n); 
            return ['All', ...names];
        }
        const names = new Set();
        paymentList.forEach((p: any) => {
            if (p.userName) names.add(p.userName);
            if (p.senderName) names.add(p.senderName);
        });
        return ['All', ...Array.from(names)];
    }, [paymentList, userList, isAdmin]);

    const parseDate = (dateStr: string) => {
        if (!dateStr) return new Date(0);
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
        const parts = dateStr.split('/');
        if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        return new Date(0); 
    };

    const changeHistoryDate = (dir: number) => {
        const d = new Date(historyDate);
        if (viewMode === 'Day') d.setDate(d.getDate() + dir);
        else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
        else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
        setHistoryDate(d);
    };

    const getHistoryHeaderDate = () => {
        if (viewMode === 'Day') return historyDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
        if (viewMode === 'Month') return historyDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (viewMode === 'FY') {
            const currentMonth = historyDate.getMonth(); 
            const currentYear = historyDate.getFullYear();
            const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
            const fyEndYear = fyStartYear + 1;
            return `FY ${fyStartYear.toString().slice(-2)}-${fyEndYear.toString().slice(-2)}`;
        }
        return "All Time";
    };

    const getMyFilteredHistory = () => {
        let data = paymentList ? [...paymentList] : [];
        if (isAdmin && selectedEmployee !== 'All') {
            data = data.filter((p: any) => p.userName === selectedEmployee || p.senderName === selectedEmployee);
        } else if (!isAdmin) {
            data = data.filter((p: any) => p.senderId === currentUser?.id || p.senderId === currentUser?.uid || p.userName === currentUser?.name);
        }
        
        if (historySearch) {
            const lowerSearch = historySearch.toLowerCase();
            data = data.filter((item: any) => {
                const fullString = `${item.orgName} ${item.amount} ${item.billRef} ${item.orderRef} ${item.mode} ${item.bankName} ${item.refNumber} ${item.date} ${item.notes}`.toLowerCase();
                return fullString.includes(lowerSearch);
            });
        }

        if (viewMode !== 'All') {
            const targetYear = historyDate.getFullYear();
            const targetMonth = historyDate.getMonth();
            const targetDay = historyDate.getDate();

            const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
            const fyStartDate = new Date(fyStartYear, 3, 1); 
            const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59); 

            data = data.filter((item: any) => {
                const dateVal = item.dateIso || item.createdAt || item.date;
                if(!dateVal) return false;
                const itemDate = parseDate(dateVal); 
                
                if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
                if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
                if (viewMode === 'FY') return itemDate >= fyStartDate && itemDate <= fyEndDate;
                return true;
            });
        }
        return data.sort((a: any, b: any) => parseDate(b.dateIso || b.date).getTime() - parseDate(a.dateIso || a.date).getTime());
    };

    const fullFilteredList = getMyFilteredHistory(); 
    const renderedList = fullFilteredList.slice(0, visibleCount);
    const totalCollected = fullFilteredList.reduce((sum: number, item: any) => sum + (parseFloat(item.amount) || 0), 0);
    const linkedOrgDetails = selectedHistoryItem ? getFullOrgDetails(selectedHistoryItem) : null;

    const shareUPI = async () => {
        try {
            if (companyProfile?.qrCodeUrl) {
                setLoading(true); 
                const cacheDir = (FileSystem as any).cacheDirectory;
                const fileUri = `${cacheDir}payment_qr.jpg`;

                if (companyProfile.qrCodeUrl.startsWith('data:image')) {
                    const base64Code = companyProfile.qrCodeUrl.split('base64,')[1];
                    const encodingType = (FileSystem as any).EncodingType ? (FileSystem as any).EncodingType.Base64 : 'base64';
                    await FileSystem.writeAsStringAsync(fileUri, base64Code, { encoding: encodingType });
                } 
                else {
                    await FileSystem.downloadAsync(companyProfile.qrCodeUrl, fileUri);
                }

                await Sharing.shareAsync(fileUri, { 
                    mimeType: 'image/jpeg', 
                    dialogTitle: 'Share Payment QR', 
                    UTI: 'public.jpeg' 
                });

            } else {
                const message = `Pay via UPI:\n\n📱 *UPI ID:* ${myUpiId}\n\n(Please pay to this ID)`;
                await Share.share({ message });
            }
        } catch (error: any) { 
            Alert.alert("Error", "Could not share QR Code."); 
        } finally {
            setLoading(false);
        }
    };

    const shareAccount = async (acc: any) => {
        try {
            const message = `Bank Account Details:\n\n🏦 *${acc.bank}*\n🏛 *${acc.branch || ''}*\n📄 *${acc.label}*\n\n👤 Name: ${acc.name}\n🔢 A/C No: ${acc.acNo}\n📍 IFSC: ${acc.ifsc}\n\nPlease share screenshot after payment.`;
            await Share.share({ message });
        } catch (error: any) { alert(error.message); }
    };

    const renderItem = ({item}: {item: any}) => {
        const modeStyle = getModeStyles(item.mode);
        const orgDetails = getFullOrgDetails(item);
        const city = orgDetails?.city || item.orgAddress || ''; 

        return (
            <TouchableOpacity style={styles.historyCard} onPress={() => setSelectedHistoryItem(item)}>
                <View style={{flex:1}}>
                    <Text style={styles.hOrg} numberOfLines={1}>{item.orgName}</Text>
                    {city ? <Text style={{fontSize: 11, color: '#555', marginBottom: 4}}>📍 {city}</Text> : null}
                    
                    <View style={{flexDirection:'row', alignItems:'center', marginTop:2, flexWrap:'wrap'}}>
                        <View style={[styles.modeBadge, {backgroundColor: modeStyle.bg}]}>
                            <Ionicons name={modeStyle.icon as any} size={10} color={modeStyle.text} />
                            <Text style={[styles.modeText, {color: modeStyle.text}]}>{item.mode}</Text>
                        </View>
                        
                        {item.orderRef && (
                            <View style={styles.linkTag}>
                                <Ionicons name="link" size={10} color="white" />
                                <Text style={{color:'white', fontSize:9, fontWeight:'bold', marginLeft:2}}>{item.orderRef}</Text>
                            </View>
                        )}

                        {item.billRef ? <Text style={styles.hSubText}> • Bill: {item.billRef}</Text> : null}
                    </View>

                    <View style={{flexDirection:'row', alignItems:'center', marginTop:4}}>
                        <Ionicons name="person-circle-outline" size={14} color="#888" /><Text style={styles.hUser}>{item.userName || item.senderName || 'Unknown'}</Text>
                    </View>
                </View>
                <View style={{alignItems:'flex-end'}}>
                    <Text style={styles.hAmount}>₹{item.amount}</Text>
                    <Text style={styles.hDate}>{item.date}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                    <Text style={styles.headerTitle}>Collections</Text>
                </View>
                <View style={{flexDirection:'row'}}>
                    <TouchableOpacity style={[styles.addBtn, {backgroundColor:'#e65100', marginRight:10}]} onPress={() => setShowBankModal(true)}>
                        <Ionicons name="qr-code" size={18} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_payment' as any)}>
                        <Ionicons name="add" size={20} color="white" /><Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>New</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.filterBox}>
                {isAdmin && (
                    <TouchableOpacity style={styles.empDropdown} onPress={() => setShowEmployeeModal(true)}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <Ionicons name="people" size={18} color="#3b5998" /><Text style={{marginLeft:8, fontWeight:'bold', color:'#333'}}>Filter: {selectedEmployee === 'All' ? 'All Employees' : selectedEmployee}</Text>
                        </View>
                        <Ionicons name="caret-down" size={16} color="gray" />
                    </TouchableOpacity>
                )}

                <View style={styles.tabContainer}>
                    {['Day', 'Month', 'FY', 'All'].map((m) => (
                        <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                            <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {viewMode !== 'All' && (
                    <View style={styles.navRow}>
                        <TouchableOpacity onPress={() => changeHistoryDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                        <Text style={styles.navText}>{getHistoryHeaderDate()}</Text>
                        <TouchableOpacity onPress={() => changeHistoryDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
                    </View>
                )}

                <View style={styles.searchBar}>
                    {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={18} color="gray" />}
                    <TextInput style={styles.searchInput} placeholder="Search Party, Amount, Bill..." value={historySearch} onChangeText={setHistorySearch} />
                    {historySearch.length > 0 && <TouchableOpacity onPress={() => setHistorySearch('')}><Ionicons name="close-circle" size={18} color="gray" /></TouchableOpacity>}
                </View>
                
                <View style={styles.summaryRow}>
                    <Text style={styles.totalLabel}>Total Collected:</Text>
                    <Text style={styles.totalValue}>₹{totalCollected.toLocaleString('en-IN')}</Text>
                </View>
            </View>

            <FlatList 
                data={renderedList} 
                keyExtractor={item => item.id} 
                contentContainerStyle={{padding: 5, paddingBottom: 100}} 
                renderItem={renderItem} 
                ListEmptyComponent={<View style={{alignItems:'center', marginTop:50}}><Ionicons name="documents-outline" size={50} color="#ccc" /><Text style={{color:'gray', marginTop:10}}>{isDbLoading ? 'Loading payments...' : 'No Collections Found'}</Text></View>} 
                
                ListFooterComponent={
                    <View style={{ paddingBottom: 80 }}>
                        {visibleCount < fullFilteredList.length ? (
                            <TouchableOpacity 
                                onPress={() => setVisibleCount(prev => prev + 20)} 
                                style={{ padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', marginHorizontal: 15 }}
                            >
                                <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                                    👇 Load More Records ({fullFilteredList.length - visibleCount} remaining)
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            fullFilteredList.length > 0 ? (
                                <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                                    --- End of List ---
                                </Text>
                            ) : null
                        )}
                    </View>
                }
            />

            {/* DETAILS & EDIT MODAL */}
            <Modal visible={selectedHistoryItem !== null} transparent={true} animationType="fade">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
                    <View style={styles.modalOverlayCenter}>
                        <View style={styles.detailCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Receipt Details</Text>
                                <TouchableOpacity onPress={() => setSelectedHistoryItem(null)}><Ionicons name="close-circle" size={30} color="#d32f2f"/></TouchableOpacity>
                            </View>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                
                                {/* AMOUNT BOX */}
                                <View style={{alignItems:'center', marginBottom:15}}>
                                    {isEditing ? (
                                        <View style={{width: '100%'}}>
                                            <Text style={{fontSize:12, color:'gray', marginBottom:5}}>Edit Amount</Text>
                                            <TextInput style={styles.editInput} value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" placeholder="Enter Amount" />
                                        </View>
                                    ) : (
                                        <>
                                            <Text style={{fontSize:24, fontWeight:'bold', color:'green'}}>₹ {selectedHistoryItem?.amount}</Text>
                                            <Text style={{fontSize:12, color:'gray'}}>Payment Received</Text>
                                        </>
                                    )}
                                </View>

                                {/* NON-EDITABLE ORG INFO */}
                                <ReceiptRow label="Receipt No" value={selectedHistoryItem?.receiptNo} highlight color="#1a237e" />
                                <ReceiptRow label="Date" value={selectedHistoryItem?.date} />
                                <ReceiptRow label="Customer" value={selectedHistoryItem?.orgName} />
                                {linkedOrgDetails && (
                                    <View style={{backgroundColor:'#f9f9f9', padding:10, borderRadius:8, marginBottom:10}}>
                                        <ReceiptRow label="City" value={linkedOrgDetails.city} small />
                                        <ReceiptRow label="Contact" value={linkedOrgDetails.contactPerson} small />
                                        <ReceiptRow label="Mobile" value={linkedOrgDetails.mobile} small />
                                        <ReceiptRow label="Address" value={linkedOrgDetails.address} small />
                                    </View>
                                )}
                                <View style={styles.divider} />
                                
                                {/* MODE & REFERENCE SHOW (Hide when editing) */}
                                {!isEditing && (
                                    <>
                                        <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Mode</Text>
                                            <View style={[styles.modeBadge, {backgroundColor: getModeStyles(selectedHistoryItem?.mode || '').bg, paddingVertical:4, paddingHorizontal:10}]}>
                                                <Text style={{color: getModeStyles(selectedHistoryItem?.mode || '').text, fontWeight:'bold', fontSize:14}}>{selectedHistoryItem?.mode}</Text>
                                            </View>
                                        </View>
                                        {selectedHistoryItem?.bankName ? <ReceiptRow label="Bank" value={selectedHistoryItem?.bankName} /> : null}
                                        {selectedHistoryItem?.refNumber ? <ReceiptRow label={getRefLabel(selectedHistoryItem?.mode)} value={selectedHistoryItem?.refNumber} /> : null}
                                        {selectedHistoryItem?.billRef ? <ReceiptRow label="Manual Bill Ref" value={selectedHistoryItem?.billRef} /> : null}
                                        {selectedHistoryItem?.orderRef ? <ReceiptRow label="Linked System Order" value={selectedHistoryItem.orderRef} color="#e65100" highlight /> : null}
                                    </>
                                )}

                                {/* 🔥 EDITABLE MODE & REFERENCE */}
                                {isEditing && (
                                    <View style={{marginTop: 10}}>
                                        <Text style={{fontSize:12, color:'gray', marginBottom:5}}>Payment Mode</Text>
                                        <TouchableOpacity style={styles.editDropdown} onPress={() => setShowEditModeModal(true)}>
                                            <Text style={{color:'#333', fontSize: 16}}>{editModeVal}</Text>
                                            <Ionicons name="caret-down" size={16} color="gray" />
                                        </TouchableOpacity>

                                        {editModeVal !== 'Cash' && (
                                            <View style={{marginTop: 10}}>
                                                <Text style={{fontSize:12, color:'gray', marginBottom:5}}>{getRefLabel(editModeVal)}</Text>
                                                <TextInput style={styles.editInput} value={editRefNumber} onChangeText={setEditRefNumber} placeholder="Transaction ID / Cheque No" />
                                            </View>
                                        )}

                                        <View style={{marginTop: 10}}>
                                            <Text style={{fontSize:12, color:'gray', marginBottom:5}}>Notes</Text>
                                            <TextInput style={[styles.editInput, {height:60, textAlignVertical:'top'}]} value={editNotes} onChangeText={setEditNotes} multiline placeholder="Edit Notes..." />
                                        </View>
                                    </View>
                                )}

                                {!isEditing && selectedHistoryItem?.notes ? (
                                    <View style={{marginTop:10, backgroundColor:'#fff9f0', padding:10, borderRadius:8}}>
                                        <Text style={{fontSize:11, color:'#e65100', fontWeight:'bold'}}>NOTES:</Text>
                                        <Text style={{fontSize:13, color:'#333'}}>{selectedHistoryItem?.notes}</Text>
                                    </View>
                                ) : null}
                                
                                {/* 🔥 SHARE BUTTON */}
                                {!isEditing && (
                                    <TouchableOpacity 
                                        style={{flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:'#e3f2fd', padding:12, borderRadius:8, marginTop:20, borderWidth:1, borderColor:'#2196f3'}}
                                        onPress={() => generateAndShareReceipt(selectedHistoryItem)}
                                        disabled={generatingPdf}
                                    >
                                        {generatingPdf ? <ActivityIndicator color="#1565c0" size="small"/> : 
                                            <>
                                                <Ionicons name="document-text-outline" size={20} color="#1565c0" />
                                                <Text style={{color:'#1565c0', fontWeight:'bold', marginLeft:8}}>Share Receipt PDF</Text>
                                            </>
                                        }
                                    </TouchableOpacity>
                                )}

                                {isAdmin && (
                                    <View style={{marginTop: 20}}>
                                        {isEditing ? (
                                            <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                                <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'gray', flex:0.48}]} onPress={() => setIsEditing(false)}>
                                                    <Text style={{color:'white', fontWeight:'bold'}}>Cancel</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#27ae60', flex:0.48}]} onPress={handleUpdate} disabled={loading}>
                                                    {loading ? <ActivityIndicator color="white"/> : <Text style={{color:'white', fontWeight:'bold'}}>Save</Text>}
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <TouchableOpacity style={{backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ccc'}} onPress={() => setIsEditing(true)}>
                                                <View style={{flexDirection:'row', alignItems:'center'}}>
                                                    <Ionicons name="create-outline" size={18} color="#333" />
                                                    <Text style={{color: '#333', fontWeight: 'bold', marginLeft: 8}}>Edit / Correct</Text>
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                        
                                        {/* 🔥 NEW: ADMIN DELETE BUTTON */}
                                        {!isEditing && isStrictAdmin && (
                                            <TouchableOpacity 
                                                style={{marginTop: 15, backgroundColor: '#ffebee', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ef9a9a'}} 
                                                onPress={handleDeletePayment}
                                                disabled={loading}
                                            >
                                                <View style={{flexDirection:'row', alignItems:'center'}}>
                                                    {loading ? <ActivityIndicator size="small" color="#d32f2f" /> : <Ionicons name="trash-outline" size={18} color="#d32f2f" />}
                                                    <Text style={{color: '#d32f2f', fontWeight: 'bold', marginLeft: 8}}>
                                                        {loading ? "Deleting..." : "Delete Entry"}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}

                                <View style={{marginTop:20, alignItems:'center'}}><Text style={{fontSize:11, color:'gray'}}>Collected By</Text><Text style={{fontSize:14, fontWeight:'bold'}}>{selectedHistoryItem?.userName} ({selectedHistoryItem?.role})</Text></View>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* EDIT PAYMENT MODE MODAL */}
            <Modal visible={showEditModeModal} transparent={true} animationType="fade">
                <View style={styles.modalOverlayCenter}>
                    <View style={[styles.detailCard, {maxHeight: 400}]}>
                        <Text style={styles.modalTitle}>Change Mode</Text>
                        {paymentModes.map(mode => (
                            <TouchableOpacity key={mode} style={styles.empItem} onPress={() => { setEditModeVal(mode); setShowEditModeModal(false); }}>
                                <Text style={{fontSize:16, color:'#333', fontWeight: editModeVal === mode ? 'bold' : 'normal'}}>{mode}</Text>
                                {editModeVal === mode && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.closeBtnPopup} onPress={() => setShowEditModeModal(false)}><Text style={{color:'white', fontWeight:'bold'}}>Close</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showEmployeeModal} transparent={true} animationType="slide">
                <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowEmployeeModal(false)}>
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerHeader}>Select Employee View</Text>
                        <FlatList 
                          data={employeeList as string[]} 
                          keyExtractor={(item) => item} 
                          renderItem={({item}) => (
                            <TouchableOpacity style={[styles.empItem, selectedEmployee === item && {backgroundColor:'#e3f2fd'}]} onPress={() => { setSelectedEmployee(item); setShowEmployeeModal(false); }}>
                                <View style={{flexDirection:'row', alignItems:'center'}}>
                                   <Ionicons name="person-circle" size={24} color="#555" style={{marginRight:10}}/>
                                   <Text style={{fontSize:16, color:'#333'}}>{item}</Text>
                                </View>
                                {selectedEmployee === item && <Ionicons name="checkmark" size={18} color="green" />}
                            </TouchableOpacity>
                        )} />
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal visible={showBankModal} transparent={true} animationType="slide">
                <View style={styles.modalOverlayCenter}>
                    <View style={[styles.detailCard, {backgroundColor:'#fff', maxHeight:'90%'}]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Bank Details</Text>
                            <TouchableOpacity onPress={() => setShowBankModal(false)}><Ionicons name="close-circle" size={30} color="#d32f2f"/></TouchableOpacity>
                        </View>
                        
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{alignItems:'center', marginVertical:10}}>
                                <View style={{width:220, height:220, justifyContent:'center', alignItems:'center', borderRadius:10, borderWidth:1, borderColor:'#ddd', overflow:'hidden', backgroundColor:'white'}}>
                                    <Image source={qrImageSource} style={{width: '100%', height: '100%', resizeMode: 'contain'}} />
                                </View>
                                <Text style={{marginTop:10, fontSize:12, color:'gray'}}>Scan using any UPI App</Text>
                                <TouchableOpacity style={[styles.shareBtnSmall, {marginTop:10}]} onPress={shareUPI}>
                                    <Ionicons name="share-social" size={14} color="white" />
                                    <Text style={{color:'white', fontSize:12, fontWeight:'bold', marginLeft:5}}>Share UPI ID</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.divider} />
                            
                            {bankAccounts.length > 0 ? bankAccounts.map((acc: any, index: any) => (
                                <View key={acc.id} style={{marginBottom: 20, backgroundColor:'#f9f9f9', padding:10, borderRadius:8, borderWidth:1, borderColor:'#eee'}}>
                                    <Text style={{fontWeight:'bold', color:'#3b5998', marginBottom:5, textDecorationLine:'underline'}}>{acc.label}</Text>
                                    <ReceiptRow label="Beneficiary" value={acc.name} small />
                                    <ReceiptRow label="Bank Name" value={acc.bank} small />
                                    <ReceiptRow label="Branch" value={acc.branch} small />
                                    <ReceiptRow label="Account No" value={acc.acNo} highlight />
                                    <ReceiptRow label="IFSC Code" value={acc.ifsc} small />
                                    <TouchableOpacity style={styles.shareBtnSmall} onPress={() => shareAccount(acc)}>
                                        <Ionicons name="copy-outline" size={14} color="white" />
                                        <Text style={{color:'white', fontSize:12, fontWeight:'bold', marginLeft:5}}>Share Account</Text>
                                    </TouchableOpacity>
                                </View>
                            )) : (
                                <Text style={{textAlign:'center', color:'gray', marginVertical:20}}>No Bank Details Added in Profile.</Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const ReceiptRow = ({label, value, highlight, color, small}: any) => (
    <View style={[styles.receiptRow, small && {marginBottom:5, borderBottomWidth:0}]}>
        <Text style={[styles.receiptLabel, small && {fontSize:11}]}>{label}</Text>
        <Text style={[styles.receiptValue, highlight && {fontSize:18, color:'#27ae60'}, color && {color: color}, small && {fontSize:13}]}>{value || '-'}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 0, alignItems:'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    backBtn: { paddingRight: 10 },
    addBtn: { flexDirection:'row', backgroundColor:'#3b5998', paddingVertical:6, paddingHorizontal:12, borderRadius:20, alignItems:'center' },
    filterBox: { backgroundColor:'white', padding:15, paddingBottom:10, marginBottom:5 },
    empDropdown: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#e3f2fd', padding:10, borderRadius:8, marginBottom:15, borderWidth:1, borderColor:'#bbdefb' },
    tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 2, marginBottom: 5 },
    tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
    activeTab: { backgroundColor: 'white', elevation: 2 },
    tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
    activeTabText: { color: '#3b5998', fontWeight: 'bold' },
    navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#eee' },
    navText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 10, height: 36 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },
    summaryRow: { flexDirection:'row', justifyContent:'space-between', marginTop:15, borderTopWidth:1, borderTopColor:'#eee', paddingTop:10 },
    totalLabel: { fontWeight:'bold', color:'#555' },
    totalValue: { fontWeight:'bold', color:'#27ae60', fontSize:16 },
    historyCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2, marginHorizontal:15 },
    hOrg: { fontWeight: 'bold', fontSize: 15, color: '#333' },
    modeBadge: { flexDirection:'row', alignItems:'center', paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginRight:5 },
    modeText: { fontSize: 10, fontWeight: 'bold', marginLeft: 3, textTransform:'uppercase' },
    linkTag: { flexDirection:'row', alignItems:'center', backgroundColor:'#e65100', paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginRight:5 },
    hSubText: { fontSize: 11, color: 'gray' },
    hUser: { fontSize: 11, color: 'gray', marginLeft: 4 },
    hDate: { fontSize: 11, color: 'gray', marginTop: 2 },
    hAmount: { fontWeight: 'bold', color: '#27ae60', fontSize: 16 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    detailCard: { width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 25, maxHeight:'85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
    receiptRow: { marginBottom: 12, flexDirection:'row', justifyContent:'space-between', alignItems:'center', borderBottomWidth:1, borderBottomColor:'#f0f0f0', paddingBottom:5 },
    receiptLabel: { fontSize: 12, color: 'gray' },
    receiptValue: { fontSize: 14, fontWeight: 'bold', color: '#333', maxWidth:'65%', textAlign:'right' },
    divider: { height:1, backgroundColor:'#eee', marginVertical:10 },
    closeBtnPopup: { backgroundColor:'#3b5998', padding:12, borderRadius:10, alignItems:'center', marginTop:10 },
    empItem: { paddingVertical:15, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between' },
    shareBtnSmall: { flexDirection:'row', alignItems:'center', backgroundColor:'#27ae60', paddingVertical:6, paddingHorizontal:12, borderRadius:15, alignSelf:'flex-end', marginTop:8 },
    
    editInput: { borderWidth:1, borderColor:'#3b5998', borderRadius:8, padding:10, fontSize:15, width:'100%', backgroundColor:'#f0f4ff', marginBottom:10 },
    editDropdown: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth:1, borderColor:'#3b5998', borderRadius:8, padding:10, backgroundColor:'#f0f4ff', marginBottom:10 },
    actionBtn: { padding:12, borderRadius:8, alignItems:'center' },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
    pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
    pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' }
});