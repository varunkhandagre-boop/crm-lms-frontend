import { apiClient } from './client';
import { ApiOrder, toLegacyOrder } from './orders';
import { ApiPaymentCollection, toLegacyPayment } from './paymentCollections';

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

export function toLegacyDue(d: ApiPaymentDue): any {
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

const PAYMENT_DUES_PAGE_SIZE = 200;

export async function listPaymentDues(params: { status?: string; search?: string } = {}): Promise<any[]> {
  const all: ApiPaymentDue[] = [];
  let page = 1;
  const MAX_PAGES = 100;
  while (page <= MAX_PAGES) {
    const res = await apiClient.get<{ data: ApiPaymentDue[]; meta: { totalPages: number } }>(
      `/payment-dues${toQueryString({ limit: PAYMENT_DUES_PAGE_SIZE, page, ...params })}`,
    );
    all.push(...res.data);
    if (page >= res.meta.totalPages) break;
    page++;
  }
  return all.map(toLegacyDue);
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

export interface OutstandingFilters {
  search?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
}

/**
 * Pending Dues screen: manual dues + unpaid billed orders, oldest first, merged and
 * filtered on the server. Each item keeps `collectionName` ('payment_dues' | 'orders')
 * like the old merged list.
 */
export async function listOutstandingPage(
  params: OutstandingFilters & { page: number; limit: number },
): Promise<{ items: any[]; total: number; totalPages: number; totalAmount: number }> {
  const res = await apiClient.get<{
    data: ({ kind: 'due'; due: ApiPaymentDue } | { kind: 'order'; order: ApiOrder })[];
    meta: { total: number; totalPages: number };
    totals: { count: number; amount: number };
  }>(`/payment-dues/outstanding${toQueryString(params)}`);
  return {
    items: res.data.map((x) =>
      x.kind === 'due'
        ? { ...toLegacyDue(x.due), collectionName: 'payment_dues' }
        : { ...toLegacyOrder(x.order), collectionName: 'orders' },
    ),
    total: res.meta.total,
    totalPages: res.meta.totalPages,
    totalAmount: res.totals.amount,
  };
}

/** Last 5 payments for one due / order (shown in its details). */
export async function fetchDueItemPayments(kind: 'due' | 'order', id: string, billRef?: string): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiPaymentCollection[] }>(`/payment-dues/payments${toQueryString({ kind, id, billRef })}`);
  return res.data.map(toLegacyPayment);
}
