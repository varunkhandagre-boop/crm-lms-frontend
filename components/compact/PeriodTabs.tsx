import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

type Props<T extends string> = {
    value: T;
    onChange: (value: T) => void;
    options?: readonly T[];
    accent?: string;
    style?: ViewStyle;
};

const DEFAULT_OPTIONS = ['Day', 'Month', 'FY', 'All'] as const;

/** Thin segmented control for Day / Month / FY / All. */
export default function PeriodTabs<T extends string>({ value, onChange, options, accent = '#3b5998', style }: Props<T>) {
    const list = (options ?? (DEFAULT_OPTIONS as unknown as readonly T[]));
    return (
        <View style={[styles.wrap, style]}>
            {list.map((opt) => {
                const active = opt === value;
                return (
                    <TouchableOpacity
                        key={opt}
                        style={[styles.tab, active && styles.activeTab]}
                        onPress={() => onChange(opt)}
                        hitSlop={{ top: 8, bottom: 8 }}
                    >
                        <Text style={[styles.text, active && { color: accent, fontWeight: 'bold' }]}>{opt}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { flexDirection: 'row', backgroundColor: '#eceff1', borderRadius: 8, padding: 2, marginHorizontal: 12, marginTop: 6 },
    tab: { flex: 1, paddingVertical: 5, alignItems: 'center', borderRadius: 6 },
    activeTab: { backgroundColor: 'white', elevation: 1 },
    text: { fontSize: 12, fontWeight: '600', color: '#757575' },
});
