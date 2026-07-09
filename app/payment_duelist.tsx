import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

// 🔥 SAAS IMPORTS (No Direct Firebase calls)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

export default function PaymentDueList() {
    const router = useRouter();
    
    // 🔥 1. Context se Core Info
    const { currentUser, companyProfile } = useData(); 
    
    // 🔥 2. Naya SaaS Engine
    const { fetchSaaSData, updateSaaSData, addSaaSData, isDbLoading } = useSaaSDB();

    // 🔥 3. Lazy Loaded States
    const [dueList, setDueList] = useState<any[]>([]);
    const [orderList, setOrderList] = useState<any[]>([]);
    const [paymentList, setPaymentList] = useState<any[]>([]);
    const [orgList, setOrgList] = useState<any[]>([]);

    // STATES
    const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('All');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    
    const [selectedItem, setSelectedItem] = useState<any>(null);

    const [visibleCount, setVisibleCount] = useState(20);

    useEffect(() => {
        if (viewMode === 'Day') setVisibleCount(500); 
        else setVisibleCount(20); 
    }, [viewMode, currentDate, searchTerm]);

    // 🔥 4. LOAD SAAS DATA ON MOUNT
    const loadData = async () => {
        if (currentUser?.companyId) {
            const [dues, orders, payments, orgs] = await Promise.all([
                fetchSaaSData("payment_dues"), 
                fetchSaaSData("orders"),
                fetchSaaSData("payment_collections"),
                fetchSaaSData("organizations")
            ]);
            setDueList(dues);
            setOrderList(orders);
            setPaymentList(payments);
            setOrgList(orgs);
        }
    };

    useEffect(() => {
        loadData();
    }, [currentUser]);

    const roleToCheck = currentUser?.role || 'employee';
    const canAddDue = ['Admin', 'Accountant', 'Account', 'Manager', 'Hr', 'SuperAdmin'].includes(roleToCheck);

    const parseDate = (dateStr: string) => {
        if (!dateStr) return new Date(0);
        if (dateStr.includes('T')) return new Date(dateStr);
        if (dateStr.includes('-')) return new Date(dateStr);
        const parts = dateStr.split('/');
        if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        return new Date(0);
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
            const currentMonth = currentDate.getMonth(); 
            const currentYear = currentDate.getFullYear();
            const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
            const fyEndYear = fyStartYear + 1;
            return `FY ${fyStartYear.toString().slice(-2)}-${fyEndYear.toString().slice(-2)}`;
        }
        return "All Time";
    };

    // 🔥 5. SAAS REMINDER TRACKING ENGINE
    const handleSendReminder = async (item: any) => {
        Alert.alert(
            "Send Reminder",
            `Do you want to send a WhatsApp payment reminder to ${item.orgName || item.hospitalName}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Yes, Send",
                    onPress: async () => {
                        try {
                            let mobile = item.mobile;
                            if (!mobile) {
                                const org = orgList.find((o: any) => o.id === item.orgId || o.orgName === item.orgName || o.name === item.orgName);
                                if (org) mobile = org.mobile || org.phone;
                            }

                            if (!mobile) {
                                Alert.alert("Missing Detail", "Mobile number not found.");
                                return;
                            }

                            let finalTo = mobile;
                            if (!finalTo.startsWith('91') && !finalTo.startsWith('+91')) {
                                finalTo = `91${finalTo.replace(/[^0-9]/g, '')}`; 
                            }

                            const dueAmt = item.balance !== undefined ? item.balance : item.amount;
                            const todayStr = new Date().toLocaleDateString('en-GB');
                            const timestampStr = new Date().toLocaleString('en-GB');

                            // 1. Queue the message in SaaS (Global outbox simulation)
                            await addSaaSData('outbound_messages', {
                                type: 'whatsapp',
                                to: finalTo,
                                templateName: 'payment_reminder',
                                variables: {
                                    customer_name: item.orgName || item.hospitalName,
                                    amount: String(dueAmt),
                                    company_name: companyProfile?.companyName || 'Our Company'
                                },
                                status: 'pending', 
                                createdAt: new Date().toISOString(),
                                retryCount: 0
                            });

                            // 2. Update Tracking in Due/Order Record using SaaS
                            const updatedHistory = item.reminderHistory ? [...item.reminderHistory] : [];
                            updatedHistory.push({
                                date: timestampStr,
                                sentBy: currentUser?.name || 'System'
                            });

                            const collectionName = item.collectionName || 'payment_dues';

                            const res = await updateSaaSData(collectionName, item.id, {
                                lastReminderDate: todayStr,
                                reminderHistory: updatedHistory
                            });

                            if(res.success) {
                                // Sync local state depending on where it came from
                                if (collectionName === 'payment_dues') {
                                    setDueList(prev => prev.map(d => d.id === item.id ? { ...d, lastReminderDate: todayStr, reminderHistory: updatedHistory } : d));
                                } else {
                                    setOrderList(prev => prev.map(o => o.id === item.id ? { ...o, lastReminderDate: todayStr, reminderHistory: updatedHistory } : o));
                                }
                                
                                // Also update the popup if open
                                setSelectedItem((prev: any) => ({ ...prev, lastReminderDate: todayStr, reminderHistory: updatedHistory }));
                                
                                Alert.alert("Success ✅", "Reminder sent and tracked!");
                            } else {
                                throw new Error("Update Failed");
                            }
                            
                        } catch(e) {
                            Alert.alert("Error", "Could not track reminder.");
                        }
                    }
                }
            ]
        );
    };

    // 🔥 FIX: MERGING MANUAL DUES AND SYSTEM ORDERS
    const getData = () => {
        // 1. Get Manual Dues
        const validDues = dueList ? dueList.filter((d:any) => {
            const rawBal = d.balance !== undefined ? d.balance : d.amount;
            const currentBal = parseFloat(String(rawBal).replace(/[^0-9.-]/g, '')) || 0;
            if (currentBal <= 0) return false;
            
            const oStatus = (d.status || '').trim().toLowerCase();
            const payStatus = (d.paymentStatus || '').trim().toLowerCase();
            if (oStatus === 'collected' || oStatus === 'paid' || payStatus === 'paid') return false;
                       
            return true;
        }).map((d: any) => ({ ...d, collectionName: 'payment_dues' })) : [];

        // 2. Get Billed System Orders (Credit Only) - 🔥 BULLETPROOF CHECK
        const validOrders = orderList ? orderList.filter((o:any) => {
            const rawBal = o.balance !== undefined ? o.balance : o.amount;
            const currentBal = parseFloat(String(rawBal).replace(/[^0-9.-]/g, '')) || 0;
            if (currentBal <= 0) return false;
            
            const oStatus = (o.status || '').trim().toLowerCase();
            const payStatus = (o.paymentStatus || '').trim().toLowerCase();
            const payMode = (o.paymentMode || '').trim().toLowerCase();

            if (oStatus === 'collected' || payStatus === 'paid') return false;
            
            // 🔥 'Billed' orders hi yahan aayenge
            const isCreditStatus = ['billed', 'approved', 'dispatched', 'completed'].includes(oStatus);
            if (!isCreditStatus) return false;
            if (payMode === 'cash') return false;
            
            return true;
        }).map((o: any) => ({ ...o, collectionName: 'orders' })) : [];

        // 3. Combine both lists
        let filtered = [...validDues, ...validOrders];

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filtered = filtered.filter((item:any) => {
                const fullString = `${item.orgName || item.hospitalName} ${item.amount} ${item.billNo || item.poNumber} ${item.date} ${item.dueDate || ''} ${item.orderId || ''}`.toLowerCase();
                return fullString.includes(lowerTerm);
            });
        }

        if (viewMode !== 'All') {
            const targetYear = currentDate.getFullYear();
            const targetMonth = currentDate.getMonth();
            const targetDay = currentDate.getDate();

            const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
            const fyStartDate = new Date(fyStartYear, 3, 1); 
            const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59);

            filtered = filtered.filter((item: any) => {
                const dateVal = item.date || item.createdAt;
                if(!dateVal) return false;
                
                const itemDate = parseDate(dateVal);
                if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
                if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
                if (viewMode === 'FY') return itemDate >= fyStartDate && itemDate <= fyEndDate;
                return true;
            });
        }
        
        return filtered.sort((a: any, b: any) => {
            const dateA = a.date || a.createdAt;
            const dateB = b.date || b.createdAt;
            return parseDate(dateA).getTime() - parseDate(dateB).getTime();
        });
    };

    const fullFilteredList = getData(); 
    const renderedList = fullFilteredList.slice(0, visibleCount);
    
    const totalPending = fullFilteredList.reduce((sum: number, item: any) => {
        const currentBal = item.balance !== undefined ? item.balance : item.amount;
        return sum + (parseFloat(currentBal) || 0);
    }, 0);

    const getOverdueDays = (dateStr: string) => {
        if(!dateStr) return 0;
        const targetDate = parseDate(dateStr);
        targetDate.setHours(0,0,0,0);
        const todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        const diffTime = todayDate.getTime() - targetDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

   // 🔥 FIX: BULLETPROOF SMART MATCHING (Ignores spaces and cases)
    const getPartyHistory = (partyItem: any) => {
    if (!partyItem || !paymentList) return [];

    return paymentList
        .filter((p: any) => {
            const pOrderRef = String(p.orderRef || '').trim().toLowerCase();
            const pOrderId = String(p.orderId || '').trim().toLowerCase();
            const pLinkedId = String(p.linkedId || '').trim().toLowerCase();
            const pBillRef = String(p.billRef || '').trim().toLowerCase();

            const partyId = String(partyItem.id || '').trim().toLowerCase();
            const partyOrderId = String(partyItem.orderId || '').trim().toLowerCase();
            const partyBillNo = String(partyItem.billNo || partyItem.poNumber || '').trim().toLowerCase();

            // 1. Direct DB ID match
            if (partyId && (pLinkedId === partyId || pOrderId === partyId)) return true;

            // 2. Order ID match (ORD-XXXX)
            if (partyOrderId && (pOrderRef === partyOrderId || pOrderId === partyOrderId)) return true;

            // 3. Bill No match (manual dues ke liye)
            if (partyBillNo && (pBillRef === partyBillNo || pOrderRef === partyBillNo)) return true;

            // ❌ OrgName/OrgId fallback NAHI — ye remove kar diya
            return false;
        })
        .sort((a: any, b: any) => {
            const dateA = new Date(a.dateIso || a.date || a.createdAt || 0).getTime();
            const dateB = new Date(b.dateIso || b.date || b.createdAt || 0).getTime();
            return dateB - dateA;
        })
        .slice(0, 5);
};

    const handleCollect = (item: any) => {
        const currentDue = item.balance !== undefined ? item.balance : item.amount;
        const sourceCollection = item.collectionName || 'payment_dues';

        setSelectedItem(null); 

        router.push({
            pathname: '/add_payment' as any,
            params: { 
                orgName: item.orgName || item.hospitalName, 
                orgId: item.orgId || '', 
                amount: currentDue, 
                billNo: item.billNo || item.poNumber,
                linkedId: item.id,       
                source: sourceCollection 
            }
        });
    };

    const renderItem = ({ item }: any) => {
        const dateToShow = item.date || item.createdAt;
        const daysOutstanding = getOverdueDays(dateToShow);
        const displayAmount = item.balance !== undefined ? item.balance : item.amount;
        
        const isOrder = item.orderId && typeof item.orderId === 'string' && item.orderId.startsWith('ORD');

        return (
            <TouchableOpacity 
                style={[styles.historyCard, daysOutstanding > 0 ? styles.overdueCard : styles.normalCard]}
                onPress={() => setSelectedItem(item)}
            >
                <View style={{flex:1}}>
                    <Text style={styles.hOrg} numberOfLines={1}>{item.orgName || item.hospitalName}</Text>
                    <View style={{flexDirection:'row', alignItems:'center', marginTop:4}}>
                        <Ionicons name={isOrder ? "cart-outline" : "receipt-outline"} size={14} color="#555" />
                        <Text style={styles.hSubText}>
                            {isOrder ? `Order #${item.orderId}` : `Bill: ${item.billNo || 'Manual'}`}
                        </Text>
                    </View>
                    <View style={{flexDirection:'row', alignItems:'center', marginTop:4}}>
                        <Ionicons name="calendar-outline" size={14} color={daysOutstanding > 0 ? '#d32f2f' : '#666'} />
                        <Text style={[styles.dateText, daysOutstanding > 0 && {color:'#d32f2f', fontWeight:'bold'}]}>
                            Date: {dateToShow} {daysOutstanding > 0 ? `(${daysOutstanding} days outstanding)` : ''}
                        </Text>
                    </View>

                    <View style={{flexDirection:'row', alignItems:'center', marginTop:5}}>
                        <Ionicons name="notifications-outline" size={12} color={item.lastReminderDate ? "#2e7d32" : "#999"} />
                        <Text style={{fontSize:10, color: item.lastReminderDate ? "#2e7d32" : "#999", marginLeft:4, fontStyle:'italic'}}>
                            {item.lastReminderDate ? `Last Reminded: ${item.lastReminderDate}` : 'No reminders sent yet'}
                        </Text>
                    </View>
                </View>
                <View style={{alignItems:'flex-end'}}>
                    <Text style={styles.hAmount}>₹{Number(displayAmount).toLocaleString('en-IN')}</Text>
                    
                    {(displayAmount < item.amount) && (
                        <Text style={{fontSize:10, color:'gray', textDecorationLine:'line-through', marginBottom:2}}>
                            ₹{Number(item.amount).toLocaleString('en-IN')}
                        </Text>
                    )}

                    <View style={{flexDirection: 'row', gap: 6, marginTop: 5}}>
                        <TouchableOpacity style={[styles.collectBtn, {backgroundColor: '#25D366'}]} onPress={() => handleSendReminder(item)}>
                            <Ionicons name="logo-whatsapp" size={12} color="white" />
                            <Text style={[styles.collectBtnText, {marginLeft: 3}]}>Remind</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={styles.collectBtn}
                            onPress={() => handleCollect(item)} 
                        >
                            <Text style={styles.collectBtnText}>Collect</Text>
                            <Ionicons name="arrow-forward" size={10} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                    <Text style={styles.headerTitle}>Pending Dues</Text>
                </View>
                <View style={{flexDirection:'row', gap:10}}>
                    {canAddDue && (
                        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_payment_due' as any)}>
                            <Ionicons name="add" size={20} color="white" />
                            <Text style={{color:'white', fontWeight:'bold', marginLeft:5}}>New</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View style={styles.filterBox}>
                <View style={styles.tabContainer}>
                    {['Day', 'Month', 'FY', 'All'].map((m) => (
                        <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                            <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                {viewMode !== 'All' && (
                    <View style={styles.navRow}>
                        <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                        <Text style={styles.navText}>{getHeaderDate()}</Text>
                        <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
                    </View>
                )}
                <View style={styles.searchBar}>
                    {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={18} color="gray" />}
                    <TextInput style={styles.searchInput} placeholder="Search Party, Bill No..." value={searchTerm} onChangeText={setSearchTerm} />
                    {searchTerm.length > 0 && <TouchableOpacity onPress={()=>setSearchTerm('')}><Ionicons name="close-circle" size={18} color="gray"/></TouchableOpacity>}
                </View>
                <View style={styles.summaryRow}>
                    <Text style={styles.totalLabel}>Total Pending:</Text>
                    <Text style={[styles.totalValue, {color: '#d32f2f'}]}>₹{totalPending.toLocaleString('en-IN')}</Text>
                </View>
            </View>

            <FlatList 
                data={renderedList}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{padding: 15, paddingBottom: 100}}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : (
                            <>
                                <Ionicons name="checkmark-circle-outline" size={60} color="#4caf50" />
                                <Text style={{color:'gray', marginTop:10, fontSize:16}}>No Pending Dues!</Text>
                            </>
                        )}
                    </View>
                }
                ListFooterComponent={
                    <View style={{ paddingBottom: 80 }}>
                        {visibleCount < fullFilteredList.length ? (
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

            {selectedItem && (
                <Modal visible={true} transparent={true} animationType="fade">
                    <View style={styles.modalOverlayCenter}>
                        <View style={[styles.detailCard, {maxHeight: '80%'}]}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Due Details</Text>
                                <TouchableOpacity onPress={() => setSelectedItem(null)}><Ionicons name="close-circle" size={30} color="#d32f2f" /></TouchableOpacity>
                            </View>
                            
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View style={{backgroundColor:'#fff5f5', padding:15, borderRadius:10, marginBottom:20, alignItems:'center'}}>
                                    <Text style={{fontSize:12, color:'gray'}}>TOTAL PENDING</Text>
                                    <Text style={{fontSize:24, fontWeight:'bold', color:'#d32f2f'}}>
                                        ₹ {Number(selectedItem.balance !== undefined ? selectedItem.balance : selectedItem.amount).toLocaleString('en-IN')}
                                    </Text>
                                </View>

                                <DetailRow label="Customer" value={selectedItem?.orgName || selectedItem?.hospitalName} />
                                <DetailRow label={selectedItem.orderId ? "Order ID" : "Bill No"} value={selectedItem?.orderId || selectedItem?.billNo || 'N/A'} />
                                
                                <DetailRow label="Bill Date" value={selectedItem?.date || selectedItem?.createdAt} />
                                {selectedItem?.dueDate && <DetailRow label="Target Due Date" value={selectedItem.dueDate} />}
                                
                                <DetailRow label="Original Amount" value={`₹ ${selectedItem?.amount}`} />
                                
                                {selectedItem?.notes ? (
                                    <View style={{marginTop:10, backgroundColor:'#f9f9f9', padding:10, borderRadius:8}}>
                                        <Text style={{fontSize:11, color:'gray', fontWeight:'bold'}}>NOTES</Text>
                                        <Text style={{color:'#555', fontStyle:'italic', marginTop:2}}>{selectedItem?.notes}</Text>
                                    </View>
                                ) : null}

                                <View style={{marginTop:20, paddingTop:10, borderTopWidth:1, borderTopColor:'#eee'}}>
                                    <Text style={{fontSize:12, fontWeight:'bold', color:'#e65100', marginBottom:10}}>REMINDER LOGS</Text>
                                    {selectedItem.reminderHistory && selectedItem.reminderHistory.length > 0 ? (
                                        selectedItem.reminderHistory.slice().reverse().map((log: any, idx: number) => (
                                            <View key={idx} style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4}}>
                                                <Text style={{fontSize:11, color:'#333'}}>🔔 {log.date}</Text>
                                                <Text style={{fontSize:11, color:'gray'}}>by {log.sentBy}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <Text style={{fontSize:11, color:'gray', fontStyle:'italic'}}>No logs found.</Text>
                                    )}
                                </View>

                                <View style={{marginTop:20, paddingTop:10, borderTopWidth:1, borderTopColor:'#eee'}}>
                                    <Text style={{fontSize:12, fontWeight:'bold', color:'#3b5998', marginBottom:10}}>PAYMENTS FOR THIS ENTRY</Text>
                                    {getPartyHistory(selectedItem).length > 0 ? (
                                        getPartyHistory(selectedItem).map((p: any) => (
                                            <View key={p.id} style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#f0f0f0'}}>
                                                <View>
                                                    <Text style={{fontSize:12, fontWeight:'bold', color:'#333'}}>₹ {p.amount}</Text>
                                                    <Text style={{fontSize:10, color:'gray'}}>{p.mode} • {p.date}</Text>
                                                </View>
                                                {p.billRef === (selectedItem.billNo || selectedItem.poNumber) && (
                                                    <View style={{backgroundColor:'#e8f5e9', padding:2, borderRadius:4}}>
                                                        <Text style={{fontSize:9, color:'green'}}>MATCHED BILL</Text>
                                                    </View>
                                                )}
                                            </View>
                                        ))
                                    ) : (
                                        <Text style={{fontSize:11, color:'gray', fontStyle:'italic'}}>No recent payments found.</Text>
                                    )}
                                </View>

                                <View style={{flexDirection: 'row', gap: 10, marginTop: 25}}>
                                    <TouchableOpacity 
                                        style={[styles.modalCollectBtn, {flex: 1, backgroundColor: '#25D366'}]}
                                        onPress={() => handleSendReminder(selectedItem)} 
                                    >
                                        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent:'center'}}>
                                            <Ionicons name="logo-whatsapp" size={18} color="white" />
                                            <Text style={{color:'white', fontWeight:'bold', fontSize:14, marginLeft: 5}}>Remind</Text>
                                        </View>
                                    </TouchableOpacity>

                                    <TouchableOpacity 
                                        style={[styles.modalCollectBtn, {flex: 1.5}]}
                                        onPress={() => handleCollect(selectedItem)} 
                                    >
                                        <Text style={{color:'white', fontWeight:'bold', fontSize:14}}>Collect Payment</Text>
                                    </TouchableOpacity>
                                </View>
                                
                                <View style={{height:20}} />
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
}

const DetailRow = ({label, value}: any) => (
    <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>{label}</Text>
        <Text style={styles.receiptValue}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 4, alignItems:'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    backBtn: { paddingRight: 10 },
    addBtn: { flexDirection:'row', backgroundColor:'#3b5998', paddingVertical:6, paddingHorizontal:12, borderRadius:20, alignItems:'center' },
    filterBox: { backgroundColor:'white', padding:15, paddingBottom:10, marginBottom:5 },
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
    totalValue: { fontWeight:'bold', fontSize:16 },
    historyCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2, marginHorizontal:15, borderLeftWidth: 5 },
    normalCard: { borderLeftColor: '#f39c12' },
    overdueCard: { borderLeftColor: '#d32f2f' },
    hOrg: { fontWeight: 'bold', fontSize: 15, color: '#333' },
    hSubText: { fontSize: 12, color: '#555', marginLeft: 5 },
    dateText: { fontSize: 11, color: 'gray', marginLeft: 5 },
    hAmount: { fontWeight: 'bold', color: '#333', fontSize: 16, marginBottom:5 },
    collectBtn: { flexDirection:'row', alignItems:'center', backgroundColor: '#27ae60', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6 },
    collectBtnText: { color: 'white', fontWeight: 'bold', fontSize: 10, marginRight: 3 },
    empty: { alignItems:'center', marginTop: 100 },
    modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    detailCard: { width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 25 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
    receiptRow: { marginBottom: 12, flexDirection:'row', justifyContent:'space-between', alignItems:'center', borderBottomWidth:1, borderBottomColor:'#f0f0f0', paddingBottom:5 },
    receiptLabel: { fontSize: 12, color: 'gray' },
    receiptValue: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    modalCollectBtn: { backgroundColor:'#27ae60', padding:15, borderRadius:10, alignItems:'center', width:'100%', justifyContent:'center' },
});