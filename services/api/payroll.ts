import { DEFAULT_SCHEDULE, WorkSchedule } from '../../utils/workSchedule';
import { apiClient } from './client';

// Same rules as the backend (src/lib/deductionRules.ts); defaults = old behaviour.
export interface DeductionRules {
  perDayBasis: 'calendar' | 'fixed30' | 'working';
  lateMode: 'half_day_each' | 'every_n' | 'fixed';
  lateFree: number;
  lateEveryN: number;
  absentDeduction: boolean;
  sandwichRule: boolean;
  missingDayOutHalfDay: boolean;
  leaveExcessMode: 'fixed_penalty' | 'lwp';
}
// Leave Policy (backend src/lib/leavePolicy.ts) — off = old single yearly pool.
export interface LeaveQuota { days: number; carryForward: boolean; maxCarry: number }
export interface LeavePolicy {
  enabled: boolean;
  quotas: { CL: LeaveQuota; SL: LeaveQuota; EL: LeaveQuota };
  otherTypesMode: 'cl' | 'paid' | 'lwp';
  countOffDays: boolean;
  halfDayAllowed: boolean;
}
export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
  enabled: false,
  quotas: {
    CL: { days: 8, carryForward: false, maxCarry: 0 },
    SL: { days: 6, carryForward: false, maxCarry: 0 },
    EL: { days: 12, carryForward: true, maxCarry: 30 },
  },
  otherTypesMode: 'cl',
  countOffDays: true,
  halfDayAllowed: true,
};

// Overtime (backend src/lib/overtime.ts) — off by default.
export interface OvertimeRules {
  enabled: boolean;
  mode: 'fixed' | 'x1' | 'x1_5' | 'x2';
  ratePerHour: number;
  standardHours: number;
  minMinutes: number;
  roundToMinutes: number;
  maxHoursPerDay: number;
}
export const DEFAULT_OVERTIME_RULES: OvertimeRules = {
  enabled: false, mode: 'x1', ratePerHour: 0, standardHours: 9, minMinutes: 30, roundToMinutes: 30, maxHoursPerDay: 4,
};

export const DEFAULT_DEDUCTION_RULES: DeductionRules = {
  perDayBasis: 'calendar', lateMode: 'half_day_each', lateFree: 0, lateEveryN: 3,
  absentDeduction: false, sandwichRule: false, missingDayOutHalfDay: false, leaveExcessMode: 'fixed_penalty',
};

export interface PayrollSettings {
  id: string;
  incentiveTier1Percent: number;
  incentiveTier2Percent: number;
  tier2Multiplier: number;
  lateComingEnabled: boolean;
  lateComingAfterTime: string | null;
  lateComingPenalty: number;
  shortHoursEnabled: boolean;
  shortHoursThreshold: number;
  shortHoursPenalty: number;
  leaveExcessPenalty: number;
  workSchedule: WorkSchedule; // company weekly off + shift
  deductionRules: DeductionRules; // late / absent / leave-excess cuts
  overtimeRules: OvertimeRules;
  leavePolicy: LeavePolicy;
}

export interface Payslip {
  id: string;
  userId: string;
  month: number;
  year: number;
  baseSalary: number;
  incentiveAmount: number;
  expenseAmount: number;
  officeDays: number;
  fieldDays: number;
  presentDays: number;
  shortDaysCount: number;
  holidaysThisMonth: number;
  leaveDaysThisMonth: number;
  leaveBalance: number;
  lateDeduction: number;
  shortHoursDeduction: number;
  leaveDeduction: number;
  advanceDeduction: number;
  lateDays?: number;
  absentDays?: number | string; // Decimal — may arrive as a string
  absentDeduction?: number | string;
  overtimeHours?: number | string;
  overtimeAmount?: number | string;
  netPayable: number;
  generatedAt: string;
  user?: { name: string; empId: string | null };
  // Month state: OPEN (can regenerate) → FINALIZED (locked) → PAID
  runStatus?: 'OPEN' | 'FINALIZED' | 'PAID';
  paidAt?: string | null; // YYYY-MM-DD…
}

