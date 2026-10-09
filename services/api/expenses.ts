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
  kind?: 'CLAIM' | 'REQUEST';
  requestId?: string | null;
  request?: { id: string; amount: string | number; type: string } | null;
  createdBy?: { name: string } | null;
}

export function toLegacyExpense(e: ApiExpense): any {
  const dateOnly = e.date ? e.date.split('T')[0] : undefined;
  return {
    id: e.id,
    companyId: e.companyId,
    date: dateOnly,
    dateIso: dateOnly,
    type: e.type,
    amount: Number(e.amount) || 0,
    remark: e.remark || '',
    // Old claims may hold a phone-local path — only real uploads are shown.
    imageUri: e.imageUri && /^https?:\/\//i.test(e.imageUri) ? e.imageUri : null,
    status: e.status,
    settlementDate: e.settlementDate,
    senderId: e.createdById,
    senderName: e.createdBy?.name,
    createdAt: e.createdAt,
    rowKind: e.kind === 'REQUEST' ? 'request' : 'claim',
    requestId: e.requestId ?? null,
    requestAmount: e.request ? Number(e.request.amount) || 0 : null,
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

export async function createExpense(payload: {
  type: string; amount: number; remark?: string; imageUri?: string; date?: string;
  kind?: 'CLAIM' | 'REQUEST'; // REQUEST = ask approval before buying
  requestId?: string; // claim against my approved request
}): Promise<any> {
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

// Bill photo as a base64 data URI; replaces any earlier one.
export async function uploadExpenseBillPhoto(id: string, dataUri: string): Promise<any> {
  const res = await apiClient.put<{ data: ApiExpense }>(`/expenses/${id}/bill-photo`, { dataUri });
  return toLegacyExpense(res.data);
}

// Also deletes the file from storage.
export async function deleteExpenseBillPhoto(id: string): Promise<any> {
  const res = await apiClient.delete<{ data: ApiExpense }>(`/expenses/${id}/bill-photo`);
  return toLegacyExpense(res.data);
}

export interface ClaimPageFilters {
  createdById?: string;
  search?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
}

/** One server page (newest first) + the screen's two totals for the whole filter (page 1 only). */
export async function listExpensesPage(
  params: ClaimPageFilters & { page: number; limit: number },
): Promise<{ items: any[]; total: number; totalPages: number; outstanding: number; totalAmount: number }> {
  const res = await apiClient.get<{
    data: ApiExpense[];
    meta: { total: number; totalPages: number };
    totals?: { outstanding: number; total: number };
  }>(`/expenses${toQueryString({ ...params, newestFirst: 'true', withTotals: params.page === 1 ? 'true' : undefined })}`);
  return {
    items: res.data.map(toLegacyExpense),
    total: res.meta.total,
    totalPages: res.meta.totalPages,
    outstanding: res.totals?.outstanding ?? 0,
    totalAmount: res.totals?.total ?? 0,
  };
}

/** One record by id — for opening it from a notification when it isn't on the loaded page. */
export async function getExpense(id: string): Promise<any> {
  const res = await apiClient.get<{ data: ApiExpense }>(`/expenses/${id}`);
  return toLegacyExpense(res.data);
}

// ── Expense screen feed: claims + Day Out expenses, or approval requests ──

export type ExpenseView = 'all' | 'claims' | 'daily' | 'requests';
export interface ExpenseFeedFilters extends ClaimPageFilters {
  view: ExpenseView;
  openOnly?: boolean; // requests: only approved ones without a claim yet
}
export interface ExpenseFeedTotals {
  outstanding: number; claims: number; daily: number; total: number;
  pendingRequests: number; openRequests: number;
}

// Day Out expense (attendance row) shown in the same list; paid with salary.
function toDailyRow(d: any): any {
  const date = (d.date || '').slice(0, 10);
  return {
    id: `daily-${d.id}`,
    rowKind: 'daily',
    date,
    dateIso: date,
    type: 'Day Out Expense',
    amount: Number(d.expenseTotal) || 0,
    da: Number(d.expenseDa) || 0,
    hotel: Number(d.expenseHotel) || 0,
    misc: Number(d.expenseMisc) || 0,
    remark: d.expenseNote || '',
    status: 'With Salary',
    imageUri: null,
    senderId: d.userId,
    senderName: d.user?.name,
  };
}

const NO_TOTALS: ExpenseFeedTotals = { outstanding: 0, claims: 0, daily: 0, total: 0, pendingRequests: 0, openRequests: 0 };

export async function listExpenseFeedPage(
  params: ExpenseFeedFilters & { page: number; limit: number },
): Promise<{ items: any[]; total: number; totalPages: number; totals: ExpenseFeedTotals }> {
  const res = await apiClient.get<{
    data: Array<{ kind: 'claim' | 'request' | 'daily'; expense?: ApiExpense; daily?: any }>;
    meta: { total: number; totalPages: number };
    totals?: ExpenseFeedTotals;
  }>(`/expenses/feed${toQueryString({ ...params, openOnly: params.openOnly ? 'true' : undefined })}`);
  return {
    items: res.data.map((r) => (r.kind === 'daily' ? toDailyRow(r.daily) : toLegacyExpense(r.expense as ApiExpense))),
    total: res.meta.total,
    totalPages: res.meta.totalPages,
    totals: res.totals ?? NO_TOTALS,
  };
}

/** My approved purchase requests that have no bill / claim yet. */
export async function listOpenRequests(): Promise<any[]> {
  const r = await listExpenseFeedPage({ view: 'requests', openOnly: true, page: 1, limit: 20 });
  return r.items;
}

export async function getExpenseSettings(): Promise<{ approvalLimit: number | null }> {
  const res = await apiClient.get<{ data: { approvalLimit: number | null } }>('/expenses/settings');
  return res.data;
}

export async function saveExpenseSettings(approvalLimit: number | null): Promise<{ approvalLimit: number | null }> {
  const res = await apiClient.put<{ data: { approvalLimit: number | null } }>('/expenses/settings', { approvalLimit });
  return res.data;
}
