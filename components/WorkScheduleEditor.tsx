import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { DAY_SHORT, describeSchedule, isValidHhmm, WorkSchedule } from '../utils/workSchedule';

interface Props {
    value: WorkSchedule;
    onChange: (s: WorkSchedule) => void;
    showGrace?: boolean; // grace is a company rule — shown only in company settings
}

const NTH = ['1st', '2nd', '3rd', '4th', '5th'];

// Weekly off days, Saturday rule (e.g. 2nd & 4th) and shift time.
export default function WorkScheduleEditor({ value, onChange, showGrace }: Props) {
    const toggle = (list: number[], n: number) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n].sort());
    const satAlwaysOff = value.weeklyOffDays.includes(6);
    const badTime = (t: string | null) => !!t && !isValidHhmm(t);

    return (
        <View>
            <Text style={styles.label}>Weekly off</Text>
            <View style={styles.row}>
                {DAY_SHORT.map((d, i) => {
                    const on = value.weeklyOffDays.includes(i);
                    return (
                        <TouchableOpacity key={d} style={[styles.chip, on && styles.chipOn]} onPress={() => onChange({ ...value, weeklyOffDays: toggle(value.weeklyOffDays, i) })}>
                            <Text style={[styles.chipText, on && styles.chipTextOn]}>{d}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {!satAlwaysOff && (
                <>
                    <Text style={styles.label}>Also off on these Saturdays</Text>
                    <View style={styles.row}>
                        {NTH.map((n, i) => {
                            const on = value.offSaturdays.includes(i + 1);
                            return (
                                <TouchableOpacity key={n} style={[styles.chip, on && styles.chipOn]} onPress={() => onChange({ ...value, offSaturdays: toggle(value.offSaturdays, i + 1) })}>
                                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{n}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </>
            )}

            <View style={styles.timeRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.label}>Shift start</Text>
                    <TextInput
                        style={[styles.input, badTime(value.shiftStart) && styles.inputBad]}
                        value={value.shiftStart ?? ''}
                        onChangeText={(t) => onChange({ ...value, shiftStart: t.trim() || null })}
                        placeholder="09:30"
                        maxLength={5}
                        keyboardType="numbers-and-punctuation"
                    />
                </View>
                <View style={{ flex: 1, marginRight: showGrace ? 8 : 0 }}>
                    <Text style={styles.label}>Shift end</Text>
                    <TextInput
                        style={[styles.input, badTime(value.shiftEnd) && styles.inputBad]}
                        value={value.shiftEnd ?? ''}
                        onChangeText={(t) => onChange({ ...value, shiftEnd: t.trim() || null })}
                        placeholder="18:30"
                        maxLength={5}
                        keyboardType="numbers-and-punctuation"
                    />
                </View>
                {showGrace && (
                    <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Late after (min)</Text>
                        <TextInput
                            style={styles.input}
                            value={String(value.graceMinutes ?? 0)}
                            onChangeText={(t) => onChange({ ...value, graceMinutes: Math.min(240, Number(t.replace(/[^0-9]/g, '')) || 0) })}
                            keyboardType="numeric"
                            maxLength={3}
                        />
                    </View>
                )}
            </View>
            {(badTime(value.shiftStart) || badTime(value.shiftEnd)) && <Text style={styles.err}>Time must be 24-hour HH:MM, e.g. 09:30 or 18:30</Text>}
            <Text style={styles.summary}>{describeSchedule(value)}</Text>
        </View>
    );
}

export function scheduleHasErrors(s: WorkSchedule): boolean {
    return (!!s.shiftStart && !isValidHhmm(s.shiftStart)) || (!!s.shiftEnd && !isValidHhmm(s.shiftEnd));
}

const styles = StyleSheet.create({
    label: { fontSize: 12, color: '#555', fontWeight: '600', marginTop: 10, marginBottom: 6 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#cfd8dc', backgroundColor: '#fff' },
    chipOn: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
    chipText: { fontSize: 12, color: '#3b5998', fontWeight: '600' },
    chipTextOn: { color: '#fff' },
    timeRow: { flexDirection: 'row' },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
    inputBad: { borderColor: '#e53935' },
    err: { color: '#e53935', fontSize: 11, marginTop: 4 },
    summary: { fontSize: 12, color: '#2e7d32', marginTop: 8, fontWeight: '600' },
});
