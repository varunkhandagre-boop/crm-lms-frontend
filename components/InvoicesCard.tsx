import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getMyInvoice, InvoiceSummary, listMyInvoices } from '../services/api/invoices';
import { shareInvoicePdf } from '../utils/invoiceHtml';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Plan & Renewal: GST invoices of this company's plan purchases (Admin). */
export default function InvoicesCard() {
    const [items, setItems] = useState<InvoiceSummary[] | null>(null);
    const [total, setTotal] = useState(0);
    const [showAll, setShowAll] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        listMyInvoices(1, 50)
            .then(r => { setItems(r.items); setTotal(r.total); })
            .catch(() => setItems([]));
    }, []);

    if (!items || items.length === 0) return null; // nothing bought yet (or not allowed)

    const download = async (id: string) => {
        setBusyId(id);
        try {
            await shareInvoicePdf(await getMyInvoice(id));
        } catch (e: any) {
            Alert.alert('Could not open the invoice', e?.message || 'Please try again.');
        } finally {
            setBusyId(null);
        }
    };

    const shown = showAll ? items : items.slice(0, 3);
    return (
        <View style={styles.card}>
            <View style={styles.head}>
                <Ionicons name="receipt-outline" size={18} color="#3b5998" />
                <Text style={styles.title}>GST invoices</Text>
                <Text style={styles.count}>{total}</Text>
            </View>
            {shown.map(inv => (
                <TouchableOpacity key={inv.id} style={styles.row} onPress={() => download(inv.id)} disabled={busyId === inv.id} accessibilityRole="button">
                    <View style={{ flex: 1 }}>
                        <Text style={styles.no}>{inv.invoiceNo}</Text>
                        <Text style={styles.sub}>{fmtDate(inv.invoiceDate)} • {inv.employees} employees • valid till {fmtDate(inv.periodTo)}</Text>
                    </View>
                    <Text style={styles.amount}>₹{inv.total.toLocaleString('en-IN')}</Text>
                    {busyId === inv.id
                        ? <ActivityIndicator size="small" color="#3b5998" style={{ marginLeft: 10 }} />
                        : <Ionicons name="download-outline" size={20} color="#3b5998" style={{ marginLeft: 10 }} />}
                </TouchableOpacity>
            ))}
            {items.length > 3 && (
                <TouchableOpacity onPress={() => setShowAll(v => !v)} style={{ paddingTop: 8 }}>
                    <Text style={styles.more}>{showAll ? 'Show less' : `Show all ${items.length}`}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: '#e3e8f4' },
    head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    title: { fontSize: 14, fontWeight: 'bold', color: '#1a2b4c', flex: 1 },
    count: { fontSize: 12, color: '#777' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f0f2f7' },
    no: { fontSize: 13, fontWeight: '600', color: '#222' },
    sub: { fontSize: 11, color: '#777', marginTop: 2 },
    amount: { fontSize: 13, fontWeight: 'bold', color: '#2e7d32' },
    more: { color: '#3b5998', fontWeight: '600', fontSize: 12, textAlign: 'center' },
});
