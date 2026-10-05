import * as Device from 'expo-device';
import { Notifications } from './notificationsModule';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SCHEDULE, isOffDay, localYmd, MY_SCHEDULE_KEY, WorkSchedule } from './workSchedule';

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

const hoursOf = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h + m / 60;
};

async function readMySchedule(): Promise<WorkSchedule> {
    try {
        const raw = await AsyncStorage.getItem(MY_SCHEDULE_KEY);
        return raw ? { ...DEFAULT_SCHEDULE, ...JSON.parse(raw) } : DEFAULT_SCHEDULE;
    } catch {
        return DEFAULT_SCHEDULE;
    }
}

// ==========================================
// 5. Local Attendance Reminders
// ==========================================
export const manageAttendanceReminders = async (
    status: 'LOGIN_PENDING' | 'LOGGED_IN' | 'COMPLETED', 
    holidayList: any[] = [] 
) => {
    
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    // Own weekly off + shift (saved by hooks/useWorkSchedules.ts); Sunday-off default.
    const schedule = await readMySchedule();
    // Reminder times follow the shift: start, +30 … +2h; end, +30 … +5h.
    const startH = schedule.shiftStart ? hoursOf(schedule.shiftStart) : 10;
    const endH = schedule.shiftEnd ? hoursOf(schedule.shiftEnd) : 18;
    const loginTimes = [0, 0.5, 1, 1.5, 2].map((x) => startH + x).filter((t) => t < 24);
    const logoutTimes = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((x) => endH + x).filter((t) => t < 24);

    // 🛑 CHECK 1: Aaj ke liye check (weekly off OR Holiday)
    if (isOffDay(localYmd(now), schedule) || isHoliday(now, holidayList)) {
        console.log("Aaj Chutti hai (weekly off/Holiday) 🌴, No Reminder today!");
    } else {
        // --- CASE A: Login Reminder ---
        if (status === 'LOGIN_PENDING') {
            const times = loginTimes;
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
            const times = logoutTimes;
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
    tomorrow.setHours(Math.floor(startH), Math.round((startH % 1) * 60), 0, 0);

    // 🛑 CHECK 2: Kal ke liye check (weekly off OR Holiday)
    if (isOffDay(localYmd(tomorrow), schedule) || isHoliday(tomorrow, holidayList)) {
        console.log("Kal Chutti hai (weekly off/Holiday) 🌴, Alarm skip kiya.");
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