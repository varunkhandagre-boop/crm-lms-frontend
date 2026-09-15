import { apiClient } from './client';

export interface ApiAdvance {
  id: string;
  companyId: string;
  date: string;
  amount: string | number;
  reason: string;
  status: string;
  settlementDate: string | null;
  createdById: string;
  createdAt: string;
}

function toLegacyAdvance(a: ApiAdvance): any {
  const dateOnly = a.date ? a.date.split('T')[0] : undefined;
  return {
    id: a.id,
    companyId: a.companyId,
    date: dateOnly,
    dateIso: dateOnly,
    amount: Number(a.amount) || 0,
    reason: a.reason,
    status: a.status,
    settlementDate: a.settlementDate,
    senderId: a.createdById,
    senderName: undefined,
    createdAt: a.createdAt,
  };
}

function toQueryString(params: Record<string, any>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function listAdvances(params: { status?: string } = {}): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiAdvance[] }>(`/advances${toQueryString({ limit: 100, ...params })}`);
  return res.data.map(toLegacyAdvance);
}

export async function createAdvance(payload: { amount: number; reason: string; date?: string }): Promise<any> {
  const res = await apiClient.post<{ data: ApiAdvance }>('/advances', payload);
  return toLegacyAdvance(res.data);
}

export async function updateAdvanceStatus(id: string, status: 'Approved' | 'Rejected', monthlyDeductionAmount?: number): Promise<any> {
  const res = await apiClient.patch<{ data: ApiAdvance }>(`/advances/${id}/status`, { status, monthlyDeductionAmount });
  return toLegacyAdvance(res.data);
}

export async function settleAdvancesForEmployee(employeeId: string): Promise<{ settledCount: number }> {
  const res = await apiClient.post<{ data: { settledCount: number } }>(`/advances/settle/${employeeId}`, {});
  return res.data;
}
