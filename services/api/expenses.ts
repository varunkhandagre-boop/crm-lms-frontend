import { apiClient } from './client';

export interface ApiExpense {
  id: string;
  companyId: string;
  date: string;
  type: string;
  amount: string | number;
  remark: string | null;
  imageUri: string | null;
  status: string;
  settlementDate: string | null;
  createdById: string;
  createdAt: string;
}

function toLegacyExpense(e: ApiExpense): any {
  const dateOnly = e.date ? e.date.split('T')[0] : undefined;
  return {
    id: e.id,
    companyId: e.companyId,
    date: dateOnly,
    dateIso: dateOnly,
    type: e.type,
    amount: Number(e.amount) || 0,
    remark: e.remark || '',
    imageUri: e.imageUri,
    status: e.status,
    settlementDate: e.settlementDate,
    senderId: e.createdById,
    senderName: undefined,
    createdAt: e.createdAt,
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

export async function listExpenses(params: { status?: string } = {}): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiExpense[] }>(`/expenses${toQueryString({limit: 1000,  ...params })}`);
  return res.data.map(toLegacyExpense);
}

export async function createExpense(payload: { type: string; amount: number; remark?: string; imageUri?: string; date?: string }): Promise<any> {
  const res = await apiClient.post<{ data: ApiExpense }>('/expenses', payload);
  return toLegacyExpense(res.data);
}

export async function updateExpenseStatus(id: string, status: 'Approved' | 'Rejected'): Promise<any> {
  const res = await apiClient.patch<{ data: ApiExpense }>(`/expenses/${id}/status`, { status });
  return toLegacyExpense(res.data);
}

export async function settleExpensesForEmployee(employeeId: string): Promise<{ settledCount: number }> {
  const res = await apiClient.post<{ data: { settledCount: number } }>(`/expenses/settle/${employeeId}`, {});
  return res.data;
}
