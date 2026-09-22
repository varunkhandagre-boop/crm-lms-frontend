import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ==========================================
// 1. Foreground Notification Settings
// ==========================================
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ==========================================
// 2. Generate Expo Push Token
// ==========================================
export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Attendance Alerts',
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
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null; // Stop here if permission denied
    }

    try {
        // 🔥 Replace this with your actual Expo Project ID
        token = (await Notifications.getExpoPushTokenAsync({
             projectId: 'fabfded8-69a3-4648-9d6f-63e2a0c5f618', 
        })).data;
        console.log("🔔 EXPO PUSH TOKEN:", token);
    } catch (e) {
        console.log("Token Error:", e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

// ==========================================
// 3. Initial Permission Caller
// ==========================================
export const setupNotificationPermissions = async () => {
    const token = await registerForPushNotificationsAsync();
    return token;
};

// ==========================================
// 4. Holiday Check Helper
// ==========================================
const isHoliday = (dateObj: Date, holidayList: any[]) => {
    if (!holidayList || holidayList.length === 0) return false;

    const offset = dateObj.getTimezoneOffset() * 60000;
    const localDate = new Date(dateObj.getTime() - offset);
    const dateStr = localDate.toISOString().split('T')[0];

    return holidayList.some((h: any) => h.date === dateStr);
};

// ==========================================
// 5. Local Attendance Reminders (Untouched)
// ==========================================
export const manageAttendanceReminders = async (
    status: 'LOGIN_PENDING' | 'LOGGED_IN' | 'COMPLETED', 
    holidayList: any[] = [] 
) => {
    
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();

    // 🛑 CHECK 1: Aaj ke liye check (Sunday OR Holiday)
    if (now.getDay() === 0 || isHoliday(now, holidayList)) {
        console.log("Aaj Chutti hai (Sunday/Holiday) 🌴, No Reminder today!");
    } else {
        // --- CASE A: Login Reminder ---
        if (status === 'LOGIN_PENDING') {
            const times = [10, 10.5, 11, 11.5, 12]; 
            for (let t of times) {
                const trigger = new Date();
                trigger.setHours(Math.floor(t), (t % 1) * 60, 0, 0);
                
                if (trigger > now) {
                    await Notifications.scheduleNotificationAsync({
                        content: { 
                            title: "⚠️ Login Reminder", 
                            body: "Please mark your Day In now!",
                            data: { url: '/dayin' }
                        },
                        trigger: { type: 'date', date: trigger } as any, 
                    });
                }
            }
        }

        // --- CASE B: Logout Reminder ---
        else if (status === 'LOGGED_IN') {
            const times = [18, 18.5, 19, 19.5, 20, 20.5, 21, 22, 23]; 
            for (let t of times) {
                const trigger = new Date();
                trigger.setHours(Math.floor(t), (t % 1) * 60, 0, 0);
                
                if (trigger > now) {
                    await Notifications.scheduleNotificationAsync({
                        content: { 
                            title: "🛑 Logout Reminder", 
                            body: "Shift over? Mark Day Out.",
                            data: { url: '/dayin' }
                        },
                        trigger: { type: 'date', date: trigger } as any,
                    });
                }
            }
        }
    }

    // --- CASE C: Kal subah ka Alarm ---
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    // 🛑 CHECK 2: Kal ke liye check (Sunday OR Holiday)
    if (tomorrow.getDay() === 0 || isHoliday(tomorrow, holidayList)) {
        console.log("Kal Chutti hai (Sunday/Holiday) 🌴, Alarm skip kiya.");
        return; 
    }
    
    await Notifications.scheduleNotificationAsync({
        content: { 
            title: "⚠️ Login Reminder", 
            body: "Good Morning! Please mark attendance.",
            data: { url: '/dayin' }
        },
        trigger: { type: 'date', date: tomorrow } as any,
    });
};

// ==========================================
// 6. 🔥 SEND REAL PUSH NOTIFICATION
// ==========================================
export async function sendExpoPushNotification(expoPushToken: string, title: string, body: string, data: any = {}) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    // 🔥 NEW: Expo का जवाब (Response) प्रिंट करना
    const responseData = await response.json();
    console.log("🚀 Expo Push Response:", responseData);
    
  } catch (error) {
    console.error("❌ Error sending push notification:", error);
  }
}