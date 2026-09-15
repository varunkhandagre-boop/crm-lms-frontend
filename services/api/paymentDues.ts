import { apiClient } from './client';

export interface ApiPaymentDue {
  id: string;
  companyId: string;
  orgId: string | null;
  orgName: string;
  billNo: string;
  billDate: string;
  amount: string | number;
  balance: string | number;
  dueDate: string;
  notes: string | null;
  status: string;
  paymentStatus: string;
  displayId: string;
  reminderHistory: { date: string; sentBy: string }[] | null;
  lastReminderDate: string | null;
  createdById: string;
  createdAt: string;
}

function toLegacyDue(d: ApiPaymentDue): any {
  return {
    id: d.id,
    companyId: d.companyId,
    orgId: d.orgId || '',
    orgName: d.orgName,
    billNo: d.billNo,
    billDate: d.billDate,
    amount: Number(d.amount) || 0,
    balance: Number(d.balance) || 0,
    dueDate: d.dueDate,
    notes: d.notes || '',
    status: d.status,
    paymentStatus: d.paymentStatus,
    orderId: d.displayId,
    type: 'Manual',
    reminderHistory: d.reminderHistory || [],
    lastReminderDate: d.lastReminderDate || '',
    addedBy: undefined,
    createdAt: d.createdAt,
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

export async function listPaymentDues(params: { status?: string; search?: string } = {}): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiPaymentDue[] }>(`/payment-dues${toQueryString({ limit: 100, ...params })}`);
  return res.data.map(toLegacyDue);
}

export interface CreatePaymentDuePayload {
  orgId?: string;
  orgName: string;
  billNo: string;
  billDate: string;
  amount: number;
  dueDate: string;
  notes?: string;
}

export async function createPaymentDue(payload: CreatePaymentDuePayload): Promise<any> {
  const res = await apiClient.post<{ data: ApiPaymentDue }>('/payment-dues', payload);
  return toLegacyDue(res.data);
}

export async function remindPaymentDue(id: string): Promise<any> {
  const res = await apiClient.post<{ data: ApiPaymentDue }>(`/payment-dues/${id}/remind`, {});
  return toLegacyDue(res.data);
}
