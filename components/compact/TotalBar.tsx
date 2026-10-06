import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
    label: string;
    count: number;
    /** Omit for screens that only count records. */
    amount?: number;
    accent?: string;
};

/** Thin one-line total: "Total (Pending): 224 • ₹1,20,54,773". */
export default function TotalBar({ label, count, amount, accent = '#3b5998' }: Props) {
    const value = amount === undefined
        ? `${count} ${count === 1 ? 'record' : 'records'}`
        : `${count} • ₹${amount.toLocaleString('en-IN')}`;
    return (
        <View style={styles.bar}>
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
            <Text style={[styles.value, { color: accent }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        marginHorizontal: 12, marginTop: 6, paddingHorizontal: 10, paddingVertical: 5,
        backgroundColor: '#f5f7fb', borderRadius: 6,
    },
    label: { flex: 1, fontSize: 12, fontWeight: '600', color: '#616161' },
    value: { fontSize: 14, fontWeight: 'bold' },
});
