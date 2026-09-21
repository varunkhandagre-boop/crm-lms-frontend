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
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCompanyProfile } from '../services/api/companies';
import { fetchHomeSummary, HomeSummary } from '../services/api/homeSummary';
import { useData } from './context/DataContext';
// 🔥 Cache-first dashboard summary (see hooks/useCachedObject.ts)
import { useCachedObject } from '../hooks/useCachedObject';
import { buildCacheKey } from '../utils/listCache';

// NOTIFICATION IMPORTS
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { fetchNotifications } from '../services/api/notifications';
import { savePushTokenToBackend } from '../services/api/users';
import { auth, db } from './../firebaseConfig';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
  }),
});

export default function HomeScreen() {
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
          if (currentUser) { setCheckedOnboarding(true); return; }
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

      // Best-effort: also keep the Firestore copy in sync for legacy
      // Firebase-linked users, since some not-yet-migrated features may
      // still read pushToken from there. Silently skipped for Postgres-only
      // sessions (no Firebase auth to write with — would always fail).
      if (!auth.currentUser) return;
      try {
          const userRef = doc(db, "users", currentUser.id);
          await setDoc(userRef, { pushToken: token }, { merge: true });
      } catch (e) { 
          console.log("❌ Error saving token to Firestore:", e); 
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

  const canSee = (moduleKey: string) => {
    if (!currentUser?.role) return false; 
    
    if (moduleKey === 'common') return true;

    const myRole = currentUser.role.toLowerCase().trim();

    if (myRole === 'admin' || myRole === 'superadmin') return true; 
    
    let userRoleKey = 'Sales Executive'; 
    if (myRole.includes('sales')) userRoleKey = 'Sales Executive';
    else if (myRole.includes('engineer') || myRole.includes('service')) userRoleKey = 'Service Engineer';
    else if (myRole.includes('account')) userRoleKey = 'Accountant';
    else if (myRole.includes('store') || myRole.includes('back office')) userRoleKey = 'Store Keeper';
    else if (myRole.includes('hr')) userRoleKey = 'Hr';
    else if (myRole.includes('manager')) userRoleKey = 'Manager';
    else userRoleKey = currentUser.role;

    const rolePerms = appPermissions?.[userRoleKey] || {};
    const userSpecificPerms = appPermissions?.[currentUser.id] || appPermissions?.[currentUser.email] || {};

    if (userSpecificPerms[moduleKey] !== undefined) {
        return userSpecificPerms[moduleKey] === true; 
    }
    
    return rolePerms[moduleKey] === true; 
  };
  
  const sidebarItems = [
      { id: '999', title: 'Super Admin Panel', icon: 'globe', route: '/superadmin/super_admin', module: 'superadmin_only' },      
      { id: '1', title: 'Serial Number', icon: 'pricetag', route: '/serial_number', module: 'asset_history' }, 
      { id: '7', title: 'Attendance Report', icon: 'person', route: '/attendance', module: 'attendance' },
      { id: '5', title: 'Spare Part Book', icon: 'book', route: '/spare_parts', module: 'spares' },
      { id: '100', title: 'Product Master', icon: 'cube', route: '/product_master', module: 'catalogs' },
      { id: '96', title: 'Personal Notes', icon: 'journal', route: '/personal_notes', module: 'personal_notes' },
      { id: '99', title: 'Sales Calculation', icon: 'calculator', route: '/sales_team_report', module: 'sales_team_report' },
      { id: '93', title: 'Activity Timeline', icon: 'time', route: '/employee_timeline', module: 'users' },
      { id: '103', title: 'Messaging Center', icon: 'chatbubbles', route: '/messaging_center', module: 'company_profile' },
      { id: '91', title: 'Payroll', icon: 'cash', route: '/payroll', module: 'payroll' },
      { id: '92', title: 'Admin Control', icon: 'settings', route: '/manage_team', module: 'users' },
      { id: '101', title: 'Automation Settings', icon: 'chatbubbles', route: '/automation_settings', module: 'company_profile' },
      { id: '90', title: 'Company Profile', icon: 'business', route: '/company_profile', module: 'company_profile' },
      { id: '102', title: 'Help & Support', icon: 'help-circle', route: '/help_support', module: 'common' },       
  ];

  const allHrItems = [
      { title: "Attendance", icon: "finger-print", color: "#4caf50", route: '/dayin', module: 'attendance' },
      { title: "Travel Log", icon: "bicycle", color: "#ff9800", route: '/travel', module: 'travel' },
      { title: "Advance", icon: "wallet", color: "#9c27b0", route: '/advance', count: pendingAdvanceCount, module: 'advance' },
      { title: "Expenses", icon: "receipt", color: "#f44336", route: '/expense', count: pendingExpenseCount, module: 'expenses' },
      { title: "Leaves", icon: "calendar", color: "#2196f3", route: '/leave', module: 'leave', count: pendingLeaveCount },
      { title: "Cards", icon: "card", color: "#795548", route: '/visiting_card', module: 'common', count: pendingCardCount }, 
      { title: "Courier", icon: "cube", color: "#e67e22", route: '/courier', count: pendingCourierCount, module: 'courier' },
      { title: "Task List", icon: "checkbox", color: "#e91e63", route: '/tasks', count: pendingTaskCount, module: 'dashboard' }, 
  ];

  const allActivityItems = [
      { title: "Visits DSR", icon: "briefcase", color: "#3b5998", route: '/sales', count: salesFollowUpCount, module: 'visits' },
      { title: "Installation", icon: "construct", color: "#795548", route: '/installation', count: todayInstallCount, module: 'installation' },
      { title: "Demo Report", icon: "play-circle", color: "#00bcd4", route: '/demo', count: todayDemoCount, module: 'demos' },
      { title: "Service Call", icon: "settings", color: "#607d8b", route: '/service_call', count: pendingServiceCount, module: 'tickets' }, 
      { title: "PMS Report", icon: "shield-checkmark", color: "#4caf50", route: '/pms_schedule', count: pmsDueCount, module: 'pms' },
      { title: "Service Analysis", icon: "pie-chart", color: "#673ab7", route: '/service_analysis', module: 'service_reports' },
      { title: "Quotations", icon: "document-text", color: "#1565c0", route: '/quotations', module: 'quotations' },
      { title: "Project Report", icon: "business", color: "#607d8b", route: '/projects', module: 'organizations' } 
  ];
  
  const allSalesItems = [
      { title: "Order Booking", icon: "cart", color: "#ff9800", route: '/orders', count: pendingOrderCount, module: 'orders' },
      { title: "Dashboard", icon: "stats-chart", color: "#4caf50", route: '/sales_analysis', module: 'sales_analysis' },
      { title: "Collect Payment", icon: "cash", color: "#27ae60", route: '/payment_collection', count: todayPaymentCount, module: 'payment_coll' },
      { title: "Pending Dues", icon: "time", color: "#c0392b", route: '/payment_duelist', count: pendingDueCount, module: 'payment_due' },
  ];

  const filterItems = (items: any[]) => {
    return items.filter(i => {
        if (i.module === 'personal_notes') return true;
        if (i.module === 'superadmin_only') return currentUser?.role === 'SuperAdmin';
        return canSee(i.module);
    });
  };

  const visibleHR = filterItems(allHrItems);
  const visibleActivity = filterItems(allActivityItems);
  const visibleSales = filterItems(allSalesItems);
  const visibleSidebar = filterItems(sidebarItems);

  return (
      <View style={styles.container}>
          <View style={styles.header}>
              <TouchableOpacity onPress={() => setSidebarVisible(true)}><Ionicons name="menu" size={28} color="#333" /></TouchableOpacity>
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
                      {activeSection === 'HR' && (
                          <View style={styles.gridContainer}>
                              {visibleHR.map((item, index) => <MenuItem key={index} {...item} onPress={() => router.push(item.route as any)} />)}
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
                      {activeSection === 'Activity' && (
                          <View style={styles.gridContainer}>
                              {visibleActivity.map((item, index) => <MenuItem key={index} {...item} onPress={() => router.push(item.route as any)} />)}
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
                      {activeSection === 'Sales' && (
                          <View style={styles.gridContainer}>
                              {visibleSales.map((item, index) => <MenuItem key={index} {...item} onPress={() => router.push(item.route as any)} />)}
                          </View>
                      )}
                  </>
              )}
          </ScrollView>

          <Modal visible={sidebarVisible} transparent={true} animationType="slide">
              <View style={styles.modalOverlay}>
                  <View style={styles.sidebarContainer}>
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

const MenuItem = ({ title, icon, color, onPress, count }: any) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.iconCircle, {backgroundColor: color}]}>
          <Ionicons name={icon} size={24} color="white" />
          {count > 0 && <View style={styles.menuBadge}><Text style={styles.menuBadgeText}>{count}</Text></View>}
      </View>
      <Text style={styles.menuText} numberOfLines={2}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 15 : 50, backgroundColor: 'white', elevation: 4 },
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
  scrollContent: { padding: 15, paddingBottom: 150, flexGrow: 1 }, 
  dashboardBanner: { backgroundColor: '#3b5998', borderRadius: 12, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, elevation: 4 },
  bannerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  bannerSub: { color: '#e3f2fd', fontSize: 12, marginTop: 4 },
  accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 15, borderRadius: 10, marginTop: 10, elevation: 2 },
  activeHeader: { backgroundColor: '#3b5998' }, 
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginLeft: 10, color: '#333' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', backgroundColor:'#f9f9f9', padding: 10, borderBottomLeftRadius:10, borderBottomRightRadius:10, marginBottom:0 },
  menuItem: { width: '31%', alignItems: 'center', marginBottom: 5, marginRight: '2%' },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 8, elevation: 2, position:'relative' },
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
  sidebarContainer: { width: '75%', backgroundColor: 'white', padding: 20, paddingTop: 50, elevation: 5, justifyContent: 'space-between' },
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
