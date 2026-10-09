import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { CompanyProfilePayload, fetchCompanyProfile, updateCompanyProfile } from '../services/api/companies';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { cellText, readExcelRows, shareExcel } from '../utils/excelImport';
import { useData } from './context/DataContext';

// One row per detail: "Field" | "Value". Logo, signature and QR code stay photo uploads in Company Profile.
const FIELDS: { label: string; key: keyof CompanyProfilePayload; read: (c: any) => string }[] = [
    { label: 'Company Name', key: 'companyName', read: (c) => c.companyName },
    { label: 'Short Name', key: 'shortName', read: (c) => c.shortName },
    { label: 'Tagline', key: 'tagline', read: (c) => c.tagline },
    { label: 'Address', key: 'addressLine', read: (c) => c.addressLine },
    { label: 'City', key: 'city', read: (c) => c.city },
    { label: 'State', key: 'state', read: (c) => c.state },
    { label: 'Pincode', key: 'pincode', read: (c) => c.pincode },
    { label: 'GST Number', key: 'gstNumber', read: (c) => c.gstNumber },
    { label: 'Email', key: 'contactEmail', read: (c) => c.contactEmail },
    { label: 'Phone', key: 'contactPhone', read: (c) => c.contactPhone },
    { label: 'Landline', key: 'landline', read: (c) => c.landline },
    { label: 'Website', key: 'website', read: (c) => c.website },
    { label: 'UPI ID', key: 'upiId', read: (c) => c.upiId },
    { label: 'Bank 1 Name', key: 'bank1Name', read: (c) => c.bankDetails1?.bankName },
    { label: 'Bank 1 Account No', key: 'bank1Acc', read: (c) => c.bankDetails1?.accountNo },
    { label: 'Bank 1 IFSC', key: 'bank1Ifsc', read: (c) => c.bankDetails1?.ifsc },
    { label: 'Bank 1 Branch', key: 'bank1Branch', read: (c) => c.bankDetails1?.branch },
    { label: 'Bank 2 Name', key: 'bank2Name', read: (c) => c.bankDetails2?.bankName },
    { label: 'Bank 2 Account No', key: 'bank2Acc', read: (c) => c.bankDetails2?.accountNo },
    { label: 'Bank 2 IFSC', key: 'bank2Ifsc', read: (c) => c.bankDetails2?.ifsc },
    { label: 'Bank 2 Branch', key: 'bank2Branch', read: (c) => c.bankDetails2?.branch },
];

type Change = { label: string; key: keyof CompanyProfilePayload; from: string; to: string };

