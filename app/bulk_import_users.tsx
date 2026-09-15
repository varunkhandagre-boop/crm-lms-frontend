import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as XLSX from 'xlsx';

import { BulkUserPreviewItem, BulkUserRow, commitBulkUserImport, previewBulkUserImport } from '../services/api/users';

const TEMPLATE_COLUMNS = [
  'Name', 'Email', 'Mobile', 'Role', 'Emp ID', 'Joining Date', 'Monthly Target',
];

const SAMPLE_ROW = {
  'Name': 'Ravi Kumar',
  'Email': 'ravi.kumar@example.com',
  'Mobile': '9876543210',
  'Role': 'Sales',
  'Emp ID': 'EMP-101',
  'Joining Date': '2026-01-15',
  'Monthly Target': 200000,
};

export default function BulkImportUsersScreen() {
  const router = useRouter();

  const [step, setStep] = useState<'start' | 'preview' | 'done'>('start');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<BulkUserPreviewItem[]>([]);
  const [resultSummary, setResultSummary] = useState<{ created: number; skipped: number; defaultPassword: string; errors: string[] } | null>(null);

  const downloadTemplate = async () => {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([SAMPLE_ROW], { header: TEMPLATE_COLUMNS });
      XLSX.utils.book_append_sheet(wb, ws, 'Employees');

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const uri = FileSystem.cacheDirectory + 'Employee_Import_Template.xlsx';
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });

      await Sharing.shareAsync(uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Download Employee Import Template',
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not generate template.');
    }
  };

  const pickAndParseFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      setLoading(true);
      const fileUri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(base64, { type: 'base64' });
      const sheetName = wb.SheetNames[0];
      const rawRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

      if (rawRows.length === 0) {
        Alert.alert('Empty File', 'No rows found in the uploaded Excel file.');
        setLoading(false);
        return;
      }

      const rows: BulkUserRow[] = rawRows
        .filter((r) => r['Name'] && r['Email'])
        .map((r) => ({
          name: String(r['Name']).trim(),
          email: String(r['Email']).trim(),
          mobile: r['Mobile'] ? String(r['Mobile']).trim() : undefined,
          roleText: r['Role'] ? String(r['Role']).trim() : 'Sales',
          empId: r['Emp ID'] ? String(r['Emp ID']).trim() : undefined,
          joiningDate: r['Joining Date'] ? String(r['Joining Date']).trim() : undefined,
          monthlyTarget: r['Monthly Target'] ? Number(r['Monthly Target']) : undefined,
        }));

      if (rows.length === 0) {
        Alert.alert('No Valid Rows', 'Every row is missing a Name or Email — nothing to import.');
        setLoading(false);
        return;
      }

      const previewResult = await previewBulkUserImport(rows);
      setPreview(previewResult);
      setStep('preview');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not read the Excel file. Make sure it matches the template format.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    setLoading(true);
    try {
      const rows = preview.map(p => p.row);
      const result = await commitBulkUserImport(rows);
      setResultSummary(result);
      setStep('done');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  const newCount = preview.filter(p => p.status === 'new').length;
  const existingCount = preview.filter(p => p.status === 'existing').length;
  const invalidCount = preview.filter(p => p.status === 'invalid').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bulk Import Employees</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3b5998" />
        </View>
      )}

      {step === 'start' && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Ionicons name="document-text-outline" size={40} color="#3b5998" style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={styles.stepTitle}>Step 1 — Download Template</Text>
            <Text style={styles.stepDesc}>
              Get a ready-made Excel sheet. Fill in one row per employee — Name and Email are required.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={downloadTemplate}>
              <Ionicons name="download-outline" size={18} color="white" />
              <Text style={styles.primaryBtnText}>Download Template</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Ionicons name="cloud-upload-outline" size={40} color="#3b5998" style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={styles.stepTitle}>Step 2 — Upload Filled Sheet</Text>
            <Text style={styles.stepDesc}>
              Select your filled-in Excel file. New employees will be created with a default password — they can change it after logging in.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={pickAndParseFile}>
              <Ionicons name="folder-open-outline" size={18} color="white" />
              <Text style={styles.primaryBtnText}>Choose Excel File</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={18} color="#e65100" />
            <Text style={styles.noteText}>
              Existing employees (matched by email) are always skipped — this only adds new employees, it never changes an existing one.
            </Text>
          </View>
        </ScrollView>
      )}

      {step === 'preview' && (
        <>
          <View style={styles.summaryBar}>
            <Text style={styles.summaryText}>
              <Text style={{ color: '#2e7d32', fontWeight: 'bold' }}>{newCount} New</Text>
              {'   '}
              <Text style={{ color: '#e65100', fontWeight: 'bold' }}>{existingCount} Existing (skip)</Text>
              {invalidCount > 0 && <Text style={{ color: '#d32f2f', fontWeight: 'bold' }}>{'   '}{invalidCount} Invalid</Text>}
            </Text>
          </View>
          <FlatList
            data={preview}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 15 }}
            renderItem={({ item }) => (
              <View style={[
                styles.previewRow,
                item.status === 'existing' && styles.previewRowExisting,
                item.status === 'invalid' && styles.previewRowInvalid,
              ]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewName}>{item.row.name || '(no name)'}</Text>
                  <Text style={styles.previewMeta}>{item.row.email} • {item.row.roleText}</Text>
                  {item.error && <Text style={styles.errorText}>{item.error}</Text>}
                </View>
                {item.status === 'new' && (
                  <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>
                )}
                {item.status === 'existing' && (
                  <View style={styles.skipBadge}><Text style={styles.skipBadgeText}>SKIP</Text></View>
                )}
                {item.status === 'invalid' && (
                  <View style={styles.invalidBadge}><Text style={styles.invalidBadgeText}>INVALID</Text></View>
                )}
              </View>
            )}
          />
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep('start')}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleCommit} disabled={newCount === 0}>
              <Text style={styles.confirmBtnText}>Import {newCount} New Employee{newCount === 1 ? '' : 's'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 'done' && resultSummary && (
        <View style={styles.content}>
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={56} color="#2e7d32" style={{ alignSelf: 'center', marginBottom: 15 }} />
            <Text style={[styles.stepTitle, { textAlign: 'center' }]}>Import Complete!</Text>
            <View style={{ marginTop: 15 }}>
              <Text style={styles.resultLine}>✅ {resultSummary.created} employees created</Text>
              {resultSummary.skipped > 0 && <Text style={styles.resultLine}>⏭️ {resultSummary.skipped} skipped</Text>}
              <View style={styles.passwordBox}>
                <Text style={styles.passwordLabel}>Default password for all new employees:</Text>
                <Text style={styles.passwordValue}>{resultSummary.defaultPassword}</Text>
                <Text style={styles.passwordHint}>Share this with them — they can change it after their first login.</Text>
              </View>
              {resultSummary.errors.length > 0 && (
                <View style={{ marginTop: 15 }}>
                  <Text style={{ fontWeight: 'bold', color: '#d32f2f', marginBottom: 5 }}>Some rows had issues:</Text>
                  {resultSummary.errors.map((err, i) => (
                    <Text key={i} style={styles.errorText}>{err}</Text>
                  ))}
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#3b5998', paddingTop: 50, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 20, marginBottom: 20, elevation: 2 },
  stepTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  stepDesc: { fontSize: 13, color: '#666', lineHeight: 19, marginBottom: 15 },
  primaryBtn: { backgroundColor: '#3b5998', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 8, gap: 8 },
  primaryBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  noteBox: { flexDirection: 'row', backgroundColor: '#fff3e0', borderRadius: 8, padding: 12, gap: 8, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 12, color: '#e65100', lineHeight: 17 },
  summaryBar: { backgroundColor: 'white', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  summaryText: { fontSize: 14, textAlign: 'center' },
  previewRow: { backgroundColor: 'white', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0' },
  previewRowExisting: { borderColor: '#ffcc80', backgroundColor: '#fff8e1' },
  previewRowInvalid: { borderColor: '#ef9a9a', backgroundColor: '#ffebee' },
  previewName: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  previewMeta: { fontSize: 12, color: '#777', marginTop: 3 },
  errorText: { fontSize: 11, color: '#d32f2f', marginTop: 3 },
  newBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  newBadgeText: { color: '#2e7d32', fontSize: 11, fontWeight: 'bold' },
  skipBadge: { backgroundColor: '#fff3e0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  skipBadgeText: { color: '#e65100', fontSize: 11, fontWeight: 'bold' },
  invalidBadge: { backgroundColor: '#ffebee', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  invalidBadgeText: { color: '#d32f2f', fontSize: 11, fontWeight: 'bold' },
  bottomBar: { flexDirection: 'row', padding: 15, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  cancelBtnText: { color: '#666', fontWeight: 'bold' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 8, backgroundColor: '#2e7d32', alignItems: 'center' },
  confirmBtnText: { color: 'white', fontWeight: 'bold' },
  resultLine: { fontSize: 14, color: '#333', marginBottom: 8, textAlign: 'center' },
  passwordBox: { backgroundColor: '#e3f2fd', borderRadius: 8, padding: 15, marginTop: 10, alignItems: 'center' },
  passwordLabel: { fontSize: 12, color: '#1565c0' },
  passwordValue: { fontSize: 20, fontWeight: 'bold', color: '#0d47a1', marginTop: 5, letterSpacing: 1 },
  passwordHint: { fontSize: 11, color: '#1565c0', marginTop: 8, textAlign: 'center' },
});
