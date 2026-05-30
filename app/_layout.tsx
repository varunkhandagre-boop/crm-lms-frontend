import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { Slot, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DataProvider, useData } from './context/DataContext';

import * as Notifications from 'expo-notifications';
import { manageAttendanceReminders, setupNotificationPermissions } from '../utils/notificationHelper';

import * as Location from 'expo-location';
// 🔥 Firestore direct imports minimized

// 🔥 SAAS IMPORT
import { useSaaSDB } from '../hooks/useSaaSDB';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function Layout() {
  return (
    <DataProvider>
      <NavigationLayout />
    </DataProvider>
  );
}

// 🔥 BULLETPROOF NETWORK & FIREBASE INDICATOR 🔥
function NetworkIndicator() {
    const [isConnected, setIsConnected] = useState<boolean | null>(null);
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    
    const { isFirebaseSynced, currentUser } = useData(); 

    useEffect(() => {
        // 🔥 '(state: any)' add kar diya gaya hai TS error hatane ke liye
        const unsubscribe = NetInfo.addEventListener((state: any) => {
            setIsConnected(state.isConnected === false ? false : true);
        });
        return () => unsubscribe();
    }, []);

    if (pathname !== '/') return null;

    if (isConnected === false) {
        return (
            <View style={[styles.networkPill, { top: insets.top + 50 }]}>
                <View style={[styles.netDot, { backgroundColor: '#f44336' }]} />
                <Text style={styles.netText}>Offline</Text>
            </View>
        );
    }

    if (isConnected === true && currentUser && isFirebaseSynced === false) {
         return (
             <View style={[styles.networkPill, { top: insets.top + 50 }]}>
                 <ActivityIndicator size="small" color="#f57c00" style={{ marginRight: 6, transform: [{ scale: 0.6 }] }} />
                 <Text style={[styles.netText, { color: '#f57c00' }]}>Syncing...</Text>
             </View>
         );
    }

    return (
        <View style={[styles.networkPill, { top: insets.top + 50 }]}>
            <View style={[styles.netDot, { backgroundColor: '#4caf50' }]} />
            <Text style={styles.netText}></Text>
        </View>
    );
}