export default function BulkImportCompanyScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    const { companyProfile, setCompanyProfile } = useData() as any;

    const [loading, setLoading] = useState(false);
    const [changes, setChanges] = useState<Change[] | null>(null);
    const [unknown, setUnknown] = useState<string[]>([]);

    // The sheet always holds the current details, so it doubles as the blank template for a new company.
    const downloadSheet = async () => {
        setLoading(true);
        try {
            const cp = await fetchCompanyProfile();
            const rows = FIELDS.map((f) => ({ Field: f.label, Value: f.read(cp) || '' }));
            await shareExcel(rows, ['Field', 'Value'], 'Company Profile', 'Company_Profile.xlsx');
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not create the Excel file.');
        } finally {
            setLoading(false);
        }
    };

    const pickFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
                copyToCacheDirectory: true,
            });
            if (result.canceled || !result.assets?.length) return;
            setLoading(true);
            const rows = await readExcelRows(result.assets[0].uri);
            const cp = await fetchCompanyProfile();

            const found: Change[] = [];
            const notKnown: string[] = [];
            for (const r of rows) {
                const label = cellText(r['Field']);
                if (!label) continue;
                const field = FIELDS.find((f) => f.label.toLowerCase() === label.toLowerCase());
                if (!field) { notKnown.push(label); continue; }
                const to = cellText(r['Value']) ?? '';
                const from = field.read(cp) || '';
                // Empty cells never wipe an existing value.
                if (to && to !== from) found.push({ label: field.label, key: field.key, from, to });
            }
            setUnknown(notKnown);
            setChanges(found);
            if (!rows.length) Alert.alert('Empty File', 'No rows found. Use the downloaded sheet (columns "Field" and "Value").');
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not read the Excel file.');
        } finally {
            setLoading(false);
        }
    };

    const save = async () => {
        if (!changes?.length) return;
        const payload: CompanyProfilePayload = {};
        for (const c of changes) (payload as any)[c.key] = c.key === 'shortName' ? c.to.toUpperCase() : c.to;
        setLoading(true);
        try {
            const res = await updateCompanyProfile(payload);
            if (setCompanyProfile) setCompanyProfile({ ...companyProfile, ...res.record });
            Alert.alert('Saved', `${changes.length} company detail(s) updated.`);
            router.back();
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not save.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Company Profile — Excel</Text>
                <View style={{ width: 24 }} />
            </View>

            {loading && (
                <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#3b5998" /></View>
            )}

            {changes === null ? (
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.card}>
                        <Text style={styles.stepTitle}>Step 1 — Download Sheet</Text>
                        <Text style={styles.stepDesc}>
                            The sheet lists every company detail (name, address, GST, contact, UPI, both bank accounts) with what is saved now. Fill or correct the “Value” column.
                        </Text>
                        <TouchableOpacity style={styles.primaryBtn} onPress={downloadSheet}>
                            <Ionicons name="download-outline" size={18} color="white" />
                            <Text style={styles.primaryBtnText}>Download Company Sheet</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.stepTitle}>Step 2 — Upload</Text>
                        <Text style={styles.stepDesc}>You will see every change before it is saved. Empty cells keep the current value.</Text>
                        <TouchableOpacity style={styles.primaryBtn} onPress={pickFile}>
                            <Ionicons name="folder-open-outline" size={18} color="white" />
                            <Text style={styles.primaryBtnText}>Choose Excel File</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.note}>Logo, signature, QR code and office location are added in Company Profile.</Text>
                </ScrollView>
            ) : (
                <>
                    <FlatList
                        data={changes}
                        keyExtractor={(c) => c.key}
                        contentContainerStyle={{ padding: 15 }}
                        ListHeaderComponent={
                            <>
                                <Text style={styles.stepTitle}>{changes.length ? `${changes.length} change(s) to save` : 'Nothing new in this file.'}</Text>
                                {unknown.length > 0 && <Text style={styles.warn}>Ignored rows (unknown field): {unknown.join(', ')}</Text>}
                            </>
                        }
                        renderItem={({ item }) => (
                            <View style={styles.changeRow}>
                                <Text style={styles.changeLabel}>{item.label}</Text>
                                {!!item.from && <Text style={styles.changeFrom}>{item.from}</Text>}
                                <Text style={styles.changeTo}>{item.to}</Text>
                            </View>
                        )}
                    />
                    <View style={styles.bottomBar}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setChanges(null)}>
                            <Text style={styles.cancelBtnText}>Back</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.confirmBtn, !changes.length && { opacity: 0.5 }]} onPress={save} disabled={!changes.length}>
                            <Text style={styles.confirmBtnText}>Save Changes</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#3b5998', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    content: { padding: 20 },
    loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    card: { backgroundColor: 'white', borderRadius: 12, padding: 20, marginBottom: 20, elevation: 2 },
    stepTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 8 },
    stepDesc: { fontSize: 13, color: '#666', lineHeight: 19, marginBottom: 15 },
    primaryBtn: { backgroundColor: '#3b5998', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 8, gap: 8 },
    primaryBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
    note: { fontSize: 12, color: 'gray', textAlign: 'center' },
    warn: { fontSize: 12, color: '#e65100', marginBottom: 8 },
    changeRow: { backgroundColor: 'white', borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e0e0e0' },
    changeLabel: { fontSize: 12, color: 'gray', fontWeight: '600' },
    changeFrom: { fontSize: 13, color: '#c62828', textDecorationLine: 'line-through', marginTop: 2 },
    changeTo: { fontSize: 14, color: '#2e7d32', fontWeight: 'bold', marginTop: 2 },
    bottomBar: { flexDirection: 'row', padding: 15, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
    cancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
    cancelBtnText: { color: '#666', fontWeight: 'bold' },
    confirmBtn: { flex: 2, padding: 14, borderRadius: 8, backgroundColor: '#2e7d32', alignItems: 'center' },
    confirmBtnText: { color: 'white', fontWeight: 'bold' },
});
