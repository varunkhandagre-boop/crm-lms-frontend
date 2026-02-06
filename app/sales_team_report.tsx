import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

export default function SalesTeamReport() {
    const router = useRouter();
    const { userList = [], orderList = [], paymentList = [], currentUser } = useData();

    // --- STATES ---
    const [viewMode, setViewMode] = useState<'Month' | 'Year'>('Month');
    const [currentDate, setCurrentDate] = useState(new Date());
    
    const [selectedUserId, setSelectedUserId] = useState('All');
    const [showUserPicker, setShowUserPicker] = useState(false);

    // Global Defaults (Agar kisi ka target set nahi hai to ye use hoga)
    const [rules, setRules] = useState({
        baseTarget: '1000000', // 10 Lakh Default
        tier1Percent: '1',
        tier2Threshold: '1500000', 
        tier2Percent: '2'
    });

    const [incentiveData, setIncentiveData] = useState<any[]>([]);
    
    // 🔥 POPUP STATES
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<any>(null);
    const [detailTab, setDetailTab] = useState<'Monthly' | 'Orders' | 'Collections'>('Monthly');
    const [staffOrders, setStaffOrders] = useState<any[]>([]);
    const [staffPayments, setStaffPayments] = useState<any[]>([]);
    const [monthlyStats, setMonthlyStats] = useState<any[]>([]);

    // --- ROLE CHECK ---
    const userRole = (currentUser?.role || '').toLowerCase();
    const isAdmin = userRole.includes('admin') || userRole.includes('manager') || userRole.includes('account') || userRole.includes('hr');

    // --- DATE NAVIGATION ---
    const changeDate = (dir: number) => {
        const d = new Date(currentDate);
        if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
        else d.setFullYear(d.getFullYear() + dir);
        setCurrentDate(d);
    };

    const getDateLabel = () => {
        if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return currentDate.getFullYear().toString();
    };

    const formatDateShort = (dateStr: string) => {
        if(!dateStr) return "-";
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
    };

    // --- 🔥 MAIN LOGIC ---
    useEffect(() => {
        calculateIncentives();
    }, [rules, orderList, paymentList, userList, viewMode, currentDate, selectedUserId]);

    const calculateIncentives = () => {
        const targetMonth = currentDate.getMonth();
        const targetYear = currentDate.getFullYear();

        // 1. FILTER STAFF (Updated to include Admin)
        let eligibleStaff = [];
        
        if (isAdmin) {
            eligibleStaff = userList.filter((u: any) => {
                const r = (u.role || '').toLowerCase();
                // 🔥 FIX: Admin ko bhi list me dikhao
                return r.includes('sales') || r.includes('manager') || r.includes('admin') || r.includes('account');
            });
        } else {
            // Employee sees ONLY themselves
            eligibleStaff = userList.filter((u: any) => u.id === currentUser?.id || u.uid === currentUser?.id);
        }

        // Apply Dropdown Filter
        if (selectedUserId !== 'All') {
            eligibleStaff = eligibleStaff.filter((u: any) => u.id === selectedUserId);
        }

        const processedData = eligibleStaff.map((user: any) => {
            
            // 🔥 LOGIC: Agar Firebase me target hai (5L), to wo lo. Nahi to Default (10L) lo.
            let monthlyTarget = 0;
            if (user.monthlyTarget && Number(user.monthlyTarget) > 0) {
                monthlyTarget = Number(user.monthlyTarget); // Custom Target (e.g. 500,000)
            } else {
                monthlyTarget = Number(rules.baseTarget); // Global Default
            }

            // Tier 2 Logic (Target + 50%)
            let monthlyTier2 = monthlyTarget * 1.5;

            // View Mode Adjustment
            let effectiveTarget = viewMode === 'Year' ? monthlyTarget * 12 : monthlyTarget;
            let effectiveTier2 = viewMode === 'Year' ? monthlyTier2 * 12 : monthlyTier2;

            // 2. GET SALES
            const userOrders = orderList.filter((order: any) => {
                const d = new Date(order.date || order.createdAt);
                
                let dateMatch = false;
                if (viewMode === 'Month') dateMatch = d.getMonth() === targetMonth && d.getFullYear() === targetYear;
                else dateMatch = d.getFullYear() === targetYear;

                // User Check
                const userMatch = (order.senderId === user.id || order.userId === user.id || order.senderName === user.name);
                // Status Check
                const statusMatch = order.status === 'Approved' || order.status === 'Completed' || order.status === 'Dispatched';

                return dateMatch && userMatch && statusMatch;
            });

            // 3. GET COLLECTIONS
            const userPayments = paymentList.filter((payment: any) => {
                const d = new Date(payment.date || payment.createdAt);
                
                let dateMatch = false;
                if (viewMode === 'Month') dateMatch = d.getMonth() === targetMonth && d.getFullYear() === targetYear;
                else dateMatch = d.getFullYear() === targetYear;

                const userMatch = (payment.senderId === user.id || payment.userName === user.name);
                return dateMatch && userMatch;
            });

            // 4. TOTALS
            const totalSales = userOrders.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
            const totalCollected = userPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

            // 5. INCENTIVE CALCULATION (Based on Effective Target)
            const incentive = getIncentiveAmount(totalSales, effectiveTarget, effectiveTier2);

            return {
                id: user.id,
                name: user.name,
                role: user.role,
                target: effectiveTarget,
                isCustomTarget: !!(user.monthlyTarget && Number(user.monthlyTarget) > 0),
                orderCount: userOrders.length,
                totalSales: totalSales,
                collectionCount: userPayments.length,
                totalCollected: totalCollected,
                incentive: incentive,
                percentage: effectiveTarget > 0 ? (totalSales / effectiveTarget) * 100 : 0
            };
        });

        // SORT by Performance
        setIncentiveData(processedData.sort((a: any, b: any) => b.totalSales - a.totalSales));
    };

    const getIncentiveAmount = (amount: number, target: number, tier2Limit: number) => {
        if (amount < target) return 0;
        const t1Per = Number(rules.tier1Percent);
        const t2Per = Number(rules.tier2Percent);
        let incentive = 0;
        if (amount <= tier2Limit) incentive = (amount - target) * (t1Per / 100);
        else {
            const slab1Inc = (tier2Limit - target) * (t1Per / 100);
            const slab2Inc = (amount - tier2Limit) * (t2Per / 100);
            incentive = slab1Inc + slab2Inc;
        }
        return Math.floor(incentive);
    };

    // --- 🔥 MONTHLY BREAKDOWN LOGIC ---
    const generateMonthlyStats = (user: any) => {
        const fyMonths = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
        
        // Get current year context based on FY logic
        const now = new Date();
        let startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        
        const stats = fyMonths.map((m, index) => {
            const actualYear = index > 8 ? startYear + 1 : startYear;
            const monthIndex = index > 8 ? index - 9 : index + 3; 

            // Filter Orders
            const monthlySales = orderList.filter((o: any) => {
                const d = new Date(o.date || o.createdAt);
                return d.getMonth() === monthIndex && d.getFullYear() === actualYear && 
                       (o.senderId === user.id || o.senderName === user.name) && 
                       (o.status === 'Approved' || o.status === 'Completed' || o.status === 'Dispatched');
            }).reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0);

            // Filter Collections
            const monthlyColl = paymentList.filter((p: any) => {
                const d = new Date(p.date || p.createdAt);
                return d.getMonth() === monthIndex && d.getFullYear() === actualYear && 
                       (p.senderId === user.id || p.userName === user.name);
            }).reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0);

            return { month: m, sales: monthlySales, collection: monthlyColl };
        });

        setMonthlyStats(stats);
    };

    const handleCardClick = (item: any) => {
        setSelectedStaff(item);
        
        const allUserOrders = orderList.filter((o:any) => (o.senderId === item.id || o.senderName === item.name) && (o.status === 'Approved' || o.status === 'Completed' || o.status === 'Dispatched'));
        const allUserPayments = paymentList.filter((p:any) => (p.senderId === item.id || p.userName === item.name));

        setStaffOrders(allUserOrders.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setStaffPayments(allUserPayments.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        
        generateMonthlyStats(item);
        setDetailTab('Monthly'); 
        setDetailModalVisible(true);
    };

    const dropdownList = [{id: 'All', name: 'All Staff'}, ...userList];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>
                    <Text style={styles.headerTitle}>{isAdmin ? 'Team Performance' : 'My Performance'} 🚀</Text>
                </View>
                {isAdmin && (
                    <TouchableOpacity onPress={() => setShowUserPicker(true)}><Ionicons name="filter" size={24} color="white" /></TouchableOpacity>
                )}
            </View>

            <View style={styles.controlBar}>
                <View style={styles.toggleContainer}>
                    <TouchableOpacity style={[styles.toggleBtn, viewMode==='Month' && styles.activeToggle]} onPress={()=>setViewMode('Month')}>
                        <Text style={[styles.toggleText, viewMode==='Month' && {color:'#3b5998'}]}>Monthly</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.toggleBtn, viewMode==='Year' && styles.activeToggle]} onPress={()=>setViewMode('Year')}>
                        <Text style={[styles.toggleText, viewMode==='Year' && {color:'#3b5998'}]}>Yearly</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.dateNav}>
                    <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={20} color="#555" /></TouchableOpacity>
                    <Text style={styles.dateText}>{getDateLabel()}</Text>
                    <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={20} color="#555" /></TouchableOpacity>
                </View>
            </View>

            {/* Config Box (Only Admin sees config) */}
            {isAdmin && (
                <View style={styles.configBox}>
                    <Text style={styles.sectionTitle}>⚙️ Global Settings (Default)</Text>
                    <View style={styles.row}>
                        <View style={styles.inputWrap}>
                            <Text style={styles.label}>Default Target</Text>
                            <TextInput 
                                style={styles.input} 
                                keyboardType='numeric' 
                                value={rules.baseTarget} 
                                onChangeText={t=>setRules({...rules, baseTarget:t})}
                            />
                        </View>
                        <View style={styles.inputWrap}><Text style={styles.label}>Comm (%)</Text><TextInput style={styles.input} keyboardType='numeric' value={rules.tier1Percent} onChangeText={t=>setRules({...rules, tier1Percent:t})}/></View>
                        <View style={styles.inputWrap}><Text style={styles.label}>Boost (%)</Text><TextInput style={styles.input} keyboardType='numeric' value={rules.tier2Percent} onChangeText={t=>setRules({...rules, tier2Percent:t})}/></View>
                    </View>
                    <Text style={{fontSize:9, color:'gray', marginTop:5}}>* This target applies if user has no specific target in profile.</Text>
                </View>
            )}

            <FlatList 
                data={incentiveData}
                keyExtractor={item => item.id}
                contentContainerStyle={{padding: 15}}
                ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No Data Found.</Text>}
                renderItem={({item, index}) => (
                    <TouchableOpacity style={styles.card} onPress={() => handleCardClick(item)} activeOpacity={0.7}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:5}}>
                            <View style={{flexDirection:'row', alignItems:'center'}}>
                                {/* Rank Badge */}
                                {isAdmin && index < 3 && (
                                    <View style={[styles.rankBadge, {backgroundColor: index===0?'#FFD700': index===1?'#C0C0C0':'#CD7F32'}]}>
                                        <Text style={{fontSize:10, fontWeight:'bold', color:'white'}}>#{index+1}</Text>
                                    </View>
                                )}
                                <View>
                                    <Text style={styles.name}>{item.name} <Ionicons name="information-circle" size={14} color="#3b5998" /></Text>
                                    <Text style={styles.roleText}>{item.role}</Text>
                                </View>
                            </View>
                            <View style={{alignItems:'flex-end'}}>
                                {/* Custom Target Badge */}
                                {item.isCustomTarget ? (
                                    <View style={styles.customBadge}><Text style={styles.customText}>Custom Goal</Text></View>
                                ) : (
                                    <View style={[styles.customBadge, {backgroundColor:'#eee'}]}><Text style={[styles.customText, {color:'gray'}]}>Default</Text></View>
                                )}
                                <Text style={{fontSize:10, color:'gray', marginTop:2}}>Goal: ₹{(item.target/1000).toFixed(0)}k</Text>
                            </View>
                        </View>
                        
                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:5}}>
                            <View>
                                <Text style={styles.subText}>Sales</Text>
                                <Text style={styles.salesAmount}>₹{item.totalSales.toLocaleString()}</Text>
                            </View>
                            <View style={{alignItems:'flex-end'}}>
                                <Text style={styles.subText}>Incentive</Text>
                                <Text style={[styles.incentiveAmount, {color: item.incentive > 0 ? '#2e7d32' : '#d32f2f'}]}>₹{item.incentive.toLocaleString()}</Text>
                            </View>
                        </View>
                        
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, {width: `${Math.min(item.percentage, 100)}%` as any, backgroundColor: item.percentage >= 100 ? '#4caf50' : '#1976D2'}]} />
                        </View>
                        <Text style={styles.progressText}>{item.percentage.toFixed(0)}% Achieved</Text>
                        
                         <View style={styles.collectionStrip}>
                            <View style={{flexDirection:'row', alignItems:'center'}}>
                                <Ionicons name="wallet-outline" size={14} color="#555" />
                                <Text style={styles.collText}> Collection: </Text>
                                <Text style={{fontWeight:'bold', color:'#333'}}>₹{item.totalCollected.toLocaleString()}</Text>
                            </View>
                            <Text style={{fontSize:10, color:'#555'}}>Click for Report</Text>
                        </View>
                    </TouchableOpacity>
                )}
            />

            {/* DETAIL POPUP (Same as before) */}
            <Modal visible={detailModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.detailModalContent}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>{selectedStaff?.name}</Text>
                                <Text style={styles.modalSub}>{isAdmin ? 'Performance Report' : 'My Report'}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                                <Ionicons name="close-circle" size={30} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>

                        {/* Tabs */}
                        <View style={styles.tabContainer}>
                            <TouchableOpacity style={[styles.tab, detailTab==='Monthly' && styles.activeTab]} onPress={()=>setDetailTab('Monthly')}>
                                <Text style={[styles.tabText, detailTab==='Monthly' && styles.activeTabText]}>Monthly 📅</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tab, detailTab==='Orders' && styles.activeTab]} onPress={()=>setDetailTab('Orders')}>
                                <Text style={[styles.tabText, detailTab==='Orders' && styles.activeTabText]}>Orders ({staffOrders.length})</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tab, detailTab==='Collections' && styles.activeTab]} onPress={()=>setDetailTab('Collections')}>
                                <Text style={[styles.tabText, detailTab==='Collections' && styles.activeTabText]}>Coll. ({staffPayments.length})</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{paddingBottom:20}}>
                            {detailTab === 'Monthly' && (
                                <View>
                                    <View style={[styles.monthRow, {backgroundColor:'#eee', borderRadius:5, paddingVertical:8}]}>
                                        <Text style={[styles.monthText, {fontWeight:'bold'}]}>Month</Text>
                                        <Text style={[styles.monthValue, {fontWeight:'bold', color:'#1565c0'}]}>Sales</Text>
                                        <Text style={[styles.monthValue, {fontWeight:'bold', color:'#2e7d32'}]}>Collection</Text>
                                    </View>
                                    {monthlyStats.map((stat, idx) => (
                                        <View key={idx} style={styles.monthRow}>
                                            <Text style={styles.monthText}>{stat.month}</Text>
                                            <Text style={styles.monthValue}>{stat.sales > 0 ? `₹${(stat.sales/1000).toFixed(1)}k` : '-'}</Text>
                                            <Text style={styles.monthValue}>{stat.collection > 0 ? `₹${(stat.collection/1000).toFixed(1)}k` : '-'}</Text>
                                        </View>
                                    ))}
                                    <View style={{marginTop:15, padding:10, backgroundColor:'#e3f2fd', borderRadius:8}}>
                                        <Text style={{textAlign:'center', fontSize:12, color:'#1565c0'}}>Total Year Sales: ₹{monthlyStats.reduce((a,b)=>a+b.sales,0).toLocaleString()}</Text>
                                    </View>
                                </View>
                            )}

                            {detailTab === 'Orders' && (
                                staffOrders.length === 0 ? <Text style={styles.emptyText}>No Orders Found</Text> : 
                                staffOrders.map((order, index) => (
                                    <View key={index} style={styles.detailItem}>
                                        <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                            <Text style={styles.itemTitle}>{order.hospitalName || 'Unknown'}</Text>
                                            <Text style={styles.itemAmount}>₹{order.amount.toLocaleString()}</Text>
                                        </View>
                                        <Text style={styles.itemSub}>{formatDateShort(order.date)} • {order.status}</Text>
                                        {order.productDetails && <Text style={styles.itemProd}>{order.productDetails}</Text>}
                                    </View>
                                ))
                            )}

                            {detailTab === 'Collections' && (
                                staffPayments.length === 0 ? <Text style={styles.emptyText}>No Collections Found</Text> : 
                                staffPayments.map((pay, index) => (
                                    <View key={index} style={styles.detailItem}>
                                        <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                            <Text style={styles.itemTitle}>{pay.orgName || 'Unknown'}</Text>
                                            <Text style={styles.itemAmount}>₹{pay.amount.toLocaleString()}</Text>
                                        </View>
                                        <Text style={styles.itemSub}>{formatDateShort(pay.date)} • {pay.mode}</Text>
                                        {pay.orderRef && <Text style={{fontSize:10, color:'#e65100', marginTop:2}}>🔗 {pay.orderRef}</Text>}
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal visible={showUserPicker} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowUserPicker(false)}>
                    <View style={styles.pickerContent}>
                        <Text style={styles.pickerTitle}>Filter Staff</Text>
                        <ScrollView style={{maxHeight: 300}}>
                            {dropdownList.map((u) => (
                                <TouchableOpacity key={u.id} style={styles.pickerItem} onPress={() => { setSelectedUserId(u.id); setShowUserPicker(false); }}>
                                    <Text style={[styles.pickerText, selectedUserId === u.id && {color:'#3b5998', fontWeight:'bold'}]}>{u.name}</Text>
                                    {selectedUserId === u.id && <Ionicons name="checkmark" size={20} color="#3b5998" />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#3b5998', paddingTop: 50, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    
    controlBar: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, backgroundColor: 'white', elevation: 2 },
    toggleContainer: { flexDirection: 'row', backgroundColor: '#eee', borderRadius: 8, padding: 2 },
    toggleBtn: { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 6 },
    activeToggle: { backgroundColor: 'white', elevation: 2 },
    toggleText: { fontSize: 12, fontWeight: '600', color: 'gray' },
    dateNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: '#eee' },
    dateText: { marginHorizontal: 10, fontWeight: 'bold', color: '#333' },

    configBox: { backgroundColor: '#e3f2fd', margin: 10, padding: 10, borderRadius: 8, borderColor: '#90caf9', borderWidth: 1 },
    sectionTitle: { fontSize: 11, fontWeight: 'bold', color: '#1565c0', marginBottom: 8, textTransform:'uppercase' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    inputWrap: { width: '30%' },
    label: { fontSize: 10, color: '#555', marginBottom: 2 },
    input: { borderWidth: 1, borderColor: '#fff', borderRadius: 5, padding: 5, fontWeight: 'bold', color: '#333', backgroundColor: 'white', textAlign:'center' },

    card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginHorizontal: 10, marginBottom: 10, elevation: 2 },
    rankBadge: { width:20, height:20, borderRadius:10, justifyContent:'center', alignItems:'center', marginRight:8 },
    name: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    roleText: { fontSize: 12, color: 'gray' },
    customBadge: { backgroundColor: '#fff3e0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 2, alignSelf:'flex-end' },
    customText: { fontSize: 9, color: '#e65100', fontWeight: 'bold' },
    
    subText: { fontSize: 12, color: 'gray' },
    salesAmount: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    incentiveAmount: { fontSize: 20, fontWeight: 'bold' },

    progressBarBg: { height: 8, backgroundColor: '#eee', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#4caf50' },
    progressText: { fontSize: 10, color: 'gray', marginTop: 4, textAlign: 'right' },

    collectionStrip: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#f0f4c3', padding:6, borderRadius:5, marginTop:8 },
    collText: { fontSize:11, color:'#555' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    detailModalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    modalSub: { color: '#666', fontSize: 14 },
    
    tabContainer: { flexDirection: 'row', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
    activeTab: { borderBottomWidth: 3, borderBottomColor: '#3b5998' },
    tabText: { fontSize: 13, color: 'gray', fontWeight: '600' },
    activeTabText: { color: '#3b5998', fontWeight: 'bold' },

    detailItem: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
    itemTitle: { fontWeight: 'bold', fontSize: 14, color: '#333', maxWidth: '70%' },
    itemAmount: { fontWeight: 'bold', fontSize: 14, color: '#2e7d32' },
    itemSub: { fontSize: 12, color: '#666' },
    itemProd: { fontSize: 11, color: '#555', marginTop: 4, fontStyle: 'italic' },
    emptyText: { textAlign: 'center', marginTop: 30, color: 'gray' },

    monthRow: { flexDirection:'row', justifyContent:'space-between', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#f5f5f5' },
    monthText: { fontSize:14, color:'#333', flex:1 },
    monthValue: { fontSize:14, color:'#555', flex:1, textAlign:'right' },

    pickerContent: { backgroundColor: 'white', borderRadius: 10, padding: 20 },
    pickerTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#3b5998' },
    pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
    pickerText: { fontSize: 16, color: '#333' }
});