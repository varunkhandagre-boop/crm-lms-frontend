import { Ionicons } from '@expo/vector-icons';
import { saveAndShareFile } from '../utils/saveFile';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { sharePdfFromHtml } from '../utils/sharePdf';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import * as XLSX from 'xlsx';
import DateTimePicker from '@react-native-community/datetimepicker';
import { pickerHandlers } from '../utils/datePickerHandlers';
import WorkScheduleEditor, { scheduleHasErrors } from '../components/WorkScheduleEditor';
import { DEFAULT_SCHEDULE } from '../utils/workSchedule';
import {
    fetchPayrollSettings,
    fetchBankSheet,
    fetchPayrollRun,
    fetchPayslips,
    finalizePayroll,
    markPayrollPaid,
    PayrollRun,
    regeneratePayslip,
    reopenPayroll,
    generateAllPayslips,
    generatePayslip,
    PayrollSettings,
    Payslip,
    PayslipCalc,
    previewAllPayslips,
    previewPayslip,
    savePayrollSettings,
    DEFAULT_DEDUCTION_RULES,
    DEFAULT_OVERTIME_RULES,
    DEFAULT_LEAVE_POLICY,
    LeavePolicy,
    LeaveQuota,
    DeductionRules,
    OvertimeRules,
} from '../services/api/payroll';
import { fetchTeamMembers } from '../services/api/users';
import { urlToBase64Image } from '../utils/pdfImageHelper';
import { useData } from './context/DataContext';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';
import { useHeaderTop } from '../hooks/useHeaderTop';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Coloured header for each Salary Rules section (colour also used as the card's left stripe).
function RuleHeader({ color, icon, title }: { color: string; icon: keyof typeof Ionicons.glyphMap; title: string }) {
    return (
        <View style={[styles.ruleHeader, { backgroundColor: color }]}>
            <Ionicons name={icon} size={16} color="#fff" />
            <Text style={styles.ruleHeaderText}>{title}</Text>
        </View>
    );
}

function ChoiceChips<T extends string>({ value, options, onChange }: { value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {options.map((o) => (
                <TouchableOpacity key={o.v} onPress={() => onChange(o.v)} style={[styles.chip, value === o.v && styles.chipActive]}>
                    <Text style={[styles.chipText, value === o.v && styles.chipTextActive]}>{o.t}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

export default function PayrollScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();
    const { currentUser, companyProfile } = useData();
    const myRole = (currentUser?.role || '').toLowerCase();
    const isManager = myRole.includes('admin') || myRole.includes('manager') || myRole.includes('account');

    const [activeTab, setActiveTab] = useState<'Generate' | 'Settings'>('Generate');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [settings, setSettings] = useState<PayrollSettings | null>(null);
    // userList now comes from useCachedList below (cache-first, shared 'team_members' key)
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [preview, setPreview] = useState<Payslip | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    // payslips now comes from useCachedList above (cache-first)

    const [allPreview, setAllPreview] = useState<PayslipCalc[] | null>(null);
    const [allPreviewLoading, setAllPreviewLoading] = useState(false);
    const [selectedSlip, setSelectedSlip] = useState<Payslip | null>(null);
    const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
    const [myCurrentMonthSummary, setMyCurrentMonthSummary] = useState<Payslip | null>(null);

    // 🔥 PAYSLIPS — cache-first (instant from AsyncStorage, then background
    // refresh). Both the manager and self-view branches call
    // fetchPayslips({}) with identical (no) params — the server scopes the
    // result by role via the JWT — so this one hook covers both.
    // Managers load one month at a time (server-filtered); employees load their own.
    const payslipsCacheKey = isManager
        ? buildCacheKey(`payslips_${selectedYear}_${selectedMonth}`, currentUser?.companyId)
        : buildCacheKey('payslips', currentUser?.companyId);
    const {
        data: payslips,
        loading: payslipsLoading,
        refreshing: payslipsRefreshing,
        refresh: refreshPayslips,
    } = useCachedList({
        cacheKey: payslipsCacheKey,
        enabled: !!currentUser?.companyId,
        fetcher: () => (isManager ? fetchPayslips({ month: selectedMonth, year: selectedYear }) : fetchPayslips({})),
    });

    // ── Month lock: OPEN (no row) → FINALIZED → PAID ──
    const [run, setRun] = useState<PayrollRun | null>(null);
    const [showPaidPicker, setShowPaidPicker] = useState(false);
    const isAdminRole = myRole.includes('admin');
    const monthLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

    const loadRun = () => {
        if (!isManager || !currentUser?.companyId) return;
        fetchPayrollRun(selectedMonth, selectedYear).then(setRun).catch(() => setRun(null));
    };
    useEffect(loadRun, [selectedMonth, selectedYear, isManager, currentUser?.companyId]);

    const afterChange = async () => {
        loadRun();
        await refreshPayslips();
    };

    const handleFinalize = () => {
        Alert.alert(
            `Finalize ${monthLabel}?`,
            `This locks ${monthLabel}: no more payslips can be generated or recalculated for this month. Use it once every payslip is checked.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Finalize & Lock', onPress: async () => {
                    try { await finalizePayroll(selectedMonth, selectedYear); await afterChange(); }
                    catch (e: any) { Alert.alert('Error', e?.message || 'Could not finalize.'); }
                }},
            ]
        );
    };

    const handleReopen = () => {
        Alert.alert(`Reopen ${monthLabel}?`, 'Payslips of this month can be recalculated again until you finalize it once more.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reopen', style: 'destructive', onPress: async () => {
                try { await reopenPayroll(selectedMonth, selectedYear); await afterChange(); }
                catch (e: any) { Alert.alert('Error', e?.message || 'Could not reopen.'); }
            }},
        ]);
    };

    const onPaidDatePicked = (event: any, date?: Date) => {
        setShowPaidPicker(false);
        if (event?.type !== 'set' || !date) return;
        const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        Alert.alert(
            'Mark salary as paid?',
            `${monthLabel} salary transferred on ${date.toLocaleDateString('en-GB')}. Every employee gets a "Salary Credited" notification.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Mark Paid', onPress: async () => {
                    try { await markPayrollPaid(selectedMonth, selectedYear, ymd); await afterChange(); Alert.alert('Done ✅', 'Marked as paid and employees notified.'); }
                    catch (e: any) { Alert.alert('Error', e?.message || 'Could not mark paid.'); }
                }},
            ]
        );
    };

    // NEFT / bank transfer sheet for the finalized month.
    const handleBankSheet = async () => {
        try {
            const sheet = await fetchBankSheet(selectedMonth, selectedYear);
            if (sheet.rows.length === 0) return Alert.alert('Nothing to pay', `No payslip with an amount for ${monthLabel}.`);
            const exportSheet = async () => {
                const narration = `Salary ${MONTH_NAMES[selectedMonth - 1].slice(0, 3)} ${selectedYear}`;
                const rows = sheet.rows.map((r, i) => ({
                    'Sr No': i + 1,
                    'Beneficiary Name': r.name,
                    'Account Number': r.accountNo,
                    'IFSC': r.ifsc,
                    'Amount': r.amount,
                    'Bank Name': r.bankName,
                    'Emp ID': r.empId,
                    'Narration': narration,
                }));
                rows.push({ 'Sr No': '' as any, 'Beneficiary Name': 'TOTAL', 'Account Number': '', 'IFSC': '', 'Amount': sheet.total, 'Bank Name': '', 'Emp ID': '', 'Narration': '' });
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(rows);
                // Account numbers as text, so Excel doesn't turn them into 1.23E+11.
                rows.forEach((_, i) => { const c = ws[XLSX.utils.encode_cell({ r: i + 1, c: 2 })]; if (c) { c.t = 's'; c.v = String(c.v ?? ''); } });
                ws['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 18 }];
                XLSX.utils.book_append_sheet(wb, ws, 'Bank Transfer');
                const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
                await saveAndShareFile({
                    content: wbout, base64: true, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    fileName: `Salary_Bank_Sheet_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.xlsx`,
                    dialogTitle: `Bank sheet — ${monthLabel}`,
                });
            };
            const missing = sheet.rows.filter((r) => r.missingBank).map((r) => r.name);
            if (missing.length) {
                Alert.alert(
                    'Bank details missing',
                    `${missing.length} employee(s) have no account number / IFSC:\n\n${missing.join(', ')}\n\nAdd them in Manage Team, or export anyway and fill those rows by hand.`,
                    [{ text: 'Cancel', style: 'cancel' }, { text: 'Export anyway', onPress: exportSheet }]
                );
            } else {
                await exportSheet();
            }
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not create the bank sheet.');
        }
    };

    // Recalculate one payslip (attendance / leave corrected) — only while the month is open.
    const handleRegenerate = (slip: Payslip) => {
        Alert.alert(
            'Recalculate payslip?',
            `${slip.user?.name || 'This employee'} — ${MONTH_NAMES[slip.month - 1]} ${slip.year} will be calculated again from current attendance, leave, expenses and advances.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Recalculate', onPress: async () => {
                    try {
                        const fresh = await regeneratePayslip(slip.id);
                        await afterChange();
                        setSelectedSlip({ ...fresh, user: slip.user, runStatus: 'OPEN', paidAt: null });
                        Alert.alert('Done ✅', `New net payable: ₹${Number(fresh.netPayable).toLocaleString('en-IN')}`);
                    } catch (e: any) {
                        Alert.alert('Error', e?.message || 'Could not recalculate.');
                    }
                }},
            ]
        );
    };

    // 🔥 Team members — cache-first, shares the SAME 'team_members' cache
    // key as manage_team.tsx/employee_timeline.tsx.
    const { data: userList } = useCachedList({
        cacheKey: buildCacheKey('team_members', currentUser?.companyId),
        enabled: !!currentUser?.companyId && isManager,
        fetcher: fetchTeamMembers,
    });
    useEffect(() => {
        if (isManager && userList.length > 0 && !selectedUserId) {
            setSelectedUserId(userList[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userList, isManager]);

    useEffect(() => {
        (async () => {
            try {
                if (isManager) {
                    const s = await fetchPayrollSettings();
                    setSettings(s);
                } else {
                    // Self-view summary card — payslips list itself comes
                    // from the cache-first hook above.
                    const now = new Date();
                    const summary = await previewPayslip(undefined, now.getMonth() + 1, now.getFullYear()).catch(() => null);
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
    const rules: DeductionRules = settings?.deductionRules || DEFAULT_DEDUCTION_RULES;
    const setRule = <K extends keyof DeductionRules>(key: K, value: DeductionRules[K]) =>
        setSettings((prev) => (prev ? { ...prev, deductionRules: { ...(prev.deductionRules || DEFAULT_DEDUCTION_RULES), [key]: value } } : prev));
    const ot: OvertimeRules = settings?.overtimeRules || DEFAULT_OVERTIME_RULES;
    const setOt = <K extends keyof OvertimeRules>(key: K, value: OvertimeRules[K]) =>
        setSettings((prev) => (prev ? { ...prev, overtimeRules: { ...(prev.overtimeRules || DEFAULT_OVERTIME_RULES), [key]: value } } : prev));
    const lp: LeavePolicy = settings?.leavePolicy || DEFAULT_LEAVE_POLICY;
    const setLp = <K extends keyof LeavePolicy>(key: K, value: LeavePolicy[K]) =>
        setSettings((prev) => (prev ? { ...prev, leavePolicy: { ...(prev.leavePolicy || DEFAULT_LEAVE_POLICY), [key]: value } } : prev));
    const setQuota = (t: 'CL' | 'SL' | 'EL', patch: Partial<LeaveQuota>) => setLp('quotas', { ...lp.quotas, [t]: { ...lp.quotas[t], ...patch } });
    const num = (t: string, min: number, max: number) => Math.max(min, Math.min(max, Number(t.replace(/[^0-9.]/g, '')) || 0));

    const handleSaveSettings = async () => {
        if (!settings) return;
        if (settings.workSchedule && scheduleHasErrors(settings.workSchedule)) {
            Alert.alert('Check shift time', 'Shift times must be 24-hour HH:MM, e.g. 09:30 or 18:30.');
            return;
        }
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
            await afterChange();
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
                        await afterChange();
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
                    'Overtime Hours': Number(p.overtimeHours || 0),
                    'Overtime Amount': Number(p.overtimeAmount || 0),
                    'Office Days': p.officeDays,
                    'Field Days': p.fieldDays,
                    'Present Days': p.presentDays,
                    'Short Days': p.shortDaysCount,
                    'Holidays': p.holidaysThisMonth,
                    'Leaves Taken': p.leaveDaysThisMonth,
                    'Leave Balance': p.leaveBalance,
                    'Late Days': p.lateDays ?? 0,
                    'Late Deduction': Number(p.lateDeduction),
                    'Absent Days': Number(p.absentDays || 0),
                    'Absent Deduction': Number(p.absentDeduction || 0),
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
            await saveAndShareFile({
                content: wbout, base64: true, fileName, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
                  ${Number(slip.overtimeAmount) > 0 ? `<tr><td>Overtime (${Number(slip.overtimeHours)} h)</td><td style="text-align:right;" class="earn">₹${Number(slip.overtimeAmount).toLocaleString('en-IN')}</td></tr>` : ''}
                </tbody>
              </table>

              <table class="table">
                <thead><tr><th style="width:60%;">Deductions</th><th style="width:40%; text-align:right;">Amount</th></tr></thead>
                <tbody>
                  <tr><td>Late-Coming${slip.lateDays ? ` (${slip.lateDays} late)` : ''}</td><td style="text-align:right;" class="ded">₹${Number(slip.lateDeduction).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Absent${Number(slip.absentDays) ? ` (${Number(slip.absentDays)} day)` : ''}</td><td style="text-align:right;" class="ded">₹${Number(slip.absentDeduction || 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Short Working-Hours</td><td style="text-align:right;" class="ded">₹${Number(slip.shortHoursDeduction).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Leave (Beyond Quota)</td><td style="text-align:right;" class="ded">₹${Number(slip.leaveDeduction).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Advance Recovery</td><td style="text-align:right;" class="ded">₹${Number(slip.advanceDeduction).toLocaleString('en-IN')}</td></tr>
                  <tr class="net-row"><td>NET PAYABLE</td><td style="text-align:right;">₹${Number(slip.netPayable).toLocaleString('en-IN')}</td></tr>
                </tbody>
              </table>

              <div class="doc-footer">
                This is a system-generated salary slip from ${companyProfile?.companyName || 'our company'} • Generated on ${genDate}${slip.runStatus === 'PAID' && slip.paidAt ? ` • Paid on ${new Date(slip.paidAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}` : ''}
              </div>
            </div>
          </body>
        </html>`;

        const cleanName = `Payslip_${slip.user?.name?.replace(/ /g, '_') || 'Employee'}_${MONTH_NAMES[slip.month - 1]}_${slip.year}.pdf`;
        await sharePdfFromHtml(htmlContent, cleanName, `Share Payslip`);
    } catch (error: any) {
        Alert.alert('Error', error.message || 'Could not generate payslip PDF.');
    }
};


    if (loading || payslipsLoading) {
        return <View style={styles.centerLoading}><ActivityIndicator size="large" color="#3b5998" /></View>;
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Payroll</Text>
                <View style={{ width: 24 }} />
            </View>

            {!isManager && (
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={
                        <RefreshControl refreshing={payslipsRefreshing} onRefresh={refreshPayslips} colors={['#3b5998']} tintColor="#3b5998" />
                    }
                >
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
                                    <Text style={styles.payslipMeta}>
                                        {item.runStatus === 'PAID' && item.paidAt
                                            ? `✅ Paid on ${new Date(item.paidAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}`
                                            : 'Net Payable'}
                                    </Text>
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
                    <RuleHeader color="#2e7d32" icon="trending-up" title="Incentive (on sales above target)" />
                    <View style={[styles.card, styles.ruleCard, { borderLeftColor: '#2e7d32' }]}>
                        <Text style={styles.label}>Tier 1 Commission (%) — on sales above target</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={String(settings.incentiveTier1Percent)} onChangeText={(t) => updateSetting('incentiveTier1Percent', Number(t) || 0)} />
                        <Text style={styles.label}>Tier 2 Commission (%) — beyond boost threshold</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={String(settings.incentiveTier2Percent)} onChangeText={(t) => updateSetting('incentiveTier2Percent', Number(t) || 0)} />
                        <Text style={styles.label}>Tier 2 Threshold Multiplier (e.g. 1.5 = 150% of target)</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={String(settings.tier2Multiplier)} onChangeText={(t) => updateSetting('tier2Multiplier', Number(t) || 1)} />
                    </View>

                    <RuleHeader color="#ef6c00" icon="alarm" title="Late-Coming" />
                    <View style={[styles.card, styles.ruleCard, { borderLeftColor: '#ef6c00' }]}>
                        <View style={styles.switchRow}>
                            <Text style={styles.label}>Enable</Text>
                            <Switch value={settings.lateComingEnabled} onValueChange={(v) => updateSetting('lateComingEnabled', v)} />
                        </View>
                        {settings.lateComingEnabled && (
                            <>
                                <Text style={styles.label}>Late After (24hr, e.g. 10:00)</Text>
                                <TextInput style={styles.input} placeholder="10:00" value={settings.lateComingAfterTime || ''} onChangeText={(t) => updateSetting('lateComingAfterTime', t)} />
                                <Text style={styles.hint}>An employee with a shift (Weekly Off & Shift below) is late after shift start + {'"late after (min)"'} instead.</Text>
                                <Text style={styles.label}>How to cut for late</Text>
                                <ChoiceChips
                                    value={rules.lateMode}
                                    options={[
                                        { v: 'half_day_each', t: '½ day per late' },
                                        { v: 'every_n', t: `½ day per ${rules.lateEveryN} lates` },
                                        { v: 'fixed', t: '₹ per late' },
                                    ]}
                                    onChange={(v) => setRule('lateMode', v)}
                                />
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>Free lates / month</Text>
                                        <TextInput style={styles.input} keyboardType="numeric" value={String(rules.lateFree)} onChangeText={(t) => setRule('lateFree', Math.min(31, Number(t.replace(/[^0-9]/g, '')) || 0))} />
                                    </View>
                                    {rules.lateMode === 'every_n' && (
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>Lates per ½ day</Text>
                                            <TextInput style={styles.input} keyboardType="numeric" value={String(rules.lateEveryN)} onChangeText={(t) => setRule('lateEveryN', Math.max(1, Math.min(31, Number(t.replace(/[^0-9]/g, '')) || 1)))} />
                                        </View>
                                    )}
                                    {rules.lateMode === 'fixed' && (
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>₹ per late</Text>
                                            <TextInput style={styles.input} keyboardType="numeric" value={String(settings.lateComingPenalty)} onChangeText={(t) => updateSetting('lateComingPenalty', Number(t) || 0)} />
                                        </View>
                                    )}
                                </View>
                            </>
                        )}
                    </View>

                    <RuleHeader color="#f9a825" icon="hourglass" title="Short Hours" />
                    <View style={[styles.card, styles.ruleCard, { borderLeftColor: '#f9a825' }]}>
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

                    <RuleHeader color="#00897b" icon="calendar" title="Weekly Off & Shift (company default)" />
                    <View style={[styles.card, styles.ruleCard, { borderLeftColor: '#00897b' }]}>
                        <Text style={{ fontSize: 12, color: 'gray' }}>
                            Applies to everyone unless an employee has their own in Manage Team. Used for Day In reminders, attendance, leave balance and late marks.
                        </Text>
                        <WorkScheduleEditor
                            value={settings.workSchedule || DEFAULT_SCHEDULE}
                            onChange={(ws) => updateSetting('workSchedule', ws)}
                            showGrace
                        />
                    </View>

                    <RuleHeader color="#1565c0" icon="flash" title="Overtime" />
                    <View style={[styles.card, styles.ruleCard, { borderLeftColor: '#1565c0' }]}>
                        <View style={styles.switchRow}>
                            <Text style={styles.label}>Pay overtime</Text>
                            <Switch value={ot.enabled} onValueChange={(v) => setOt('enabled', v)} />
                        </View>
                        {ot.enabled && (
                            <>
                                <Text style={styles.hint}>Hours worked on a working day beyond the employee’s shift (or the standard hours below when no shift is set). Work on a weekly off / holiday earns leave instead.</Text>
                                <Text style={styles.label}>Rate</Text>
                                <ChoiceChips
                                    value={ot.mode}
                                    options={[
                                        { v: 'x1', t: 'Hourly salary × 1' },
                                        { v: 'x1_5', t: '× 1.5' },
                                        { v: 'x2', t: '× 2' },
                                        { v: 'fixed', t: '₹ per hour' },
                                    ]}
                                    onChange={(v) => setOt('mode', v)}
                                />
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    {ot.mode === 'fixed' && (
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>₹ per hour</Text>
                                            <TextInput style={styles.input} keyboardType="numeric" value={String(ot.ratePerHour)} onChangeText={(t) => setOt('ratePerHour', num(t, 0, 100000))} />
                                        </View>
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>Standard hours / day</Text>
                                        <TextInput style={styles.input} keyboardType="numeric" value={String(ot.standardHours)} onChangeText={(t) => setOt('standardHours', num(t, 1, 16))} />
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>Min. minutes</Text>
                                        <TextInput style={styles.input} keyboardType="numeric" value={String(ot.minMinutes)} onChangeText={(t) => setOt('minMinutes', Math.round(num(t, 0, 240)))} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>Round down to (min)</Text>
                                        <TextInput style={styles.input} keyboardType="numeric" value={String(ot.roundToMinutes)} onChangeText={(t) => setOt('roundToMinutes', Math.round(num(t, 1, 60)))} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>Max hrs / day</Text>
                                        <TextInput style={styles.input} keyboardType="numeric" value={String(ot.maxHoursPerDay)} onChangeText={(t) => setOt('maxHoursPerDay', num(t, 0.5, 12))} />
                                    </View>
                                </View>
                                <Text style={styles.hint}>Hourly salary = one day’s salary ÷ shift hours. E.g. 1 h 40 min extra with “round down to 30” = 1.5 h.</Text>
                            </>
                        )}
                    </View>

                    <RuleHeader color="#c62828" icon="person-remove" title="Absent & One Day’s Salary" />
                    <View style={[styles.card, styles.ruleCard, { borderLeftColor: '#c62828' }]}>
                        <Text style={styles.label}>One day’s salary =</Text>
                        <ChoiceChips
                            value={rules.perDayBasis}
                            options={[
                                { v: 'calendar', t: 'Salary ÷ days in month' },
                                { v: 'fixed30', t: 'Salary ÷ 30' },
                                { v: 'working', t: 'Salary ÷ working days' },
                            ]}
                            onChange={(v) => setRule('perDayBasis', v)}
                        />
                        <View style={styles.switchRow}>
                            <Text style={[styles.label, { flex: 1 }]}>Cut one day’s salary for absent without leave</Text>
                            <Switch value={rules.absentDeduction} onValueChange={(v) => setRule('absentDeduction', v)} />
                        </View>
                        {rules.absentDeduction && (
                            <View style={styles.switchRow}>
                                <Text style={[styles.label, { flex: 1 }]}>Sandwich rule — weekly off / holiday between two absent days is also absent</Text>
                                <Switch value={rules.sandwichRule} onValueChange={(v) => setRule('sandwichRule', v)} />
                            </View>
                        )}
                        <View style={styles.switchRow}>
                            <Text style={[styles.label, { flex: 1 }]}>Day In without Day Out = ½ day absent</Text>
                            <Switch value={rules.missingDayOutHalfDay} onValueChange={(v) => setRule('missingDayOutHalfDay', v)} />
                        </View>
                        <Text style={styles.hint}>Absent = a past working day with no Day In and no approved leave (weekly offs and holidays don’t count). Days before joining are never absent.</Text>
                    </View>

                    <RuleHeader color="#6a1b9a" icon="document-text" title="Leave Quota (single pool)" />
                    <View style={[styles.card, styles.ruleCard, { borderLeftColor: '#6a1b9a' }]}>
                        <Text style={styles.label}>Leave beyond the allowed quota</Text>
                        <ChoiceChips
                            value={rules.leaveExcessMode}
                            options={[
                                { v: 'fixed_penalty', t: '₹ per day beyond monthly quota' },
                                { v: 'lwp', t: "One day's salary (LWP) beyond yearly balance" },
                            ]}
                            onChange={(v) => setRule('leaveExcessMode', v)}
                        />
                        {rules.leaveExcessMode === 'fixed_penalty' && (
                            <>
                                <Text style={styles.label}>Penalty (₹ per extra day beyond monthly quota)</Text>
                                <TextInput style={styles.input} keyboardType="numeric" value={String(settings.leaveExcessPenalty)} onChangeText={(t) => updateSetting('leaveExcessPenalty', Number(t) || 0)} />
                            </>
                        )}
                    </View>

                    <RuleHeader color="#8e24aa" icon="briefcase" title="Leave Policy (CL / SL / EL)" />
                    <View style={[styles.card, styles.ruleCard, { borderLeftColor: '#8e24aa' }]}>
                        <View style={styles.switchRow}>
                            <Text style={[styles.label, { flex: 1 }]}>Separate CL / SL / EL balances</Text>
                            <Switch value={lp.enabled} onValueChange={(v) => setLp('enabled', v)} />
                        </View>
                        <Text style={styles.hint}>
                            {lp.enabled
                                ? 'Each employee gets these yearly quotas (Apr–Mar). Working on a weekly off / holiday adds Comp Off. Unplanned absence is NOT taken from leave — use “Absent” above to cut salary. The per-employee “Leaves” number and the ₹ leave penalty are not used.'
                                : 'Off: one yearly leave pool per employee (Manage Team → Leaves), as before.'}
                        </Text>
                        {lp.enabled && (
                            <>
                                {(['CL', 'SL', 'EL'] as const).map((t) => (
                                    <View key={t} style={styles.quotaRow}>
                                        <Text style={styles.quotaType}>{t}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>Days / year</Text>
                                            <TextInput style={styles.input} keyboardType="numeric" value={String(lp.quotas[t].days)} onChangeText={(v) => setQuota(t, { days: num(v, 0, 365) })} />
                                        </View>
                                        <View style={{ alignItems: 'center', marginHorizontal: 6 }}>
                                            <Text style={styles.label}>Carry</Text>
                                            <Switch value={lp.quotas[t].carryForward} onValueChange={(v) => setQuota(t, { carryForward: v })} />
                                        </View>
                                        <View style={{ flex: 1, opacity: lp.quotas[t].carryForward ? 1 : 0.35 }}>
                                            <Text style={styles.label}>Max carry</Text>
                                            <TextInput style={styles.input} keyboardType="numeric" editable={lp.quotas[t].carryForward} value={String(lp.quotas[t].maxCarry)} onChangeText={(v) => setQuota(t, { maxCarry: num(v, 0, 365) })} />
                                        </View>
                                    </View>
                                ))}
                                <Text style={styles.label}>Marriage / Festival / Others leave</Text>
                                <ChoiceChips
                                    value={lp.otherTypesMode}
                                    options={[
                                        { v: 'cl', t: 'From CL balance' },
                                        { v: 'paid', t: 'Paid, no balance' },
                                        { v: 'lwp', t: 'Unpaid (LWP)' },
                                    ]}
                                    onChange={(v) => setLp('otherTypesMode', v)}
                                />
                            </>
                        )}
                        <View style={styles.switchRow}>
                            <Text style={[styles.label, { flex: 1 }]}>Count weekly offs / holidays inside a leave as leave days</Text>
                            <Switch value={lp.countOffDays} onValueChange={(v) => setLp('countOffDays', v)} />
                        </View>
                        <View style={styles.switchRow}>
                            <Text style={[styles.label, { flex: 1 }]}>Allow half-day leave</Text>
                            <Switch value={lp.halfDayAllowed} onValueChange={(v) => setLp('halfDayAllowed', v)} />
                        </View>
                    </View>

                    <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSettings} disabled={saving}>
                        {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Rules</Text>}
                    </TouchableOpacity>
                </ScrollView>
            )}

            {activeTab === 'Generate' && (
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={
                        <RefreshControl refreshing={payslipsRefreshing} onRefresh={refreshPayslips} colors={['#3b5998']} tintColor="#3b5998" />
                    }
                >
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

                    <Text style={styles.sectionTitle}>Status — {monthLabel}</Text>
                    <View style={styles.card}>
                        {!run ? (
                            <>
                                <Text style={styles.runText}>🟡 Open — payslips can still be generated or recalculated.</Text>
                                {payslips.length > 0 && (
                                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#6a1b9a', marginTop: 10 }]} onPress={handleFinalize}>
                                        <Text style={styles.saveBtnText}>🔒 Finalize & Lock {monthLabel}</Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        ) : (
                            <>
                                <Text style={styles.runText}>
                                    {run.status === 'PAID'
                                        ? `✅ Paid on ${run.paidAt ? new Date(run.paidAt).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '-'} — locked.`
                                        : '🔒 Finalized — locked. Download the bank sheet, transfer salaries, then mark as paid.'}
                                </Text>
                                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#2e7d32', marginTop: 10 }]} onPress={handleBankSheet}>
                                    <Text style={styles.saveBtnText}>🏦 Bank Transfer Sheet (Excel)</Text>
                                </TouchableOpacity>
                                {run.status === 'FINALIZED' && (
                                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#1565c0', marginTop: 10 }]} onPress={() => setShowPaidPicker(true)}>
                                        <Text style={styles.saveBtnText}>💰 Mark Salary as Paid</Text>
                                    </TouchableOpacity>
                                )}
                                {run.status === 'FINALIZED' && isAdminRole && (
                                    <TouchableOpacity onPress={handleReopen} style={{ marginTop: 10, alignSelf: 'center' }}>
                                        <Text style={{ color: '#c62828', fontWeight: 'bold' }}>Reopen (Admin)</Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        )}
                        {showPaidPicker && <DateTimePicker value={new Date()} mode="date" maximumDate={new Date()} {...pickerHandlers(onPaidDatePicked)} />}
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
                            {Number(preview.overtimeAmount) > 0 && <Row label={`Overtime (${Number(preview.overtimeHours)} h)`} value={Number(preview.overtimeAmount)} positive />}
                            <Row label={`Late-Coming Deduction${preview.lateDays ? ` (${preview.lateDays} late)` : ''}`} value={-preview.lateDeduction} />
                            <Row label={`Absent Deduction${Number(preview.absentDays) ? ` (${Number(preview.absentDays)} day)` : ''}`} value={-Number(preview.absentDeduction || 0)} />
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
                        <Text style={styles.sectionTitle}>Payslips — {monthLabel}</Text>
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
                        <Text style={[styles.runBadge, selectedSlip.runStatus === 'PAID' ? styles.runPaid : selectedSlip.runStatus === 'FINALIZED' ? styles.runFinal : styles.runOpen]}>
                            {selectedSlip.runStatus === 'PAID'
                                ? `✅ Paid on ${selectedSlip.paidAt ? new Date(selectedSlip.paidAt).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '-'}`
                                : selectedSlip.runStatus === 'FINALIZED' ? '🔒 Final' : '🟡 Draft — may still change'}
                        </Text>
                        {isManager && (selectedSlip.runStatus ?? 'OPEN') === 'OPEN' && (
                            <TouchableOpacity onPress={() => handleRegenerate(selectedSlip)} style={{ marginTop: 8 }}>
                                <Text style={{ color: '#1565c0', fontWeight: 'bold' }}>↻ Recalculate this payslip</Text>
                            </TouchableOpacity>
                        )}

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
                            {Number(selectedSlip.overtimeAmount) > 0 && <Row label={`Overtime (${Number(selectedSlip.overtimeHours)} h)`} value={Number(selectedSlip.overtimeAmount)} positive />}
                            <Row label={`Late-Coming Deduction${selectedSlip.lateDays ? ` (${selectedSlip.lateDays} late)` : ''}`} value={-Number(selectedSlip.lateDeduction)} />
                            <Row label={`Absent Deduction${Number(selectedSlip.absentDays) ? ` (${Number(selectedSlip.absentDays)} day)` : ''}`} value={-Number(selectedSlip.absentDeduction || 0)} />
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
    runText: { fontSize: 13, color: '#333', lineHeight: 19 },
    ruleHeader: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginTop: 14 },
    ruleHeaderText: { color: '#fff', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
    ruleCard: { borderLeftWidth: 5, borderTopLeftRadius: 0 },
    quotaRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
    quotaType: { width: 30, fontWeight: 'bold', color: '#3b5998', paddingBottom: 12 },
    runBadge: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, fontSize: 12, fontWeight: 'bold', overflow: 'hidden' },
    runOpen: { backgroundColor: '#fff8e1', color: '#ef6c00' },
    runFinal: { backgroundColor: '#ede7f6', color: '#6a1b9a' },
    runPaid: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
    attSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    attBox: { backgroundColor: '#f5f7fa', borderRadius: 8, padding: 10, minWidth: '30%', alignItems: 'center' },
    attBoxValue: { fontSize: 16, fontWeight: 'bold', color: '#3b5998' },
    attBoxLabel: { fontSize: 10, color: '#777', marginTop: 2, textAlign: 'center' },
    modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalBox: { backgroundColor: 'white', borderRadius: 12, padding: 20, elevation: 10 },
    modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#333' },
    modalSub: { fontSize: 13, color: '#999' },
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#3b5998', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
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
