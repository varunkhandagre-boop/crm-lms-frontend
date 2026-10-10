import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    LayoutAnimation,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACTIVITY_ITEMS, HR_ITEMS, SALES_ITEMS, SIDEBAR_ITEMS } from '../constants/menuItems';
import { canSeeModule } from '../utils/menuAccess';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { fetchCompanyProfile } from '../services/api/companies';
import { fetchHomeSummary } from '../services/api/homeSummary';
import { useData } from './context/DataContext';
import { useHeaderTop } from '../hooks/useHeaderTop';

// 🔥 Cache-first dashboard summary (see hooks/useCachedObject.ts)
import { useCachedObject } from '../hooks/useCachedObject';
import { buildCacheKey } from '../utils/listCache';

// NOTIFICATION IMPORTS
import * as Device from 'expo-device';
import { Notifications } from '../utils/notificationsModule';
import { fetchNotifications } from '../services/api/notifications';
import { savePushTokenToBackend } from '../services/api/users';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
  }),
});

export default function HomeScreen() {
  const headerTop = useHeaderTop();
  const router = useRouter();
  
  const { 
    activeSection, setActiveSection, 
    currentUser, logout, 
    shouldOpenSidebar, setShouldOpenSidebar,
    appPermissions, companyProfile,
    loading
} = useData();

  // 🔥 DASHBOARD SUMMARY — cache-first (instant from AsyncStorage, then
  // background refresh). See hooks/useCachedObject.ts.
  const {
      data: summary,
      refresh: refreshSummary,
  } = useCachedObject({
      cacheKey: buildCacheKey('home_summary', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchHomeSummary,
  });
  const [planDaysLeft, setPlanDaysLeft] = useState<number | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false); 
  const [expoPushToken, setExpoPushToken] = useState('');
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  useFocusEffect(
    useCallback(() => {
        const loadData = async () => {
            // Logged out (this re-runs when currentUser becomes null while
            // Home is still mounted) — no token, so don't call the API.
            if (!currentUser?.companyId) return;

            // Dashboard summary — cache already shows the last-known
            // snapshot instantly; this just triggers a background refresh
            // whenever the home screen regains focus.
            refreshSummary();

            try {
                const profile = await fetchCompanyProfile();
                if (profile?.expiryDate) {
                    const expiry = new Date(profile.expiryDate);
                    const diff = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
                    setPlanDaysLeft(diff);
                }
            } catch (e) {}

            // Unread notification badge — refreshed whenever the home screen
            // regains focus (app open, tab switch back, nav back), instead of
            // a background setInterval poll.
            if (currentUser?.companyId) {
                try {
                    const unread = await fetchNotifications({ filter: 'unread' });
                    setUnreadCount(unread.length);
                } catch (e) {
                    // Badge staying at its last-known value on a transient
                    // error beats crashing the home screen.
                }
            }

            if (shouldOpenSidebar) { setSidebarVisible(true); setShouldOpenSidebar(false); }
        };
        loadData();
    }, [currentUser, shouldOpenSidebar])
);

const [unreadCount, setUnreadCount] = useState(0);

const [branding, setBranding] = useState({
      name: 'LMS',
      logo: null as string | null
  });

  useEffect(() => {
      const loadBranding = async () => {
          if (companyProfile?.shortName) {
              setBranding({
                  name: companyProfile.shortName,
                  logo: companyProfile.logoUrl || null
              });
          } else {
              try {
                  const savedProfile = await AsyncStorage.getItem('companyProfileLocal');
                  if (savedProfile) {
                      const parsed = JSON.parse(savedProfile);
                      setBranding({
                          name: parsed.shortName || 'LMS',
                          logo: parsed.logoUrl || null
                      });
                  }
              } catch (e) {}
          }
      };
      loadBranding();
  }, [companyProfile]);

  const getUserImage = () => {
      if (currentUser?.profileImage && currentUser.profileImage.startsWith('data:image')) {
          return { uri: currentUser.profileImage };
      }
      return null; 
  };

  // Badge counts — all sourced from the single /home/summary call now.
  const pendingTaskCount = summary?.taskCount ?? 0;
  const pendingDueCount = summary?.dueCount ?? 0;
  const pendingCourierCount = summary?.courierCount ?? 0;
  const pendingServiceCount = summary?.serviceCount ?? 0;
  const pmsDueCount = summary?.pmsDueCount ?? 0;
  const pendingLeadCount = summary?.leadCount ?? 0;
  const todayInstallCount = summary?.installCount ?? 0;
  const todayDemoCount = summary?.demoCount ?? 0;
  const todayPaymentCount = summary?.paymentCount ?? 0;
  const salesFollowUpCount = summary?.salesFollowUpCount ?? 0;
  const pendingLeaveCount = summary?.leaveCount ?? 0;
  const pendingExpenseCount = summary?.expenseCount ?? 0;
  const pendingAdvanceCount = summary?.advanceCount ?? 0;
  const pendingOrderCount = summary?.orderCount ?? 0;
  const pendingCardCount = summary?.cardCount ?? 0;

  const attendanceStatusMap: Record<string, { text: string; icon: string; color: string }> = {
      not_marked: { text: "Not Marked", icon: "ellipse-outline", color: "#FFCC80" },
      checked_in: { text: "Logged In", icon: "time", color: "#A5D6A7" },
      checked_out: { text: "Logged Out", icon: "checkmark-circle", color: "#EF9A9A" },
  };
  const { text: statusText, icon: statusIcon, color: statusColor } = attendanceStatusMap[summary?.attendanceStatus ?? 'not_marked'];

  let dashboardLabel = "Follow-ups";
  let dashboardCount = salesFollowUpCount; 

  const myRoleStr = (currentUser?.role || '').toLowerCase();

  if (myRoleStr.includes('store')) {
      dashboardLabel = "Pending Courier";
      dashboardCount = pendingCourierCount;
  } 
  else if (myRoleStr.includes('account')) {
      dashboardLabel = "Pending Dues";
      dashboardCount = pendingDueCount;
  } 
  else if (myRoleStr.includes('service') || myRoleStr.includes('engineer')) {
      dashboardLabel = "Open Tickets";
      dashboardCount = pendingServiceCount;
  }

  useEffect(() => {
      const checkOnboarding = async () => {
          // The intro slides are for the phone app; the web version goes straight to login.
          if (currentUser || Platform.OS === 'web') { setCheckedOnboarding(true); return; }
          try {
              const seen = await AsyncStorage.getItem('hasSeenOnboarding');
              if (seen !== 'true') {
                  router.replace('/onboarding' as any);
                  return;
              }
          } catch (e) {}
          setCheckedOnboarding(true);
      };
      checkOnboarding();
  }, [currentUser]);

    useEffect(() => {
      if (!checkedOnboarding || loading) return; // wait for DataContext to finish checking both Firebase and Postgres sessions
      const timer = setTimeout(() => { if (!currentUser) router.replace('/login' as any); }, 100);
      return () => clearTimeout(timer);
  }, [currentUser, checkedOnboarding, loading]);

  useEffect(() => {
      if(currentUser) {
          registerForPushNotificationsAsync().then(token => {
              if (token) { setExpoPushToken(token); saveTokenToDatabase(token); }
          });
      }
  }, [currentUser]);

const saveTokenToDatabase = async (token: string) => {
      if (!currentUser?.id) return;

      // Always save to Postgres now — works for every user regardless of
      // whether they also have a Firebase session.
      try {
          await savePushTokenToBackend(token);
      } catch (e) {
          console.log("❌ Error saving token to backend:", e);
      }

};

  async function registerForPushNotificationsAsync() {
      let token;
      if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
              name: 'default',
              importance: Notifications.AndroidImportance.MAX,
              vibrationPattern: [0, 250, 250, 250],
              lightColor: '#FF231F7C',
          });
      }
      if (Device.isDevice) {
          const { status: existingStatus } = await Notifications.getPermissionsAsync();
          let finalStatus = existingStatus;
          if (existingStatus !== 'granted') {
              const { status } = await Notifications.requestPermissionsAsync();
              finalStatus = status;
          }
          if (finalStatus !== 'granted') return;
          const projectId = "fabfded8-69a3-4648-9d6f-63e2a0c5f618"; 
          try { token = (await Notifications.getExpoPushTokenAsync({ projectId })).data; } catch (e) { console.log("Token error:", e); }
      } 
      return token;
  }
  
  const isDesktop = useIsDesktop();

  const handleSidebarNavigate = (route: string) => {
      setShouldOpenSidebar(true); setSidebarVisible(false); router.push(route as any);
  };

  if (!currentUser || !checkedOnboarding) return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><ActivityIndicator size="large" color="#3b5998" /></View>;

  const toggleSection = (section: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setActiveSection(activeSection === section ? '' : section);
  };

  const handleLogout = () => {
      Alert.alert("Logout", "Are you sure?", [{ text: "Cancel" }, { text: "Logout", onPress: () => { setSidebarVisible(false); logout(); router.replace('/login' as any); }}]);
  };

  const canSee = (moduleKey: string) => canSeeModule(moduleKey, { currentUser, companyProfile, appPermissions });

  // Badge counts by screen; the items themselves live in constants/menuItems.ts.
  const countByRoute: Record<string, number> = {
      '/advance': pendingAdvanceCount, '/expense': pendingExpenseCount, '/leave': pendingLeaveCount,
      '/visiting_card': pendingCardCount, '/courier': pendingCourierCount, '/tasks': pendingTaskCount,
      '/sales': salesFollowUpCount, '/installation': todayInstallCount, '/demo': todayDemoCount,
      '/service_call': pendingServiceCount, '/pms_schedule': pmsDueCount,
      '/orders': pendingOrderCount, '/payment_collection': todayPaymentCount, '/payment_duelist': pendingDueCount,
  };
  const withCounts = (items: typeof HR_ITEMS) => items.map((i) => ({ ...i, count: countByRoute[i.route] }));
  const allHrItems = withCounts(HR_ITEMS);
  const allActivityItems = withCounts(ACTIVITY_ITEMS);
  const allSalesItems = withCounts(SALES_ITEMS);
  const sidebarItems = SIDEBAR_ITEMS.map((i) => ({ ...i, id: i.id || i.route }));
  const filterItems = (items: any[]) => items.filter((i) => canSee(i.module));

  const visibleHR = filterItems(allHrItems);
  const visibleActivity = filterItems(allActivityItems);
  const visibleSales = filterItems(allSalesItems);
  const visibleSidebar = filterItems(sidebarItems);

  return (
      <View style={styles.container}>
          <View style={[styles.header, { paddingTop: headerTop }]}>
              {isDesktop
                  ? <View style={{ width: 28 }} /> /* desktop: the menu is always on the left */
                  : <TouchableOpacity onPress={() => setSidebarVisible(true)}><Ionicons name="menu" size={28} color="#333" /></TouchableOpacity>}
              <View style={{flexDirection:'row', alignItems:'center'}}>
                  {branding.logo ? (
                      <Image source={{ uri: branding.logo }} style={{width: 40, height: 40, resizeMode:'contain', marginRight: 10}} />
                  ) : (
                      <Image source={require('../assets/images/icon.png')} style={{width: 40, height: 40, resizeMode:'contain', marginRight: 10}} />
                  )}
                  <Text style={styles.headerTitle}>{branding.name}</Text>
              </View>
              <View style={{flexDirection:'row', alignItems:'center'}}>
                  <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications' as any)}>
                      <Ionicons name="notifications-outline" size={26} color="#333" />
                        {unreadCount > 0 && (
                            <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#e74c3c', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                                <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                            </View>
                        )}
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={() => router.push('/profile')}>
                        <View style={styles.headerAvatar}>
                          {getUserImage() 
                              ? <Image source={getUserImage()!} style={{width: 35, height: 35, borderRadius: 20}} /> 
                              : <Text style={{color:'white', fontWeight:'bold'}}>{currentUser.name.charAt(0)}</Text>
                          }
                        </View>
                  </TouchableOpacity>
              </View>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.dashboardBanner} onPress={() => router.push('/dashboard' as any)}>
                  <View>
                      <Text style={styles.bannerTitle}>Live Dashboard</Text>
                      <Text style={styles.bannerSub}>Tasks: {pendingTaskCount} | {dashboardLabel}: {dashboardCount}</Text>
                        <View style={{
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            backgroundColor: 'rgba(255,255,255,0.2)', 
                            paddingHorizontal: 8, 
                            paddingVertical: 4, 
                            borderRadius: 12,
                            marginTop: 8,
                            alignSelf: 'flex-start'
                        }}>
                            <Ionicons name={statusIcon as any} size={14} color={statusColor} />
                            <Text style={{color: statusColor, fontWeight: 'bold', fontSize: 12, marginLeft: 5}}>
                                {statusText}
                            </Text>
                        </View>
                  </View>
                  <Ionicons name="stats-chart" size={30} color="white" />
              </TouchableOpacity>
                            
              {visibleHR.length > 0 && (
                  <>
                      <TouchableOpacity style={[styles.accordionHeader, activeSection === 'HR' && styles.activeHeader]} onPress={() => toggleSection('HR')}>
                          <View style={{flexDirection:'row', alignItems:'center'}}>
                              <Ionicons name="people-circle" size={24} color={activeSection === 'HR' ? "white" : "#333"} />
                              <Text style={[styles.sectionTitle, activeSection === 'HR' && {color:'white'}]}> HR & Operations</Text>
                          </View>
                          <Ionicons name={activeSection === 'HR' ? "chevron-up" : "chevron-down"} size={20} color={activeSection === 'HR' ? "white" : "gray"} />
                      </TouchableOpacity>
                      {(isDesktop || activeSection === 'HR') && (
                          <View style={styles.gridContainer}>
                              {visibleHR.map((item, index) => <MenuItem key={index} {...item} desktop={isDesktop} onPress={() => router.push(item.route as any)} />)}
                          </View>
                      )}
                  </>
              )}

              {visibleActivity.length > 0 && (
                  <>
                      <TouchableOpacity style={[styles.accordionHeader, activeSection === 'Activity' && styles.activeHeader]} onPress={() => toggleSection('Activity')}>
                          <View style={{flexDirection:'row', alignItems:'center'}}>
                              <Ionicons name="folder-open" size={24} color={activeSection === 'Activity' ? "white" : "#333"} />
                              <Text style={[styles.sectionTitle, activeSection === 'Activity' && {color:'white'}]}> Activity Report</Text>
                          </View>
                          <Ionicons name={activeSection === 'Activity' ? "chevron-up" : "chevron-down"} size={20} color={activeSection === 'Activity' ? "white" : "gray"} />
                      </TouchableOpacity>
                      {(isDesktop || activeSection === 'Activity') && (
                          <View style={styles.gridContainer}>
                              {visibleActivity.map((item, index) => <MenuItem key={index} {...item} desktop={isDesktop} onPress={() => router.push(item.route as any)} />)}
                          </View>
                      )}
                  </>
              )}

              {visibleSales.length > 0 && (
                  <>
                      <TouchableOpacity style={[styles.accordionHeader, activeSection === 'Sales' && styles.activeHeader]} onPress={() => toggleSection('Sales')}>
                          <View style={{flexDirection:'row', alignItems:'center'}}>
                              <Ionicons name="bar-chart" size={24} color={activeSection === 'Sales' ? "white" : "#333"} />
                              <Text style={[styles.sectionTitle, activeSection === 'Sales' && {color:'white'}]}> Sales Analysis</Text>
                          </View>
                          <Ionicons name={activeSection === 'Sales' ? "chevron-up" : "chevron-down"} size={20} color={activeSection === 'Sales' ? "white" : "gray"} />
                      </TouchableOpacity>
                      {(isDesktop || activeSection === 'Sales') && (
                          <View style={styles.gridContainer}>
                              {visibleSales.map((item, index) => <MenuItem key={index} {...item} desktop={isDesktop} onPress={() => router.push(item.route as any)} />)}
                          </View>
                      )}
                  </>
              )}
          </ScrollView>

          <Modal visible={sidebarVisible} transparent={true} animationType="slide">
              <View style={styles.modalOverlay}>
                  <View style={[styles.sidebarContainer, { paddingTop: headerTop }]}>
                      <View style={styles.sidebarHeader}>
                          <TouchableOpacity onPress={() => { setSidebarVisible(false); router.push('/profile'); }}>
                              <View style={styles.sidebarAvatar}>
                                   {getUserImage() 
                                      ? <Image source={getUserImage()!} style={{width: 70, height: 70, borderRadius: 35}} /> 
                                      : <Text style={{fontSize:24, fontWeight:'bold', color:'white'}}>{currentUser.name.charAt(0)}</Text>
                                   }
                              </View>
                          </TouchableOpacity>
                          <Text style={styles.empId}>{currentUser.empId}</Text>
                          <Text style={styles.empName}>{currentUser.name}</Text>
                          <Text style={styles.empRole}>{currentUser.role}</Text>
                          {planDaysLeft !== null && planDaysLeft <= 30 && (
    <TouchableOpacity 
        onPress={() => { setSidebarVisible(false); router.push('/SubscriptionScreen' as any); }}
        style={{
            marginTop: 8,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: planDaysLeft <= 7 ? '#fdecea' : '#fff3cd',
            borderColor: planDaysLeft <= 7 ? '#d32f2f' : '#f57c00',
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 5,
        }}
    >
        <Ionicons name="warning" size={12} color={planDaysLeft <= 7 ? '#d32f2f' : '#f57c00'} />
        <Text style={{
            fontSize: 11, fontWeight: 'bold', marginLeft: 5,
            color: planDaysLeft <= 7 ? '#d32f2f' : '#856404'
        }}>
            {planDaysLeft <= 0 ? '⚠️ Plan Expired!' : `⏳ Plan: ${planDaysLeft} days left`}
        </Text>
    </TouchableOpacity>
)}
                      </View>
                      <FlatList 
                          data={visibleSidebar} 
                          keyExtractor={item => item.id}
                          renderItem={({item}) => (
                              <TouchableOpacity style={styles.sidebarItem} onPress={() => handleSidebarNavigate(item.route)}>
                                  <Ionicons name={item.icon as any} size={22} color="#3b5998" />
                                  <Text style={styles.sidebarItemText}>{item.title}</Text>
                              </TouchableOpacity>
                          )}
                          ListFooterComponent={() => <View></View>}
                      />
                      <TouchableOpacity style={styles.sidebarLogoutBtn} onPress={handleLogout}>
                          <Ionicons name="log-out-outline" size={24} color="white" />
                          <Text style={{color:'white', fontWeight:'bold', marginLeft:10}}>Logout</Text>
                      </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.modalTransparent} onPress={() => setSidebarVisible(false)} />
              </View>
          </Modal>
      </View>
  );
}