function NavigationLayout() {
  const router = useRouter();
  const pathname = usePathname();
  
  // 🔥 SAAS ENGINE HOOK INJECTED HERE
  const { addSaaSData } = useSaaSDB();

  const { 
      currentUser, 
      appPermissions, 
      loading, 
      attendanceList, 
      taskList = [],
      leadList = [],         
      serviceCallList = [],  
      orgList = []           
  } = useData();
  
  const insets = useSafeAreaInsets(); 

  useEffect(() => {
    let isMounted = true;

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      if (!isMounted) return;

      const data = response.notification.request.content.data as any;
      let targetPath = data?.route || data?.url || data?.screen || "";

      if (!targetPath) return; 

      if (typeof targetPath === 'string') {
          if (!targetPath.startsWith('/')) {
              targetPath = '/' + targetPath;
          }
      }

      setTimeout(() => {
          try {
              router.push(targetPath as any);
          } catch (error) {
              router.push('/');
          }
      }, 800); 
    });

    return () => {
        isMounted = false;
        subscription.remove();
    };
  }, []);

  const isBoss = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';
  const todayStr = new Date().toISOString().split('T')[0];

  const calculateTaskBadge = () => {
      if (!currentUser) return 0;
      const myPending = taskList.filter((t: any) => (t.to === 'Self' || t.to === currentUser?.name) && t.status === 'Pending').length;
      const assignedPending = taskList.filter((t: any) => t.from === currentUser?.name && t.to !== 'Self' && t.to !== currentUser?.name && t.status === 'Pending').length;
      return isBoss ? taskList.filter((t:any) => t.status === 'Pending').length : (myPending + assignedPending);
  };
  const taskCount = calculateTaskBadge();

  const leadCount = leadList.filter((l: any) => {
      if (l.status === 'Closed' || l.status === 'Converted') return false; 
      return isBoss || l.senderId === currentUser?.uid || l.userId === currentUser?.uid;
  }).length;

  const serviceCount = serviceCallList.filter((s: any) => {
      if (s.status !== 'Open' && s.status !== 'Assigned') return false;
      return isBoss || s.senderId === currentUser?.uid || s.engineerId === currentUser?.uid || s.engineerId === currentUser?.id;
  }).length;

  const orgCount = orgList.filter((o: any) => {
      const itemDate = o.createdAt ? o.createdAt.split('T')[0] : '';
      return itemDate === todayStr; 
  }).length;

  // ==========================================
  // 🕵️‍♂️ AUTO LOCATION TRACKER (🔥 UPGRADED TO SAAS)
  // ==========================================
  useEffect(() => {
    if (loading || !currentUser) return;

    let locationSubscription: any = null;
    let lastUpdateTimestamp = 0; 

    const startTracking = async () => {
        try {
            const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
            if (foreStatus !== 'granted') return;

            try {
                const { status: backStatus } = await Location.requestBackgroundPermissionsAsync();
                if (backStatus !== 'granted') console.log("Bg Permission denied");
            } catch (err) { }

            locationSubscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced, 
                    timeInterval: 5 * 60 * 1000,  
                    distanceInterval: 0           
                },
                async (loc) => {
                    const now = Date.now();
                    const THIRTY_MINUTES = 30 * 60 * 1000; 

                    if (lastUpdateTimestamp !== 0 && (now - lastUpdateTimestamp) < THIRTY_MINUTES) {
                        return; 
                    }

                    lastUpdateTimestamp = now;

                    try {
                        // 🔥 COMPANY ID ATTACHED USING addSaaSData INSTEAD OF addDoc
                        await addSaaSData("location_logs", {
                            userId: currentUser.email || currentUser.uid || currentUser.id,
                            userName: currentUser.name || "App User",
                            latitude: loc.coords.latitude,
                            longitude: loc.coords.longitude,
                            timestamp: new Date().toISOString(), // SaaS uses ISO strings easily
                            date: new Date().toISOString().split('T')[0],
                            time: new Date().toLocaleTimeString(),
                            type: "🟣 Auto-Track (30 min)", 
                            device: "App",
                            isStationary: true 
                        });
                    } catch (dbError) {
                        console.error("DB Error:", dbError);
                    }
                }
            );

        } catch (error) {
            console.error("Tracking Error:", error);
        }
    };

    startTracking();

    return () => {
        if (locationSubscription) {
            locationSubscription.remove();
        }
    };

  }, [currentUser, loading]);

  useEffect(() => {
    if (loading || !currentUser) return;

    const initReminders = async () => {
        await setupNotificationPermissions();
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const myEntry = attendanceList.find((a: any) => 
            a.date === todayStr && a.userName === currentUser.name
        );

        let status: any = 'LOGIN_PENDING';

        if (myEntry) {
            status = myEntry.outTime ? 'COMPLETED' : 'LOGGED_IN';
        }
        
        await manageAttendanceReminders(status);
    };

    initReminders();

  }, [attendanceList, currentUser, loading]);

  if (loading) {
     return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><ActivityIndicator size="large" color="#3b5998"/></View>;
  }

  const canSeeTab = (moduleKey: string) => {
      const userRole = currentUser?.role || 'Service Engineer';
      if (userRole === 'Admin' || userRole === 'SuperAdmin') return true;
      const myPerms = appPermissions?.[userRole];
      if (!myPerms) return true;
      return myPerms[moduleKey] === true;
  };

  const showNavBar = ['/', '/activity_plan', '/tasks', '/leads', '/service_call', '/organization'].includes(pathname);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="white" />
      
      {/* 🔥 GLOBAL NETWORK INDICATOR */}
      <NetworkIndicator />

      <View style={styles.content}>
        <Slot />
      </View>

      {/* BOTTOM NAVIGATION */}
      {showNavBar && (
        <View style={[styles.bottomNavContainer, { bottom: 20 + insets.bottom }]}>
            <View style={styles.bottomNav}>
            
            <NavButton title="Home" iconName="home" active={pathname === '/'} onPress={() => router.push('/')} />
            
            {canSeeTab('activity') && (
                <NavButton title="Act Plan" iconName="calendar" active={pathname === '/activity_plan'} onPress={() => router.push('/activity_plan')} />
            )}

            {canSeeTab('tasks') && (
                <NavButton 
                    title="Task" 
                    iconName="checkbox" 
                    active={pathname === '/tasks'} 
                    onPress={() => router.push('/tasks')}
                    badgeCount={taskCount} 
                />
            )}
            
            {canSeeTab('leads') && (
                <NavButton 
                    title="Leads" 
                    iconName="funnel" 
                    active={pathname === '/leads'} 
                    onPress={() => router.push('/leads')} 
                    badgeCount={leadCount}
                />
            )}

            {canSeeTab('tickets') && (
                <NavButton 
                    title="Service" 
                    iconName="settings" 
                    active={pathname === '/service_call'} 
                    onPress={() => router.push('/service_call')} 
                    badgeCount={serviceCount}
                />
            )}

            {canSeeTab('organizations') && (
                <NavButton 
                    title="Org" 
                    iconName="people" 
                    active={pathname === '/organization'} 
                    onPress={() => router.push('/organization')} 
                    badgeCount={orgCount}
                />
            )}

            </View>
        </View>
      )}
    </View>
  );
}

// 🔥 NAV BUTTON
const NavButton = ({ title, iconName, active, onPress, badgeCount }: any) => (
  <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.7}>
    <View>
        <Ionicons name={iconName} size={24} color={active ? "#3b5998" : "#9e9e9e"} />
        {badgeCount > 0 && (
            <View style={styles.navBadge}>
                <Text style={styles.navBadgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
            </View>
        )}
    </View>
    <Text style={[styles.navText, active && styles.activeNavText]} numberOfLines={1}>
        {title}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1 }, 
  
  // 🔥 NETWORK INDICATOR STYLES
  networkPill: {
      position: 'absolute',
      right: 15,
      zIndex: 9999,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.9)',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 15,
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
  },
  netDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  netText: { fontSize: 10, fontWeight: 'bold', color: '#555' },

  bottomNavContainer: {
    position: 'absolute',
    left: 15,
    right: 15,
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 1000,
  },

  bottomNav: { 
    flexDirection: 'row', 
    backgroundColor: 'white', 
    width: '100%',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'space-around', 
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 10,
  },

  navItem: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 2 },
  navText: { fontSize: 10, marginTop: 4, color: '#9e9e9e', textAlign:'center', fontWeight: '500' },
  activeNavText: { color: '#3b5998', fontWeight: 'bold' },

  navBadge: {
      position: 'absolute',
      top: -6,
      right: -14, 
      backgroundColor: '#D32F2F',
      borderRadius: 10, 
      minWidth: 20,     
      height: 20,       
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: 'white',
      zIndex: 10,
      paddingHorizontal: 5, 
  },
  navBadgeText: {
      color: 'white',
      fontSize: 10, 
      fontWeight: 'bold',
      textAlign: 'center'
  }
});