import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useData } from './context/DataContext';

export default function ProjectsScreen() {
  const router = useRouter();
  const { user, projectList = [] } = useData(); 
  const [searchText, setSearchText] = useState('');

  // 🔥 PAGINATION STATE
  const [visibleCount, setVisibleCount] = useState(20);

  // 🔥 NEW STATES: FY Filter
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  // 🔒 SECURITY CHECK
  const allowedRoles = ['admin', 'manager', 'account', 'accountant', 'store', 'store keeper', 'hr'];
  const userRole = user?.role ? user.role.toLowerCase() : '';
  const hasAccess = allowedRoles.includes(userRole);

  useEffect(() => {
      if (user && !hasAccess) {
          Alert.alert("Access Denied", "You don't have permission to view Projects.");
          if (router.canGoBack()) {
              router.back();
          } else {
              router.replace('/');
          }
      }
  }, [user, hasAccess]);

  useEffect(() => {
      setVisibleCount(20);
  }, [searchText, viewMode, currentDate]);

  if (!hasAccess) {
      return null; 
  }

  const getStatusColor = (status: string) => {
      if (status === 'Completed') return '#4caf50'; 
      if (status === 'Ongoing') return '#2196f3';   
      return '#ff9800'; 
  };

  // 🔥 DATE PARSER
  const parseDate = (dateStr: any) => {
      if (!dateStr) return 0;
      if (typeof dateStr === 'number') return dateStr;
      if (dateStr instanceof Date) return dateStr.getTime();
      if (typeof dateStr === 'string') {
          if (dateStr.includes('T')) return new Date(dateStr).getTime();
          if (dateStr.includes('-')) return new Date(dateStr).getTime();
          if (dateStr.includes('/')) {
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
              }
          }
      }
      return new Date(dateStr).getTime();
  };

  // 🔥 FY Navigation
  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (viewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  // 🔥 FY Header Text Logic
  const getHeaderDate = () => {
      if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (viewMode === 'FY') {
          const m = currentDate.getMonth(); 
          const y = currentDate.getFullYear();
          const startY = m >= 3 ? y : y - 1;
          return `FY ${startY.toString().slice(-2)}-${(startY + 1).toString().slice(-2)}`;
      }
      return "All Time";
  };

  // 🔥 SUPER SEARCH & DATE FILTER LOGIC
  const getFilteredProjects = () => {
      let data = Array.isArray(projectList) ? [...projectList] : [];

      if (searchText) {
          const lower = searchText.toLowerCase();
          data = data.filter((item: any) => 
              (item.name && item.name.toLowerCase().includes(lower)) ||
              (item.client && item.client.toLowerCase().includes(lower)) ||
              (item.location && item.location.toLowerCase().includes(lower)) ||
              (item.orgId && item.orgId.toLowerCase().includes(lower)) 
          );
      } else if (viewMode !== 'All') {
          const tYear = currentDate.getFullYear();
          const tMonth = currentDate.getMonth();
          const tDay = currentDate.getDate();

          const fyStartYear = tMonth >= 3 ? tYear : tYear - 1;
          let fyStartDate = new Date(fyStartYear, 3, 1).getTime(); // 1st April
          const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); // 31st March

          // 🔥 Apply App Launch Date (Jan 1, 2026) Limit
          const APP_LAUNCH_DATE = new Date(2026, 0, 1).getTime(); 
          if (fyStartDate < APP_LAUNCH_DATE) {
              fyStartDate = APP_LAUNCH_DATE;
          }

          data = data.filter((item: any) => {
              const dateField = item.createdAt || item.date;
              if (!dateField) return false;
              const ts = parseDate(dateField);
              if (ts === 0) return false;
              const itemDate = new Date(ts);
              const itemTime = itemDate.getTime();

              if (viewMode === 'Month') return itemDate.getFullYear() === tYear && itemDate.getMonth() === tMonth;
              if (viewMode === 'Day') return itemDate.getFullYear() === tYear && itemDate.getMonth() === tMonth && itemDate.getDate() === tDay;
              if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
              return true;
          });
      }

      data.sort((a: any, b: any) => {
          const dateA = parseDate(a.createdAt || a.date);
          const dateB = parseDate(b.createdAt || b.date);
          return dateB - dateA;
      });

      return data;
  };

  const fullList = getFilteredProjects(); 
  const renderedList = fullList.slice(0, visibleCount);

  // 🐛 FIX: `FlatList` renderItem method moved outside inline
  const renderProjectCard = ({ item }: any) => (
      <TouchableOpacity 
          style={styles.card} 
          // 🔥 Direct Query String का इस्तेमाल करेंगे ताकि ID हमेशा String फॉर्मेट में ही जाए
          onPress={() => router.push(`/project_details?id=${item.id}` as any)}
      >
          <View style={styles.cardHeader}>
              <Text style={styles.projectName}>{item.name}</Text>
              <View style={[styles.badge, {backgroundColor: getStatusColor(item.status)}]}>
                  <Text style={styles.badgeText}>{item.status}</Text>
              </View>
          </View>

          <Text style={styles.clientName}>🏢 {item.client}</Text>
          <Text style={styles.location}>📍 {item.location}</Text>

          <View style={styles.divider} />

          <View style={styles.row}>
              <View>
                  <Text style={styles.label}>Order Value</Text>
                  <Text style={styles.value}>
                      ₹ {(parseInt(item.totalValue) || 0).toLocaleString()}
                  </Text>
              </View>
              <View>
                  <Text style={styles.label}>Total Expense</Text>
                  <Text style={[styles.value, {color:'#d32f2f'}]}>
                      ₹ {(item.totalExpense ? parseInt(item.totalExpense) : 0).toLocaleString()}
                  </Text>
              </View>
          </View>
      </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Project Management</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_project' as any)}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={styles.addBtnText}>New Project</Text>
        </TouchableOpacity>
      </View>

      {/* 🔥 NEW FILTER UI STARTS */}
      <View style={{backgroundColor:'white', paddingBottom:5}}>
          {/* SEARCH BAR */}
          <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="gray" style={{marginRight: 10}} />
              <TextInput 
                  style={styles.searchInput} 
                  placeholder="Search Project, Client, City, ID..." 
                  value={searchText} 
                  onChangeText={setSearchText} 
              />
              {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}>
                      <Ionicons name="close-circle" size={20} color="gray" />
                  </TouchableOpacity>
              )}
          </View>

          {!searchText && (
            <>
              {/* TABS */}
              <View style={styles.tabContainer}>
                  {['Day', 'Month', 'FY', 'All'].map((m) => (
                      <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                          <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                      </TouchableOpacity>
                  ))}
              </View>

              {/* DATE NAVIGATOR */}
              {viewMode !== 'All' && (
                  <View style={styles.dateNav}>
                      <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                      <Text style={styles.monthText}>{getHeaderDate()}</Text>
                      <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
                  </View>
              )}
            </>
          )}

          {/* SUMMARY CARDS */}
          <View style={styles.summaryContainer}>
              <View style={[styles.summaryCard, {backgroundColor:'#e3f2fd'}]}>
                  <Text style={styles.summaryLabel}>Running</Text>
                  <Text style={styles.summaryValue}>
                      {fullList ? fullList.filter((p:any) => p.status === 'Ongoing').length : 0}
                  </Text>
              </View>
              <View style={[styles.summaryCard, {backgroundColor:'#e8f5e9'}]}>
                  <Text style={styles.summaryLabel}>Completed</Text>
                  <Text style={styles.summaryValue}>
                      {fullList ? fullList.filter((p:any) => p.status === 'Completed').length : 0}
                  </Text>
              </View>
          </View>

          <Text style={{textAlign:'right', paddingHorizontal: 15, fontSize:12, color:'gray', marginBottom: 5}}>
              Total Projects: <Text style={{fontWeight:'bold', color:'#333'}}>{fullList.length}</Text>
          </Text>
      </View>

      {/* PROJECT LIST */}
      <FlatList 
        data={renderedList}
        keyExtractor={(item:any) => item.id.toString()} 
        contentContainerStyle={{padding: 15, paddingBottom: 50}}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                <Ionicons name="business-outline" size={60} color="#ccc" />
                <Text style={{color:'gray', marginTop:10}}>No Projects Found.</Text>
            </View>
        }
        renderItem={renderProjectCard}
        
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < fullList.length ? (
                    <TouchableOpacity 
                        onPress={() => setVisibleCount(prev => prev + 20)} 
                        style={{
                            padding: 12, 
                            backgroundColor: '#fff', 
                            alignItems: 'center', 
                            marginVertical: 10, 
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#ddd',
                            elevation: 1
                        }}
                    >
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                            👇 Load More Records ({fullList.length - visibleCount} remaining)
                        </Text>
                    </TouchableOpacity>
                ) : (
                    fullList.length > 0 ? (
                        <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                            --- End of List ---
                        </Text>
                    ) : null
                )}
            </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 3 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 10 },
  addBtn: { flexDirection:'row', backgroundColor:'#212121', paddingHorizontal:12, paddingVertical:8, borderRadius:5, alignItems:'center' },
  addBtnText: { color:'white', fontWeight:'bold', marginLeft:5 },
  
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', marginHorizontal: 15, marginTop: 10, marginBottom: 5, paddingHorizontal: 15, borderRadius: 10, height: 45, borderWidth: 1, borderColor: '#90caf9' },
  searchInput: { flex: 1, fontSize: 15, color: '#1565c0', fontWeight: '500' },

  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', marginHorizontal: 15, borderRadius: 8, padding: 2, marginBottom: 5 },
  tab: { flex: 1, paddingVertical: 5, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 5, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  summaryContainer: { flexDirection: 'row', paddingHorizontal: 15, justifyContent: 'space-between', marginBottom: 5, marginTop: 5 },
  summaryCard: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', marginHorizontal: 5, elevation: 1 },
  summaryLabel: { fontSize: 12, color: '#555', fontWeight:'bold' },
  summaryValue: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 2 },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2, marginHorizontal: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  projectName: { fontSize: 18, fontWeight: 'bold', color: '#333', flex:1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginLeft:5 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  clientName: { fontSize: 14, color: '#555', marginTop: 2 },
  location: { fontSize: 13, color: '#777', marginTop: 2 },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 11, color: 'gray' },
  value: { fontSize: 16, fontWeight: 'bold', color: '#333' }
});