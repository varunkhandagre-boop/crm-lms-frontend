import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { BulkUserPreviewItem, BulkUserResult, BulkUserRow, commitBulkUserImport, fetchTeamMembers, previewBulkUserImport } from '../services/api/users';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { cellDate, cellNumber, cellText, readExcelRows, shareExcel } from '../utils/excelImport';

// Excel column → employee field. Name, Email are required; everything else optional.
const COLUMNS: { header: string; key: keyof BulkUserRow; kind: 'text' | 'number' | 'date'; aliases?: string[] }[] = [
  { header: 'Name', key: 'name', kind: 'text' },
  { header: 'Email', key: 'email', kind: 'text', aliases: ['Official Email'] },
  { header: 'Mobile', key: 'mobile', kind: 'text' },
  { header: 'Role', key: 'roleText', kind: 'text', aliases: ['Designation'] },
  { header: 'Emp ID', key: 'empId', kind: 'text', aliases: ['Employee ID', 'EmpID'] },
  { header: 'Joining Date', key: 'joiningDate', kind: 'date', aliases: ['DOJ', 'Date of Joining'] },
  { header: 'Monthly Target', key: 'monthlyTarget', kind: 'number' },
  { header: 'Daily Visit Target', key: 'dailyVisitTarget', kind: 'number' },
  { header: 'Monthly Visit Target', key: 'monthlyVisitTarget', kind: 'number' },
  { header: 'Base Salary', key: 'baseSalary', kind: 'number', aliases: ['Salary'] },
  { header: 'Yearly Leaves', key: 'yearlyLeaves', kind: 'number' },
  { header: 'Personal Email', key: 'personalEmail', kind: 'text' },
  { header: 'Personal Mobile', key: 'personalMobile', kind: 'text' },
  { header: 'Blood Group', key: 'bloodGroup', kind: 'text' },
  { header: 'Address', key: 'address', kind: 'text', aliases: ['Current Address'] },
  { header: 'City', key: 'city', kind: 'text' },
  { header: 'State', key: 'state', kind: 'text' },
  { header: 'Permanent Address', key: 'permanentAddress', kind: 'text' },
  { header: 'Bank Name', key: 'bankName', kind: 'text' },
  { header: 'Bank Account No', key: 'bankAccountNo', kind: 'text', aliases: ['Account No', 'Account Number'] },
  { header: 'IFSC', key: 'bankIfsc', kind: 'text', aliases: ['IFSC Code'] },
  { header: 'Aadhaar', key: 'aadhar', kind: 'text', aliases: ['Aadhar', 'Aadhaar No'] },
  { header: 'PAN', key: 'pan', kind: 'text', aliases: ['PAN No'] },
];
const HEADERS = COLUMNS.map((c) => c.header);

const SAMPLE_ROW: Record<string, any> = {
  'Name': 'Ravi Kumar', 'Email': 'ravi.kumar@example.com', 'Mobile': '9876543210', 'Role': 'Sales',
  'Emp ID': 'EMP-101', 'Joining Date': '2026-01-15', 'Monthly Target': 200000, 'Daily Visit Target': 5,
  'Monthly Visit Target': 120, 'Base Salary': 25000, 'Yearly Leaves': 18, 'City': 'Nagpur', 'State': 'Maharashtra',
};

// App role → the word used in the Role column.
const roleWord = (role: string, jobTitle: string) =>
  role === 'FIELD_USER' ? (jobTitle === 'Service Engineer' ? 'Service' : 'Sales')
    : ({ ADMIN: 'Admin', MANAGER: 'Manager', ACCOUNT: 'Account', HR: 'HR', STORE: 'Store', SUPER_ADMIN: 'Admin' } as Record<string, string>)[role] || role;

function readCell(r: Record<string, any>, col: (typeof COLUMNS)[number]) {
  const names = [col.header, ...(col.aliases ?? [])].map((n) => n.toLowerCase());
  const key = Object.keys(r).find((k) => names.includes(k.toLowerCase()));
  return key === undefined ? undefined : r[key];
}

