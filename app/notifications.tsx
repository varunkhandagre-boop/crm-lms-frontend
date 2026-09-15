import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (Removed DataContext notification functions)
import { useData } from './context/DataContext';

// 🔥 Phase 9: notifications now come from Postgres via these adapters.
// Visibility (mine by recipientId, or broadcast to my role) is now
// server-enforced — the old client-side name/id/role string-matching
// (getMyNotifications) is gone, it's just the fetched list now.
import { fetchNotifications, markNotificationRead as markNotificationReadApi, markAllNotificationsRead } from '../services/api/notifications';

// Tab State Memory
let savedTabState = 'Unread'; 

export default function NotificationScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se sirf current user nikala
  const { currentUser } = useData();
  
  // 🔥 2. Local loading state (no more useSaaSDB here)
  const [isDbLoading, setIsDbLoading] = useState(true);

  // 🔥 3. Lazy Loaded States
  const [notificationList, setNotificationList] = useState<any[]>([]);

  const [filter, setFilter] = useState(savedTabState);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState(''); 

  // PAGINATION STATE
  const [visibleCount, setVisibleCount] = useState(20);

  // RESET PAGINATION ON FILTER CHANGE
  useEffect(() => {
      setVisibleCount(20);
  }, [filter, searchText]);

  // 🔥 4. LOAD DATA — Phase 9: fetches from Postgres, already scoped to me server-side
  const loadNotifications = async () => {
      if (!currentUser?.companyId) return;
      setIsDbLoading(true);
      try {
          const data = await fetchNotifications({ filter: 'all', limit: 200 });
          setNotificationList(data);
      } finally {
          setIsDbLoading(false);
      }
  };

  useEffect(() => {
      loadNotifications();
  }, [currentUser]);

  // 🔥 5. PULL TO REFRESH LOGIC
  const onRefresh = async () => {
      setRefreshing(true);
      await loadNotifications();
      setRefreshing(false);
  };

  const changeFilter = (newFilter: any) => {
      savedTabState = newFilter; 
      setFilter(newFilter);
      setSearchText(''); 
  };

  // Server already scopes the list to "mine" (recipientId=me OR recipientRole=my role) —
  // no client-side name/id/role matching needed anymore.
  let myData = [...notificationList];
  myData.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let displayList = myData;
  if (filter === 'Unread') displayList = myData.filter((item: any) => !item.read);
  if (filter === 'Read') displayList = myData.filter((item: any) => item.read);

  if (filter === 'All' && searchText.trim() !== '') {
      const query = searchText.toLowerCase().trim();
      
      displayList = displayList.filter((item: any) => {
          const title = (item.title || '').toLowerCase();
          const message = (item.message || '').toLowerCase();
          const type = (item.type || '').toLowerCase();
          const dateObj = new Date(item.createdAt);
          const dateStr = dateObj.toLocaleDateString('en-GB'); 
          
          return title.includes(query) || 
                 message.includes(query) || 
                 type.includes(query) || 
                 dateStr.includes(query);
      });
  }

  const renderedList = displayList.slice(0, visibleCount);

  // 🔥 6. Phase 9: PATCHes via markNotificationReadApi()
  const markNotificationRead = async (id: string) => {
      try {
          const res = await markNotificationReadApi(id);
          if (res.success) {
              setNotificationList(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
          }
      } catch (error) {
          console.log("❌ Notification update failed:", error);
      }
  };

  const handlePress = async (item: any) => {
      let targetRoute = item.route || item.screen;

      if (targetRoute === 'organization' || item.type === 'organization') targetRoute = '/organization'; 
      
      if (
          targetRoute === 'service_call' || 
          targetRoute === 'service_calls' || 
          item.title?.includes('Service Call')
      ) {
          targetRoute = '/service_call'; 
      }

      if (targetRoute === 'leads' || item.title?.includes('Lead')) targetRoute = '/leads';
      if (targetRoute === 'tasks' || item.title?.includes('Task')) targetRoute = '/tasks';

      if (!item.read) {
          item.read = true; // Optimistic UI update
          if(filter === 'Unread') {
             // Let it disappear smoothly
          }
          await markNotificationRead(item.id);
      }

      if (targetRoute) {
          try { 
              let cleanRoute = targetRoute;
              if (cleanRoute === '/visiting_cards') cleanRoute = '/visiting_card'; 
              if (!cleanRoute.startsWith('/')) cleanRoute = '/' + cleanRoute;
              router.push(cleanRoute as any); 
          } catch (e) { 
              console.log("Route error", e); 
          }
      }
  };

  // 🔥 7. Phase 9: single atomic bulk PATCH via markAllNotificationsRead()
  // (replaces the old client-side Promise.all of individual updates)
  const handleMarkAll = () => {
      if (displayList.length === 0) return;
      Alert.alert("Mark All Read", "Are you sure?", [
          { text: "Cancel", style: "cancel" },
          { text: "Yes", onPress: async () => {
              await markAllNotificationsRead();
              setNotificationList(prev => prev.map(n => ({ ...n, read: true })));
              Alert.alert("Success", "All notifications marked as read.");
          }}
      ]);
  };

  const formatTimeAgo = (isoString: any) => {
      if (!isoString) return 'Just now';
      const date = new Date(isoString);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (diffInSeconds < 60) return 'Just now';
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) return `${diffInHours}h ago`;
      const diffInDays = Math.floor(diffInHours / 24);
      return diffInDays === 1 ? 'Yesterday' : `${diffInDays}d ago`;
  };

  const getIconConfig = (type: any) => {
      switch(type) {
          case 'success': return { name: 'checkmark-circle', color: '#2E7D32', bg: '#E8F5E9' };
          case 'warning': return { name: 'warning', color: '#EF6C00', bg: '#FFF3E0' };
          case 'alert': return { name: 'alert-circle', color: '#C62828', bg: '#FFEBEE' };
          case 'info': return { name: 'information-circle', color: '#1565C0', bg: '#E3F2FD' };
          default: return { name: 'notifications', color: '#555', bg: '#F5F5F5' };
      }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backCircle}>
                <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        {filter === 'Unread' && displayList.length > 0 && (
            <TouchableOpacity onPress={handleMarkAll} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Mark all read</Text>
            </TouchableOpacity>
        )}
      </View>

      {/* TABS */}
      <View style={styles.tabContainer}>
          {['Unread', 'All', 'Read'].map((tab) => (
            <TouchableOpacity 
                key={tab} 
                style={[styles.tab, filter === tab && styles.activeTab]} 
                onPress={() => changeFilter(tab)}
            >
                <Text style={[styles.tabText, filter === tab && styles.activeTabText]}>{tab}</Text>
                {tab === 'Unread' && myData.filter((n: any) => !n.read).length > 0 && 
                  <View style={styles.unreadDot} />
                }
            </TouchableOpacity>
          ))}
      </View>

      {/* SEARCH BAR */}
      {filter === 'All' && (
          <View style={styles.searchWrapper}>
              <View style={styles.searchBar}>
                  <Ionicons name="search" size={20} color="#666" style={{marginRight: 8}} />
                  <TextInput 
                      style={styles.searchInput}
                      placeholder="Search Hospital, City, Date..."
                      placeholderTextColor="#999"
                      value={searchText}
                      onChangeText={setSearchText}
                  />
                  {searchText.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchText('')}>
                          <Ionicons name="close-circle" size={18} color="#999" />
                      </TouchableOpacity>
                  )}
              </View>
          </View>
      )}
      
      {/* TOTAL COUNT INDICATOR */}
      {filter === 'All' && (
          <Text style={{textAlign:'right', paddingHorizontal:20, fontSize:12, color:'gray', marginBottom:5}}>
              Total: {displayList.length}
          </Text>
      )}

      {/* LIST */}
      <FlatList 
        data={renderedList}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
            <View style={styles.emptyBox}>
                {isDbLoading ? <ActivityIndicator size="large" color="#1A237E" /> : (
                    <>
                        <Ionicons name={searchText ? "search" : "notifications-off-outline"} size={60} color="#DDD" />
                        <Text style={styles.emptyText}>
                            {searchText ? `No match for "${searchText}"` : `No notifications in ${filter}`}
                        </Text>
                    </>
                )}
            </View>
        }
        renderItem={({ item }: any) => {
            const config = getIconConfig(item.type);
            
            return (
                <TouchableOpacity 
                    style={[styles.card, !item.read && styles.unreadCard]} 
                    onPress={() => handlePress(item)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.iconBox, {backgroundColor: config.bg}]}>
                        <Ionicons name={config.name as any} size={22} color={config.color} />
                    </View>
                    
                    <View style={styles.content}>
                        <View style={styles.cardHeader}>
                            <Text style={[styles.title, !item.read && styles.boldTitle]} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.time}>{formatTimeAgo(item.createdAt)}</Text>
                        </View>
                        <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
                        
                        {(item.route || item.screen) && (
                            <View style={styles.actionHint}>
                                <Text style={styles.actionHintText}>Tap to View</Text>
                                <Ionicons name="chevron-forward" size={12} color="#1A237E" />
                            </View>
                        )}
                    </View>
                    
                    {!item.read && <View style={styles.newIndicator} />}
                </TouchableOpacity>
            );
        }}
        
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < displayList.length ? (
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
                            👇 Load More Notifications ({displayList.length - visibleCount} remaining)
                        </Text>
                    </TouchableOpacity>
                ) : (
                    displayList.length > 0 ? (
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
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  header: { backgroundColor: '#1A237E', padding: 20, paddingTop: 55, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: 25, borderBottomRightRadius: 25, elevation: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backCircle: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginLeft: 12 },
  clearBtn: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  clearBtnText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
  
  tabContainer: { flexDirection: 'row', backgroundColor: 'white', margin: 15, marginBottom: 5, borderRadius: 15, padding: 5, elevation: 2 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, flexDirection: 'row', justifyContent: 'center' },
  activeTab: { backgroundColor: '#1A237E' },
  tabText: { color: '#666', fontWeight: 'bold', fontSize: 13 },
  activeTabText: { color: 'white' },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF5252', marginLeft: 5 },
  
  searchWrapper: { paddingHorizontal: 15, marginBottom: 5, marginTop: 5 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 12, height: 45, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },

  list: { padding: 15, paddingBottom: 30 },
  card: { flexDirection: 'row', padding: 15, backgroundColor: 'white', borderRadius: 18, marginBottom: 12, elevation: 2, alignItems: 'flex-start', position: 'relative', overflow: 'hidden' },
  unreadCard: { backgroundColor: '#F9FAFF', borderLeftWidth: 4, borderLeftColor: '#1A237E' },
  iconBox: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, marginLeft: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  title: { fontSize: 14, color: '#444', fontWeight: '500', flex: 1, marginRight: 5 },
  boldTitle: { fontWeight: 'bold', color: '#1A237E' },
  message: { color: '#666', fontSize: 13, lineHeight: 18 },
  time: { fontSize: 10, color: '#AAA', fontWeight: 'bold', minWidth: 50, textAlign: 'right' },
  actionHint: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  actionHintText: { fontSize: 11, color: '#1A237E', fontWeight: 'bold', marginRight: 4 },
  newIndicator: { position: 'absolute', top: 15, right: 15, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252' },
  emptyBox: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: '#AAA', marginTop: 15, fontSize: 14, fontWeight: '500' }
});
