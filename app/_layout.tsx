import { Ionicons } from '@expo/vector-icons';
import { Slot, usePathname, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DataProvider, useData } from './context/DataContext';

// 🔥 1. NOTIFICATIONS SETUP
import * as Notifications from 'expo-notifications';
import { manageAttendanceReminders, setupNotificationPermissions } from '../utils/notificationHelper';

// 🔥 2. LOCATION & DB IMPORTS
import * as Location from 'expo-location';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Notification Handler Settings
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

function NavigationLayout() {
  const router = useRouter();
  const pathname = usePathname();
  
  // 🔥 GET DATA
  const { currentUser, appPermissions, loading, attendanceList, taskList = [] } = useData();
  
  const insets = useSafeAreaInsets(); 

  // ==========================================
  // 🔥 NOTIFICATION CLICK LISTENER (FIXED)
  // ==========================================
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      console.log("🔔 Notification Clicked Data:", data);

      // Step 1: Target Path nikalo
      const targetPath = data?.route || data?.screen || data?.url || "";

      // ✅ 2. ORGANIZATION CHECK
      if (
          targetPath === 'organization' || 
          (typeof targetPath === 'string' && targetPath.includes('organization'))
      ) {
          setTimeout(() => router.push('/organization'), 500);
          return; 
      }

      // ✅ 3. SERVICE CALL CHECK (Critical Fix)
      if (
          targetPath === 'service_call' || 
          targetPath === 'service_calls' || 
          targetPath === '/service_calls' || 
          (typeof targetPath === 'string' && targetPath.includes('service_call'))
      ) {
          setTimeout(() => {
              // 👇 Force Navigate to correct file
              router.push('/service_call' as any); 
          }, 500);
          return;
      }

      // ✅ 4. GENERIC URL LOGIC (Backup)
      if (targetPath && typeof targetPath === 'string') {
        let cleanUrl = targetPath;
        if (!cleanUrl.startsWith('/')) {
            cleanUrl = '/' + cleanUrl;
        }
        setTimeout(() => router.push(cleanUrl as any), 500);
      }
    });

    return () => subscription.remove();
  }, []);

  // ==========================================
  // 🔥 BADGE LOGIC (TASKS)
  // ==========================================
  const calculateTaskBadge = () => {
      if (!currentUser) return 0;
      
      const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'Manager';

      // 1. Received Pending
      const myPending = taskList.filter((t: any) => 
          (t.to === 'Self' || t.to === currentUser?.name) && t.status === 'Pending'
      ).length;

      // 2. Assigned Pending
      const assignedPending = taskList.filter((t: any) => 
          t.from === currentUser?.name && t.to !== 'Self' && t.to !== currentUser?.name && t.status === 'Pending'
      ).length;

      // Admin sees ALL, User sees (My + Assigned)
      return isAdmin 
          ? taskList.filter((t:any) => t.status === 'Pending').length 
          : (myPending + assignedPending);
  };

  const taskCount = calculateTaskBadge();

  // ==========================================
  // 🕵️‍♂️ AUTO LOCATION TRACKER (OFFICE + FIELD MODE)
  // ==========================================
  useEffect(() => {
    if (loading || !currentUser) return;

    let locationSubscription: any = null;
    let lastUpdateTimestamp = 0; // 🔥 Ye variable spam rokega

    const startTracking = async () => {
        try {
            // 1. Permissions
            const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
            if (foreStatus !== 'granted') return;

            try {
                const { status: backStatus } = await Location.requestBackgroundPermissionsAsync();
                if (backStatus !== 'granted') console.log("Bg Permission denied");
            } catch (err) { }

            // 2. Start Watcher
            // Hum OS ko bol rahe hain: "Har 5 min me check karo, chahe banda hile ya na hile"
            locationSubscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced, 
                    timeInterval: 5 * 60 * 1000,  // OS har 5 min me wake up karega (Internal Check)
                    distanceInterval: 0           // 🔥 Zero Distance: Baithe hue bande ki bhi location lega
                },
                async (loc) => {
                    const now = Date.now();
                    const THIRTY_MINUTES = 30 * 60 * 1000; 

                    // 🛑 GATEKEEPER: Agar 30 min nahi hue, to yahi ruk jao. Firebase mat bhejo.
                    if (lastUpdateTimestamp !== 0 && (now - lastUpdateTimestamp) < THIRTY_MINUTES) {
                        return; // ⏳ Silent Skip (Quota Bachao)
                    }

                    // ✅ 30 Min ho gaye -> Ab Firebase me daalo
                    lastUpdateTimestamp = now;
                    console.log("📍 Tracking Update Sent (30 min logic):", loc.coords.latitude);

                    try {
                        await addDoc(collection(db, "location_logs"), {
                            userId: currentUser.email || currentUser.uid,
                            userName: currentUser.name || "App User",
                            latitude: loc.coords.latitude,
                            longitude: loc.coords.longitude,
                            timestamp: serverTimestamp(),
                            date: new Date().toISOString().split('T')[0],
                            time: new Date().toLocaleTimeString(),
                            type: "🟣 Auto-Track (30 min)", 
                            device: "App",
                            isStationary: true // Flag ki banda shayad baitha hai ya slow hai
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


  // ==========================================
  // ⏰ SMART ATTENDANCE REMINDER
  // ==========================================
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
      if (userRole === 'Admin') return true;
      const myPerms = appPermissions?.[userRole];
      if (!myPerms) return true;
      return myPerms[moduleKey] === true;
  };

  const showNavBar = ['/', '/activity_plan', '/tasks', '/leads', '/service_call', '/organization'].includes(pathname);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="white" />
      
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

            {/* 🔥 UPDATED TASK BUTTON WITH BADGE */}
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
                <NavButton title="Leads" iconName="funnel" active={pathname === '/leads'} onPress={() => router.push('/leads')} />
            )}

            {canSeeTab('tickets') && (
                <NavButton title="Service" iconName="settings" active={pathname === '/service_call'} onPress={() => router.push('/service_call')} />
            )}

            {canSeeTab('organizations') && (
                <NavButton title="Org" iconName="people" active={pathname === '/organization'} onPress={() => router.push('/organization')} />
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
        {/* 🔴 RED BADGE CIRCLE */}
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
      top: -5,
      right: -8,
      backgroundColor: '#D32F2F',
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: 'white',
      zIndex: 10,
      paddingHorizontal: 3
  },
  navBadgeText: {
      color: 'white',
      fontSize: 9,
      fontWeight: 'bold'
  }
});