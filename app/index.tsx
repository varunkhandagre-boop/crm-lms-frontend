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
import { useData } from './context/DataContext';
// Baki imports ke saath ise bhi add karein 👇
import AsyncStorage from '@react-native-async-storage/async-storage';

// NOTIFICATION IMPORTS
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './../firebaseConfig';

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
      taskList, leadList, pmsList, dueList, courierList, 
      serviceCallList, salesVisitList, attendanceList,
      appPermissions, notificationCount, companyProfile 
  } = useData();
  
  const [sidebarVisible, setSidebarVisible] = useState(false); 
  const [expoPushToken, setExpoPushToken] = useState('');
  // ... purana expoPushToken wala code ...

  // 👇👇 IS CODE BLOCK KO YAHAN PASTE KAREIN 👇👇
  
  // 🔥 DYNAMIC BRANDING STATE
  const [branding, setBranding] = useState({
      name: 'LMS', // Default Name
      logo: null
  });

  // Load Branding (Prefer Context, Fallback to Local Storage)
  useEffect(() => {
      const loadBranding = async () => {
          if (companyProfile?.shortName) {
              // Agar Context ready hai to wahan se lo
              setBranding({
                  name: companyProfile.shortName,
                  logo: companyProfile.logoUrl || null
              });
          } else {
              // Agar Internet slow hai, to Local Storage se lo
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

  // --- 🔥 HELPER: GET USER IMAGE ---
  const getUserImage = () => {
      if (currentUser?.profileImage && currentUser.profileImage.startsWith('data:image')) {
          return { uri: currentUser.profileImage };
      }
      return null; 
  };

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.slice(0, 7); 

  // --- 🔥 COUNTS LOGIC ---
  const pendingTaskCount = taskList ? taskList.filter((t:any) => {
      if (t.status !== 'Pending') return false;
      if (['Admin', 'Manager'].includes(currentUser?.role)) return true;
      return t.to === currentUser?.name;
  }).length : 0;

  const pendingDueCount = dueList ? dueList.filter((d:any) => d.status !== 'Collected').length : 0;

  const pendingCourierCount = courierList ? courierList.filter((c:any) => {
      if (c.status !== 'Pending') return false;
      const isLogisticsRole = ['Admin', 'Manager', 'Accountant', 'Store Keeper'].includes(currentUser?.role);
      if (isLogisticsRole) return true;
      const isMine = c.senderId === currentUser?.uid || (c.receiver && currentUser?.name && c.receiver.toLowerCase().includes(currentUser.name.toLowerCase()));
      return isMine;
  }).length : 0;

  const pendingServiceCount = serviceCallList ? serviceCallList.filter((s: any) => {
      const isStatusOpen = s.status === 'Open' || s.status === 'Assigned';
      if (!isStatusOpen) return false;
      if (['Admin', 'Manager'].includes(currentUser?.role)) return true;
      return s.senderId === currentUser?.uid || s.senderId === currentUser?.id;
  }).length : 0;

  const pmsDueCount = pmsList ? pmsList.filter((p:any) => {
      const isDue = p.nextServiceDate && p.nextServiceDate.startsWith(currentMonth) && p.status !== 'Done';
      if (!isDue) return false;
      if (['Admin', 'Manager'].includes(currentUser?.role)) return true;
      return p.senderId === currentUser?.uid;
  }).length : 0;

  const pendingLeadCount = leadList ? leadList.filter((l:any) => {
       const isToday = l.nextFollowUp === today && l.status !== 'Closed';
       if (!isToday) return false;
       if (['Admin', 'Manager'].includes(currentUser?.role)) return true;
       return l.senderId === currentUser?.uid;
  }).length : 0;

  const getSalesFollowUpCount = () => {
      const isBoss = ['Admin', 'Manager'].includes(currentUser?.role);
      const activeVisits = salesVisitList ? salesVisitList.filter((v:any) => {
          const outcome = (v.outcome || '').toLowerCase();
          const isClosed = outcome.includes('order closed') || outcome.includes('lost') || outcome.includes('not interested');
          const isMine = isBoss || v.senderId === currentUser?.uid;
          return !isClosed && isMine;
      }).length : 0;
      const activeLeads = leadList ? leadList.filter((l:any) => {
          const status = (l.status || '').toLowerCase();
          const isClosed = status.includes('converted') || status.includes('lost') || status.includes('drop');
          const isMine = isBoss || l.senderId === currentUser?.uid;
          return !isClosed && isMine;
      }).length : 0;
      return activeVisits + activeLeads;
  };
  const salesFollowUpCount = getSalesFollowUpCount();
  // 🔥 PENDING LEAVE COUNT
const pendingLeaveCount = useData().leaveList ? useData().leaveList.filter((l: any) => {
    const status = l.status || 'Pending';
    // Admin sabki dekhega, User sirf apni
    const isBoss = ['Admin', 'Manager', 'Hr'].includes(currentUser?.role);
    if (isBoss) return status === 'Pending';
    return status === 'Pending' && l.senderId === currentUser?.uid;
}).length : 0;

  // --- ⏰ LOGIC: TODAY'S ATTENDANCE STATUS ---
  const todayStr = new Date().toISOString().split('T')[0];
  const myEntry = attendanceList.find((a: any) => 
      a.date === todayStr && a.userName === currentUser?.name
  );

  let statusText = "Not Marked";
  let statusIcon = "ellipse-outline";
  let statusColor = "#FFCC80"; // Light Orange

  if (myEntry) {
      if (myEntry.outTime) {
          statusText = "Logged Out";
          statusIcon = "checkmark-circle";
          statusColor = "#EF9A9A"; // Light Red
      } else {
          statusText = "Logged In";
          statusIcon = "time";
          statusColor = "#A5D6A7"; // Light Green
      }
  }

  // --- 🔥 DASHBOARD TEXT LOGIC ---
  let dashboardLabel = "Follow-ups";
  let dashboardCount = salesFollowUpCount; 

  const myRole = (currentUser?.role || '').toLowerCase();

  if (myRole.includes('store')) {
      dashboardLabel = "Pending Courier";
      dashboardCount = pendingCourierCount;
  } 
  else if (myRole.includes('account')) {
      dashboardLabel = "Pending Dues";
      dashboardCount = pendingDueCount;
  } 
  else if (myRole.includes('service') || myRole.includes('engineer')) {
      dashboardLabel = "Open Tickets";
      dashboardCount = pendingServiceCount;
  }

  useEffect(() => {
      const timer = setTimeout(() => { if (!currentUser) router.replace('/login' as any); }, 100);
      return () => clearTimeout(timer);
  }, [currentUser]);

  useEffect(() => {
      if(currentUser) {
          registerForPushNotificationsAsync().then(token => {
              if (token) { setExpoPushToken(token); saveTokenToDatabase(token); }
          });
      }
  }, [currentUser]);

  const saveTokenToDatabase = async (token: string) => {
      if (!currentUser?.email) return;
      try {
          const emailKey = currentUser.email.toLowerCase();
          const userRef = doc(db, "users", emailKey);
          await updateDoc(userRef, { pushToken: token });
      } catch (e) { console.log("❌ Error saving token:", e); }
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
  
  useFocusEffect(useCallback(() => {
      if (shouldOpenSidebar) { setSidebarVisible(true); setShouldOpenSidebar(false); }
  }, [shouldOpenSidebar]));

  const handleSidebarNavigate = (route: string) => {
      setShouldOpenSidebar(true); setSidebarVisible(false); router.push(route as any);
  };

  if (!currentUser) return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><ActivityIndicator size="large" color="#3b5998" /></View>;

  const toggleSection = (section: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setActiveSection(activeSection === section ? '' : section);
  };

  const handleLogout = () => {
      Alert.alert("Logout", "Are you sure?", [{ text: "Cancel" }, { text: "Logout", onPress: () => { setSidebarVisible(false); logout(); router.replace('/login' as any); }}]);
  };

  const canSee = (moduleKey: string) => {
    // 1. Admin Sab Kuch Dekhega (God Mode)
    if (currentUser?.role === 'Admin') return true; 
    
    // 'common' modules sabko dikhenge
    if (moduleKey === 'common') return true;

    // 2. Role Mapping (🔥 FIX: Spelling & Case Mismatch Handle)
    // Sabse pehle role ko small letters me convert karo taaki matching aasan ho
    let rawRole = (currentUser?.role || '').toLowerCase(); 
    
    // Default fallback value
    let userRole = 'Sales Executive'; 

    // Ab Keywords check karke EXACT Database Key set karo
    if (rawRole.includes('sales')) {
        userRole = 'Sales Executive';
    } 
    else if (rawRole.includes('engineer') || rawRole.includes('service')) {
        userRole = 'Service Engineer';
    } 
    else if (rawRole.includes('account')) {
        userRole = 'Accountant';
    } 
    else if (rawRole.includes('store') || rawRole.includes('back office')) {
        userRole = 'Store Keeper';
    } 
    else if (rawRole.includes('hr')) {
        userRole = 'Hr';
    } 
    else if (rawRole.includes('manager')) {
        userRole = 'Manager';
    }
    // Agar koi aur role hai jo upar match nahi hua, to original role hi use karo (Capitalize karke)
    else if (currentUser?.role) {
        userRole = currentUser.role;
    }

    // ---------------------------------------------------------
    // 3. 🔥 MAIN UPDATE: MERGE LOGIC (Role + User)
    // ---------------------------------------------------------
    
    // Step A: Role (Group) ki permission nikalo
    // Ab 'userRole' wahi spelling hai jo Admin panel ne save ki hai
    const rolePerms = appPermissions?.[userRole] || {};

    // Step B: Specific User ki permission nikalo (ID ya Email se)
    const userSpecificPerms = appPermissions?.[currentUser?.id] || appPermissions?.[currentUser?.email] || {};

    // Step C: Check Final Permission
    // Logic: Agar User ke liye True/False set hai, to wo maano.
    if (userSpecificPerms[moduleKey] !== undefined) {
        return userSpecificPerms[moduleKey] === true; // User Override
    }

    // Agar User ke liye kuch nahi set hai, to Role wala maano.
    return rolePerms[moduleKey] === true; 
};
  
  const sidebarItems = [
      // Web Key: "asset_history" (Machine Kundali)
      { id: '1', title: 'Serial Number', icon: 'pricetag', route: '/serial_number', module: 'asset_history' }, 
      
      // Web Key: "attendance"
      { id: '7', title: 'Attendance Report', icon: 'person', route: '/attendance', module: 'attendance' },
      
      // Web Key: "spares"
      { id: '5', title: 'Spare Part Book', icon: 'book', route: '/spare_parts', module: 'spares' },
      
      // Web Key: "catalogs" (Product Master ke liye catalogs use karein)
      { id: '100', title: 'Product Master', icon: 'cube', route: '/product_master', module: 'catalogs' },
      { id: '99', title: 'sales Calculation', icon: 'calculator', route: '/sales_team_report', module: 'sales_team_report' },
      { id: '90', title: 'Company Profile', icon: 'business', route: '/company_profile', module: 'company_profile' },
      { id: '92', title: 'Admin Control', icon: 'settings', route: '/manage_team', module: 'users' },       
  ];

  const allHrItems = [
      { title: "Attendance", icon: "finger-print", color: "#4caf50", route: '/dayin', module: 'attendance' },
      { title: "Travel Log", icon: "bicycle", color: "#ff9800", route: '/travel', module: 'travel' },
      { title: "Advance", icon: "wallet", color: "#9c27b0", route: '/advance', module: 'advance' },
      { title: "Expenses", icon: "receipt", color: "#f44336", route: '/expense', module: 'expenses' },
      { title: "Leaves", icon: "calendar", color: "#2196f3", route: '/leave', module: 'leave', count: pendingLeaveCount },
      
      // Cards ke liye shayad web me key nahi thi, filhal 'settings' ya 'common' rakhein
      { title: "Cards", icon: "card", color: "#795548", route: '/visiting_card', module: 'common' }, 
      
      { title: "Courier", icon: "cube", color: "#e67e22", route: '/courier', count: pendingCourierCount, module: 'courier' },
      
      // Tasks web list me nahi tha, ise 'dashboard' ya 'common' se link karein
      { title: "Task List", icon: "checkbox", color: "#e91e63", route: '/tasks', count: pendingTaskCount, module: 'dashboard' }, 
  ];

  const allActivityItems = [
      { title: "Visits DSR", icon: "briefcase", color: "#3b5998", route: '/sales', count: salesFollowUpCount, module: 'visits' },
      { title: "Installation", icon: "construct", color: "#795548", route: '/installation', module: 'installation' },
      { title: "Demo Report", icon: "play-circle", color: "#00bcd4", route: '/demo', module: 'demos' },
      
      // Web Key: "tickets" (Service Call ke liye)
      { title: "Service Call", icon: "settings", color: "#607d8b", route: '/service_call', count: pendingServiceCount, module: 'tickets' }, 
      
      { title: "PMS Report", icon: "shield-checkmark", color: "#4caf50", route: '/pms_schedule', count: pmsDueCount, module: 'pms' },
      
      // Web Key: "service_reports" (Analysis ke liye)
      { title: "Service Analysis", icon: "pie-chart", color: "#673ab7", route: '/service_analysis', module: 'service_reports' },
      
      // Projects Web list me nahi tha, filhal 'common' ya 'organizations' use karein
      { title: "Project Report", icon: "business", color: "#607d8b", route: '/projects', module: 'organizations' } 
  ];
  // ✅ SALES ITEMS (Is code ko paste karein)
  const allSalesItems = [
      // Web Key: "orders"
      { title: "Order Booking", icon: "cart", color: "#ff9800", route: '/orders', module: 'orders' },
      
      // Web Key: "sales_analysis"
      { title: "Dashboard", icon: "stats-chart", color: "#4caf50", route: '/sales_analysis', module: 'sales_analysis' },
      
      // Web Key: "payment_coll"
      { title: "Collect Payment", icon: "cash", color: "#27ae60", route: '/payment_collection', module: 'payment_coll' },
      
      // Web Key: "payment_due"
      { title: "Pending Dues", icon: "time", color: "#c0392b", route: '/payment_duelist', count: pendingDueCount, module: 'payment_due' },
      
  ];

  const filterItems = (items: any[]) => {
    return items.filter(i => canSee(i.module));
};

  const visibleHR = filterItems(allHrItems);
  const visibleActivity = filterItems(allActivityItems);
  const visibleSales = filterItems(allSalesItems);
  const visibleSidebar = filterItems(sidebarItems);

  return (
      <View style={styles.container}>
          <View style={styles.header}>
              <TouchableOpacity onPress={() => setSidebarVisible(true)}><Ionicons name="menu" size={28} color="#333" /></TouchableOpacity>
              {/* 🔥 UPDATED DYNAMIC HEADER LOGO */}
              <View style={{flexDirection:'row', alignItems:'center'}}>
                  {branding.logo ? (
                      <Image source={{ uri: branding.logo }} style={{width: 40, height: 40, resizeMode:'contain', marginRight: 10}} />
                  ) : (
                      <Image source={require('../assets/images/icon.png')} style={{width: 40, height: 40, resizeMode:'contain', marginRight: 10}} />
                  )}
                  {/* Ab yahan LMS nahi, balki apka Company Short Name dikhega */}
                  <Text style={styles.headerTitle}>{branding.name}</Text>
              </View>
              <View style={{flexDirection:'row', alignItems:'center'}}>
                  <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications' as any)}>
                      <Ionicons name="notifications-outline" size={26} color="#333" />
                      {notificationCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{notificationCount}</Text></View>}
                  </TouchableOpacity>
                  
                  {/* 🔥 CLICKABLE PROFILE AVATAR (Navigates to /profile) */}
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
                          {/* 🔥 CLICKABLE SIDEBAR AVATAR */}
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
                          ListFooterComponent={() => (
                                    <View>
                                                                            
                                    </View>
                                  )}
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
  badge: { position: 'absolute', top: -5, right: -5, backgroundColor: 'red', borderRadius: 10, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
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
  menuBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: 'red', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth:1.5, borderColor:'white' },
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