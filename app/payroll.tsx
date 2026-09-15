import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import * as XLSX from 'xlsx';
import {
    fetchPayrollSettings,
    fetchPayslips,
    generateAllPayslips,
    generatePayslip,
    PayrollSettings,
    Payslip,
    PayslipCalc,
    previewAllPayslips,
    previewPayslip,
    savePayrollSettings,
} from '../services/api/payroll';
import { fetchTeamMembers } from '../services/api/users';
import { urlToBase64Image } from '../utils/pdfImageHelper';
import { useData } from './context/DataContext';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayrollScreen() {
    const router = useRouter();
    const { currentUser, companyProfile } = useData();
    const myRole = (currentUser?.role || '').toLowerCase();
    const isManager = myRole.includes('admin') || myRole.includes('manager') || myRole.includes('account');

    const [activeTab, setActiveTab] = useState<'Generate' | 'Settings'>('Generate');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [settings, setSettings] = useState<PayrollSettings | null>(null);
    const [userList, setUserList] = useState<any[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [preview, setPreview] = useState<Payslip | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [payslips, setPayslips] = useState<Payslip[]>([]);

    const [allPreview, setAllPreview] = useState<PayslipCalc[] | null>(null);
    const [allPreviewLoading, setAllPreviewLoading] = useState(false);
    const [selectedSlip, setSelectedSlip] = useState<Payslip | null>(null);
    const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
    const [myCurrentMonthSummary, setMyCurrentMonthSummary] = useState<Payslip | null>(null);

    useEffect(() => {
        (async () => {
            try {
                if (isManager) {
                    const [s, users, slips] = await Promise.all([
                        fetchPayrollSettings(),
                        fetchTeamMembers(),
                        fetchPayslips({}),
                    ]);
                    setSettings(s);
                    setUserList(users);
                    setPayslips(slips);
                    if (users.length > 0) setSelectedUserId(users[0].id);
                } else {
                    // Self-view: backend's listPayslips() already scopes
                    // non-manager roles to their own records only.
                    const now = new Date();
                    const [slips, summary] = await Promise.all([
                        fetchPayslips({}),
                        previewPayslip(undefined, now.getMonth() + 1, now.getFullYear()).catch(() => null),
                    ]);
                    setPayslips(slips);
                    setMyCurrentMonthSummary(summary);
                }
            } catch (e) {
                console.log('Payroll load error:', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const updateSetting = (key: keyof PayrollSettings, value: any) => {
        setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    };

    const handleSaveSettings = async () => {
        if (!settings) return;
        setSaving(true);
        try {
            const saved = await savePayrollSettings(settings);
            setSettings(saved);
            Alert.alert('Success ✅', 'Salary rules saved.');
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not save settings.');
        } finally {
            setSaving(false);
        }
    };

    const handlePreview = async () => {
        if (!selectedUserId) return;
        setAllPreview(null);
        setPreviewLoading(true);
        try {
            const result = await previewPayslip(selectedUserId, selectedMonth, selectedYear);
            setPreview(result);
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not calculate preview.');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleGenerate = async () => {
        if (!selectedUserId) return;
        setSaving(true);
        try {
            await generatePayslip(selectedUserId, selectedMonth, selectedYear);
            const slips = await fetchPayslips({});
            setPayslips(slips);
            setPreview(null);
            Alert.alert('Success ✅', 'Payslip generated!');
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not generate payslip.');
        } finally {
            setSaving(false);
        }
    };

    const handlePreviewAll = async () => {
        setPreview(null);
        setAllPreviewLoading(true);
        try {
            const result = await previewAllPayslips(selectedMonth, selectedYear);
            setAllPreview(result);
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not calculate payroll for all employees.');
        } finally {
            setAllPreviewLoading(false);
        }
    };

    const handleGenerateAll = async () => {
        Alert.alert(
            'Generate All Payslips',
            `Generate payslips for all ${allPreview?.length || 0} employees for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}? This cannot be undone for employees already generated.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Generate All', onPress: async () => {
                    setSaving(true);
                    try {
                        const result = await generateAllPayslips(selectedMonth, selectedYear);
                        const slips = await fetchPayslips({});
                        setPayslips(slips);
                        setAllPreview(null);
                        Alert.alert('Done ✅', `Generated: ${result.created}, Skipped: ${result.skipped} (already existed)`);
                    } catch (e: any) {
                        Alert.alert('Error', e?.message || 'Could not generate payroll.');
                    } finally {
                        setSaving(false);
                    }
                }}
            ]
        );
    };

    const toggleExportSelection = (id: string) => {
        setSelectedForExport((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        const currentMonthSlips = payslips.filter((p) => p.month === selectedMonth && p.year === selectedYear);
        if (selectedForExport.size === currentMonthSlips.length && currentMonthSlips.length > 0) {
            setSelectedForExport(new Set());
        } else {
            setSelectedForExport(new Set(currentMonthSlips.map((p) => p.id)));
        }
    };

    const handleExportExcel = async () => {
        try {
            // If specific payslips are checkbox-selected, export exactly
            // those (regardless of which month/year is currently shown on
            // screen). Otherwise, fall back to exporting everything for the
            // currently-selected month/year.
            const rows = (selectedForExport.size > 0
                ? payslips.filter((p) => selectedForExport.has(p.id))
                : payslips.filter((p) => p.month === selectedMonth && p.year === selectedYear)
            ).map((p) => ({
                    'Employee': p.user?.name || 'Unknown',
                    'Emp ID': p.user?.empId || '-',
                    'Month': MONTH_NAMES[p.month - 1],
                    'Year': p.year,
                    'Base Salary': Number(p.baseSalary),
                    'Incentive': Number(p.incentiveAmount),
                    'Expenses': Number(p.expenseAmount),
                    'Office Days': p.officeDays,
                    'Field Days': p.fieldDays,
                    'Present Days': p.presentDays,
                    'Short Days': p.shortDaysCount,
                    'Holidays': p.holidaysThisMonth,
                    'Leaves Taken': p.leaveDaysThisMonth,
                    'Leave Balance': p.leaveBalance,
                    'Late Deduction': Number(p.lateDeduction),
                    'Short-Hours Deduction': Number(p.shortHoursDeduction),
                    'Leave Deduction': Number(p.leaveDeduction),
                    'Advance Deduction': Number(p.advanceDeduction),
                    'Net Payable': Number(p.netPayable),
                }));

            if (rows.length === 0) {
                Alert.alert('Nothing to Export', `No generated payslips found for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}.`);
                return;
            }

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, 'Payroll');

            const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const fileName = `Payroll_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.xlsx`;
            const uri = FileSystem.cacheDirectory + fileName;
            await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });

            await Sharing.shareAsync(uri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: `Payroll — ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
            });
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not export.');
        }
    };

// Add this import at the top of app/payroll.tsx:
// import * as Print from 'expo-print';
// import { urlToBase64Image } from '../utils/pdfImageHelper';
// import { useData } from './context/DataContext';  (already imported)

// Add this function inside the PayrollScreen component, alongside the other handlers:

const generatePayslipPDF = async (slip: Payslip) => {
    try {
        const logoBase64 = await urlToBase64Image(companyProfile?.logoUrl);
        const logoHTML = logoBase64
            ? `<img src="${logoBase64}" style="height: 62px; object-fit: contain;" />`
            : `<div style="font-size:24px; font-weight:800; color:#0f2557; letter-spacing:0.5px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const genDate = new Date().toLocaleDateString('en-GB');
        const monthLabel = `${MONTH_NAMES[slip.month - 1]} ${slip.year}`;

        const htmlContent = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              * { box-sizing: border-box; }
              body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 0; }
              .sheet { padding: 0 40px 40px; }
              .topbar { display: flex; justify-content: space-between; align-items: center; padding: 28px 40px; background: #0f2557; color: #ffffff; }
              .topbar .company-meta { text-align: right; font-size: 12px; line-height: 1.7; opacity: 0.92; }
              .doc-band { display: flex; justify-content: space-between; align-items: center; background: #eef2fb; border-bottom: 4px solid #0f2557; padding: 18px 40px; margin-bottom: 28px; }
              .doc-title { font-size: 19px; font-weight: 800; letter-spacing: 1.4px; color: #0f2557; }
              .doc-meta { text-align: right; font-size: 12.5px; color: #4a4a68; line-height: 1.7; }
              .doc-meta b { color: #0f2557; }
              .grid { display: flex; gap: 20px; margin-bottom: 24px; }
              .card { flex: 1; background: #fafbfe; border: 1px solid #e2e6f0; border-radius: 12px; padding: 20px 22px; }
              .card-label { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: 1px; margin-bottom: 14px; }
              .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
              .row .k { color: #6b7280; } .row .v { font-weight: 600; color: #1a1a2e; text-align: right; }
              .table { width: 100%; border-collapse: collapse; margin-bottom: 26px; border-radius: 12px; overflow: hidden; }
              .table th { background: #0f2557; color: white; font-size: 12.5px; letter-spacing: 0.5px; text-align: left; padding: 15px 18px; font-weight: 600; }
              .table td { padding: 14px 18px; font-size: 14px; border-bottom: 1px solid #e9ecf5; background: #ffffff; }
              .earn { color: #16a34a; font-weight: 700; } .ded { color: #dc2626; font-weight: 700; }
              .net-row td { background: #eef2fb; font-weight: 800; color: #0f2557; font-size: 16px; border-bottom: none; }
              .doc-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e9ecf5; font-size: 10.5px; color: #9ca3af; text-align: center; }
            </style>
          </head>
          <body>
            <div class="topbar">
              ${logoHTML}
              <div class="company-meta">
                <div style="font-weight:700; font-size:14px; margin-bottom:3px;">${companyProfile?.companyName || ''}</div>
                <div>${companyProfile?.address || ''}</div>
              </div>
            </div>

            <div class="doc-band">
              <div class="doc-title">SALARY SLIP</div>
              <div class="doc-meta">
                <div>Period: <b>${monthLabel}</b></div>
                <div>Employee: <b>${slip.user?.name || 'Unknown'}</b> ${slip.user?.empId ? `(${slip.user.empId})` : ''}</div>
              </div>
            </div>

            <div class="sheet">
              <div class="grid">
                <div class="card">
                  <div class="card-label">ATTENDANCE SUMMARY</div>
                  <div class="row"><span class="k">Present Days</span><span class="v">${slip.presentDays}</span></div>
                  <div class="row"><span class="k">Short Days</span><span class="v">${slip.shortDaysCount}</span></div>
                  <div class="row"><span class="k">Holidays</span><span class="v">${slip.holidaysThisMonth}</span></div>
                  <div class="row"><span class="k">Office / Field Days</span><span class="v">${slip.officeDays} / ${slip.fieldDays}</span></div>
                </div>
                <div class="card">
                  <div class="card-label">LEAVE SUMMARY</div>
                  <div class="row"><span class="k">Leaves Taken (This Month)</span><span class="v">${slip.leaveDaysThisMonth}</span></div>
                  <div class="row"><span class="k">Leave Balance</span><span class="v">${slip.leaveBalance}</span></div>
                </div>
              </div>

              <table class="table">
                <thead><tr><th style="width:60%;">Earnings</th><th style="width:40%; text-align:right;">Amount</th></tr></thead>
                <tbody>
                  <tr><td>Base Salary</td><td style="text-align:right;" class="earn">₹${Number(slip.baseSalary).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Incentive</td><td style="text-align:right;" class="earn">₹${Number(slip.incentiveAmount).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Expenses Reimbursed</td><td style="text-align:right;" class="earn">₹${Number(slip.expenseAmount).toLocaleString('en-IN')}</td></tr>
                </tbody>
              </table>

              <table class="table">
                <thead><tr><th style="width:60%;">Deductions</th><th style="width:40%; text-align:right;">Amount</th></tr></thead>
                <tbody>
                  <tr><td>Late-Coming</td><td style="text-align:right;" class="ded">₹${Number(slip.lateDeduction).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Short Working-Hours</td><td style="text-align:right;" class="ded">₹${Number(slip.shortHoursDeduction).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Leave (Beyond Quota)</td><td style="text-align:right;" class="ded">₹${Number(slip.leaveDeduction).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Advance Recovery</td><td style="text-align:right;" class="ded">₹${Number(slip.advanceDeduction).toLocaleString('en-IN')}</td></tr>
                  <tr class="net-row"><td>NET PAYABLE</td><td style="text-align:right;">₹${Number(slip.netPayable).toLocaleString('en-IN')}</td></tr>
                </tbody>
              </table>

              <div class="doc-footer">
                This is a system-generated salary slip from ${companyProfile?.companyName || 'our company'} • Generated on ${genDate}
              </div>
            </div>
          </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `Payslip_${slip.user?.name?.replace(/ /g, '_') || 'Employee'}_${MONTH_NAMES[slip.month - 1]}_${slip.year}.pdf`;
        const newPath = `${(FileSystem as any).cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Payslip` });
        } catch {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
    } catch (error: any) {
        Alert.alert('Error', error.message || 'Could not generate payslip PDF.');
    }
};


    if (loading) {
        return <View style={styles.centerLoading}><ActivityIndicator size="large" color="#3b5998" /></View>;
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Payroll</Text>
                <View style={{ width: 24 }} />
            </View>

            {!isManager && (
                <ScrollView contentContainerStyle={styles.content}>
                    {myCurrentMonthSummary && (
                        <>
                            <Text style={styles.sectionTitle}>This Month's Attendance</Text>
                            <View style={styles.card}>
                                <View style={styles.attSummaryGrid}>
                                    <AttBox label="Present" value={myCurrentMonthSummary.presentDays} />
                                    <AttBox label="Short Days" value={myCurrentMonthSummary.shortDaysCount} />
                                    <AttBox label="Holidays" value={myCurrentMonthSummary.holidaysThisMonth} />
                                    <AttBox label="Leaves Taken" value={myCurrentMonthSummary.leaveDaysThisMonth} />
                                    <AttBox label="Leave Balance" value={myCurrentMonthSummary.leaveBalance} />
                                    <AttBox label="Office / Field" value={`${myCurrentMonthSummary.officeDays}/${myCurrentMonthSummary.fieldDays}`} />
                                </View>
                            </View>
                        </>
                    )}

                    <Text style={styles.sectionTitle}>My Payslips</Text>
                    {payslips.length === 0 ? (
                        <View style={styles.card}>
                            <Text style={{ textAlign: 'center', color: '#999' }}>No payslips generated yet.</Text>
                        </View>
                    ) : (
                        payslips.map((item) => (
                            <TouchableOpacity key={item.id} style={styles.payslipRow} onPress={() => setSelectedSlip(item)}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.payslipName}>{MONTH_NAMES[item.month - 1]} {item.year}</Text>
                                    <Text style={styles.payslipMeta}>Net Payable</Text>
                                </View>
                                <Text style={styles.payslipAmount}>₹{Number(item.netPayable).toLocaleString('en-IN')}</Text>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>
            )}

            {isManager && (
            <>
            <View style={styles.tabBar}>
                {(['Generate', 'Settings'] as const).map((tab) => (
                    <TouchableOpacity key={tab} style={[styles.tabBtn, activeTab === tab && styles.activeTabBtn]} onPress={() => setActiveTab(tab)}>
                        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab === 'Settings' ? 'Salary Rules' : tab}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {activeTab === 'Settings' && settings && (
                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.sectionTitle}>Incentive</Text>
                    <View style={styles.card}>
                        <Text style={styles.label}>Tier 1 Commission (%) — on sales above target</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={String(settings.incentiveTier1Percent)} onChangeText={(t) => updateSetting('incentiveTier1Percent', Number(t) || 0)} />
                        <Text style={styles.label}>Tier 2 Commission (%) — beyond boost threshold</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={String(settings.incentiveTier2Percent)} onChangeText={(t) => updateSetting('incentiveTier2Percent', Number(t) || 0)} />
                        <Text style={styles.label}>Tier 2 Threshold Multiplier (e.g. 1.5 = 150% of target)</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={String(settings.tier2Multiplier)} onChangeText={(t) => updateSetting('tier2Multiplier', Number(t) || 1)} />
                    </View>

                    <Text style={styles.sectionTitle}>Late-Coming</Text>
                    <View style={styles.card}>
                        <View style={styles.switchRow}>
                            <Text style={styles.label}>Enable</Text>
                            <Switch value={settings.lateComingEnabled} onValueChange={(v) => updateSetting('lateComingEnabled', v)} />
                        </View>
                        {settings.lateComingEnabled && (
                            <>
                                <Text style={styles.label}>Late After (24hr, e.g. 10:00)</Text>
                                <TextInput style={styles.input} placeholder="10:00" value={settings.lateComingAfterTime || ''} onChangeText={(t) => updateSetting('lateComingAfterTime', t)} />
                                <Text style={styles.hint}>Penalty: half a day's salary, automatically calculated per employee.</Text>
                            </>
                        )}
                    </View>

                    <Text style={styles.sectionTitle}>Short Hours</Text>
                    <View style={styles.card}>
                        <View style={styles.switchRow}>
                            <Text style={styles.label}>Enable</Text>
                            <Switch value={settings.shortHoursEnabled} onValueChange={(v) => updateSetting('shortHoursEnabled', v)} />
                        </View>
                        {settings.shortHoursEnabled && (
                            <>
                                <Text style={styles.label}>Minimum Hours Required</Text>
                                <TextInput style={styles.input} keyboardType="numeric" value={String(settings.shortHoursThreshold)} onChangeText={(t) => updateSetting('shortHoursThreshold', Number(t) || 0)} />
                                <Text style={styles.hint}>Penalty: half a day's salary, automatically calculated per employee.</Text>
                            </>
                        )}
                    </View>

                    <Text style={styles.sectionTitle}>Leave Quota</Text>
                    <View style={styles.card}>
                        <Text style={styles.label}>Penalty (₹ per extra day beyond monthly quota)</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={String(settings.leaveExcessPenalty)} onChangeText={(t) => updateSetting('leaveExcessPenalty', Number(t) || 0)} />
                    </View>

                    <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSettings} disabled={saving}>
                        {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Rules</Text>}
                    </TouchableOpacity>
                </ScrollView>
            )}

            {activeTab === 'Generate' && (
                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.sectionTitle}>Period</Text>
                    <View style={styles.card}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, marginBottom: 10 }}>
                            {MONTH_NAMES.map((m, idx) => (
                                <TouchableOpacity
                                    key={m}
                                    style={[styles.chip, selectedMonth === idx + 1 && styles.chipActive]}
                                    onPress={() => { setSelectedMonth(idx + 1); setPreview(null); setAllPreview(null); }}
                                >
                                    <Text style={[styles.chipText, selectedMonth === idx + 1 && styles.chipTextActive]}>{m.slice(0, 3)}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <Text style={styles.label}>Year</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={String(selectedYear)} onChangeText={(t) => setSelectedYear(Number(t) || 2026)} />
                    </View>

                    <Text style={styles.sectionTitle}>Single Employee</Text>
                    <View style={styles.card}>
                        <Text style={styles.label}>Employee</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }}>
                            {userList.map((u) => (
                                <TouchableOpacity
                                    key={u.id}
                                    style={[styles.chip, selectedUserId === u.id && styles.chipActive]}
                                    onPress={() => { setSelectedUserId(u.id); setPreview(null); }}
                                >
                                    <Text style={[styles.chipText, selectedUserId === u.id && styles.chipTextActive]}>{u.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.previewBtn} onPress={handlePreview} disabled={previewLoading}>
                            {previewLoading ? <ActivityIndicator color="#3b5998" /> : <Text style={styles.previewBtnText}>Calculate Preview</Text>}
                        </TouchableOpacity>
                    </View>

                    {preview && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>Attendance Summary</Text>
                            <View style={styles.attSummaryGrid}>
                                <AttBox label="Present" value={preview.presentDays} />
                                <AttBox label="Short Days" value={preview.shortDaysCount} />
                                <AttBox label="Holidays" value={preview.holidaysThisMonth} />
                                <AttBox label="Leaves Taken" value={preview.leaveDaysThisMonth} />
                                <AttBox label="Leave Balance" value={preview.leaveBalance} />
                                <AttBox label="Office / Field" value={`${preview.officeDays}/${preview.fieldDays}`} />
                            </View>

                            <Text style={styles.sectionTitle}>Breakdown</Text>
                            <Row label="Base Salary" value={preview.baseSalary} positive />
                            <Row label="Incentive" value={preview.incentiveAmount} positive />
                            <Row label="Expenses" value={preview.expenseAmount} positive />
                            <Row label="Late-Coming Deduction" value={-preview.lateDeduction} />
                            <Row label="Short-Hours Deduction" value={-preview.shortHoursDeduction} />
                            <Row label="Leave Deduction" value={-preview.leaveDeduction} />
                            <Row label="Advance Deduction" value={-preview.advanceDeduction} />
                            <View style={styles.netRow}>
                                <Text style={styles.netLabel}>Net Payable</Text>
                                <Text style={styles.netValue}>₹{preview.netPayable.toLocaleString('en-IN')}</Text>
                            </View>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleGenerate} disabled={saving}>
                                {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Generate Payslip</Text>}
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={styles.sectionTitle}>All Employees</Text>
                    <View style={styles.card}>
                        <TouchableOpacity style={styles.previewBtn} onPress={handlePreviewAll} disabled={allPreviewLoading}>
                            {allPreviewLoading ? <ActivityIndicator color="#3b5998" /> : <Text style={styles.previewBtnText}>Calculate All Employees</Text>}
                        </TouchableOpacity>
                    </View>

                    {allPreview && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>{MONTH_NAMES[selectedMonth - 1]} {selectedYear} — {allPreview.length} Employees</Text>
                            {allPreview.map((p) => (
                                <View key={p.userId} style={styles.allPreviewRow}>
                                    <Text style={styles.allPreviewName}>{p.userName}</Text>
                                    <Text style={styles.allPreviewAmount}>₹{p.netPayable.toLocaleString('en-IN')}</Text>
                                </View>
                            ))}
                            <TouchableOpacity style={styles.saveBtn} onPress={handleGenerateAll} disabled={saving}>
                                {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Generate All Payslips</Text>}
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                        <Text style={styles.sectionTitle}>Previously Generated</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllBtn}>
                                <Text style={styles.selectAllBtnText}>Select All</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleExportExcel} style={styles.exportBtn}>
                                <Ionicons name="download-outline" size={16} color="#2e7d32" />
                                <Text style={styles.exportBtnText}>Export {selectedForExport.size > 0 ? `(${selectedForExport.size})` : ''}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {payslips.map((item) => (
                        <TouchableOpacity key={item.id} style={styles.payslipRow} onPress={() => setSelectedSlip(item)}>
                            <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleExportSelection(item.id); }} style={{ marginRight: 10 }}>
                                <Ionicons
                                    name={selectedForExport.has(item.id) ? 'checkbox' : 'square-outline'}
                                    size={22}
                                    color="#3b5998"
                                />
                            </TouchableOpacity>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.payslipName}>{item.user?.name || 'Unknown'}</Text>
                                <Text style={styles.payslipMeta}>{MONTH_NAMES[item.month - 1]} {item.year}</Text>
                            </View>
                            <Text style={styles.payslipAmount}>₹{Number(item.netPayable).toLocaleString('en-IN')}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            {selectedSlip && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <Text style={styles.modalTitle}>{selectedSlip.user?.name}</Text>
                            <TouchableOpacity onPress={() => setSelectedSlip(null)}>
                                <Ionicons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSub}>{MONTH_NAMES[selectedSlip.month - 1]} {selectedSlip.year}</Text>

                        <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Attendance Summary</Text>
                        <View style={styles.attSummaryGrid}>
                            <AttBox label="Present" value={selectedSlip.presentDays} />
                            <AttBox label="Short Days" value={selectedSlip.shortDaysCount} />
                            <AttBox label="Holidays" value={selectedSlip.holidaysThisMonth} />
                            <AttBox label="Leaves Taken" value={selectedSlip.leaveDaysThisMonth} />
                            <AttBox label="Leave Balance" value={selectedSlip.leaveBalance} />
                            <AttBox label="Office / Field" value={`${selectedSlip.officeDays}/${selectedSlip.fieldDays}`} />
                        </View>

                        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#1565c0', marginTop: 15 }]} onPress={() => generatePayslipPDF(selectedSlip)}>
                            <Text style={styles.saveBtnText}>📄 Download PDF</Text>
                        </TouchableOpacity>

                        <View style={{ marginTop: 15 }}>
                            <Row label="Base Salary" value={Number(selectedSlip.baseSalary)} positive />
                            <Row label="Incentive" value={Number(selectedSlip.incentiveAmount)} positive />
                            <Row label="Expenses" value={Number(selectedSlip.expenseAmount)} positive />
                            <Row label="Late-Coming Deduction" value={-Number(selectedSlip.lateDeduction)} />
                            <Row label="Short-Hours Deduction" value={-Number(selectedSlip.shortHoursDeduction)} />
                            <Row label="Leave Deduction" value={-Number(selectedSlip.leaveDeduction)} />
                            <Row label="Advance Deduction" value={-Number(selectedSlip.advanceDeduction)} />
                            <View style={styles.netRow}>
                                <Text style={styles.netLabel}>Net Payable</Text>
                                <Text style={styles.netValue}>₹{Number(selectedSlip.netPayable).toLocaleString('en-IN')}</Text>
                            </View>
                        </View>
                    </View>
                  </View>
                          )}
              </>
              )}

            {selectedSlip && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <Text style={styles.modalTitle}>{selectedSlip.user?.name}</Text>
                            <TouchableOpacity onPress={() => setSelectedSlip(null)}>
                                <Ionicons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSub}>{MONTH_NAMES[selectedSlip.month - 1]} {selectedSlip.year}</Text>

                        <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Attendance Summary</Text>
                        <View style={styles.attSummaryGrid}>
                            <AttBox label="Present" value={selectedSlip.presentDays} />
                            <AttBox label="Short Days" value={selectedSlip.shortDaysCount} />
                            <AttBox label="Holidays" value={selectedSlip.holidaysThisMonth} />
                            <AttBox label="Leaves Taken" value={selectedSlip.leaveDaysThisMonth} />
                            <AttBox label="Leave Balance" value={selectedSlip.leaveBalance} />
                            <AttBox label="Office / Field" value={`${selectedSlip.officeDays}/${selectedSlip.fieldDays}`} />
                        </View>

                        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#1565c0', marginTop: 15 }]} onPress={() => generatePayslipPDF(selectedSlip)}>
                            <Text style={styles.saveBtnText}>📄 Download PDF</Text>
                        </TouchableOpacity>

                        <View style={{ marginTop: 15 }}>
                            <Row label="Base Salary" value={Number(selectedSlip.baseSalary)} positive />
                            <Row label="Incentive" value={Number(selectedSlip.incentiveAmount)} positive />
                            <Row label="Expenses" value={Number(selectedSlip.expenseAmount)} positive />
                            <Row label="Late-Coming Deduction" value={-Number(selectedSlip.lateDeduction)} />
                            <Row label="Short-Hours Deduction" value={-Number(selectedSlip.shortHoursDeduction)} />
                            <Row label="Leave Deduction" value={-Number(selectedSlip.leaveDeduction)} />
                            <Row label="Advance Deduction" value={-Number(selectedSlip.advanceDeduction)} />
                            <View style={styles.netRow}>
                                <Text style={styles.netLabel}>Net Payable</Text>
                                <Text style={styles.netValue}>₹{Number(selectedSlip.netPayable).toLocaleString('en-IN')}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            )}
          </View>
          </KeyboardAvoidingView>
      );
  }

function AttBox({ label, value }: { label: string; value: number | string }) {
    return (
        <View style={styles.attBox}>
            <Text style={styles.attBoxValue}>{value}</Text>
            <Text style={styles.attBoxLabel}>{label}</Text>
        </View>
    );
}

function Row({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
    return (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, color: '#555' }}>{label}</Text>
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: positive ? '#2e7d32' : '#d32f2f' }}>
                {value < 0 ? '-' : ''}₹{Math.abs(value).toLocaleString('en-IN')}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    attSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    attBox: { backgroundColor: '#f5f7fa', borderRadius: 8, padding: 10, minWidth: '30%', alignItems: 'center' },
    attBoxValue: { fontSize: 16, fontWeight: 'bold', color: '#3b5998' },
    attBoxLabel: { fontSize: 10, color: '#777', marginTop: 2, textAlign: 'center' },
    modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalBox: { backgroundColor: 'white', borderRadius: 12, padding: 20, elevation: 10 },
    modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#333' },
    modalSub: { fontSize: 13, color: '#999' },
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#3b5998', paddingTop: 50, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    tabBar: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
    tabBtn: { flex: 1, padding: 14, alignItems: 'center' },
    activeTabBtn: { borderBottomWidth: 2, borderBottomColor: '#3b5998' },
    tabText: { color: '#999', fontWeight: 'bold' },
    activeTabText: { color: '#3b5998' },
    content: { padding: 15 },
    sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#666', marginBottom: 8, marginTop: 10, textTransform: 'uppercase' },
    card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 1 },
    label: { fontSize: 12, color: '#777', marginBottom: 5, marginTop: 8 },
    hint: { fontSize: 11, color: '#999', fontStyle: 'italic', marginTop: 6 },
    input: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, backgroundColor: '#fafafa' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    saveBtn: { backgroundColor: '#2e7d32', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 15, marginBottom: 5 },
    saveBtnText: { color: 'white', fontWeight: 'bold' },
    previewBtn: { backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    previewBtnText: { color: '#1565c0', fontWeight: 'bold' },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0', marginRight: 8 },
    chipActive: { backgroundColor: '#3b5998' },
    chipText: { color: '#555', fontSize: 13 },
    chipTextActive: { color: 'white', fontWeight: 'bold' },
    netRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 5 },
    netLabel: { fontSize: 15, fontWeight: 'bold', color: '#333' },
    netValue: { fontSize: 16, fontWeight: 'bold', color: '#2e7d32' },
    payslipRow: { backgroundColor: 'white', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
    selectAllBtn: { backgroundColor: '#e3f2fd', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    selectAllBtnText: { color: '#1565c0', fontSize: 12, fontWeight: 'bold' },
    payslipName: { fontWeight: 'bold', color: '#333' },
    payslipMeta: { fontSize: 11, color: '#999', marginTop: 2 },
    payslipAmount: { fontWeight: 'bold', color: '#2e7d32', fontSize: 15 },
    allPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    allPreviewName: { fontSize: 13, color: '#333' },
    allPreviewAmount: { fontSize: 13, fontWeight: 'bold', color: '#2e7d32' },
    exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    exportBtnText: { color: '#2e7d32', fontSize: 12, fontWeight: 'bold' },
});