interface OneResponse<T> { data: T; }
interface ListResponse<T> { data: T[]; meta: any; }

// Decimals arrive as strings — numbers here, so a second Save doesn't fail validation.
function normalizeSettings(d: any): PayrollSettings {
  return {
    ...d,
    incentiveTier1Percent: Number(d.incentiveTier1Percent),
    incentiveTier2Percent: Number(d.incentiveTier2Percent),
    tier2Multiplier: Number(d.tier2Multiplier),
    lateComingPenalty: Number(d.lateComingPenalty),
    shortHoursThreshold: Number(d.shortHoursThreshold),
    shortHoursPenalty: Number(d.shortHoursPenalty),
    leaveExcessPenalty: Number(d.leaveExcessPenalty),
    workSchedule: { ...DEFAULT_SCHEDULE, ...(d.workSchedule || {}) },
    deductionRules: { ...DEFAULT_DEDUCTION_RULES, ...(d.deductionRules || {}) },
    overtimeRules: { ...DEFAULT_OVERTIME_RULES, ...(d.overtimeRules || {}) },
    leavePolicy: {
      ...DEFAULT_LEAVE_POLICY,
      ...(d.leavePolicy || {}),
      quotas: { ...DEFAULT_LEAVE_POLICY.quotas, ...((d.leavePolicy && d.leavePolicy.quotas) || {}) },
    },
  };
}

export async function fetchPayrollSettings(): Promise<PayrollSettings> {
  const res = await apiClient.get<OneResponse<PayrollSettings>>('/payroll/settings');
  return normalizeSettings(res.data);
}

export async function savePayrollSettings(payload: Partial<PayrollSettings>): Promise<PayrollSettings> {
  const res = await apiClient.patch<OneResponse<PayrollSettings>>('/payroll/settings', payload);
  return normalizeSettings(res.data);
}

export async function previewPayslip(userId: string | undefined, month: number, year: number): Promise<Payslip> {
  const qs = userId ? `?userId=${userId}&month=${month}&year=${year}` : `?month=${month}&year=${year}`;
  const res = await apiClient.get<OneResponse<Payslip>>(`/payroll/preview${qs}`);
  return res.data;
}

export async function generatePayslip(userId: string, month: number, year: number): Promise<Payslip> {
  const res = await apiClient.post<OneResponse<Payslip>>('/payroll/generate', { userId, month, year });
  return res.data;
}

export async function fetchPayslips(params: { userId?: string; month?: number; year?: number } = {}): Promise<Payslip[]> {
  const qs = new URLSearchParams();
  if (params.userId) qs.set('userId', params.userId);
  if (params.month) qs.set('month', String(params.month));
  if (params.year) qs.set('year', String(params.year));
  const res = await apiClient.get<ListResponse<Payslip>>(`/payroll?${qs.toString()}`);
  return res.data;
}

export interface PayslipCalc {
  userId: string;
  userName?: string;
  empId?: string | null;
  month: number;
  year: number;
  baseSalary: number;
  incentiveAmount: number;
  expenseAmount: number;
  officeDays: number;
  fieldDays: number;
  presentDays: number;
  shortDaysCount: number;
  holidaysThisMonth: number;
  leaveDaysThisMonth: number;
  leaveBalance: number;
  lateDeduction: number;
  shortHoursDeduction: number;
  leaveDeduction: number;
  advanceDeduction: number;
  netPayable: number;
}

export async function previewAllPayslips(month: number, year: number): Promise<PayslipCalc[]> {
  const res = await apiClient.get<ListResponse<PayslipCalc>>(`/payroll/preview-all?month=${month}&year=${year}`);
  return res.data;
}

export async function generateAllPayslips(month: number, year: number): Promise<{ created: number; skipped: number; total: number }> {
  const res = await apiClient.post<OneResponse<{ created: number; skipped: number; total: number }>>('/payroll/generate-all', { month, year });
  return res.data;
}
// ── Month lock / paid / regenerate / bank sheet ─────────────────────────────
export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: 'FINALIZED' | 'PAID';
  finalizedAt: string;
  paidAt: string | null;
  paidNote: string | null;
}

