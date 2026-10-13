import * as Device from 'expo-device';
import { Notifications } from './notificationsModule';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SCHEDULE, isOffDay, localYmd, MY_ROSTER_KEY, MY_SCHEDULE_KEY, MyRosterDay, WorkSchedule } from './workSchedule';

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

async function readMyRoster(): Promise<Record<string, MyRosterDay>> {
    try {
        const raw = await AsyncStorage.getItem(MY_ROSTER_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

// ==========================================
// 5. Local Attendance Reminders
// ==========================================
export const manageAttendanceReminders = async (
    status: 'LOGIN_PENDING' | 'LOGGED_IN' | 'COMPLETED', 
    holidayList: any[] = [],
    entryDate?: string, // "YYYY-MM-DD" of the open / done attendance row (its shift's start date), when known
) => {
    
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    // Own weekly off + shift (saved by hooks/useWorkSchedules.ts); Sunday-off default.
    // Shift Roster days (a shift or Off per date) win over it when cached.
    const schedule = await readMySchedule();
    const roster = await readMyRoster();
    const dayOf = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const planFor = (day: Date) => {
        const ymd = localYmd(day);
        const r = roster[ymd];
        const start = r?.start ?? schedule.shiftStart;
        const end = r?.end ?? schedule.shiftEnd;
        const startH = start ? hoursOf(start) : 10;
        let endH = end ? hoursOf(end) : 18;
        if (endH <= startH) endH += 24; // night shift: ends next day
        const off = r ? r.off : isOffDay(ymd, schedule);
        return { off: off || isHoliday(day, holidayList), startH, endH };
    };
    // A time on `day` given in hours; 24+ rolls over to the next day.
    const at = (day: Date, h: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const schedule1 = async (when: Date, title: string, body: string) => {
        if (when <= now) return;
        await Notifications.scheduleNotificationAsync({
            content: { title, body, data: { url: '/dayin' } },
            trigger: { type: 'date', date: when } as any,
        });
    };

    const today = dayOf(0);
    const todayPlan = planFor(today);
    const yesterday = dayOf(-1);
    const yPlan = planFor(yesterday);
    // A night shift that started yesterday (22:00–06:00) is still "today's" entry until a few hours after it ends.
    const yesterdayNight = entryDate
        ? entryDate === localYmd(yesterday)
        : !yPlan.off && yPlan.endH > 24 && now < at(yesterday, yPlan.endH + 6);

    // --- CASE A: Login Reminder — shift start, +30 … +2h (on a working day) ---
    // Also after finishing last night's shift in the morning: tonight's shift still needs a Day In.
    if (status === 'LOGIN_PENDING' || (status === 'COMPLETED' && yesterdayNight)) {
        if (todayPlan.off) {
            console.log("Aaj Chutti hai (weekly off/Holiday/Off) 🌴, No Reminder today!");
        } else {
            for (const x of [0, 0.5, 1, 1.5, 2]) await schedule1(at(today, todayPlan.startH + x), "⚠️ Login Reminder", "Please mark your Day In now!");
        }
    }

    // --- CASE B: Logout Reminder — shift end, +30 … +5h ---
    // A night shift that started yesterday (22:00–06:00) ends this morning.
    else if (status === 'LOGGED_IN') {
        const endAt = yesterdayNight ? at(yesterday, yPlan.endH) : at(today, todayPlan.endH);
        for (const x of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) {
            await schedule1(new Date(endAt.getTime() + x * 3600000), "🛑 Logout Reminder", "Shift over? Mark Day Out.");
        }
    }

    // --- CASE C: Kal ka Alarm (next shift start) ---
    const tomorrow = dayOf(1);
    const tomorrowPlan = planFor(tomorrow);
    if (tomorrowPlan.off) {
        console.log("Kal Chutti hai (weekly off/Holiday/Off) 🌴, Alarm skip kiya.");
        return; 
    }
    await schedule1(at(tomorrow, tomorrowPlan.startH), "⚠️ Login Reminder", tomorrowPlan.startH < 12 ? "Good Morning! Please mark attendance." : "Your shift is starting. Please mark attendance.");
};

