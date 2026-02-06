import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useData } from './context/DataContext';

export default function PaymentDueList() {
    const router = useRouter();
    // PaymentList is used for history, DueList is the main data source here
    const { dueList = [], paymentList = [], currentUser } = useData(); 
    
    // STATES
    const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year' | 'All'>('All');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    
    const [selectedItem, setSelectedItem] = useState<any>(null);

    // LOCK ADD BUTTON (Permissions)
    const canAddDue = ['Admin', 'Accountant', 'Account', 'Manager', 'Hr'].includes(currentUser?.role);

    // --- HELPER: DATE PARSER ---
    const parseDate = (dateStr: string) => {
        if (!dateStr) return new Date(0);
        if (dateStr.includes('T')) return new Date(dateStr);
        if (dateStr.includes('-')) return new Date(dateStr);
        const parts = dateStr.split('/');
        if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        return new Date(0);
    };

    // --- DATE NAVIGATION ---
    const changeDate = (dir: number) => {
        const d = new Date(currentDate);
        if (viewMode === 'Day') d.setDate(d.getDate() + dir);
        else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
        else if (viewMode === 'Year') d.setFullYear(d.getFullYear() + dir);
        setCurrentDate(d);
    };

    const getHeaderDate = () => {
        if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
        if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (viewMode === 'Year') return currentDate.getFullYear().toString();
        return "All Time";
    };

    // --- FILTER LOGIC ---
    const getData = () => {
        // Filter out items that are fully collected/paid
        let filtered = dueList.filter((d:any) => d.status !== 'Collected' && d.status !== 'Paid');

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filtered = filtered.filter((item:any) => {
                const fullString = `${item.orgName} ${item.amount} ${item.billNo || item.billRef} ${item.dueDate} ${item.orderId || ''}`.toLowerCase();
                return fullString.includes(lowerTerm);
            });
        }

        if (viewMode !== 'All') {
            const targetYear = currentDate.getFullYear();
            const targetMonth = currentDate.getMonth();
            const targetDay = currentDate.getDate();

            filtered = filtered.filter((item: any) => {
                if(!item.dueDate) return false;
                const itemDate = parseDate(item.dueDate);
                if (viewMode === 'Year') return itemDate.getFullYear() === targetYear;
                if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
                if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
                return true;
            });
        }
        return filtered.sort((a: any, b: any) => parseDate(a.dueDate).getTime() - parseDate(b.dueDate).getTime());
    };

    const displayList = getData(); 
    
    // Calculate Total Pending Amount
    const totalPending = displayList.reduce((sum: number, item: any) => {
        const currentBal = item.balance !== undefined ? item.balance : item.amount;
        return sum + (parseFloat(currentBal) || 0);
    }, 0);

    const getOverdueDays = (dateStr: string) => {
        if(!dateStr) return 0;
        const dueDate = parseDate(dateStr);
        dueDate.setHours(0,0,0,0);
        const todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        const diffTime = todayDate.getTime() - dueDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

    // 🔥 GET PARTY HISTORY LOGIC
    const getPartyHistory = (partyName: string) => {
        if (!partyName) return [];
        return paymentList
            .filter((p: any) => p.orgName === partyName)
            .sort((a: any, b: any) => parseDate(b.date).getTime() - parseDate(a.date).getTime())
            .slice(0, 5); 
    };

    // 🔥 NAVIGATION TO ADD PAYMENT (The Bridge Logic)
    const handleCollect = (item: any) => {
        // Determine Current Balance
        const currentDue = item.balance !== undefined ? item.balance : item.amount;
        
        // Determine Source (Is it a Real Order or Manual Due?)
        // Agar 'orderId' exist karta hai aur wo 'LMS-' se shuru hota hai, to wo Order hai.
        // Nahi to wo Manual Due hai.
        const sourceCollection = item.orderId ? 'orders' : 'payment_dues';

        setSelectedItem(null); // Close modal if open

        router.push({
            pathname: '/add_payment' as any,
            params: { 
                orgName: item.orgName, 
                amount: currentDue, 
                billNo: item.billNo || item.billRef,
                // 🔥 Critical Params for Linking
                linkedId: item.id,       // Document ID
                source: sourceCollection // 'orders' or 'payment_dues'
            }
        });
    };

    const renderItem = ({ item }: any) => {
        const daysOverdue = getOverdueDays(item.dueDate);
        const displayAmount = item.balance !== undefined ? item.balance : item.amount;

        return (
            <TouchableOpacity 
                style={[styles.historyCard, daysOverdue > 0 ? styles.overdueCard : styles.normalCard]}
                onPress={() => setSelectedItem(item)}
            >
                <View style={{flex:1}}>
                    <Text style={styles.hOrg} numberOfLines={1}>{item.orgName}</Text>
                    <View style={{flexDirection:'row', alignItems:'center', marginTop:4}}>
                        <Ionicons name="receipt-outline" size={14} color="#555" />
                        <Text style={styles.hSubText}>
                            {/* Differentiate between Order and Bill */}
                            {item.orderId ? `Order #${item.orderId}` : `Bill: ${item.billNo || 'N/A'}`}
                        </Text>
                    </View>
                    <View style={{flexDirection:'row', alignItems:'center', marginTop:4}}>
                        <Ionicons name="calendar-outline" size={14} color={daysOverdue > 0 ? '#d32f2f' : '#666'} />
                        <Text style={[styles.dateText, daysOverdue > 0 && {color:'#d32f2f', fontWeight:'bold'}]}>
                            Due: {item.dueDate} {daysOverdue > 0 ? `(${daysOverdue} days late)` : ''}
                        </Text>
                    </View>
                </View>
                <View style={{alignItems:'flex-end'}}>
                    <Text style={styles.hAmount}>₹{Number(displayAmount).toLocaleString('en-IN')}</Text>
                    {(item.balance !== undefined && item.balance < item.amount) && (
                        <Text style={{fontSize:10, color:'gray', textDecorationLine:'line-through', marginBottom:2}}>
                            ₹{Number(item.amount).toLocaleString('en-IN')}
                        </Text>
                    )}
                    <TouchableOpacity 
                        style={styles.collectBtn}
                        onPress={() => handleCollect(item)} // Used new function
                    >
                        <Text style={styles.collectBtnText}>Collect</Text>
                        <Ionicons name="arrow-forward" size={10} color="white" />
                    </TouchableOpacity>
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
                    {['Day', 'Month', 'Year', 'All'].map((m) => (
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
                    <Ionicons name="search" size={18} color="gray" />
                    <TextInput style={styles.searchInput} placeholder="Search Party, Bill No..." value={searchTerm} onChangeText={setSearchTerm} />
                    {searchTerm.length > 0 && <TouchableOpacity onPress={()=>setSearchTerm('')}><Ionicons name="close-circle" size={18} color="gray"/></TouchableOpacity>}
                </View>
                <View style={styles.summaryRow}>
                    <Text style={styles.totalLabel}>Total Pending:</Text>
                    <Text style={[styles.totalValue, {color: '#d32f2f'}]}>₹{totalPending.toLocaleString('en-IN')}</Text>
                </View>
            </View>

            <FlatList 
                data={displayList}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{padding: 15, paddingBottom: 100}}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Ionicons name="checkmark-circle-outline" size={60} color="#4caf50" />
                        <Text style={{color:'gray', marginTop:10, fontSize:16}}>No Pending Dues!</Text>
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

                                <DetailRow label="Customer" value={selectedItem?.orgName} />
                                <DetailRow label={selectedItem.orderId ? "Order ID" : "Bill No"} value={selectedItem?.orderId || selectedItem?.billNo || 'N/A'} />
                                <DetailRow label="Due Date" value={selectedItem?.dueDate} />
                                <DetailRow label="Original Amount" value={`₹ ${selectedItem?.amount}`} />
                                
                                {selectedItem?.notes ? (
                                    <View style={{marginTop:10, backgroundColor:'#f9f9f9', padding:10, borderRadius:8}}>
                                        <Text style={{fontSize:11, color:'gray', fontWeight:'bold'}}>NOTES</Text>
                                        <Text style={{color:'#555', fontStyle:'italic', marginTop:2}}>{selectedItem?.notes}</Text>
                                    </View>
                                ) : null}

                                <View style={{marginTop:20, paddingTop:10, borderTopWidth:1, borderTopColor:'#eee'}}>
                                    <Text style={{fontSize:12, fontWeight:'bold', color:'#3b5998', marginBottom:10}}>RECENT PAYMENTS FROM PARTY</Text>
                                    {getPartyHistory(selectedItem.orgName).length > 0 ? (
                                        getPartyHistory(selectedItem.orgName).map((p: any) => (
                                            <View key={p.id} style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#f0f0f0'}}>
                                                <View>
                                                    <Text style={{fontSize:12, fontWeight:'bold', color:'#333'}}>₹ {p.amount}</Text>
                                                    <Text style={{fontSize:10, color:'gray'}}>{p.mode} • {p.date}</Text>
                                                </View>
                                                {p.billRef === selectedItem.billNo && (
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

                                <TouchableOpacity 
                                    style={styles.modalCollectBtn}
                                    onPress={() => handleCollect(selectedItem)} // Used new function
                                >
                                    <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>Collect Payment</Text>
                                </TouchableOpacity>
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
    tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 3, marginBottom: 10 },
    tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
    activeTab: { backgroundColor: 'white', elevation: 2 },
    tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
    activeTabText: { color: '#3b5998', fontWeight: 'bold' },
    navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#eee' },
    navText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 10, height: 40 },
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
    modalCollectBtn: { backgroundColor:'#27ae60', padding:15, borderRadius:10, alignItems:'center', width:'100%', marginTop:20 }
});