const MenuItem = ({ title, icon, color, onPress, count, desktop }: any) => (
  <TouchableOpacity style={[styles.menuItem, desktop && styles.menuItemDesktop]} onPress={onPress}>
      <View style={[styles.iconCircle, {backgroundColor: color}]}>
          <Ionicons name={icon} size={24} color="white" />
          {count > 0 && <View style={styles.menuBadge}><Text style={styles.menuBadgeText}>{count}</Text></View>}
      </View>
      <Text style={styles.menuText} numberOfLines={2}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, paddingBottom: 12, backgroundColor: 'white', elevation: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
  headerAvatar: { width: 35, height: 35, borderRadius: 20, backgroundColor:'#3b5998', justifyContent:'center', alignItems:'center', overflow:'hidden' },
  bellBtn: { marginRight: 15, position: 'relative' },
  badge: { 
      position: 'absolute', 
      top: -5, 
      right: -8, 
      backgroundColor: '#D32F2F', 
      borderRadius: 10, 
      minWidth: 18, 
      height: 18, 
      justifyContent: 'center', 
      alignItems: 'center',
      paddingHorizontal: 4 
  },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  scrollContent: { padding: 12, paddingBottom: 150, flexGrow: 1, paddingTop: 10 }, 
  dashboardBanner: { backgroundColor: '#3b5998', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, elevation: 4 },
  bannerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  bannerSub: { color: '#e3f2fd', fontSize: 12, marginTop: 4 },
  accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 13, borderRadius: 10, marginTop: 8, elevation: 2 },
  activeHeader: { backgroundColor: '#3b5998' }, 
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginLeft: 10, color: '#333' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', backgroundColor:'#f9f9f9', padding: 10, borderBottomLeftRadius:10, borderBottomRightRadius:10, marginBottom:0, paddingTop: 10, paddingBottom: 2 },
  menuItem: { width: '31%', alignItems: 'center', marginBottom: 4, marginRight: '2%' },
  menuItemDesktop: { width: 112, marginRight: 12, marginBottom: 10 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 6, elevation: 2, position:'relative' },
  menuText: { fontSize: 11, color: '#333', textAlign: 'center', fontWeight:'600', height: 30 },
  menuBadge: { 
      position: 'absolute', 
      top: -6, 
      right: -10, 
      backgroundColor: '#D32F2F', 
      minWidth: 22, 
      height: 20, 
      borderRadius: 10, 
      justifyContent: 'center', 
      alignItems: 'center', 
      borderWidth: 1.5, 
      borderColor: 'white',
      paddingHorizontal: 5 
  },
  menuBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  modalOverlay: { flex: 1, flexDirection: 'row' },
  sidebarContainer: { width: '75%', backgroundColor: 'white', padding: 20, elevation: 5, justifyContent: 'space-between' },
  modalTransparent: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sidebarHeader: { alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 20 },
  sidebarAvatar: { width: 70, height: 70, borderRadius: 35, backgroundColor:'#3b5998', justifyContent:'center', alignItems:'center', marginBottom: 10, overflow:'hidden' },
  empId: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  empName: { fontSize: 14, color: 'gray' },
  empRole: { fontSize: 14, color: 'orange', fontWeight:'bold', marginTop:5 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sidebarItemText: { marginLeft: 15, fontSize: 14, color: '#333', fontWeight: '500' },
  sidebarLogoutBtn: { flexDirection:'row', backgroundColor:'#d32f2f', padding:15, borderRadius:10, alignItems:'center', justifyContent:'center', marginBottom:20 },
});
