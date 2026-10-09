import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

// 🔥 SAAS IMPORTS (organizations still Firestore)
import { useData } from './context/DataContext';
// 🔥 Phase 6: orders (Phase 3), payment dues, payment collections now via new backend API
import { remindOrder } from '../services/api/orders';
import { fetchDueItemPayments, listOutstandingPage, OutstandingFilters, remindPaymentDue } from '../services/api/paymentDues';
import { useServerPagedList } from '../hooks/useServerPagedList';
import { buildCacheKey } from '../utils/listCache';
import { periodRange, useDebounced } from '../utils/periodRange';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { PeriodTabs, StaffPeriodRow, TotalBar } from '../components/compact';

export default function PaymentDueList() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    
    const { currentUser, companyProfile } = useData(); 


    const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('All');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    
    const [selectedItem, setSelectedItem] = useState<any>(null);


    // 🔥 PENDING DUES — manual dues + unpaid billed orders, merged, filtered and
    // paged on the server (oldest first, 20 per page). Was: every due, every order,
    // every payment and every organization downloaded and merged on the phone.
    const debouncedSearch = useDebounced(searchTerm.trim());
    const dueFilters = useMemo<OutstandingFilters>(() => ({
        ...periodRange(viewMode, currentDate),
        search: debouncedSearch || undefined,
    }), [viewMode, currentDate, debouncedSearch]);
    const [totalPending, setTotalPending] = useState(0);
    const fetchDuesPage = useCallback(async (p: OutstandingFilters & { page: number; limit: number }) => {
        const r = await listOutstandingPage(p);
        if (p.page === 1) setTotalPending(r.totalAmount);
        return r;
    }, []);
    const {
        items: dueItems,
        setItems: setDueItems,
        total: dueTotal,
        loading: duesLoading,
        loadingMore: duesLoadingMore,
        hasMore: duesHasMore,
        loadMore: loadMoreDues,
        refreshing: duesRefreshing,
        refresh: refreshDues,
        error: duesError,
    } = useServerPagedList<OutstandingFilters, any>({
        fetchPage: fetchDuesPage,
        filters: dueFilters,
        enabled: !!currentUser?.companyId,
        // Default view is "All" (no dates) with no search.
        cacheKey: viewMode === 'All' && !debouncedSearch ? buildCacheKey('pending_dues_page1_v2', currentUser?.companyId) : null,
    });

    // Payments for the entry open in the details popup (last 5), loaded when it opens.
    const [partyHistory, setPartyHistory] = useState<any[]>([]);
    useEffect(() => {
        let cancelled = false;
        if (!selectedItem) return;
        const kind = selectedItem.collectionName === 'orders' ? 'order' : 'due';
        fetchDueItemPayments(kind, selectedItem.id, selectedItem.billNo || selectedItem.poNumber || undefined)
            .then((rows) => {
                if (cancelled) return;
                // Order advances never become a payment row — show them as a display-only line.
                const advance = kind === 'order' && Number(selectedItem.advanceAmount) > 0
                    ? [{
                        id: `advance-${selectedItem.id}`,
                        amount: Number(selectedItem.advanceAmount),
                        mode: 'Advance (at Order)',
                        date: selectedItem.date || selectedItem.dateIso,
                        dateIso: selectedItem.dateIso || selectedItem.date,
                        isAdvancePseudoEntry: true,
                    }]
                    : [];
                const all = [...rows, ...advance].sort((a: any, b: any) =>
                    new Date(b.dateIso || b.date || 0).getTime() - new Date(a.dateIso || a.date || 0).getTime());
                setPartyHistory(all.slice(0, 5));
            })
            .catch(() => { if (!cancelled) setPartyHistory([]); });
        return () => { cancelled = true; setPartyHistory([]); };
    }, [selectedItem?.id, selectedItem?.collectionName]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // 🔥 REMINDER — via new backend API. The old "outbound_messages" queue
    // write is dropped: nothing ever consumed it (no WhatsApp API
    // integration exists), so it was just data hygiene, not an active
    // feature. Reminder tracking (lastReminderDate/reminderHistory) is kept.
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
                            const collectionName = item.collectionName || 'payment_dues';
                            const updated = collectionName === 'orders'
                                ? await remindOrder(item.id)
                                : await remindPaymentDue(item.id);

                            setDueItems(prev => prev.map(d => d.id === item.id ? { ...d, lastReminderDate: updated.lastReminderDate, reminderHistory: updated.reminderHistory } : d));
                            
                            setSelectedItem((prev: any) => prev ? ({ ...prev, lastReminderDate: updated.lastReminderDate, reminderHistory: updated.reminderHistory }) : prev);
                            
                            Alert.alert("Success ✅", "Reminder sent and tracked!");
                        } catch(e) {
                            Alert.alert("Error", "Could not track reminder.");
                        }
                    }
                }
            ]
        );
    };

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
            <View style={[styles.header, { paddingTop: headerTop }]}>
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
                <PeriodTabs value={viewMode} onChange={setViewMode} />
                <StaffPeriodRow
                    periodLabel={viewMode !== 'All' ? getHeaderDate() : undefined}
                    onPrev={() => changeDate(-1)}
                    onNext={() => changeDate(1)}
                />
                <View style={styles.searchBar}>
                    {<Ionicons name="search" size={18} color="gray" />}
                    <TextInput style={styles.searchInput} placeholder="Search Party, Bill No..." value={searchTerm} onChangeText={setSearchTerm} />
                    {searchTerm.length > 0 && <TouchableOpacity onPress={()=>setSearchTerm('')}><Ionicons name="close-circle" size={18} color="gray"/></TouchableOpacity>}
                </View>
                <TotalBar label="Total Pending" count={dueTotal} amount={totalPending} accent="#d32f2f" />
            </View>

            <FlatList 
                data={dueItems}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{padding: 15, paddingBottom: 100}}
                refreshControl={
                    <RefreshControl
                        refreshing={duesRefreshing}
                        onRefresh={refreshDues}
                        colors={['#3b5998']}
                        tintColor="#3b5998"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.empty}>
                        {duesLoading ? <ActivityIndicator size="large" color="#3b5998" /> : duesError ? (
                            <>
                                <Ionicons name="cloud-offline-outline" size={60} color="#ccc" />
                                <Text style={{color:'gray', marginTop:10, fontSize:16}}>Could not load dues — pull down to retry.</Text>
                            </>
                        ) : (
                            <>
                                <Ionicons name="checkmark-circle-outline" size={60} color="#4caf50" />
                                <Text style={{color:'gray', marginTop:10, fontSize:16}}>No Pending Dues!</Text>
                            </>
                        )}
                    </View>
                }
                ListFooterComponent={
                    <View style={{ paddingBottom: 80 }}>
                        {duesHasMore ? (
                            <TouchableOpacity 
                                onPress={loadMoreDues}
                                disabled={duesLoadingMore}
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
                                {duesLoadingMore ? <ActivityIndicator color="#3b5998" /> : (
                                    <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                                        👇 Load More Records ({dueTotal - dueItems.length} remaining)
                                    </Text>
                                )}
                            </TouchableOpacity>
                        ) : (
                            dueItems.length > 0 ? (
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
                                    {partyHistory.length > 0 ? (
                                        partyHistory.map((p: any) => (
                                            <View key={p.id} style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#f0f0f0'}}>
                                                                                                <View>
                                                    <Text style={{fontSize:12, fontWeight:'bold', color:'#333'}}>₹ {p.amount}</Text>
                                                    <Text style={{fontSize:10, color:'gray'}}>{p.mode} • {p.date}</Text>
                                                    {p.mode === 'Cheque' && p.chequeStatus && p.chequeStatus !== 'Pending' && (
                                                        <Text style={{fontSize:10, fontWeight:'bold', color: p.chequeStatus === 'Bounced' ? '#d32f2f' : '#2e7d32', marginTop: 2}}>
                                                            {p.chequeStatus === 'Bounced' ? '❌ Bounced' : '✅ Cleared'}
                                                        </Text>
                                                    )}
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
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: 'white', elevation: 4, alignItems:'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    backBtn: { paddingRight: 10 },
    addBtn: { flexDirection:'row', backgroundColor:'#3b5998', paddingVertical:6, paddingHorizontal:12, borderRadius:20, alignItems:'center' },
    filterBox: { backgroundColor:'white', paddingBottom:6, marginBottom:4 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 10, height: 36, marginHorizontal: 12, marginTop: 6 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },
    historyCard: { backgroundColor: 'white', padding: 11, borderRadius: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 2, marginHorizontal:12, borderLeftWidth: 5 },
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