export default function BulkImportUsersScreen() {
  const headerTop = useHeaderTop();
  const router = useRouter();

  const [step, setStep] = useState<'start' | 'preview' | 'done'>('start');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<BulkUserPreviewItem[]>([]);
  const [badDates, setBadDates] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [resultSummary, setResultSummary] = useState<BulkUserResult | null>(null);

  const downloadTemplate = async () => {
    try {
      await shareExcel([SAMPLE_ROW], HEADERS, 'Employees', 'Employee_Import_Template.xlsx');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not generate template.');
    }
  };

  // Current team with every column — fill the blanks and upload it back with "Update existing" on.
  const downloadCurrent = async () => {
    setLoading(true);
    try {
      const team = await fetchTeamMembers();
      const rows = team.map((u: any) => ({
        'Name': u.name, 'Email': u.email, 'Mobile': u.mobile, 'Role': roleWord(u.role, u.jobTitle),
        'Emp ID': u.empId, 'Joining Date': u.joiningDate, 'Monthly Target': Number(u.monthlyTarget) || '',
        'Daily Visit Target': u.dailyVisitTarget, 'Monthly Visit Target': u.monthlyVisitTarget,
        'Base Salary': Number(u.baseSalary) || '', 'Yearly Leaves': u.yearlyLeaves,
        'Personal Email': u.personalEmail, 'Personal Mobile': u.personalMobile, 'Blood Group': u.bloodGroup,
        'Address': u.address, 'City': u.city, 'State': u.state, 'Permanent Address': u.permanentAddress,
        'Bank Name': u.bankName, 'Bank Account No': u.accountNo, 'IFSC': u.ifscCode, 'Aadhaar': u.aadhar, 'PAN': u.pan,
      }));
      await shareExcel(rows, HEADERS, 'Employees', 'Employees_Current.xlsx');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not download employees.');
    } finally {
      setLoading(false);
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
      const rawRows = await readExcelRows(result.assets[0].uri);

      if (rawRows.length === 0) {
        Alert.alert('Empty File', 'No rows found in the uploaded Excel file.');
        return;
      }

      const dateProblems: string[] = [];
      const rows: BulkUserRow[] = [];
      for (const r of rawRows) {
        const row: Record<string, any> = {};
        for (const col of COLUMNS) {
          const v = readCell(r, col);
          if (col.kind === 'number') row[col.key] = cellNumber(v);
          else if (col.kind === 'date') {
            row[col.key] = cellDate(v);
            if (cellText(v) && !row[col.key]) dateProblems.push(`${cellText(readCell(r, COLUMNS[0])) || 'Row'}: "${cellText(v)}"`);
          } else row[col.key] = cellText(v);
        }
        if (!row.name || !row.email) continue;
        row.roleText = row.roleText || 'Sales';
        if (row.dailyVisitTarget !== undefined) row.dailyVisitTarget = Math.round(row.dailyVisitTarget);
        if (row.monthlyVisitTarget !== undefined) row.monthlyVisitTarget = Math.round(row.monthlyVisitTarget);
        if (row.yearlyLeaves !== undefined) row.yearlyLeaves = Math.round(row.yearlyLeaves);
        rows.push(row as BulkUserRow);
      }

      if (rows.length === 0) {
        Alert.alert('No Valid Rows', 'Every row is missing a Name or Email — nothing to import.');
        return;
      }

      const previewResult = await previewBulkUserImport(rows);
      setPreview(previewResult);
      setBadDates(dateProblems);
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
      const rows = preview.filter(p => p.status !== 'invalid').map(p => p.row);
      const result = await commitBulkUserImport(rows, updateExisting);
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
      <View style={[styles.header, { paddingTop: headerTop }]}>
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
              One row per employee — Name and Email are required, every other column is optional
              (salary, targets, bank, Aadhaar, PAN, address…). Role: Admin, Manager, Account, HR, Store, Sales or Service.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={downloadTemplate}>
              <Ionicons name="download-outline" size={18} color="white" />
              <Text style={styles.primaryBtnText}>Download Template</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryBtn, styles.secondaryBtn]} onPress={downloadCurrent}>
              <Ionicons name="people-outline" size={18} color="#3b5998" />
              <Text style={[styles.primaryBtnText, { color: '#3b5998' }]}>Download Current Employees</Text>
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
              Employees already in the app are matched by email. They are skipped unless you turn on "Fill details for existing employees" on the next screen — then only the filled-in columns are saved. Name, role, email and password never change from Excel.
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
              <Text style={{ color: '#e65100', fontWeight: 'bold' }}>{existingCount} Existing{updateExisting ? ' (update)' : ' (skip)'}</Text>
              {invalidCount > 0 && <Text style={{ color: '#d32f2f', fontWeight: 'bold' }}>{'   '}{invalidCount} Invalid</Text>}
            </Text>
            {existingCount > 0 && (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleText}>Fill details for existing employees</Text>
                <Switch value={updateExisting} onValueChange={setUpdateExisting} />
              </View>
            )}
            {badDates.length > 0 && (
              <Text style={styles.errorText}>Could not read these dates (use YYYY-MM-DD or DD/MM/YYYY), they will be left empty: {badDates.slice(0, 5).join(', ')}{badDates.length > 5 ? '…' : ''}</Text>
            )}
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
                  <View style={styles.skipBadge}><Text style={styles.skipBadgeText}>{updateExisting ? 'UPDATE' : 'SKIP'}</Text></View>
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
            <TouchableOpacity
              style={[styles.confirmBtn, newCount + (updateExisting ? existingCount : 0) === 0 && { opacity: 0.5 }]}
              onPress={handleCommit}
              disabled={newCount + (updateExisting ? existingCount : 0) === 0}
            >
              <Text style={styles.confirmBtnText}>
                {updateExisting && existingCount > 0 ? `Add ${newCount} + Update ${existingCount}` : `Import ${newCount} New Employee${newCount === 1 ? '' : 's'}`}
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
              <Text style={styles.resultLine}>✅ {resultSummary.created} employees created</Text>
              {!!resultSummary.updated && <Text style={styles.resultLine}>✏️ {resultSummary.updated} existing employees updated</Text>}
              {resultSummary.skipped > 0 && <Text style={styles.resultLine}>⏭️ {resultSummary.skipped} skipped</Text>}
              {resultSummary.created > 0 && <View style={styles.passwordBox}>
                <Text style={styles.passwordLabel}>Default password for all new employees:</Text>
                <Text style={styles.passwordValue}>{resultSummary.defaultPassword}</Text>
                <Text style={styles.passwordHint}>Share this with them — they can change it after their first login.</Text>
              </View>}
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
  header: { backgroundColor: '#3b5998', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 20, marginBottom: 20, elevation: 2 },
  stepTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  stepDesc: { fontSize: 13, color: '#666', lineHeight: 19, marginBottom: 15 },
  primaryBtn: { backgroundColor: '#3b5998', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 8, gap: 8 },
  primaryBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  secondaryBtn: { backgroundColor: 'white', borderWidth: 1, borderColor: '#3b5998', marginTop: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  toggleText: { fontSize: 13, color: '#333', fontWeight: '600', flex: 1 },
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
