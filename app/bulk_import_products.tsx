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

import { BulkImportPreviewItem, BulkProductRow, commitBulkImport, previewBulkImport } from '../services/api/products';

const TEMPLATE_COLUMNS = [
  'Product Name', 'Model', 'Series', 'Description', 'Specifications',
  'Price', 'GST %', 'Catalog/PDF Link', 'YouTube Link',
];

const SAMPLE_ROW = {
  'Product Name': 'Bipap Machine',
  'Model': 'B30P',
  'Series': 'B-Series',
  'Description': 'Bilevel positive airway pressure device',
  'Specifications': 'Flow rate: 30 LPM, Weight: 2.1kg',
  'Price': 45000,
  'GST %': 12,
  'Catalog/PDF Link': 'https://example.com/brochure.pdf',
  'YouTube Link': 'https://youtube.com/watch?v=xxxx',
};

export default function BulkImportProductsScreen() {
  const router = useRouter();

  const [step, setStep] = useState<'start' | 'preview' | 'done'>('start');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<BulkImportPreviewItem[]>([]);
  const [selectedOverwrites, setSelectedOverwrites] = useState<Set<string>>(new Set());
  const [resultSummary, setResultSummary] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  const downloadTemplate = async () => {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([SAMPLE_ROW], { header: TEMPLATE_COLUMNS });
      XLSX.utils.book_append_sheet(wb, ws, 'Products');

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const uri = FileSystem.cacheDirectory + 'Product_Import_Template.xlsx';
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });

      await Sharing.shareAsync(uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Download Product Import Template',
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

      const rows: BulkProductRow[] = rawRows
        .filter((r) => r['Product Name'] && String(r['Product Name']).trim() !== '')
        .map((r) => ({
          name: String(r['Product Name']).trim(),
          model: r['Model'] ? String(r['Model']).trim() : undefined,
          series: r['Series'] ? String(r['Series']).trim() : undefined,
          description: r['Description'] ? String(r['Description']).trim() : undefined,
          specifications: r['Specifications'] ? String(r['Specifications']).trim() : undefined,
          price: r['Price'] ? Number(r['Price']) : undefined,
          gstRate: r['GST %'] ? Number(r['GST %']) : undefined,
          catalogUrl: r['Catalog/PDF Link'] ? String(r['Catalog/PDF Link']).trim() : undefined,
          videoUrl: r['YouTube Link'] ? String(r['YouTube Link']).trim() : undefined,
        }));

      if (rows.length === 0) {
        Alert.alert('No Valid Rows', 'Every row is missing a Product Name — nothing to import.');
        setLoading(false);
        return;
      }

      const previewResult = await previewBulkImport(rows);
      setPreview(previewResult);
      setSelectedOverwrites(new Set(previewResult.filter(p => p.status === 'existing').map(p => p.existingId!)));
      setStep('preview');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not read the Excel file. Make sure it matches the template format.');
    } finally {
      setLoading(false);
    }
  };

  const toggleOverwrite = (id: string) => {
    setSelectedOverwrites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCommit = async () => {
    setLoading(true);
    try {
      const rows = preview.map(p => p.row);
      const result = await commitBulkImport(rows, Array.from(selectedOverwrites));
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
        <Text style={styles.headerTitle}>Bulk Import Products</Text>
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
              Get a ready-made Excel sheet with the right columns already set up. Fill in your products — one row per product.
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
              Select your filled-in Excel file. We'll check which products already exist so you can choose whether to update them.
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
              <Text style={{ color: '#e65100', fontWeight: 'bold' }}>{existingCount} Existing</Text>
            </Text>
          </View>
          <FlatList
            data={preview}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 15 }}
            renderItem={({ item }) => (
              <View style={[styles.previewRow, item.status === 'existing' && styles.previewRowExisting]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewName}>{item.row.name}{item.row.model ? ` (${item.row.model})` : ''}</Text>
                  <Text style={styles.previewMeta}>
                    ₹{item.row.price ?? 0} • GST {item.row.gstRate ?? 0}%
                  </Text>
                </View>
                {item.status === 'new' ? (
                  <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>
                ) : (
                  <TouchableOpacity
                    style={styles.overwriteToggle}
                    onPress={() => toggleOverwrite(item.existingId!)}
                  >
                    <Ionicons
                      name={selectedOverwrites.has(item.existingId!) ? 'checkbox' : 'square-outline'}
                      size={22}
                      color="#e65100"
                    />
                    <Text style={styles.overwriteText}>Overwrite</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep('start')}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleCommit}>
              <Text style={styles.confirmBtnText}>
                Import {newCount} New{selectedOverwrites.size > 0 ? ` + Update ${selectedOverwrites.size}` : ''}
              </Text>
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
              <Text style={styles.resultLine}>✅ {resultSummary.created} products created</Text>
              <Text style={styles.resultLine}>🔄 {resultSummary.updated} products updated</Text>
              {resultSummary.skipped > 0 && <Text style={styles.resultLine}>⏭️ {resultSummary.skipped} skipped (not overwritten)</Text>}
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
  summaryText: { fontSize: 15, textAlign: 'center' },
  previewRow: { backgroundColor: 'white', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0' },
  previewRowExisting: { borderColor: '#ffcc80', backgroundColor: '#fff8e1' },
  previewName: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  previewMeta: { fontSize: 12, color: '#777', marginTop: 3 },
  newBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  newBadgeText: { color: '#2e7d32', fontSize: 11, fontWeight: 'bold' },
  overwriteToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  overwriteText: { fontSize: 11, color: '#e65100', fontWeight: 'bold' },
  bottomBar: { flexDirection: 'row', padding: 15, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  cancelBtnText: { color: '#666', fontWeight: 'bold' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 8, backgroundColor: '#2e7d32', alignItems: 'center' },
  confirmBtnText: { color: 'white', fontWeight: 'bold' },
  resultLine: { fontSize: 14, color: '#333', marginBottom: 8, textAlign: 'center' },
});
