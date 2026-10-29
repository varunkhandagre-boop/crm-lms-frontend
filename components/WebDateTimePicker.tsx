import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Web stand-in for @react-native-community/datetimepicker, which draws nothing
// in a browser (so on app.lifelinem.com every date stayed "today"). metro.config.js
// points the package to this file for the web build only; screens keep their
// usual <DateTimePicker value mode {...pickerHandlers(fn)} /> code.
// Shows a small dialog with the browser's own date / time box.

type Props = {
    value: Date;
    mode?: 'date' | 'time' | 'datetime' | 'countdown';
    minimumDate?: Date;
    maximumDate?: Date;
    onValueChange?: (event: any, date: Date) => void;
    onDismiss?: () => void;
    onChange?: (event: any, date?: Date) => void;
    [key: string]: any;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toHm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function WebDateTimePicker({ value, mode = 'date', minimumDate, maximumDate, onValueChange, onDismiss, onChange }: Props) {
    const isTime = mode === 'time';
    const start = value instanceof Date && !isNaN(value.getTime()) ? value : new Date();
    const [text, setText] = useState(isTime ? toHm(start) : toYmd(start));
    const inputRef = useRef<any>(null);

    useEffect(() => {
        // Open the browser's calendar straight away where supported.
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        try { el.showPicker?.(); } catch { /* needs a click in some browsers — the box is there */ }
    }, []);

    const cancel = () => {
        onDismiss?.();
        onChange?.({ type: 'dismissed', nativeEvent: {} }, undefined);
    };

    const confirm = () => {
        if (!text) return cancel();
        const d = new Date(start);
        if (isTime) {
            const [h, m] = text.split(':').map(Number);
            d.setHours(h, m, 0, 0);
        } else {
            const [y, mo, day] = text.split('-').map(Number);
            d.setFullYear(y, mo - 1, day);
        }
        const event = { type: 'set', nativeEvent: { timestamp: d.getTime() } };
        onValueChange?.(event, d);
        onChange?.(event, d);
    };

    const input = React.createElement('input', {
        ref: inputRef,
        type: isTime ? 'time' : 'date',
        value: text,
        min: !isTime && minimumDate ? toYmd(minimumDate) : undefined,
        max: !isTime && maximumDate ? toYmd(maximumDate) : undefined,
        onChange: (e: any) => setText(e.target.value),
        onKeyDown: (e: any) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); },
        style: { fontSize: 18, padding: 10, border: '1px solid #d5d9de', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
    });

    return (
        <Modal transparent visible animationType="fade" onRequestClose={cancel}>
            <Pressable style={styles.backdrop} onPress={cancel}>
                <Pressable style={styles.card} onPress={() => { /* keep open */ }}>
                    <Text style={styles.title}>{isTime ? 'Select time' : 'Select date'}</Text>
                    {input}
                    <View style={styles.row}>
                        <TouchableOpacity onPress={cancel} style={[styles.btn, styles.btnGhost]}>
                            <Text style={styles.btnGhostText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={confirm} style={[styles.btn, styles.btnMain]}>
                            <Text style={styles.btnMainText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { width: '100%', maxWidth: 340, backgroundColor: 'white', borderRadius: 14, padding: 18 },
    title: { fontSize: 16, fontWeight: 'bold', color: '#2c4f8f', marginBottom: 12 },
    row: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
    btn: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 8, marginLeft: 10 },
    btnGhost: { backgroundColor: '#f1f3f5' },
    btnGhostText: { color: '#555', fontWeight: '600' },
    btnMain: { backgroundColor: '#2c4f8f' },
    btnMainText: { color: 'white', fontWeight: 'bold' },
});
