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

export function toLegacyAdvance(a: ApiAdvance): any {
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

const ADVANCES_PAGE_SIZE = 200;

export async function listAdvances(params: { status?: string } = {}): Promise<any[]> {
  const all: ApiAdvance[] = [];
  let page = 1;
  const MAX_PAGES = 100;
  while (page <= MAX_PAGES) {
    const res = await apiClient.get<{ data: ApiAdvance[]; meta: { totalPages: number } }>(
      `/advances${toQueryString({ limit: ADVANCES_PAGE_SIZE, page, ...params })}`,
    );
    all.push(...res.data);
    if (page >= res.meta.totalPages) break;
    page++;
  }
  return all.map(toLegacyAdvance);
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

export interface ClaimPageFilters {
  createdById?: string;
  search?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
}

/** One server page (newest first) + the screen's two totals for the whole filter (page 1 only). */
export async function listAdvancesPage(
  params: ClaimPageFilters & { page: number; limit: number },
): Promise<{ items: any[]; total: number; totalPages: number; outstanding: number; totalAmount: number }> {
  const res = await apiClient.get<{
    data: ApiAdvance[];
    meta: { total: number; totalPages: number };
    totals?: { outstanding: number; total: number };
  }>(`/advances${toQueryString({ ...params, newestFirst: 'true', withTotals: params.page === 1 ? 'true' : undefined })}`);
  return {
    items: res.data.map(toLegacyAdvance),
    total: res.meta.total,
    totalPages: res.meta.totalPages,
    outstanding: res.totals?.outstanding ?? 0,
    totalAmount: res.totals?.total ?? 0,
  };
}

/** One record by id — for opening it from a notification when it isn't on the loaded page. */
export async function getAdvance(id: string): Promise<any> {
  const res = await apiClient.get<{ data: ApiAdvance }>(`/advances/${id}`);
  return toLegacyAdvance(res.data);
}
