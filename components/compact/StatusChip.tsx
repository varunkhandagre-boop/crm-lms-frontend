import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
    label: string;
    active: boolean;
    onPress: () => void;
    /** Small text after the label, e.g. "12 • ₹4.5L". */
    detail?: string;
    activeColor?: string;
};

/** Single-line filter chip: "Pending  12 • ₹4.5L". */
export default function StatusChip({ label, active, onPress, detail, activeColor = '#3b5998' }: Props) {
    return (
        <TouchableOpacity
            style={[styles.chip, active && { backgroundColor: activeColor, borderColor: activeColor }]}
            onPress={onPress}
            hitSlop={{ top: 6, bottom: 6 }}
        >
            <Text style={[styles.label, active && styles.activeText]}>{label}</Text>
            {detail ? <Text style={[styles.detail, active ? styles.activeText : { color: activeColor }]}>{detail}</Text> : null}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30,
        paddingHorizontal: 11, borderRadius: 15, marginRight: 8,
        backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0',
    },
    label: { fontSize: 12, fontWeight: 'bold', color: '#555' },
    detail: { fontSize: 11, fontWeight: '600' },
    activeText: { color: 'white' },
});
