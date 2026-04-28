import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 🔥 SAAS IMPORTS (Direct DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';


export default function QuotationsListScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    
    // 🔥 1. Context se sirf current user & profile nikala
    const { companyProfile, currentUser } = useData(); 
    
    // 🔥 2. Naya SaaS Engine
    const { fetchSaaSData, isDbLoading } = useSaaSDB();

    // 🔥 3. Lazy Loaded Master States
    const [quotations, setQuotations] = useState<any[]>([]);
    const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('Month'); 
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchText, setSearchText] = useState('');
    
    const [selectedQuote, setSelectedQuote] = useState<any>(null);
    const [pdfTheme, setPdfTheme] = useState<'theme1' | 'theme2'>('theme1');

    const [selectedEmployeeName, setSelectedEmployeeName] = useState('All'); 
    const [showEmployeePicker, setShowEmployeePicker] = useState(false);

    const [visibleCount, setVisibleCount] = useState(20); 
    const canManage = ['Admin', 'Manager', 'Account', 'Accountant', 'SuperAdmin'].includes(currentUser?.role || '');

    useEffect(() => {
        if (viewMode === 'Day') setVisibleCount(100);
        else setVisibleCount(20); 
    }, [viewMode, currentDate, selectedEmployeeName, searchText]);

    // 🔥 4. LOAD SAAS DATA
    const loadData = async () => {
        if (!currentUser?.companyId) return;
        setLoading(true);
        try {
            const [quotes, users] = await Promise.all([
                fetchSaaSData("quotations"),
                fetchSaaSData("users")
            ]);
            
            // Sort Descending locally
            quotes.sort((a: any, b: any) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
            setQuotations(quotes);

            if (canManage) {
                const uniqueUsers = Array.from(new Set(users.map((u:any) => u.name)))
                    .map(name => users.find((u:any) => u.name === name));
                setEmployees([{ id: 'All', name: 'All' }, ...uniqueUsers as any]);
            }
        } catch (error) {
            console.log(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [currentUser]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const parseDate = (dateStr: any) => {
        if (!dateStr) return new Date();
        if (typeof dateStr === 'string' && dateStr.includes('-')) {
            const parts = dateStr.split('-'); 
            if (parts.length === 3) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        return new Date(dateStr);
    };

    const changeDate = (dir: number) => {
        const d = new Date(currentDate);
        if (viewMode === 'Day') d.setDate(d.getDate() + dir);
        else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
        else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
        setCurrentDate(d);
    };

    const getHeaderDate = () => {
        if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
        if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (viewMode === 'FY') {
            const m = currentDate.getMonth(); 
            const y = currentDate.getFullYear();
            const startY = m >= 3 ? y : y - 1;
            return `FY ${startY.toString().slice(-2)}-${(startY + 1).toString().slice(-2)}`;
        }
        return "All Time";
    };

    const getFilteredData = () => {
        let data = [...quotations];
        if (canManage) {
            if(selectedEmployeeName !== 'All') data = data.filter((item: any) => item.senderName === selectedEmployeeName);
        } else {
            const myId = currentUser?.id || currentUser?.uid;
            data = data.filter((item: any) => item.senderId === myId);
        }

        if (viewMode !== 'All') {
            const targetYear = currentDate.getFullYear();
            const targetMonth = currentDate.getMonth();
            const targetDay = currentDate.getDate();
            const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
            const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
            const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime();

            data = data.filter(item => {
                const dateField = item.dateIso || item.createdAt || item.date;
                if(!dateField) return false;
                
                const itemDate = parseDate(dateField);
                const itemTime = itemDate.getTime();
                
                if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
                if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
                if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
                return true;
            });
        }

        if (searchText) {
            const term = searchText.toLowerCase();
            data = data.filter((item: any) => {
                const row = `${item.date} ${item.orgName} ${item.estimateNo} ${item.grandTotal}`.toLowerCase();
                return row.includes(term);
            });
        }
        return data;
    };

    const fullFilteredList = getFilteredData();
    const renderedList = fullFilteredList.slice(0, visibleCount);

    const numberToWords = (num: number) => {
        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        if ((num = num.toString().replace(/[\, ]/g, '') as any) != parseFloat(num as any)) return 'Not a Number';
        let n: any = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return; let str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'only' : '';
        return str.trim();
    };

    const generateAndSharePDF = async (item: any) => {
        try {
            const gstBreakdown: { [key: number]: number } = {};
            let totalQty = 0;
            
            item.items.forEach((prod: any) => {
                const baseAmount = prod.qty * prod.price;
                const rate = Number(prod.gstRate) || 0;
                const gstAmount = (baseAmount * rate) / 100;
                totalQty += Number(prod.qty) || 0;

                if (rate > 0) {
                    if (!gstBreakdown[rate]) gstBreakdown[rate] = 0;
                    gstBreakdown[rate] += gstAmount;
                }
            });

            let gstHtmlRows = '';
            Object.keys(gstBreakdown).forEach((rateStr) => {
                const rate = Number(rateStr);
                const amount = gstBreakdown[rate];
                if (item.taxType === 'IGST') {
                    gstHtmlRows += `<div class="summary-row"><span>IGST @ ${rate}%</span> <span>₹${amount.toLocaleString()}</span></div>`;
                } else {
                    const halfRate = rate / 2;
                    const halfAmount = amount / 2;
                    gstHtmlRows += `
                        <div class="summary-row"><span>CGST @ ${halfRate}%</span> <span>₹${halfAmount.toLocaleString()}</span></div>
                        <div class="summary-row"><span>SGST @ ${halfRate}%</span> <span>₹${halfAmount.toLocaleString()}</span></div>
                    `;
                }
            });

            const htmlContent = `
            <html>
            <head>
                <style>
                    body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #333; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #3b5998; padding-bottom: 10px; }
                    .company-name { font-size: 24px; font-weight: bold; color: #3b5998; text-transform: uppercase; }
                    .details-container { display: flex; justify-content: space-between; margin-bottom: 20px; }
                    .box { width: 48%; padding: 10px; border: 1px solid #eee; border-radius: 5px; background: #f9f9f9; }
                    .box-title { font-size: 12px; color: #888; margin-bottom: 5px; text-transform: uppercase; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th { background-color: #e3f2fd; color: #1565c0; font-weight: bold; padding: 10px; text-align: left; font-size: 12px; border: 1px solid #bbdefb; }
                    td { padding: 10px; border: 1px solid #ddd; font-size: 13px; vertical-align: top; }
                    .specs { font-size: 11px; color: #555; margin-top: 4px; white-space: pre-wrap; }
                    .summary { border: 1px solid #ddd; border-radius: 5px; }
                    .summary-row { display: flex; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
                    .summary-row span:first-child { text-align: left; }
                    .summary-row span:last-child { text-align: right; }
                    .summary-row.total { background-color: #e3f2fd; font-weight: bold; font-size: 16px; border-bottom: none; color: #1565c0; }
                </style>
            </head>
            <body>
                <div class="header" style="flex-direction: ${pdfTheme === 'theme1' ? 'row' : 'row-reverse'}; text-align: ${pdfTheme === 'theme1' ? 'left' : 'right'}; align-items: flex-start;">
                    <div style="flex: 1;">
                        <div class="company-name" style="margin-top: 0;">${companyProfile?.companyName || 'Life Line Medical Systems'}</div>
                        <div style="font-size: 12px; margin-top: 5px; max-width: 280px; line-height: 1.5;">${companyProfile?.address || companyProfile?.addressLine || 'Nagpur, M.H. 440022'}</div>
                        <div style="font-size: 12px; margin-top: 4px;">Phone: ${companyProfile?.phone || '8770530146'}</div>
                        <div style="font-size: 12px; margin-top: 2px;">Email: ${companyProfile?.email || 'lifelinengp@gmail.com'}</div>
                        <div style="font-size: 12px; font-weight: bold; margin-top: 5px;">GSTIN: ${companyProfile?.gstNumber || '27BMSPK3720Q1ZB'}</div>
                    </div>
                    <div style="width: 250px; text-align: ${pdfTheme === 'theme1' ? 'right' : 'left'}; margin-top: 0; padding-top: 0;">
                        ${companyProfile?.logoUrl ? `<img src="${companyProfile.logoUrl}" style="max-height: 120px; max-width: 240px; object-fit: contain; object-position: top; display: block; ${pdfTheme === 'theme1' ? 'margin-left: auto;' : 'margin-right: auto;'}" />` : ''}
                    </div>
                </div>

                <div style="text-align: center; margin: 15px 0;">
                    <h2 style="margin:0; font-size: 22px; color: #1565c0; text-decoration: underline;">ESTIMATE</h2>
                </div>

                <div class="details-container">
                    <div class="box">
                        <div class="box-title">Estimate For</div>
                        <div style="font-weight: bold; font-size: 16px; color: #1565c0;">${item.orgName}</div>
                        <div style="font-size: 12px; margin-top: 5px;">${item.orgAddress || 'Address Not Provided'}</div>
                        <div style="font-size: 12px;">Phone: ${item.orgPhone || 'N/A'}</div>
                    </div>
                    <div style="text-align: right; font-size: 13px; line-height: 1.8;">
                        <div><strong>Est No:</strong> ${item.estimateNo}</div>
                        <div><strong>Date:</strong> ${item.date}</div>
                        <div><strong>Valid Till:</strong> ${item.validTill}</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th width="5%">#</th>
                            <th width="45%">Item Name & Description</th>
                            <th width="10%">Qty</th>
                            <th width="15%" style="text-align:right;">Price/Unit</th>
                            <th width="10%" style="text-align:right;">GST</th>
                            <th width="15%" style="text-align:right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${item.items.map((prod: any, index: number) => {
                            const baseAmount = prod.qty * prod.price;
                            const gstAmount = (baseAmount * prod.gstRate) / 100;
                            const rowTotal = baseAmount + gstAmount;
                            return `
                            <tr>
                                <td>${index + 1}</td>
                                <td>
                                    <strong>${prod.name} ${prod.model ? `(${prod.model})` : ''}</strong>
                                    ${prod.specifications ? `<div class="specs">${prod.specifications}</div>` : ''}
                                </td>
                                <td>${prod.qty}</td>
                                <td style="text-align:right;">₹${prod.price.toLocaleString()}</td>
                                <td style="text-align:right;">₹${gstAmount.toLocaleString()}<br><span style="font-size:10px; color:gray;">(${prod.gstRate}%)</span></td>
                                <td style="text-align:right; font-weight:bold;">₹${rowTotal.toLocaleString()}</td>
                            </tr>
                            `;
                        }).join('')}
                        
                        <tr style="background-color: #f0f8ff; border-top: 2px solid #3b5998;">
                            <td colspan="2" style="text-align:right; font-weight:bold; padding:10px; font-size:14px;">Total</td>
                            <td style="font-weight:bold; padding:10px; font-size:14px;">${totalQty}</td>
                            <td></td>
                            <td style="text-align:right; font-weight:bold; padding:10px; font-size:14px;">₹${item.totalGST?.toLocaleString()}</td>
                            <td style="text-align:right; font-weight:bold; padding:10px; font-size:14px;">₹${item.grandTotal?.toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>

                <div style="display: flex; justify-content: space-between; margin-top: 20px;">
                    <div style="width: 55%;">
                        <div style="margin-bottom: 15px;">
                            <span style="color:gray; font-size: 11px;">Amount In Words:</span><br>
                            <strong style="font-size: 12px;">${numberToWords(item.grandTotal)} Rupees Only</strong>
                        </div>

                        <div style="margin-bottom: 15px;">
                            <div class="tc-title" style="color:#1565c0; font-size: 12px; font-weight: bold;">Terms & Conditions:</div>
                            <div style="margin-top: 5px; font-size: 10px; white-space: pre-wrap; line-height: 1.4;">${item.termsAndConditions}</div>
                        </div>

                        <div style="display:flex; align-items: flex-start; gap: 15px;">
                            <div>
                                <div class="tc-title" style="color:#1565c0; font-size: 12px; font-weight: bold;">Pay To / Bank Details:</div>
                                <div style="font-size: 11px;">Bank Name: <strong>${companyProfile?.bankDetails1?.bankName || companyProfile?.bank1_name || 'N/A'}</strong></div>
                                <div style="font-size: 11px;">A/c No: <strong>${companyProfile?.bankDetails1?.accountNo || companyProfile?.bank1_acc || 'N/A'}</strong></div>
                                <div style="font-size: 11px;">IFSC: <strong>${companyProfile?.bankDetails1?.ifsc || companyProfile?.bank1_ifsc || 'N/A'}</strong></div>
                                <div style="font-size: 11px;">A/c Name: <strong>${companyProfile?.companyName || 'N/A'}</strong></div>
                            </div>
                            ${companyProfile?.qrCodeUrl ? `<img src="${companyProfile.qrCodeUrl}" style="width: 70px; height: 70px; border: 1px solid #ddd; padding: 2px;" />` : ''}
                        </div>
                    </div>

                    <div style="width: 40%; display: flex; flex-direction: column; justify-content: space-between;">
                        <div class="summary" style="border: 1px solid #ddd; border-radius: 5px;">
                            <div class="summary-row"><span>Sub Total</span> <span>₹${item.subTotal?.toLocaleString()}</span></div>
                            ${gstHtmlRows}
                            <div class="summary-row total"><span>Grand Total</span> <span>₹${item.grandTotal?.toLocaleString()}</span></div>
                        </div>

                        <div class="signature-box" style="text-align: center; margin-top: 40px;">
                            <div style="font-weight:bold; margin-bottom: 5px; font-size: 12px;">For: ${companyProfile?.companyName}</div>
                            <div style="height: 60px; display:flex; align-items:center; justify-content:center;">
                                ${companyProfile?.signatureUrl ? `<img src="${companyProfile.signatureUrl}" style="max-height: 60px; max-width: 150px;" />` : ''}
                            </div>
                            <div style="border-top: 1px solid #333; margin-top: 5px; padding-top: 5px; font-size: 11px; width: 100%;">Authorized Signatory</div>
                        </div>
                    </div>
                </div>

            </body>
            </html>
            `;
            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        } catch (error) {
            Alert.alert("Error", "Could not generate PDF");
        }
    };

    const renderItem = ({ item }: any) => {
        return (
            <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => setSelectedQuote(item)}>
                <View style={styles.cardHeader}>
                    <Text style={styles.date}>{item.date}</Text>
                    <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>{item.status || 'Saved'}</Text>
                    </View>
                </View>

                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginVertical:5}}>
                    <View style={{flex: 1}}>
                        <Text style={styles.orgName} numberOfLines={1}>{item.orgName}</Text>
                        <Text style={{fontSize: 12, color: 'gray', marginTop: 2}}>Est No: {item.estimateNo}</Text>
                    </View>
                    <Text style={styles.amount}>₹ {item.grandTotal?.toLocaleString()}</Text>
                </View>

                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5}}>
                    <Text style={{fontSize: 12, color: '#555'}}>{item.items?.length || 0} Items</Text>
                    {canManage && <Text style={{fontSize:12, fontWeight:'bold', color:'#3b5998'}}>👤 {item.senderName || 'Admin'}</Text>}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, {paddingTop: insets.top + 10}]}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Quotations List</Text>
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_quotation' as any)}>
                    <Ionicons name="add" size={20} color="white" />
                    <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>Create</Text>
                </TouchableOpacity>
            </View>

            <View style={{backgroundColor:'white', paddingBottom:10, borderBottomLeftRadius: 15, borderBottomRightRadius: 15, elevation: 2, marginBottom: 10}}>
                <View style={styles.tabContainer}>
                    {['Day', 'Month', 'FY', 'All'].map((m) => (
                        <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                            <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {canManage && (
                    <TouchableOpacity style={styles.employeeFilterBtn} onPress={() => setShowEmployeePicker(true)}>
                        <Ionicons name="people" size={18} color="#2e7d32" />
                        <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                            {selectedEmployeeName === 'All' ? 'View All Staff' : selectedEmployeeName}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:'auto'}}/>
                    </TouchableOpacity>
                )}

                {viewMode !== 'All' && (
                    <View style={styles.dateNav}>
                        <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                        <Text style={styles.monthText}>{getHeaderDate()}</Text>
                        <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
                    </View>
                )}

                <View style={{paddingHorizontal:15}}>
                    <View style={styles.searchBar}>
                        {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
                        <TextInput 
                            style={styles.searchInput}
                            placeholder="Search Client, Estimate No..."
                            value={searchText}
                            onChangeText={setSearchText}
                        />
                        {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="gray" /></TouchableOpacity>}
                    </View>
                    <Text style={{textAlign:'right', fontSize:12, color:'gray', marginTop: 2}}>
                        Total Quotes: <Text style={{fontWeight:'bold', color:'#3b5998'}}>{fullFilteredList.length}</Text>
                    </Text>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#3b5998" style={{marginTop: 50}} />
            ) : (
                <FlatList 
                    data={renderedList}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{padding: 15, paddingBottom: 50}}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={
                        <Text style={{textAlign:'center', marginTop:50, color:'gray'}}>No quotations found.</Text>
                    }
                    ListFooterComponent={
                        <View style={{ paddingBottom: 80 }}>
                            {visibleCount < fullFilteredList.length ? (
                                <TouchableOpacity 
                                    onPress={() => setVisibleCount(prev => prev + 20)} 
                                    style={styles.loadMoreBtn}
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
            )}

            <Modal visible={!!selectedQuote} transparent={true} animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {selectedQuote && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View style={styles.modalHeader}>
                                    <View>
                                        <Text style={{fontSize: 18, fontWeight: 'bold', color: '#333'}}>{selectedQuote.estimateNo}</Text>
                                        <Text style={{fontSize: 12, color: 'gray'}}>{selectedQuote.date}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setSelectedQuote(null)} style={{padding: 5}}>
                                        <Ionicons name="close-circle" size={28} color="red" />
                                    </TouchableOpacity>
                                </View>

                                <View style={{backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#eee'}}>
                                    <Text style={{fontSize: 16, fontWeight: 'bold', color: '#1565c0'}}>{selectedQuote.orgName}</Text>
                                    <Text style={{fontSize: 13, color: '#555', marginTop: 3}}>{selectedQuote.orgAddress}</Text>
                                </View>

                                <Text style={{fontWeight: 'bold', marginBottom: 10, color: '#555'}}>Items Included ({selectedQuote.items?.length}):</Text>
                                <View style={{maxHeight: 180}}>
                                    <FlatList 
                                        data={selectedQuote.items}
                                        keyExtractor={(item, idx) => idx.toString()}
                                        nestedScrollEnabled={true}
                                        renderItem={({item}) => (
                                            <View style={{flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#f0f0f0', paddingVertical: 10}}>
                                                <Text style={{fontSize: 13, flex: 1, color: '#333'}} numberOfLines={2}>{item.qty}x {item.name}</Text>
                                                <Text style={{fontSize: 13, fontWeight: 'bold', color: '#333'}}>₹{(item.qty * item.price).toLocaleString()}</Text>
                                            </View>
                                        )}
                                    />
                                </View>

                                <View style={{marginTop: 15, borderTopWidth: 2, borderColor: '#eee', paddingTop: 15}}>
                                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5}}>
                                        <Text style={{color: 'gray', fontSize: 13}}>Sub Total:</Text><Text style={{fontSize: 13}}>₹{selectedQuote.subTotal?.toLocaleString()}</Text>
                                    </View>
                                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10}}>
                                        <Text style={{color: 'gray', fontSize: 13}}>Total GST:</Text><Text style={{fontSize: 13}}>₹{selectedQuote.totalGST?.toLocaleString()}</Text>
                                    </View>
                                    <View style={{flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#e8f5e9', padding: 10, borderRadius: 8}}>
                                        <Text style={{fontSize: 16, fontWeight: 'bold', color: '#2e7d32'}}>Grand Total:</Text>
                                        <Text style={{fontSize: 16, fontWeight: 'bold', color: '#2e7d32'}}>₹{selectedQuote.grandTotal?.toLocaleString()}</Text>
                                    </View>
                                </View>

                                <Text style={{fontWeight: 'bold', marginTop: 15, marginBottom: 5, color: '#555'}}>Select PDF Format:</Text>
                                <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                                    <TouchableOpacity 
                                        style={[styles.chip, pdfTheme === 'theme1' && styles.activeChip]} 
                                        onPress={() => setPdfTheme('theme1')}
                                    >
                                        <Text style={[styles.chipText, pdfTheme === 'theme1' && styles.activeChipText]}>Format 1</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.chip, pdfTheme === 'theme2' && styles.activeChip]} 
                                        onPress={() => setPdfTheme('theme2')}
                                    >
                                        <Text style={[styles.chipText, pdfTheme === 'theme2' && styles.activeChipText]}>Format 2</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={{flexDirection: 'row', gap: 10, marginTop: 5}}>
                                    <TouchableOpacity 
                                        style={[styles.shareBtn, {flex: 1, backgroundColor: '#FFA000', marginTop: 0, padding: 12}]} 
                                        onPress={() => { 
                                            const qId = selectedQuote.id; 
                                            setSelectedQuote(null); 
                                            router.push({ pathname: '/add_quotation', params: { id: qId, mode: 'edit' }} as any); 
                                        }}
                                    >
                                        <Ionicons name="pencil" size={18} color="white" />
                                        <Text style={{color: 'white', fontWeight: 'bold', marginLeft: 5}}>Edit</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity 
                                        style={[styles.shareBtn, {flex: 1, backgroundColor: '#4CAF50', marginTop: 0, padding: 12}]} 
                                        onPress={() => { 
                                            const qId = selectedQuote.id; 
                                            setSelectedQuote(null); 
                                            router.push({ pathname: '/add_quotation', params: { id: qId, mode: 'duplicate' }} as any); 
                                        }}
                                    >
                                        <Ionicons name="copy" size={18} color="white" />
                                        <Text style={{color: 'white', fontWeight: 'bold', marginLeft: 5}}>Duplicate</Text>
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity style={[styles.shareBtn, {marginTop: 10}]} onPress={() => generateAndSharePDF(selectedQuote)}>
                                    <Ionicons name="share-social" size={20} color="white" style={{marginRight: 8}} />
                                    <Text style={{color: 'white', fontWeight: 'bold', fontSize: 16}}>Share / View PDF</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal visible={showEmployeePicker} transparent animationType="fade">
                <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerHeader}>Select Employee</Text>
                        <FlatList 
                            data={employees} 
                            keyExtractor={(item, index) => index.toString()} 
                            renderItem={({item}) => (
                                <TouchableOpacity style={styles.pickerItem} onPress={() => { setSelectedEmployeeName(item.name); setShowEmployeePicker(false); }}>
                                    <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                                    {selectedEmployeeName === item.name && <Ionicons name="checkmark" size={18} color="green" />}
                                </TouchableOpacity>
                            )} 
                        />
                    </View>
                </TouchableOpacity>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', elevation: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 10 },
    addBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#3b5998', borderRadius:20, paddingHorizontal:12, paddingVertical:6 },
    
    tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 15, borderRadius: 8, padding: 3, marginBottom: 10 },
    tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
    activeTab: { backgroundColor: 'white', elevation: 2 },
    tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
    activeTabText: { color: '#3b5998', fontWeight: 'bold' },
    
    dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 10, marginHorizontal: 15, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#eee' },
    monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
    
    employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, marginHorizontal:15, borderRadius:8, borderWidth:1, borderColor:'#2e7d32', marginBottom:10 },
    searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 40 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },
    
    card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, marginHorizontal: 15, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom:5 },
    date: { fontWeight:'bold', color:'gray', fontSize:13 },
    statusBadge: { paddingHorizontal:8, paddingVertical:4, borderRadius:4, backgroundColor: '#e8f5e9' },
    statusText: { fontSize:10, fontWeight:'bold', color: '#2e7d32' },
    orgName: { fontSize:16, fontWeight:'bold', color:'#333' },
    amount: { fontSize:18, fontWeight:'bold', color:'#1565c0' },

    loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },

    chip: { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#f0f0f0', borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
    activeChip: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
    chipText: { color: '#555', fontSize: 13, fontWeight: 'bold' },
    activeChipText: { color: 'white' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '90%', backgroundColor: 'white', borderRadius: 15, padding: 25, elevation: 5, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
    shareBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
    pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
    pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
    pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});