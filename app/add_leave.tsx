import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { pickerHandlers } from '../utils/datePickerHandlers';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

import { useData } from './context/DataContext';

// 🔥 Phase 7: leaves now go to Postgres via this adapter instead of addSaaSData("leaves", ...)
import { applyLeave, fetchLeaves, fetchLeaveSummary, leaveBucket } from '../services/api/leaves';
import { useWorkSchedules } from '../hooks/useWorkSchedules';
import { isOffDay, localYmd } from '../utils/workSchedule';

export default function AddLeaveScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se Current User aur Notification Engine nikala
  const { currentUser, addNotification } = useData();
  const { forUser: scheduleFor } = useWorkSchedules(currentUser?.companyId, currentUser?.id);

  // States
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [type, setType] = useState('Select Leave Type');
  const [days, setDays] = useState('1'); // Auto Calculated
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);

  // Leave balance for this FY (server-computed) and days already waiting for approval
  const [balanceInfo, setBalanceInfo] = useState<Awaited<ReturnType<typeof fetchLeaveSummary>> | null>(null);
  const [pendingDays, setPendingDays] = useState(0);
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [halfDay, setHalfDay] = useState(false);
  const policy = balanceInfo?.policy;
  useEffect(() => {
      let cancelled = false;
      Promise.all([fetchLeaveSummary(), fetchLeaves({ status: 'Pending' })])
          .then(([summary, pending]) => {
              if (cancelled) return;
              setBalanceInfo(summary);
              setPendingDays(pending.reduce((n, l) => n + (parseFloat(l.days) || 0), 0));
              setPendingList(pending);
          })
          .catch(() => {}); // the form still works without the balance
      return () => { cancelled = true; };
  }, []);

  const requested = parseFloat(days) || 0;
  // Leave Policy on: the balance of the selected type (CL / SL / EL / Comp Off);
  // LWP and "paid, no balance" types never warn.
  const bucket = policy?.enabled && type !== 'Select Leave Type' ? leaveBucket(type, policy.otherTypesMode) : null;
  const typedBalance = bucket ? balanceInfo?.balances?.find((b) => b.type === bucket) : undefined;
  const pendingSameBucket = bucket && policy
      ? pendingList.filter((l) => leaveBucket(l.type, policy.otherTypesMode) === bucket).reduce((n, l) => n + (parseFloat(l.days) || 0), 0)
      : 0;
  const available = policy?.enabled
      ? (typedBalance ? Math.max(0, typedBalance.balance - pendingSameBucket) : null)
      : balanceInfo ? Math.max(0, balanceInfo.balance - pendingDays) : null;
  const overBy = available !== null && type !== 'Leave Without Pay' ? Math.max(0, requested - available) : 0;
  const sameDay = localYmd(fromDate) === localYmd(toDate);
  const canHalfDay = !!policy?.halfDayAllowed && sameDay;
  
  const leaveTypes = [
      "Compensatory Off", "Leave Without Pay", "Sick Leave", 
      "Casual Leave", "Regional Festival", "Earned Leave", "Marriage Leave", "Others" 
  ];

  // DATE FORMATTER
  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // --- ⚡ AUTO CALCULATE DAYS LOGIC ---
  useEffect(() => {
    if(fromDate && toDate) {
        // Reset hours for accurate day calculation
        const start = new Date(fromDate); start.setHours(0,0,0,0);
        const end = new Date(toDate); end.setHours(0,0,0,0);
        
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        let total = diffDays + 1; // Include start date
        if (total > 0 && policy && !policy.countOffDays) {
            // Weekly offs don't count (holidays are also left out when saved)
            const sched = scheduleFor(currentUser?.id);
            total = 0;
            for (let t = new Date(start); t <= end; t.setDate(t.getDate() + 1)) {
                if (!isOffDay(localYmd(t), sched)) total++;
            }
        }
        if (diffDays + 1 <= 0) setDays('Invalid'); // End date before Start date
        else if (halfDay && canHalfDay) setDays(total > 0 ? '0.5' : '0');
        else setDays(total.toString());
    }
  }, [fromDate, toDate, halfDay, canHalfDay, policy, scheduleFor, currentUser?.id]);

  // 🔥 3. SAAS SAVE LOGIC (Phase 7: now calls the Postgres API adapter directly)
  const handleSave = async () => {
      if (type === 'Select Leave Type' || !reason) {
          Alert.alert("Missing Fields", "Please select Type and enter Reason.");
          return;
      }
      if (days === 'Invalid' || requested <= 0) {
          Alert.alert("Invalid Dates", "To Date must be same or after From Date.");
          return;
      }
      if (overBy > 0) {
          const ok = await new Promise<boolean>((resolve) =>
              Alert.alert(
                  "More than your balance",
                  `You have ${available} day(s) available but are applying for ${requested}. The extra ${overBy} day(s) may be treated as Leave Without Pay.`,
                  [
                      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
                      { text: "Apply anyway", onPress: () => resolve(true) },
                  ],
                  { cancelable: true, onDismiss: () => resolve(false) }
              )
          );
          if (!ok) return;
      }

      setLoading(true);
      try {
          // 🔥 Phase 7: applyLeave() posts to /api/v1/leaves — server derives company_id,
          // user_id and role from the authenticated request; it also recalculates `days`
          // server-side, so this is treated as a display-only echo of the local calc.
          const result = await applyLeave({
              // Local calendar date — toISOString() is UTC and gave the previous
              // day for leaves applied between midnight and 5:30 AM IST.
              fromDate: localYmd(fromDate),
              toDate: localYmd(toDate),
              type: type,
              reason: reason,
              halfDay: halfDay && canHalfDay,
          });
          
          if (result.success) {
              // 🔥 5. REAL PUSH NOTIFICATION
              if (addNotification) {
                  await addNotification({
                      title: "New Leave Application 📅",
                      message: `${currentUser?.name} applied for ${days} day(s) leave (${type}).`,
                      to: "Admin", // Manager ya HR ko bhi set kar sakte hain future me
                      route: "/leave",
                      type: "alert" // High priority
                  });
              }

              Alert.alert("Success", `Applied for ${days} Day(s) Leave & Admin Notified!`);
              router.back();
          } else {
              Alert.alert("Error", "Could not apply leave.");
          }
      } catch (e) {
          Alert.alert("Error", "Could not apply leave.");
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Leave Application</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{flex: 1}}
      >
        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 100}} keyboardShouldPersistTaps="handled">
            
            {/* Leave balance */}
            {balanceInfo && (
                <View style={styles.balanceCard}>
                    {policy?.enabled && balanceInfo.balances ? (
                        <View style={{ flex: 1 }}>
                            <Text style={styles.balanceLabel}>Leave balance ({balanceInfo.fyLabel})</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                {balanceInfo.balances.map((b) => (
                                    <View key={b.type} style={[styles.typeChip, bucket === b.type && styles.typeChipOn]}>
                                        <Text style={[styles.typeChipText, bucket === b.type && { color: '#fff' }]}>{b.type === 'COMP' ? 'Comp Off' : b.type} {b.balance}</Text>
                                    </View>
                                ))}
                            </View>
                            {available !== null && <Text style={styles.balanceSub}>{type}: {available} day(s) available{pendingSameBucket ? ` (${pendingSameBucket} pending)` : ''}</Text>}
                        </View>
                    ) : (
                    <>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.balanceLabel}>Leave balance ({balanceInfo.fyLabel})</Text>
                        <Text style={styles.balanceValue}>{available} <Text style={{ fontSize: 13, fontWeight: 'normal' }}>day(s) available</Text></Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.balanceSub}>Used: {balanceInfo.used}</Text>
                        {pendingDays > 0 && <Text style={styles.balanceSub}>Pending approval: {pendingDays}</Text>}
                    </View>
                    </>
                    )}
                </View>
            )}

            {/* Type Dropdown */}
            <Text style={styles.label}>Leave Type <Text style={{color:'red'}}>*</Text></Text>
            <TouchableOpacity style={styles.inputBox} onPress={() => setModalVisible(true)}>
                <Text style={{color: type === 'Select Leave Type' ? 'gray' : 'black'}}>{type}</Text>
                <Ionicons name="caret-down" size={14} color="gray" />
            </TouchableOpacity>

            {/* Dates Row */}
            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>From Date</Text>
                    <TouchableOpacity style={styles.inputBox} onPress={() => setShowFromPicker(true)}>
                        <Text style={{flex:1}}>{formatDate(fromDate)}</Text>
                        <Ionicons name="calendar-outline" size={18} color="gray" />
                    </TouchableOpacity>
                    {showFromPicker && (
                        <DateTimePicker 
                            value={fromDate} mode="date" 
                            {...pickerHandlers((e, d) => { setShowFromPicker(false); if(d) setFromDate(d); })} 
                        />
                    )}
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>To Date</Text>
                    <TouchableOpacity style={styles.inputBox} onPress={() => setShowToPicker(true)}>
                        <Text style={{flex:1}}>{formatDate(toDate)}</Text>
                        <Ionicons name="calendar-outline" size={18} color="gray" />
                    </TouchableOpacity>
                    {showToPicker && (
                        <DateTimePicker 
                            value={toDate} mode="date" minimumDate={fromDate}
                            {...pickerHandlers((e, d) => { setShowToPicker(false); if(d) setToDate(d); })} 
                        />
                    )}
                </View>
            </View>

            {/* Total Days (Auto Calculated) */}
            <Text style={styles.label}>Total Days (Auto-Calculated)</Text>
            <View style={[styles.inputBox, {backgroundColor:'#e0e0e0'}]}> 
                <Text style={{flex:1, color: days === 'Invalid' ? 'red' : 'black', fontWeight:'bold'}}>
                    {days}
                </Text>
                <Text style={{fontSize:12, color:'gray'}}>Days</Text>
            </View>
            {canHalfDay && (
                <TouchableOpacity style={styles.halfRow} onPress={() => setHalfDay(!halfDay)}>
                    <Ionicons name={halfDay ? 'checkbox' : 'square-outline'} size={22} color="#3b5998" />
                    <Text style={{ marginLeft: 8, color: '#333', fontWeight: '600' }}>Half day (0.5)</Text>
                </TouchableOpacity>
            )}
            {policy && !policy.countOffDays && <Text style={{ fontSize: 11, color: 'gray', marginTop: -6, marginBottom: 8 }}>Weekly offs and holidays inside the leave are not counted.</Text>}
            {overBy > 0 && (
                <View style={styles.overBox}>
                    <Ionicons name="warning" size={16} color="#c62828" />
                    <Text style={styles.overText}>
                        {overBy} day(s) more than your balance — the extra may be Leave Without Pay.
                    </Text>
                </View>
            )}

            {/* Reason */}
            <Text style={styles.label}>Reason <Text style={{color:'red'}}>*</Text></Text>
            <TextInput 
                style={[styles.inputBox, {height: 100, textAlignVertical:'top'}]} 
                value={reason} 
                onChangeText={setReason}
                multiline
                placeholder="Reason for leave..."
            />

            {/* SUBMIT BUTTON WITH BLUR EFFECT */}
            <TouchableOpacity 
                style={[styles.saveBtn, loading && { opacity: 0.6 }]} 
                onPress={handleSave} 
                disabled={loading}
            >
                {loading ? <ActivityIndicator color="white"/> : <Text style={styles.saveBtnText}>Apply</Text>}
            </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Type Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Leave Type</Text>
                <FlatList 
                    data={leaveTypes}
                    keyExtractor={item => item}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => { setType(item); setModalVisible(false); }}>
                            <Text style={styles.modalItemText}>{item}</Text>
                            {type === item && <Ionicons name="checkmark" size={18} color="#3b5998" />}
                        </TouchableOpacity>
                    )}
                />
                <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                    <Text style={{color:'red'}}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  typeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: '#e8f5e9' },
  typeChipOn: { backgroundColor: '#2e7d32' },
  typeChipText: { fontSize: 12, fontWeight: 'bold', color: '#2e7d32' },
  halfRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  balanceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', borderRadius: 10, padding: 14, marginBottom: 10 },
  balanceLabel: { fontSize: 12, color: '#1565c0', fontWeight: '600' },
  balanceValue: { fontSize: 22, color: '#0d47a1', fontWeight: 'bold', marginTop: 2 },
  balanceSub: { fontSize: 11, color: '#555' },
  overBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', borderRadius: 8, padding: 10, marginTop: 8 },
  overText: { color: '#c62828', fontSize: 12, fontWeight: 'bold', marginLeft: 6, flex: 1 },
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  contentContainer: { padding: 20 },
  label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13, marginTop:15 },
  inputBox: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, fontSize:16 },
  row: { flexDirection:'row', justifyContent:'space-between' },
  col: { width:'48%' },
  saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#3b5998', textAlign:'center' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection:'row', justifyContent:'space-between' },
  modalItemText: { fontSize: 16, color: '#333' },
  closeBtn: { marginTop:15, alignItems:'center', padding:10 }
});
