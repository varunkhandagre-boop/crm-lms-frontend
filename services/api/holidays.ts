// 🔥 Phase 7: Holidays API adapter (Postgres) — replaces Firestore "holidays" collection.
// See attendance.ts for notes on the fetch-based apiClient (no /api/v1 prefix,
// no .data envelope, no built-in query-string support).
import { apiClient } from "./client";

export interface LegacyHoliday {
  id: string;
  date: string;     // YYYY-MM-DD
  dateIso: string;  // YYYY-MM-DD (kept for old code that reads h.dateIso)
  name: string;
}

interface ListResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse<T> {
  data: T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function toLegacyHoliday(h: any): LegacyHoliday {
  const dateStr = (h.date || "").slice(0, 10);
  return { id: h.id, date: dateStr, dateIso: dateStr, name: h.name };
}

export async function fetchHolidays(fromDate?: string, toDate?: string): Promise<LegacyHoliday[]> {
  const qs = buildQuery({ limit: 200, fromDate, toDate });
  const res = await apiClient.get<ListResponse<any>>(`/holidays${qs}`);
  return (res.data ?? []).map(toLegacyHoliday);
}

export async function addHoliday(name: string, date: string) {
  const res = await apiClient.post<OneResponse<any>>(`/holidays`, { name, date });
  return { success: true, id: res.data?.id, record: toLegacyHoliday(res.data) };
}

export async function deleteHoliday(id: string) {
  await apiClient.delete(`/holidays/${id}`);
  return { success: true };
}

export interface BulkHolidayRow {
  name: string;
  date: string;
}

export interface BulkHolidayPreviewItem {
  row: BulkHolidayRow;
  status: 'new' | 'existing';
}

export async function previewBulkHolidayImport(rows: BulkHolidayRow[]): Promise<BulkHolidayPreviewItem[]> {
  const res = await apiClient.post<{ data: BulkHolidayPreviewItem[] }>('/holidays/bulk-import/preview', { rows });
  return res.data;
}

export async function commitBulkHolidayImport(rows: BulkHolidayRow[]): Promise<{ created: number; skipped: number }> {
  const res = await apiClient.post<{ data: { created: number; skipped: number } }>('/holidays/bulk-import/commit', { rows });
  return res.data;
}
