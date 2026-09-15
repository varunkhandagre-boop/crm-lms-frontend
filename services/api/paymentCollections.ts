import { apiClient } from './client';

export interface ApiPaymentCollection {
  id: string;
  companyId: string;
  date: string;
  receiptNo: string;
  orgId: string | null;
  orgName: string;
  orgAddress: string | null;
  linkedOrderId: string | null;
  linkedDueId: string | null;
  billRef: string | null;
  totalDueSnapshot: string | number;
  amount: string | number;
  remainingBalance: string | number;
  mode: string;
  bankName: string | null;
  refNumber: string | null;
  pdcDate: string | null;
  notes: string | null;
  status: string;
  chequeStatus: string | null;
  clearedDate: string | null;
  bouncedDate: string | null;
  createdById: string;
  createdAt: string;
}

function toLegacyPayment(p: ApiPaymentCollection): any {
  const dateOnly = p.date ? p.date.split('T')[0] : undefined;
  return {
    id: p.id,
    companyId: p.companyId,
    date: dateOnly,
    dateIso: dateOnly,
    receiptNo: p.receiptNo,
    orgId: p.orgId || '',
    orgName: p.orgName,
    address: p.orgAddress || '',
    linkedOrderId: p.linkedOrderId || undefined,
    linkedDueId: p.linkedDueId || undefined,
    billRef: p.billRef || '',
    totalDue: Number(p.totalDueSnapshot) || 0,
    amount: Number(p.amount) || 0,
    balance: Number(p.remainingBalance) || 0,
    mode: p.mode,
    bankName: p.bankName || '',
    refNumber: p.refNumber || '',
    pdcDate: p.pdcDate || '',
    note: p.notes || '',
    status: p.status,
    chequeStatus: p.chequeStatus || 'Pending',
    clearedDate: p.clearedDate,
    bouncedDate: p.bouncedDate,
    addedBy: undefined,
    userName: undefined,
    senderId: p.createdById,
    createdAt: p.createdAt,
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

export async function listPaymentCollections(params: { search?: string } = {}): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiPaymentCollection[] }>(`/payment-collections${toQueryString({ limit: 100, ...params })}`);
  return res.data.map(toLegacyPayment);
}

export interface CreatePaymentCollectionPayload {
  date?: string;
  orgId?: string;
  orgName: string;
  orgAddress?: string;
  linkedOrderId?: string;
  linkedDueId?: string;
  billRef?: string;
  totalDueSnapshot?: number;
  amount: number;
  mode?: 'Cash' | 'Cheque' | 'NEFT' | 'UPI' | 'RTGS';
  bankName?: string;
  refNumber?: string;
  pdcDate?: string;
  notes?: string;
}

export async function createPaymentCollection(payload: CreatePaymentCollectionPayload): Promise<any> {
  const res = await apiClient.post<{ data: ApiPaymentCollection }>('/payment-collections', payload);
  return toLegacyPayment(res.data);
}

export async function updatePaymentCollection(id: string, payload: { amount?: number; notes?: string; mode?: string; refNumber?: string }): Promise<any> {
  const res = await apiClient.patch<{ data: ApiPaymentCollection }>(`/payment-collections/${id}`, payload);
  return toLegacyPayment(res.data);
}

export async function markChequeCleared(id: string): Promise<any> {
  const res = await apiClient.post<{ data: ApiPaymentCollection }>(`/payment-collections/${id}/mark-cleared`);
  return toLegacyPayment(res.data);
}

export async function markChequeBounced(id: string): Promise<any> {
  const res = await apiClient.post<{ data: ApiPaymentCollection }>(`/payment-collections/${id}/mark-bounced`);
  return toLegacyPayment(res.data);
}

export async function deletePaymentCollection(id: string): Promise<void> {
  await apiClient.delete(`/payment-collections/${id}`);
}
