import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
    /** Staff picker is shown only when true (Admin / Manager). */
    showStaff?: boolean;
    staffLabel?: string;
    onStaffPress?: () => void;
    /** Leave undefined to hide the ◀ period ▶ part (e.g. "All" view). */
    periodLabel?: string;
    onPrev?: () => void;
    onNext?: () => void;
};

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

/** One line: [👥 Staff ▾]  [◀ Oct 2026 ▶]. Renders nothing when both parts are hidden. */
export default function StaffPeriodRow({ showStaff, staffLabel, onStaffPress, periodLabel, onPrev, onNext }: Props) {
    const showPeriod = periodLabel !== undefined;
    if (!showStaff && !showPeriod) return null;

    return (
        <View style={styles.row}>
            {showStaff && (
                <TouchableOpacity style={styles.staff} onPress={onStaffPress}>
                    <Ionicons name="people" size={15} color="#2e7d32" />
                    <Text style={styles.staffText} numberOfLines={1}>{staffLabel}</Text>
                    <Ionicons name="chevron-down" size={14} color="#2e7d32" />
                </TouchableOpacity>
            )}
            {showPeriod && (
                <View style={[styles.period, !showStaff && styles.periodFull]}>
                    <TouchableOpacity onPress={onPrev} hitSlop={HIT}>
                        <Ionicons name="chevron-back" size={18} color="#555" />
                    </TouchableOpacity>
                    <Text style={styles.periodText} numberOfLines={1}>{periodLabel}</Text>
                    <TouchableOpacity onPress={onNext} hitSlop={HIT}>
                        <Ionicons name="chevron-forward" size={18} color="#555" />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6 },
    staff: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32,
        backgroundColor: '#e8f5e9', borderWidth: 1, borderColor: '#a5d6a7', borderRadius: 16, paddingHorizontal: 10,
    },
    staffText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#2e7d32' },
    period: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32,
        backgroundColor: '#f2f4f7', borderRadius: 16, paddingHorizontal: 8, minWidth: 140,
    },
    periodFull: { flex: 1 },
    periodText: { fontSize: 12, fontWeight: 'bold', color: '#3b5998', marginHorizontal: 6, textAlign: 'center', flexShrink: 1 },
});