export async function fetchPayrollRun(month: number, year: number): Promise<PayrollRun | null> {
  const res = await apiClient.get<OneResponse<PayrollRun | null>>(`/payroll/run?month=${month}&year=${year}`);
  return res.data;
}

export async function finalizePayroll(month: number, year: number): Promise<PayrollRun> {
  const res = await apiClient.post<OneResponse<PayrollRun>>('/payroll/finalize', { month, year });
  return res.data;
}

export async function reopenPayroll(month: number, year: number): Promise<void> {
  await apiClient.post('/payroll/reopen', { month, year });
}

export async function markPayrollPaid(month: number, year: number, paidOn: string, note?: string): Promise<PayrollRun> {
  const res = await apiClient.post<OneResponse<PayrollRun>>('/payroll/mark-paid', { month, year, paidOn, note });
  return res.data;
}

export async function regeneratePayslip(payslipId: string): Promise<Payslip> {
  const res = await apiClient.post<OneResponse<Payslip>>(`/payroll/payslips/${payslipId}/regenerate`, {});
  return res.data;
}

export interface BankSheetRow {
  name: string; empId: string; bankName: string; accountNo: string; ifsc: string; amount: number; missingBank: boolean;
}
export async function fetchBankSheet(month: number, year: number): Promise<{ rows: BankSheetRow[]; total: number; status: string }> {
  const res = await apiClient.get<OneResponse<{ rows: BankSheetRow[]; total: number; status: string }>>(`/payroll/bank-sheet?month=${month}&year=${year}`);
  return res.data;
}

// ── Full & Final settlement ────────────────────────────────────────────────
export interface FnfLine { key: string; label: string; amount: number; note?: string }
export interface FnfInput {
  userId: string;
  lastWorkingDay: string; // YYYY-MM-DD
  encashDays?: number | null;
  noticeShortDays?: number;
  includeGratuity?: boolean | null;
  otherAdditions?: { label: string; amount: number }[];
  otherDeductions?: { label: string; amount: number }[];
  note?: string;
}
export interface FnfSaved {
  id: string; userId: string; lastWorkingDay: string; status: 'FINAL' | 'PAID';
  lines: { lines: FnfLine[]; perDaySalary: number }; netAmount: string | number; note: string | null; paidAt: string | null; createdAt: string;
}
export interface FnfPreview {
  employee: {
    id: string; name: string; empId: string | null; role: string; jobTitle: string | null; joiningDate: string;
    baseSalary: number; tenureYears: number; bankName: string | null; bankAccountNo: string | null; bankIfsc: string | null;
  };
  lastWorkingDay: string;
  perDaySalary: number;
  suggestedEncashDays: number;
  gratuityEligible: boolean;
  lines: FnfLine[];
  net: number;
  existing: FnfSaved | null;
}

export async function previewFinalSettlement(input: FnfInput): Promise<FnfPreview> {
  const res = await apiClient.post<OneResponse<FnfPreview>>('/payroll/final-settlement/preview', input);
  return res.data;
}
export async function saveFinalSettlement(input: FnfInput): Promise<FnfPreview> {
  const res = await apiClient.post<OneResponse<FnfPreview>>('/payroll/final-settlement', input);
  return res.data;
}
export async function fetchFinalSettlement(userId: string): Promise<FnfSaved | null> {
  const res = await apiClient.get<OneResponse<FnfSaved | null>>(`/payroll/final-settlement/${userId}`);
  return res.data;
}
export async function deleteFinalSettlement(id: string): Promise<void> {
  await apiClient.delete(`/payroll/final-settlement/${id}`);
}
export async function markFinalSettlementPaid(id: string, paidOn: string): Promise<FnfSaved> {
  const res = await apiClient.post<OneResponse<FnfSaved>>(`/payroll/final-settlement/${id}/paid`, { paidOn });
  return res.data;
}
