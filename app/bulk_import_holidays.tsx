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

import { BulkHolidayPreviewItem, BulkHolidayRow, commitBulkHolidayImport, previewBulkHolidayImport } from '../services/api/holidays';

const TEMPLATE_COLUMNS = ['Holiday Name', 'Date'];

const SAMPLE_ROWS = [
  { 'Holiday Name': 'Republic Day', 'Date': '2027-01-26' },
  { 'Holiday Name': 'Holi', 'Date': '2027-03-14' },
  { 'Holiday Name': 'Independence Day', 'Date': '2027-08-15' },
];

export default function BulkImportHolidaysScreen() {
  const router = useRouter();

  const [step, setStep] = useState<'start' | 'preview' | 'done'>('start');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<BulkHolidayPreviewItem[]>([]);
  const [resultSummary, setResultSummary] = useState<{ created: number; skipped: number } | null>(null);

  const downloadTemplate = async () => {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: TEMPLATE_COLUMNS });
      XLSX.utils.book_append_sheet(wb, ws, 'Holidays');

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const uri = FileSystem.cacheDirectory + 'Holiday_Import_Template.xlsx';
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });

      await Sharing.shareAsync(uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Download Holiday Import Template',
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

      const rows: BulkHolidayRow[] = rawRows
        .filter((r) => r['Holiday Name'] && r['Date'])
        .map((r) => {
          let dateStr = r['Date'];
          // Excel sometimes gives a JS Date object or a serial number for
          // date cells depending on formatting — normalize to YYYY-MM-DD.
          if (dateStr instanceof Date) {
            dateStr = dateStr.toISOString().split('T')[0];
          } else {
            dateStr = String(dateStr).trim();
          }
          return { name: String(r['Holiday Name']).trim(), date: dateStr };
        });

      if (rows.length === 0) {
        Alert.alert('No Valid Rows', 'Every row is missing a Holiday Name or Date — nothing to import.');
        setLoading(false);
        return;
      }

      const previewResult = await previewBulkHolidayImport(rows);
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
      const result = await commitBulkHolidayImport(rows);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bulk Import Holidays</Text>
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
            <Ionicons name="calendar-outline" size={40} color="#3b5998" style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={styles.stepTitle}>Step 1 — Download Template</Text>
            <Text style={styles.stepDesc}>
              Get a ready-made Excel sheet with sample rows. Fill in your full year's holiday list — one row per holiday.
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
              Select your filled-in Excel file. Dates that already have a holiday saved will be skipped automatically.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={pickAndParseFile}>
              <Ionicons name="folder-open-outline" size={18} color="white" />
              <Text style={styles.primaryBtnText}>Choose Excel File</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {step === 'preview' && (
        <>
          <View style={styles.summaryBar}>
            <Text style={styles.summaryText}>
              <Text style={{ color: '#2e7d32', fontWeight: 'bold' }}>{newCount} New</Text>
              {'   '}
              <Text style={{ color: '#e65100', fontWeight: 'bold' }}>{existingCount} Already Exists (skip)</Text>
            </Text>
          </View>
          <FlatList
            data={preview}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 15 }}
            renderItem={({ item }) => (
              <View style={[styles.previewRow, item.status === 'existing' && styles.previewRowExisting]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewName}>{item.row.name}</Text>
                  <Text style={styles.previewMeta}>{item.row.date}</Text>
                </View>
                {item.status === 'new' ? (
                  <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>
                ) : (
                  <View style={styles.skipBadge}><Text style={styles.skipBadgeText}>SKIP</Text></View>
                )}
              </View>
            )}
          />
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep('start')}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleCommit} disabled={newCount === 0}>
              <Text style={styles.confirmBtnText}>Import {newCount} New Holiday{newCount === 1 ? '' : 's'}</Text>
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
              <Text style={styles.resultLine}>✅ {resultSummary.created} holidays added</Text>
              {resultSummary.skipped > 0 && <Text style={styles.resultLine}>⏭️ {resultSummary.skipped} skipped (already existed)</Text>}
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
  summaryBar: { backgroundColor: 'white', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  summaryText: { fontSize: 14, textAlign: 'center' },
  previewRow: { backgroundColor: 'white', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0' },
  previewRowExisting: { borderColor: '#ffcc80', backgroundColor: '#fff8e1' },
  previewName: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  previewMeta: { fontSize: 12, color: '#777', marginTop: 3 },
  newBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  newBadgeText: { color: '#2e7d32', fontSize: 11, fontWeight: 'bold' },
  skipBadge: { backgroundColor: '#fff3e0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  skipBadgeText: { color: '#e65100', fontSize: 11, fontWeight: 'bold' },
  bottomBar: { flexDirection: 'row', padding: 15, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  cancelBtnText: { color: '#666', fontWeight: 'bold' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 8, backgroundColor: '#2e7d32', alignItems: 'center' },
  confirmBtnText: { color: 'white', fontWeight: 'bold' },
  resultLine: { fontSize: 14, color: '#333', marginBottom: 8, textAlign: 'center' },
});
