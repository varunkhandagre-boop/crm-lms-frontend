import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useData } from './context/DataContext';

export default function ActivityPlanScreen() {
  const router = useRouter();
  
  // 🔥 GET DATA FROM CONTEXT
  const { activityPlanList = [], updateActivityStatus, user } = useData();

  // STATES
  const [filter, setFilter] = useState<'Today' | 'Upcoming' | 'Completed' | 'All'>('Today');
  
  // POWER USER CHECK
  const canManage = user?.role === 'Admin' || user?.role === 'Manager' || user?.role === 'Account' || user?.role === 'Hr';

  // --- DATE HELPERS ---
  const getTodayFormatted = () => {
      const now = new Date();
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = now.getFullYear();
      return `${d}/${m}/${y}`; 
  };

  const parseDate = (dateStr: string) => {
      if (!dateStr || !dateStr.includes('/')) return new Date(0);
      const [d, m, y] = dateStr.split('/').map(Number);
      return new Date(y, m - 1, d);
  };

  // --- FILTER LOGIC ---
  const getFilteredData = () => {
      let data = Array.isArray(activityPlanList) ? [...activityPlanList] : [];

      if (!canManage && user?.uid) {
          data = data.filter((item: any) => item.senderId === user.uid);
      }

      const todayStr = getTodayFormatted();
      const todayDate = parseDate(todayStr).getTime();

      return data.filter((item: any) => {
          const itemDateStr = item.date || "";
          const itemDateTime = parseDate(itemDateStr).getTime();

          if (filter === 'All') return true;
          if (filter === 'Completed') return item.status === 'Completed';

          if (filter === 'Today') {
              return itemDateStr === todayStr && item.status !== 'Completed';
          }
          if (filter === 'Upcoming') {
              return itemDateTime > todayDate && item.status !== 'Completed';
          }
          return false;
      }).sort((a: any, b: any) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  };

  const displayList = getFilteredData();

  // --- ACTIONS ---
  const handleAction = (item: any) => {
      if (typeof updateActivityStatus !== 'function') {
          Alert.alert("Error", "Update function missing.");
          return;
      }

      if (item.status === 'Planned') {
          Alert.alert("Start Journey", "Are you reaching the location?", [
              { text: "Cancel", style: "cancel" },
              { text: "Yes", onPress: () => updateActivityStatus(item.id, 'Started') }
          ]);
      } 
      else if (item.status === 'Started') {
          handleCompletionRedirect(item);
      }
  };

  // 🔥 UPDATED REDIRECTION LOGIC (PMS, Service, Installation, Demo, Sales)
  const handleCompletionRedirect = (item: any) => {
      const note = (item.planningNotes || '').toLowerCase();
      const type = (item.type || ''); 

      // 🔥 IMPORTANT: Hum yahan Status 'Completed' nahi karenge.
      // Hum sirf ID bhejenge. User jab Form Save karega tab status complete hoga.
      
      const commonParams = {
          org: item.hospital,      // Auto-fill ke liye
          hospital: item.hospital, // Backup
          serial: item.serialNo,   // Agar serial planned tha
          activityId: item.id      // 🔥 Connection ID
      };

      // 1. INSTALLATION
      if (type.includes('Installation') || note.includes('install')) {
          router.push({ pathname: '/add_installation', params: commonParams } as any);
      } 
      // 2. PMS
      else if (type.includes('PMS') || note.includes('pms') || note.includes('maintenance')) {
          router.push({ pathname: '/add_pms', params: commonParams } as any);
      }
      // 3. DEMO
      else if (type.includes('Demo') || note.includes('demo')) {
          router.push({ pathname: '/add_demo', params: commonParams } as any);
      }
      // 4. SERVICE CALL
      else if (type.includes('Service')) {
          router.push({ pathname: '/add_service_call', params: commonParams } as any);
      } 
      // 5. SALES (Default)
      else {
          // Note: Check karein ki aapki file ka naam 'add_sales' hai ya 'add_sales_visit'
          router.push({ pathname: '/add_sales', params: commonParams } as any);
      }
  };

  const getStatusColor = (status: string) => {
      if(status === 'Planned') return '#ff9800';
      if(status === 'Started') return '#2196f3';
      if(status === 'Completed') return '#4caf50';
      return 'gray';
  };

  const renderItem = ({ item }: any) => (
      <View style={[styles.card, item.status === 'Completed' && {opacity: 0.7, borderLeftColor: '#4caf50'}]}>
          <View style={styles.cardHeader}>
              <View style={{flex:1}}>
                  <Text style={styles.hospitalName}>{item.hospital}</Text>
                  <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold'}}>📅 {item.date}</Text>
                  {canManage && <Text style={{fontSize:10, color:'gray'}}>👤 By: {item.senderName}</Text>}
              </View>
              <View style={[styles.statusBadge, {backgroundColor: getStatusColor(item.status)}]}>
                  <Text style={styles.statusText}>{item.status}</Text>
              </View>
          </View>
          
          <View style={styles.divider} />
          <Text style={styles.infoText}><Text style={styles.label}>Type: </Text>{item.type}</Text>
          <Text style={styles.infoText} numberOfLines={2}><Text style={styles.label}>Note: </Text>{item.planningNotes}</Text>

          {item.status !== 'Completed' && (
              <TouchableOpacity 
                  style={[styles.actionBtn, {backgroundColor: item.status === 'Started' ? '#e91e63' : '#3b5998'}]} 
                  onPress={() => handleAction(item)}
              >
                  <Ionicons name={item.status === 'Started' ? "checkmark-circle" : "play-circle"} size={18} color="white" />
                  <Text style={styles.btnText}>{item.status === 'Planned' ? 'Start Journey' : 'Complete & Report'}</Text>
              </TouchableOpacity>
          )}
      </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
             <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
             <Text style={styles.headerTitle}>Activity Plans</Text>
             <TouchableOpacity onPress={() => router.push('/add_activity' as any)}><Ionicons name="add-circle" size={32} color="#3b5998" /></TouchableOpacity>
        </View>

        <View style={styles.tabContainer}>
            {['Today', 'Upcoming', 'Completed', 'All'].map((tab) => (
                <TouchableOpacity key={tab} style={[styles.tab, filter === tab && styles.activeTab]} onPress={() => setFilter(tab as any)}>
                    <Text style={[styles.tabText, filter === tab && styles.activeTabText]}>{tab}</Text>
                </TouchableOpacity>
            ))}
        </View>
      </View>

      <FlatList 
        data={displayList}
        keyExtractor={item => item.id}
        contentContainerStyle={{padding: 15}}
        renderItem={renderItem}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:100}}>
                <Ionicons name="calendar-outline" size={50} color="#ccc" />
                <Text style={{color:'gray', marginTop:10}}>Nothing found in "{filter}" tab.</Text>
            </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: 'white', padding: 15, paddingTop: 50, elevation: 4 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom:15 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
  tabContainer: { flexDirection: 'row', backgroundColor:'#f0f0f0', borderRadius:8, padding:3 },
  tab: { flex:1, paddingVertical: 8, alignItems:'center', borderRadius: 6 },
  activeTab: { backgroundColor: '#3b5998' },
  tabText: { color: 'gray', fontWeight: '600', fontSize:12 },
  activeTabText: { color: 'white' },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#ff9800' },
  
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  
  hospitalName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  infoText: { fontSize: 13, color: '#444', marginBottom: 3 },
  label: { fontWeight: 'bold', color: '#777' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 8, marginTop: 10 },
  btnText: { color: 'white', fontWeight: 'bold', marginLeft: 8, fontSize: 14 }
});