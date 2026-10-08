import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// 🔥 SAAS IMPORTS (kept only for isDbLoading UX)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 5: projects now via new backend API
import { listProjectsPage, ProjectPageFilters } from '../services/api/projects';
import { useServerPagedList } from '../hooks/useServerPagedList';
import { buildCacheKey } from '../utils/listCache';
import { isCurrentFy, periodRange, useDebounced } from '../utils/periodRange';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { PeriodTabs, StaffPeriodRow, TotalBar } from '../components/compact';

export default function ProjectsScreen() {
  const headerTop = useHeaderTop();
  const router = useRouter();
  
  const { currentUser } = useData(); 
  const { isDbLoading } = useSaaSDB();


  const [searchText, setSearchText] = useState('');

  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const allowedRoles = ['admin', 'manager', 'account', 'accountant', 'store', 'store keeper', 'hr', 'superadmin'];
  const userRole = currentUser?.role ? currentUser.role.toLowerCase() : '';
  const hasAccess = allowedRoles.includes(userRole);

  useEffect(() => {
      if (currentUser && !hasAccess) {
          Alert.alert("Access Denied", "You don't have permission to view Projects.");
          if (router.canGoBack()) {
              router.back();
          } else {
              router.replace('/');
          }
      }
  }, [currentUser, hasAccess]);

  // 🔥 PROJECTS — 20 per page from the server (a search looks across all dates, as before);
  // page 1 also brings the Running / Completed counts.
  const debouncedSearch = useDebounced(searchText.trim());
  const projectFilters = useMemo<ProjectPageFilters>(() => ({
      ...(debouncedSearch ? {} : periodRange(viewMode, currentDate)),
      search: debouncedSearch || undefined,
  }), [viewMode, currentDate, debouncedSearch]);
  const [statusCounts, setStatusCounts] = useState({ ongoing: 0, completed: 0 });
  const fetchProjectPage = useCallback(async (p: ProjectPageFilters & { page: number; limit: number }) => {
      const r = await listProjectsPage(p);
      if (r.counts) setStatusCounts(r.counts);
      return r;
  }, []);
  const isDefaultView = isCurrentFy(viewMode, currentDate) && !debouncedSearch;
  const {
      items: fullList,
      total: projectTotal,
      loading: projectsLoading,
      loadingMore: projectsLoadingMore,
      hasMore: projectsHasMore,
      loadMore: loadMoreProjects,
      refreshing: projectsRefreshing,
      refresh: refreshProjects,
      error: projectsError,
  } = useServerPagedList<ProjectPageFilters, any>({
      fetchPage: fetchProjectPage,
      filters: projectFilters,
      enabled: !!currentUser?.companyId && hasAccess,
      cacheKey: isDefaultView ? buildCacheKey('projects_page1_v1', currentUser?.companyId) : null,
  });

  if (!hasAccess) {
      return null; 
  }

  const getStatusColor = (status: string) => {
      if (status === 'Completed') return '#4caf50'; 
      if (status === 'Ongoing') return '#2196f3';   
      return '#ff9800'; 
  };

  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (viewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

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


  const renderProjectCard = ({ item }: any) => (
      <TouchableOpacity 
          style={styles.card} 
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
      <View style={[styles.header, { paddingTop: headerTop }]}>
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

      <View style={{backgroundColor:'white', paddingBottom:5}}>
          <View style={styles.searchContainer}>
              {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" style={{marginRight: 10}}/> : <Ionicons name="search" size={20} color="gray" style={{marginRight: 10}} />}
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
              <PeriodTabs value={viewMode} onChange={setViewMode} />
              <StaffPeriodRow
                  periodLabel={viewMode !== 'All' ? getHeaderDate() : undefined}
                  onPrev={() => changeDate(-1)}
                  onNext={() => changeDate(1)}
              />
            </>
          )}

          <View style={styles.summaryContainer}>
              <View style={[styles.summaryCard, {backgroundColor:'#e3f2fd'}]}>
                  <Text style={styles.summaryLabel}>Running</Text>
                  <Text style={styles.summaryValue}>
                      {statusCounts.ongoing}
                  </Text>
              </View>
              <View style={[styles.summaryCard, {backgroundColor:'#e8f5e9'}]}>
                  <Text style={styles.summaryLabel}>Completed</Text>
                  <Text style={styles.summaryValue}>
                      {statusCounts.completed}
                  </Text>
              </View>
          </View>

          <TotalBar label="Total Projects" count={projectTotal} />
      </View>

      <FlatList 
        data={fullList}
        refreshControl={<RefreshControl refreshing={projectsRefreshing} onRefresh={refreshProjects} colors={['#3b5998']} tintColor="#3b5998" />}
        keyExtractor={(item:any) => item.id.toString()} 
        contentContainerStyle={{padding: 15, paddingBottom: 50}}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                {(isDbLoading || projectsLoading) ? <ActivityIndicator size="large" color="#3b5998" /> : (
                    <>
                        <Ionicons name="business-outline" size={60} color="#ccc" />
                        <Text style={{color:'gray', marginTop:10}}>{projectsError ? 'Could not load projects — pull down to retry.' : 'No Projects Found.'}</Text>
                    </>
                )}
            </View>
        }
        renderItem={renderProjectCard}
        
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {projectsHasMore ? (
                    <TouchableOpacity
                        onPress={loadMoreProjects}
                        disabled={projectsLoadingMore}
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
                        {projectsLoadingMore ? <ActivityIndicator color="#3b5998" /> : (
                            <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({projectTotal - fullList.length} remaining)</Text>
                        )}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', elevation: 3 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 10 },
  addBtn: { flexDirection:'row', backgroundColor:'#212121', paddingHorizontal:12, paddingVertical:8, borderRadius:5, alignItems:'center' },
  addBtnText: { color:'white', fontWeight:'bold', marginLeft:5 },
  
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', marginHorizontal: 15, marginTop: 10, marginBottom: 5, paddingHorizontal: 15, borderRadius: 10, height: 45, borderWidth: 1, borderColor: '#90caf9' },
  searchInput: { flex: 1, fontSize: 15, color: '#1565c0', fontWeight: '500' },


  summaryContainer: { flexDirection: 'row', paddingHorizontal: 15, justifyContent: 'space-between', marginBottom: 5, marginTop: 5 },
  summaryCard: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', marginHorizontal: 5, elevation: 1 },
  summaryLabel: { fontSize: 12, color: '#555', fontWeight:'bold' },
  summaryValue: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 2 },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 11, marginBottom: 8, elevation: 2, marginHorizontal: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  projectName: { fontSize: 18, fontWeight: 'bold', color: '#333', flex:1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginLeft:5 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  clientName: { fontSize: 14, color: '#555', marginTop: 2 },
  location: { fontSize: 13, color: '#777', marginTop: 2 },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 7},
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 11, color: 'gray' },
  value: { fontSize: 16, fontWeight: 'bold', color: '#333' }
});
