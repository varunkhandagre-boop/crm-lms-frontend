import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Laptop / desktop web: lists shown as an Excel-like table. Used inside the
// screen's existing FlatList (header = ListHeaderComponent, rows = renderItem)
// so paging, pull-to-refresh and filters stay exactly the same as on the phone.

export type TableColumn<T> = {
    key: string;
    label: string;
    flex?: number;          // share of the free width (default 1)
    width?: number;         // fixed width in px instead of flex
    align?: 'left' | 'right' | 'center';
    render: (item: T) => React.ReactNode;
};

const cellBox = (c: TableColumn<any>) => (c.width ? { width: c.width } : { flex: c.flex ?? 1, minWidth: 140 });
const alignText = (c: TableColumn<any>) => ({ textAlign: c.align || 'left' } as const);

export function TableHeader<T>({ columns }: { columns: TableColumn<T>[] }) {
    return (
        <View style={styles.headerRow}>
            {columns.map((c) => (
                <View key={c.key} style={[styles.cell, cellBox(c)]}>
                    <Text style={[styles.headerText, alignText(c)]} numberOfLines={1}>{c.label}</Text>
                </View>
            ))}
        </View>
    );
}

export function TableRow<T>({ columns, item, index, onPress, tint }: {
    columns: TableColumn<T>[]; item: T; index: number; onPress?: () => void; tint?: string;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={({ hovered }: any) => [
                styles.row,
                index % 2 === 1 && styles.rowAlt,
                tint ? { borderLeftColor: tint } : null,
                hovered && styles.rowHover,
            ]}
        >
            {columns.map((c) => {
                const v = c.render(item);
                return (
                    <View key={c.key} style={[styles.cell, cellBox(c), { alignItems: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start' }]}>
                        {typeof v === 'string' || typeof v === 'number'
                            ? <Text style={[styles.cellText, alignText(c)]} numberOfLines={2}>{v}</Text>
                            : v}
                    </View>
                );
            })}
        </Pressable>
    );
}

/** Small coloured status label for table cells. */
export function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
    return (
        <View style={[styles.pill, { backgroundColor: bg }]}>
            <Text style={[styles.pillText, { color }]} numberOfLines={1}>{text}</Text>
        </View>
    );
}

/** Two-line cell: bold main text + small grey second line. */
export function TwoLine({ main, sub }: { main: string; sub?: string }) {
    return (
        <View>
            <Text style={styles.mainText} numberOfLines={1}>{main || '-'}</Text>
            {!!sub && <Text style={styles.subText} numberOfLines={1}>{sub}</Text>}
        </View>
    );
}

export const inr = (n: any) => {
    const v = Number(n);
    return Number.isFinite(v) ? `₹${v.toLocaleString('en-IN')}` : '-';
};

const styles = StyleSheet.create({
    headerRow: { flexDirection: 'row', backgroundColor: '#3b5998', paddingVertical: 9, paddingHorizontal: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8, marginHorizontal: 8, marginTop: 6 },
    headerText: { color: 'white', fontWeight: '700', fontSize: 12 },
    row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingVertical: 8, paddingHorizontal: 8, marginHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#eef0f4', borderLeftWidth: 3, borderLeftColor: 'transparent' },
    rowAlt: { backgroundColor: '#fafbfd' },
    rowHover: { backgroundColor: '#eef3ff' },
    cell: { paddingHorizontal: 6, justifyContent: 'center' },
    cellText: { fontSize: 13, color: '#2d3748' },
    mainText: { fontSize: 13, fontWeight: '600', color: '#2d3748' },
    subText: { fontSize: 11, color: '#8a93a6', marginTop: 1 },
    pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
    pillText: { fontSize: 11, fontWeight: '700' },
});
