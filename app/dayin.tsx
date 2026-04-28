import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

import { manageAttendanceReminders } from '../utils/notificationHelper';

export default function DayInScreen() {
    useKeepAwake();
    const router = useRouter();
    
    // 🔥 1. Context se sirf User nikalenge
    const { currentUser } = useData();

    // 🔥 2. Naya SaaS Engine
    const { fetchSaaSData, addSaaSData, updateSaaSData, isDbLoading } = useSaaSDB();

    // 🔥 3. Lazy Loaded Lists
    const [attendanceList, setAttendanceList] = useState<any[]>([]);
    const [holidayList, setHolidayList] = useState<any[]>([]);
    const [leaveList, setLeaveList] = useState<any[]>([]);
    const [userList, setUserList] = useState<any[]>([]);

    // --- STATES ---
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [address, setAddress] = useState<string>('Ready to fetch location...');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('Out'); 
    const [timer, setTimer] = useState(0); 
    const [todayDocId, setTodayDocId] = useState<string | null>(null);
    const [startTime, setStartTime] = useState<number | null>(null);
    
    // Expenses State
    const [expenseModalVisible, setExpenseModalVisible] = useState(false);
    const [expenses, setExpenses] = useState({ da: '', hotel: '', misc: '', totalAmount: '', note: '' });
    
    // History View State
    const [currentDate, setCurrentDate] = useState(new Date()); 
    const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'Year'>('Day'); 
    const [filterUser, setFilterUser] = useState('All'); 
    const [showUserModal, setShowUserModal] = useState(false);
    
    // Detail Popup
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any>(null);

    const [visibleCount, setVisibleCount] = useState(20);

    useEffect(() => {
        if (viewMode === 'Day') setVisibleCount(500); 
        else setVisibleCount(20);  
    }, [viewMode, currentDate, filterUser]);

    const canManage = currentUser?.role === 'Admin' || currentUser?.role === 'Manager' || currentUser?.role === 'Hr' || currentUser?.role === 'Accountant' || currentUser?.role === 'SuperAdmin';

    // 🔥 4. LOAD DATA ON MOUNT
    const loadAllData = async () => {
        if (currentUser?.companyId) {
            const [attendance, holidays, leaves, users] = await Promise.all([
                fetchSaaSData("attendance"),
                fetchSaaSData("holidays"),
                fetchSaaSData("leaves"),
                fetchSaaSData("users")
            ]);
            setAttendanceList(attendance);
            setHolidayList(holidays);
            setLeaveList(leaves);
            setUserList(users);
        }
    };

    useEffect(() => {
        loadAllData();
    }, [currentUser]);

    // HELPER: Unique Users
    const uniqueUsers = useMemo(() => {
        if (!canManage || !userList) return [];
        return userList.map((u:any) => u.name).sort();
    }, [userList, canManage]);

    const normalizeDate = (dStr: string, isoStr?: string) => {
        if (isoStr && isoStr.includes('-')) return isoStr.split('T')[0];
        if (!dStr) return "";
        if (dStr.includes('/')) {
            const parts = dStr.split('/');
            if(parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        if (dStr.includes('T')) return dStr.split('T')[0];
        return dStr;
    };

    const isSameUser = (name1: string, name2: string) => {
        if (!name1 || !name2) return false;
        return name1.trim().toLowerCase() === name2.trim().toLowerCase();
    };

    const formatMonth = (date: Date) => date.toLocaleString('default', { month: 'long', year: 'numeric' });
    const formatFullDate = (date: Date) => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const formatDateDisplay = (dateStr: string) => {
        if(!dateStr) return "-";
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    const getHours = (timeStr: string) => {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        if (parts.length >= 2) return (parseInt(parts[0]) || 0) + ((parseInt(parts[1]) || 0) / 60);
        return 0;
    };
    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const changeDate = (direction: number) => {
        const newDate = new Date(currentDate);
        if (viewMode === 'Day') newDate.setDate(newDate.getDate() + direction);
        else if (viewMode === 'Month') newDate.setMonth(newDate.getMonth() + direction);
        else newDate.setFullYear(newDate.getFullYear() + direction);
        setCurrentDate(newDate);
    };
    
    const getHeaderDateText = () => {
        if (viewMode === 'Day') return formatFullDate(currentDate);
        if (viewMode === 'Month') return formatMonth(currentDate);
        return currentDate.getFullYear().toString();
    };
    
    const handleExpenseChange = (field: string, value: string) => {
        const newExpenses = { ...expenses, [field]: value };
        const da = parseFloat(newExpenses.da) || 0;
        const hotel = parseFloat(newExpenses.hotel) || 0;
        const misc = parseFloat(newExpenses.misc) || 0;
        const total = da + hotel + misc;
        
        setExpenses({ ...newExpenses, totalAmount: total >= 0 ? total.toString() : '' });
    };

    useFocusEffect(
        useCallback(() => {
            const checkStatus = () => {
                const now = new Date();
                const offset = now.getTimezoneOffset() * 60000;
                const localDate = new Date(now.getTime() - offset);
                const todayStr = localDate.toISOString().split('T')[0];
                
                const myEntry = attendanceList.find((a: any) => 
                    a.date === todayStr && (isSameUser(a.userName, currentUser?.name) || a.userId === currentUser?.id || a.senderId === currentUser?.id)
                );

                if (myEntry) {
                    setTodayDocId(myEntry.id);
                    
                    if (myEntry.outTime && myEntry.outTime !== '--') {
                        setStatus('Completed');
                        setTimer(0);
                    } else {
                        if (status === 'Completed') return;
                        setStatus('In');
                        const start = new Date(myEntry.createdAt || myEntry.timestamp).getTime();
                        setStartTime(start);
                        const diff = Math.floor((now.getTime() - start) / 1000);
                        setTimer(diff > 0 ? diff : 0);
                    }
                    
                    if(myEntry.location?.address && address.includes('Ready')) {
                        setAddress(myEntry.location.address);
                    }
                } else {
                    setStatus('Out');
                    setTimer(0);
                    setTodayDocId(null);
                }
            };

            if(attendanceList && currentUser) checkStatus();
        }, [attendanceList, currentUser, status])
    );

    useEffect(() => {
        let interval: any;
        if (status === 'In' && startTime) {
            interval = setInterval(() => {
                const now = new Date().getTime();
                const diff = Math.floor((now - startTime) / 1000);
                setTimer(diff > 0 ? diff : 0);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [status, startTime]);

    const getStatus = (item: any) => {
        if (item.type === 'LEAVE') return 'LEAVE';
        if (item.type === 'HOLIDAY') return 'HOLIDAY';
        if (item.type === 'ABSENT') return 'ABSENT';

        const todayStr = new Date().toISOString().split('T')[0];
        const isToday = item.date === todayStr;
        const hasLoggedOut = item.outTime && item.outTime !== '--';
        const hours = getHours(item.workHrs);

        if (hasLoggedOut && hours < 4) return 'SHORT';
        if (!hasLoggedOut && !isToday) return 'SHORT';

        return 'PRESENT';
    };

    const getDisplayData = () => {
        let rawData: any[] = [];

        if (viewMode === 'Day') {
            const selectedDateStr = currentDate.toISOString().split('T')[0];
            const finalOutput: any[] = [];
            const usersToCheck = (filterUser !== 'All' && canManage) 
                ? userList.filter((u:any) => isSameUser(u.name, filterUser)) 
                : (canManage ? userList : [currentUser]); 

            usersToCheck.forEach((emp: any) => {
                if (!emp || !emp.name) return;

                const attendance = attendanceList.find((a: any) => 
                    (isSameUser(a.userName, emp.name) || isSameUser(a.senderName, emp.name)) && 
                    a.date === selectedDateStr
                );

                if (attendance) {
                    finalOutput.push({ ...attendance, type: 'ATTENDANCE', senderName: emp.name });
                    return; 
                }

                const leave = leaveList.find((l: any) => {
                    if (!isSameUser(l.senderName, emp.name) || l.status !== 'Approved') return false;
                    const startD = normalizeDate(l.fromDate, l.fromDateIso);
                    const endD = normalizeDate(l.toDate || l.fromDate, l.toDateIso);
                    return selectedDateStr >= startD && selectedDateStr <= endD;
                });

                if (leave) {
                    finalOutput.push({ id: `leave-${leave.id}-${emp.id}`, date: selectedDateStr, type: 'LEAVE', senderName: emp.name, outTime: leave.type, workHrs: '0' });
                    return;
                }

                const holiday = holidayList.find((h:any) => normalizeDate(h.date, h.dateIso) === selectedDateStr);
                if (holiday) {
                    finalOutput.push({ id: `holiday-${selectedDateStr}-${emp.id}`, date: selectedDateStr, type: 'HOLIDAY', senderName: emp.name, outTime: holiday.name, workHrs: '0' });
                    return;
                }

                const d = new Date(selectedDateStr);
                if (d.getDay() === 0) {
                     finalOutput.push({ id: `sunday-${selectedDateStr}-${emp.id}`, date: selectedDateStr, type: 'HOLIDAY', senderName: emp.name, outTime: 'Sunday Off', workHrs: '0' });
                     return;
                }

                if (selectedDateStr <= new Date().toISOString().split('T')[0]) {
                    finalOutput.push({ id: `absent-${selectedDateStr}-${emp.id}`, date: selectedDateStr, type: 'ABSENT', senderName: emp.name, inTime: '-', outTime: '-', workHrs: '0' });
                }
            });
            return finalOutput;
        }
        else {
            let attSource = [...attendanceList];
            let leaveSource = [...leaveList];
            const targetUser = (canManage && filterUser !== 'All') ? filterUser : (canManage ? null : currentUser?.name);

            if (targetUser) {
                attSource = attSource.filter((item: any) => isSameUser(item.userName, targetUser) || isSameUser(item.senderName, targetUser));
                leaveSource = leaveSource.filter((item: any) => isSameUser(item.senderName, targetUser));
            } else if (!canManage) {
                attSource = attSource.filter((item: any) => item.userId === currentUser?.id || item.senderId === currentUser?.id);
                leaveSource = leaveSource.filter((item: any) => item.userId === currentUser?.id || item.senderId === currentUser?.id);
            }

            attSource.forEach((att: any) => rawData.push({ ...att, type: 'ATTENDANCE', senderName: att.userName || att.senderName }));
            
            leaveSource.forEach((leave: any) => {
                if (leave.status === 'Approved') {
                    const startD = normalizeDate(leave.fromDate, leave.fromDateIso);
                    const endD = normalizeDate(leave.toDate || leave.fromDate, leave.toDateIso);

                    let currDate = new Date(startD);
                    const lastDate = new Date(endD);

                    while (currDate <= lastDate) {
                        const dStr = currDate.toISOString().split('T')[0];
                        const hasAtt = attSource.some(a => a.date === dStr && (isSameUser(a.userName, leave.senderName) || isSameUser(a.senderName, leave.senderName)));

                        if (!hasAtt) {
                            rawData.push({
                                id: `leave-${leave.id}-${dStr}`,
                                date: dStr,
                                inTime: 'LEAVE',
                                outTime: leave.type,
                                workHrs: '0',
                                location: 'Approved Leave',
                                senderName: leave.senderName,
                                type: 'LEAVE'
                            });
                        }
                        currDate.setDate(currDate.getDate() + 1);
                    }
                }
            });

            if (viewMode === 'Month') {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const fullMonthData = [];
                
                for (let i = 1; i <= daysInMonth; i++) {
                    const d = new Date(year, month, i);
                    const offset = d.getTimezoneOffset() * 60000;
                    const dateStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
                    
                    const logs = rawData.filter(item => item.date === dateStr);
                    const holiday = holidayList.find((h:any) => normalizeDate(h.date, h.dateIso) === dateStr);
                    const isSunday = d.getDay() === 0;

                    if (logs.length > 0) {
                        fullMonthData.push(...logs); 
                    } 
                    else if (holiday) {
                        fullMonthData.push({ id: `holiday-${i}`, date: dateStr, type: 'HOLIDAY', outTime: holiday.name, workHrs: '0', senderName: targetUser || 'N/A' });
                    }
                    else if (isSunday) {
                        fullMonthData.push({ id: `sunday-${i}`, date: dateStr, type: 'HOLIDAY', outTime: 'Sunday Off', workHrs: '0', senderName: targetUser || 'N/A' });
                    }
                    else if (targetUser && d <= new Date()) {
                        fullMonthData.push({ id: `absent-${i}`, date: dateStr, type: 'ABSENT', inTime: '-', outTime: '-', workHrs: '0', senderName: targetUser });
                    }
                }
                return fullMonthData.reverse();
            }

            const filterPrefix = viewMode === 'Year' ? currentDate.getFullYear().toString() : currentDate.toISOString().slice(0, 7);
            rawData = rawData.filter(item => (item.date || "").startsWith(filterPrefix));
            return rawData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
    };

    const finalData = getDisplayData();
    const displayData = finalData.slice(0, visibleCount);

    const todayObj = new Date();
    const tomorrowObj = new Date();
    tomorrowObj.setDate(todayObj.getDate() + 1);

    const getStandardDateForHoliday = (dateObj: Date) => {
        const offset = dateObj.getTimezoneOffset() * 60000;
        return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
    };

    const todayStrFull = getStandardDateForHoliday(todayObj);
    const tomorrowStrFull = getStandardDateForHoliday(tomorrowObj);

    const todayIsSunday = todayObj.getDay() === 0;
    const tomorrowIsSunday = tomorrowObj.getDay() === 0;

    const todayHoliday = holidayList?.find((h:any) => normalizeDate(h.date, h.dateIso) === todayStrFull);
    const tomorrowHoliday = holidayList?.find((h:any) => normalizeDate(h.date, h.dateIso) === tomorrowStrFull);

    let holidayMessage = null;
    let isTodayHoliday = false;

    if (todayHoliday || todayIsSunday) {
        isTodayHoliday = true;
        holidayMessage = `🎉 Today is ${todayHoliday ? todayHoliday.name : 'Sunday'}. Enjoy your day off!`;
    } else if (tomorrowHoliday || tomorrowIsSunday) {
        holidayMessage = `💡 Reminder: Tomorrow is ${tomorrowHoliday ? tomorrowHoliday.name : 'Sunday'}.`;
    }

    const daysPresent = finalData.filter(i => getStatus(i) === 'PRESENT').length;
    const actualHolidayCount = finalData.filter(i => getStatus(i) === 'HOLIDAY').length;
    const leavesOrAbsent = finalData.filter(i => getStatus(i) === 'LEAVE' || getStatus(i) === 'ABSENT').length;
    const midLabel = "Leaves/Abs";

    // 🔥 5. SAAS DAY IN LOGIC
    const handleDayIn = async () => {
        setLoading(true);
        setAddress("Fetching GPS...");
        try {
            const now = new Date();
            const todayStr = getStandardDateForHoliday(now);
            
            const existingEntry = attendanceList.find((a: any) => 
                a.date === todayStr && (a.userId === currentUser?.id || isSameUser(a.userName, currentUser?.name) || isSameUser(a.senderName, currentUser?.name))
            );

            if (existingEntry) {
                Alert.alert("Already Punched In", "You have already marked your attendance for today.");
                setStatus(existingEntry.outTime && existingEntry.outTime !== '--' ? 'Completed' : 'In');
                setLoading(false);
                return;
            }

            let realName = currentUser?.name || 'Unknown';

            let { status: permStatus } = await Location.requestForegroundPermissionsAsync();
            if (permStatus !== 'granted') throw new Error("Denied");

            let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
            setLocation(loc);

            let addrRes = await Location.reverseGeocodeAsync({ 
                latitude: loc.coords.latitude, 
                longitude: loc.coords.longitude 
            });

            let currentAddr = "Unknown Location";
            if (addrRes.length > 0) {
                const obj = addrRes[0];
                let city = obj.city || '';
                let building = obj.name || '';
                if (building.includes(',')) building = ''; 
                let street = obj.street || '';
                if(street === building) street = '';
                let area = obj.district || obj.subregion || '';
                if (area === city) area = ''; 
                currentAddr = [building, street, area, city].filter(Boolean).join(', ');
            }
            setAddress(currentAddr);

            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const newAttendanceData = {
                date: todayStr,
                dateIso: todayStr,
                inTime: timeString,
                outTime: '', workHrs: '', status: 'Present',
                expenses: { da: '0', hotel: '0', misc: '0', totalAmount: '0' },
                location: { address: currentAddr, latitude: loc.coords.latitude, longitude: loc.coords.longitude },
                note: 'Marked via GPS',
                userName: realName, 
                senderName: realName,
                role: currentUser?.role || 'Employee'
            };

            const res = await addSaaSData("attendance", newAttendanceData);
            
            if (res.success) {
                setTodayDocId(res.id);
                setStatus('In');
                setStartTime(now.getTime());
                await manageAttendanceReminders('LOGGED_IN', holidayList);
                
                // Silent refresh
                await loadAllData();
                Alert.alert("Success", `✅ Punched In at ${timeString}\n📍 ${currentAddr}`);
            } else {
                throw new Error("Could not save to SaaS DB");
            }
        } catch (error) {
            console.log(error);
            Alert.alert("Error", "Check GPS/Internet or Permission");
            setAddress("Error fetching location");
        } finally { 
            setLoading(false); 
        }
    };

    const handleMainButton = () => {
        if (status === 'Out') handleDayIn();
        else if (status === 'In') setExpenseModalVisible(true);
        else Alert.alert("Done", "Aaj ka kaam ho gaya hai.");
    };

    // 🔥 6. SAAS DAY OUT LOGIC
    const handleFinalizeDayOut = async () => {
        if (!todayDocId) return;
        if (!startTime) {
            Alert.alert("Please Wait", "Syncing attendance data... try again in 5 seconds.");
            return;
        }
        if (loading) return;
        setLoading(true);

        try {
            const nowMs = new Date().getTime();
            const actualDurationSeconds = Math.floor((nowMs - startTime) / 1000);
            const finalSeconds = actualDurationSeconds > 0 ? actualDurationSeconds : 0;
            const hoursWorked = finalSeconds / 3600;
            
            const attendanceStatus = hoursWorked < 4 ? 'Short Day' : 'Present';

            const finalExpenses = {
                da: expenses.da || '0',
                hotel: expenses.hotel || '0',
                misc: expenses.misc || '0',
                totalAmount: expenses.totalAmount || '0',
                note: expenses.note || '' 
            };

            let outLocData = null;
            let outAddr = "Unknown";
            try {
                let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                outLocData = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
                let addrRes = await Location.reverseGeocodeAsync(outLocData);
                if (addrRes.length > 0) {
                    const obj = addrRes[0];
                    let building = obj.name || '';
                    if (building.includes(',')) building = '';
                    let street = obj.street || '';
                    if (street === building) street = '';
                    let area = obj.district || obj.subregion || '';
                    let city = obj.city || '';
                    if (area === city) area = '';
                    outAddr = [building, street, area, city].filter(Boolean).join(', ');
                }
            } catch (e) { console.log("Out loc failed"); }

            const updatedData = {
                outTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                workHrs: formatTime(finalSeconds), 
                status: attendanceStatus,
                expenses: finalExpenses,
                outLocation: outLocData,
                outAddress: outAddr
            };

            const res = await updateSaaSData("attendance", todayDocId, updatedData);

            if (res.success) {
                await Notifications.dismissAllNotificationsAsync();
                await Notifications.cancelAllScheduledNotificationsAsync();
                await manageAttendanceReminders('COMPLETED', holidayList);

                setStatus('Completed');
                setExpenseModalVisible(false);
                setExpenses({ da: '', hotel: '', misc: '', totalAmount: '', note: '' });

                await loadAllData();
                Alert.alert("Day End", `✅ Punched Out Successfully!\nTotal Expense: ₹${finalExpenses.totalAmount}`);
            } else {
                throw new Error("Failed to update in SaaS DB");
            }
        } catch (error) {
            Alert.alert("Error", "Day Out Update Failed.");
        } finally {
            setLoading(false);
        }
    };

    const renderHistoryItem = ({ item }: any) => {
        const status = getStatus(item);
        const isLeave = status === 'LEAVE';
        const isHoliday = status === 'HOLIDAY';
        const isAbsent = status === 'ABSENT';
        const isPresent = status === 'PRESENT';
        const isShort = status === 'SHORT';

        const showForgot = isShort && (!item.outTime || item.outTime === '--');

        return (
            <TouchableOpacity onPress={() => {if(!isAbsent) {setSelectedItem(item); setDetailModalVisible(true);}}} activeOpacity={isAbsent ? 1 : 0.7} 
                style={[styles.historyCard, isLeave && styles.bgLeave, isHoliday && styles.bgHoliday, isAbsent && styles.bgAbsent, isShort && styles.bgShort]}>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                    <View>
                        <Text style={styles.historyTitle}>{formatDateDisplay(item.date)}</Text>
                        
                        {(canManage && (viewMode === 'Day' || filterUser === 'All')) && (
                            <Text style={{fontSize:13, color:'#3b5998', fontWeight:'bold', marginTop:4}}>👤 {item.senderName?.split(' ')[0]}</Text>
                        )}
                    </View>
                    <View style={{alignItems:'flex-end'}}>
                        {isLeave ? <Text style={{color:'#e65100', fontWeight:'bold', fontSize:13}}>On Leave</Text> :
                         isHoliday ? <Text style={{color:'#c2185b', fontWeight:'bold', fontSize:13}}>Holiday</Text> :
                         isAbsent ? <Text style={{color:'#d32f2f', fontWeight:'bold', fontSize:13}}>Absent</Text> :
                         (
                            <>
                                <Text style={styles.valText}>In: {item.inTime} | Out: {showForgot ? '?' : (item.outTime || '--')}</Text>
                                <Text style={{fontSize:13, color: isPresent ? 'green' : 'orange', fontWeight:'bold', marginTop:4}}>
                                    {isPresent ? 'Present' : 'Short Day'} ({item.workHrs || 'Run'}h)
                                </Text>
                            </>
                         )
                        }
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Attendance</Text>
                <View style={{width:24}} />
            </View>

            <ScrollView contentContainerStyle={{paddingBottom: 20}}>
                
                <View style={styles.card}>
                    <Text style={styles.dateText}>{new Date().toDateString()}</Text>
                    {status === 'In' ? (
                        <Text style={styles.timerText}>{formatTime(timer)}</Text>
                    ) : status === 'Completed' ? (
                        <Text style={[styles.timerText, {color:'green', fontSize:24}]}>Shift Done ✅</Text>
                    ) : (
                        <Text style={styles.timeText}>Ready to Start</Text>
                    )}
                    
                    {holidayMessage && (
                        <View style={{
                            backgroundColor: isTodayHoliday ? '#e8f5e9' : '#fff3e0', 
                            padding: 10, borderRadius: 8, marginBottom: 15, width: '100%', 
                            borderWidth: 1, borderColor: isTodayHoliday ? '#c8e6c9' : '#ffe0b2'
                        }}>
                            <Text style={{color: isTodayHoliday ? '#2e7d32' : '#e65100', fontWeight: 'bold', fontSize: 13, textAlign: 'center'}}>
                                {holidayMessage}
                            </Text>
                        </View>
                    )}
                    
                    <View style={styles.locationBox}>
                        <Ionicons name="location" size={20} color="#3b5998" />
                        {loading ? <ActivityIndicator size="small" color="#3b5998" style={{marginLeft:10}} /> : 
                            <Text style={styles.locText} numberOfLines={1}>{address}</Text>
                        }
                    </View>

                    <TouchableOpacity 
                        style={[styles.punchBtn, {backgroundColor: status === 'In' ? '#d32f2f' : (status === 'Completed' ? 'gray' : '#2e7d32')}]} 
                        onPress={handleMainButton} disabled={loading || status === 'Completed'}
                    >
                        {loading ? <ActivityIndicator color="white" size="large" /> : (
                            <>
                                <Ionicons name={status === 'In' ? "stop-circle" : "finger-print"} size={40} color="white" />
                                <Text style={styles.punchBtnText}>{status === 'Out' ? 'DAY IN' : (status === 'In' ? 'DAY OUT' : 'DONE')}</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.historySection}>
                    <Text style={styles.sectionTitle}>Log Book</Text>

                    {canManage && (
                        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowUserModal(true)}>
                            <Text style={{color:'white', fontWeight:'bold'}}>{filterUser === 'All' ? 'Filter: All Users' : filterUser}</Text>
                            <Ionicons name="chevron-down" size={16} color="white" />
                        </TouchableOpacity>
                    )}

                    <View style={styles.monthSelector}>
                        <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                        <Text style={styles.monthText}>{getHeaderDateText()}</Text>
                        <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
                    </View>

                    <View style={styles.tabContainer}>
                        {['Day', 'Month', 'Year'].map((m) => (
                            <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => { setViewMode(m as any); setCurrentDate(new Date()); }}>
                                <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.summaryGrid}>
                        <View style={[styles.summaryBox, {backgroundColor:'#e8f5e9'}]}><Text style={{fontWeight:'bold', color:'green'}}>{daysPresent}</Text><Text style={{fontSize:10}}>Present</Text></View>
                        <View style={[styles.summaryBox, {backgroundColor:'#ffebee'}]}><Text style={{fontWeight:'bold', color:'#d32f2f'}}>{leavesOrAbsent}</Text><Text style={{fontSize:10}}>{midLabel}</Text></View>
                        <View style={[styles.summaryBox, {backgroundColor:'#fce4ec'}]}><Text style={{fontWeight:'bold', color:'#c2185b'}}>{actualHolidayCount}</Text><Text style={{fontSize:10}}>Holidays</Text></View>
                    </View>

                    <FlatList 
                        data={displayData} 
                        keyExtractor={(item, index) => item.id || `log-${index}`} 
                        renderItem={renderHistoryItem} 
                        scrollEnabled={false} 
                        contentContainerStyle={{paddingBottom: 20}}
                        ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>{isDbLoading ? 'Loading data...' : 'No records found.'}</Text>}
                        
                        ListFooterComponent={
                            <View style={{ marginTop: 10 }}>
                                {visibleCount < finalData.length ? (
                                    <TouchableOpacity onPress={() => setVisibleCount(prev => prev + 20)} style={styles.loadMoreBtn}>
                                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({finalData.length - visibleCount} remaining)</Text>
                                    </TouchableOpacity>
                                ) : (
                                    finalData.length > 0 ? <Text style={styles.endListText}>--- End of List ---</Text> : null
                                )}
                            </View>
                        }
                    />
                </View>
            </ScrollView>

            {/* EXPENSE MODAL */}
            <Modal visible={expenseModalVisible} transparent={true} animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'center'}} keyboardShouldPersistTaps="handled">
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>End Day Expenses</Text>
                            
                            <View style={{marginBottom:10}}>
                                <Text style={{fontSize:12, color:'gray', marginBottom:2}}>Total Amount (Auto)</Text>
                                <TextInput style={[styles.input, {borderColor:'#3b5998', borderWidth:2, backgroundColor:'#e3f2fd', color:'#333', fontWeight:'bold'}]} placeholder="0" value={expenses.totalAmount} editable={false} />
                            </View>

                            <TextInput style={styles.input} placeholder="DA" keyboardType="numeric" value={expenses.da} onChangeText={(t) => handleExpenseChange('da', t)} />
                            <TextInput style={styles.input} placeholder="Hotel" keyboardType="numeric" value={expenses.hotel} onChangeText={(t) => handleExpenseChange('hotel', t)} />
                            <TextInput style={styles.input} placeholder="Misc" keyboardType="numeric" value={expenses.misc} onChangeText={(t) => handleExpenseChange('misc', t)} />
                            
                            <TextInput style={[styles.input, {height: 80, textAlignVertical: 'top'}]} placeholder="Note / Remark (Optional)" multiline={true} numberOfLines={3} value={expenses.note} onChangeText={(t) => setExpenses(prev => ({...prev, note: t}))} />

                            <View style={styles.row}>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setExpenseModalVisible(false)} disabled={loading}>
                                    <Text>Cancel</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity style={[styles.saveBtn, loading && {opacity: 0.6}]} onPress={handleFinalizeDayOut} disabled={loading}>
                                    {loading ? <ActivityIndicator size="small" color="white" /> : <Text style={{color:'white'}}>Submit</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>

            {/* USER FILTER MODAL */}
            <Modal visible={showUserModal} transparent={true} animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.userModalContent}>
                        <Text style={styles.modalTitle}>Select Employee</Text>
                        <ScrollView style={{maxHeight: 300}}>
                            <TouchableOpacity style={styles.userItem} onPress={() => { setFilterUser('All'); setShowUserModal(false); }}>
                                <Text style={{fontWeight: filterUser==='All'?'bold':'normal', color: filterUser==='All'?'#e67e22':'#333'}}>All Employees</Text>
                            </TouchableOpacity>
                            {uniqueUsers.map((u:any, i:number) => (
                                <TouchableOpacity key={i} style={styles.userItem} onPress={() => { setFilterUser(u); setShowUserModal(false); }}>
                                    <Text style={{fontWeight: filterUser===u?'bold':'normal', color: filterUser===u?'#e67e22':'#333'}}>{u}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowUserModal(false)}><Text style={{color:'white'}}>Close</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* DETAIL POPUP */}
            <Modal visible={detailModalVisible} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.detailCard}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                            <Text style={styles.modalTitle}>Full Details</Text>
                            <TouchableOpacity onPress={() => setDetailModalVisible(false)}><Ionicons name="close-circle" size={30} color="#d32f2f" /></TouchableOpacity>
                        </View>
                        {selectedItem && (
                            <View>
                                <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}>
                                    <Text style={{color:'gray', fontWeight:'600', fontSize:14}}>Employee</Text>
                                    <Text style={{fontWeight:'bold', color: '#2e7d32', maxWidth:'60%', textAlign:'right', fontSize:14}}>{selectedItem.senderName}</Text>
                                </View>
                                <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}>
                                    <Text style={{color:'gray', fontWeight:'600', fontSize:14}}>Date</Text>
                                    <Text style={{fontWeight:'bold', color: '#333', maxWidth:'60%', textAlign:'right', fontSize:14}}>{formatDateDisplay(selectedItem.date)}</Text>
                                </View>
                                
                                <View style={styles.divider} />
                                
                                {selectedItem.type === 'ATTENDANCE' && (
                                    <>
                                        <View style={{flexDirection:'row', justifyContent:'space-between', backgroundColor:'#f9f9f9', padding:10, borderRadius:8}}>
                                            <View style={{alignItems:'center'}}>
                                                <Text style={{fontSize:11, color:'gray'}}>IN TIME</Text>
                                                <Text style={{fontWeight:'bold', color:'green', fontSize:14}}>{selectedItem.inTime}</Text>
                                            </View>
                                            <View style={{alignItems:'center'}}>
                                                <Text style={{fontSize:11, color:'gray'}}>OUT TIME</Text>
                                                <Text style={{fontWeight:'bold', color:'red', fontSize:14}}>{selectedItem.outTime || '--'}</Text>
                                            </View>
                                            <View style={{alignItems:'center'}}>
                                                <Text style={{fontSize:11, color:'gray'}}>TOTAL HRS</Text>
                                                <Text style={{fontWeight:'bold', color:'#333', fontSize:14}}>{selectedItem.workHrs || '--'}</Text>
                                            </View>
                                        </View>

                                        <View style={styles.divider}/>
                                        <Text style={{fontSize:14, fontWeight:'bold', color:'#3b5998', marginBottom:8}}>📍 Locations</Text>
                                        <View style={{marginBottom:10}}>
                                            <Text style={{fontSize:11, color:'green', fontWeight:'bold'}}>Login Location:</Text>
                                            <Text style={{fontSize:12, color:'#333'}}>{selectedItem.location?.address || 'Unknown Location'}</Text>
                                        </View>
                                        {selectedItem.outTime && selectedItem.outTime !== '--' && (
                                            <View>
                                                <Text style={{fontSize:11, color:'red', fontWeight:'bold'}}>Logout Location:</Text>
                                                <Text style={{fontSize:12, color:'#333'}}>{selectedItem.outAddress || 'Unknown Location'}</Text>
                                            </View>
                                        )}

                                        <View style={styles.divider}/>
                                        <Text style={{fontSize:14, fontWeight:'bold', color:'#3b5998', marginBottom:8}}>💰 Today's Expenses</Text>
                                        <View style={{backgroundColor:'#fff3e0', padding:10, borderRadius:8}}>
                                            <Text style={{color:'#333', fontSize:13}}>DA: ₹{selectedItem.expenses?.da || 0}</Text>
                                            <Text style={{color:'#333', fontSize:13}}>Hotel: ₹{selectedItem.expenses?.hotel || 0}</Text>
                                            <Text style={{color:'#333', fontSize:13}}>Misc: ₹{selectedItem.expenses?.misc || 0}</Text>
                                            <View style={{height:1, backgroundColor:'#ccc', marginVertical:5}}/>
                                            <Text style={{color:'#e65100', fontWeight:'bold', fontSize:14}}>Total: ₹{selectedItem.expenses?.totalAmount || 0}</Text>
                                            {selectedItem.expenses?.note ? (
                                                <View style={{marginTop: 5, backgroundColor:'#fffde7', padding:8, borderRadius:5, borderWidth:1, borderColor:'#fff9c4'}}>
                                                    <Text style={{fontSize:11, color:'#fbc02d', fontWeight:'bold'}}>NOTE: {selectedItem.expenses.note}</Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    </>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#3b5998', paddingTop: 50, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    
    card: { backgroundColor: 'white', margin: 15, padding: 20, borderRadius: 15, alignItems: 'center', elevation: 3 },
    dateText: { fontSize: 16, color: 'gray' },
    timerText: { fontSize: 36, fontWeight: 'bold', color: '#2e7d32', marginVertical: 10 },
    timeText: { fontSize: 24, fontWeight: 'bold', color: '#333', marginVertical: 10 },
    locationBox: { flexDirection: 'row', backgroundColor: '#e3f2fd', padding: 10, borderRadius: 8, width: '100%', marginBottom: 20, justifyContent:'center' },
    locText: { marginLeft: 10, color: '#333' },
    punchBtn: { width: 150, height: 150, borderRadius: 75, justifyContent: 'center', alignItems: 'center', elevation: 5 },
    punchBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18, marginTop:5 },

    historySection: { marginHorizontal: 12 },
    sectionTitle: { fontWeight: 'bold', fontSize: 16, color:'#555', marginBottom: 8 },
    filterBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0d47a1', padding: 10, borderRadius: 8, marginBottom: 10 },
    monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 8, borderRadius: 8, marginBottom: 10 },
    monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

    tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 3, marginBottom: 10 },
    tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
    activeTab: { backgroundColor: 'white', elevation: 2 },
    tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
    activeTabText: { color: '#3b5998', fontWeight: 'bold' },

    summaryGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    summaryBox: { width: '32%', paddingVertical: 8, borderRadius: 8, alignItems: 'center', elevation: 1 },

    historyCard: { backgroundColor: 'white', marginBottom: 12, padding: 15, borderRadius: 10, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#3b5998' },
    bgLeave: { backgroundColor: '#fff3e0', borderLeftColor: '#e65100' },
    bgHoliday: { backgroundColor: '#fce4ec', borderLeftColor: '#c2185b' },
    bgAbsent: { backgroundColor: '#ffebee', borderLeftColor: '#d32f2f' },
    bgShort: { backgroundColor: '#fff8e1', borderLeftColor: '#ff9800' }, 
    historyTitle: { fontWeight: 'bold', fontSize: 16, color: '#333' },
    valText: { fontSize: 14, color: '#555', marginTop: 4 },

    loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
    endListText: { textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 10 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color:'#3b5998' },
    input: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 5, marginBottom: 8 },
    row: { flexDirection:'row', justifyContent:'space-between', marginTop:10 },
    cancelBtn: { padding: 12, flex:1, alignItems:'center' },
    saveBtn: { backgroundColor: '#3b5998', padding: 12, alignItems: 'center', borderRadius: 5, flex:1 },
    
    userModalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: 400 },
    userItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    closeModalBtn: { backgroundColor: '#3b5998', padding: 10, marginTop: 10, borderRadius: 5, alignItems: 'center' },
    
    detailCard: { backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5 },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
});