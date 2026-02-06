import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// 1. Permission Setup (Same as before)
export const setupNotificationPermissions = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Attendance Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }
    return finalStatus === 'granted';
};

// 🔥 HELPER: Check if Date is in Holiday List
const isHoliday = (dateObj: Date, holidayList: any[]) => {
    if (!holidayList || holidayList.length === 0) return false;

    // Local Date String (YYYY-MM-DD) banana zaruri hai
    // Kyunki Firebase me date string format me hai
    const offset = dateObj.getTimezoneOffset() * 60000;
    const localDate = new Date(dateObj.getTime() - offset);
    const dateStr = localDate.toISOString().split('T')[0];

    // Check karein ki ye date list me hai ya nahi
    return holidayList.some((h: any) => h.date === dateStr);
};

// 2. Schedule Logic (Updated with Holiday Check)
export const manageAttendanceReminders = async (
    status: 'LOGIN_PENDING' | 'LOGGED_IN' | 'COMPLETED', 
    holidayList: any[] = [] // 👈 Yaha humne holidayList receive kiya
) => {
    
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();

    // 🛑 CHECK 1: Aaj ke liye check (Sunday OR Holiday)
    if (now.getDay() === 0 || isHoliday(now, holidayList)) {
        console.log("Aaj Chutti hai (Sunday/Holiday) 🌴, No Reminder today!");
        // Aaj ka reminder skip, but niche Case C (Kal ka alarm) chalega
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
        return; // Kal alarm set mat karo
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