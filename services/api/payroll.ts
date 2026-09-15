import { apiClient } from './client';

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
  netPayable: number;
  generatedAt: string;
  user?: { name: string; empId: string | null };
}

interface OneResponse<T> { data: T; }
interface ListResponse<T> { data: T[]; meta: any; }

export async function fetchPayrollSettings(): Promise<PayrollSettings> {
  const res = await apiClient.get<OneResponse<PayrollSettings>>('/payroll/settings');
  return {
    ...res.data,
    incentiveTier1Percent: Number(res.data.incentiveTier1Percent),
    incentiveTier2Percent: Number(res.data.incentiveTier2Percent),
    tier2Multiplier: Number(res.data.tier2Multiplier),
    lateComingPenalty: Number(res.data.lateComingPenalty),
    shortHoursThreshold: Number(res.data.shortHoursThreshold),
    shortHoursPenalty: Number(res.data.shortHoursPenalty),
    leaveExcessPenalty: Number(res.data.leaveExcessPenalty),
  };
}

export async function savePayrollSettings(payload: Partial<PayrollSettings>): Promise<PayrollSettings> {
  const res = await apiClient.patch<OneResponse<PayrollSettings>>('/payroll/settings', payload);
  return res.data;
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