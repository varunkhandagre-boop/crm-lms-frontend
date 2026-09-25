// 🔥 Phase 8: Couriers API adapter (Postgres) — replaces Firestore "couriers" collection.
// See services/api/attendance.ts (Phase 7) for notes on the fetch-based apiClient
// (no /api/v1 prefix, no .data envelope, no built-in query-string support).
import { apiClient } from "./client";

export interface LegacyCourierItem { description: string; qty: string; }

export interface LegacyCourier {
  id: string;
  date: string;       // DD/MM/YYYY
  dateIso: string;     // YYYY-MM-DD
  courierDate: string; // DD/MM/YYYY
  type: "Inward" | "Outward";
  docketNo: string;
  courierName: string;
  orgId: string;
  sender: string;
  receiver: string;
  toCity: string;
  items: LegacyCourierItem[];
  material: string;
  qty: string;
  dcNo: string;
  status: "Pending" | "Received" | "Delivered";
  notes: string;
  note: string; // alias some screens read
  senderId: string;
  senderName: string;
  createdAt: string;
}

interface ListResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number }; }
interface OneResponse<T> { data: T; }

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function toDDMMYYYY(iso: string) {
  const [y, m, d] = (iso || "").slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export function toLegacyCourier(c: any): LegacyCourier {
  const dateIso = (c.date || "").slice(0, 10);
  return {
    id: c.id,
    date: toDDMMYYYY(dateIso),
    dateIso,
    courierDate: toDDMMYYYY((c.courierDate || "").slice(0, 10)),
    type: c.type,
    docketNo: c.docketNo,
    courierName: c.courierName,
    orgId: c.orgId ?? "",
    sender: c.sender,
    receiver: c.receiver,
    toCity: c.toCity ?? "",
    items: c.items ?? [],
    material: c.material ?? "",
    qty: String((c.items ?? []).length),
    dcNo: c.dcNo ?? "",
    status: c.status,
    notes: c.notes ?? "",
    note: c.notes ?? "",
    senderId: c.createdById,
    senderName: c.createdBy?.name ?? "",
    createdAt: c.createdAt,
  };
}

export async function fetchCouriers(opts: {
  type?: "Inward" | "Outward";
  status?: "Pending" | "Received" | "Delivered";
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
} = {}): Promise<LegacyCourier[]> {
  if (opts.limit !== undefined) {
    const qs = buildQuery({ type: opts.type, status: opts.status, fromDate: opts.fromDate, toDate: opts.toDate, search: opts.search, limit: opts.limit });
    const res = await apiClient.get<ListResponse<any>>(`/couriers${qs}`);
    return (res.data ?? []).map(toLegacyCourier);
  }
  const all: any[] = [];
  let page = 1;
  const MAX_PAGES = 100;
  while (page <= MAX_PAGES) {
    const qs = buildQuery({ type: opts.type, status: opts.status, fromDate: opts.fromDate, toDate: opts.toDate, search: opts.search, limit: 200, page });
    const res = await apiClient.get<ListResponse<any>>(`/couriers${qs}`);
    all.push(...(res.data ?? []));
    if (page >= res.meta.totalPages) break;
    page++;
  }
  return all.map(toLegacyCourier);
}

export async function createCourier(payload: {
  type: "Inward" | "Outward";
  docketNo: string;
  courierName: string;
  date: string; // YYYY-MM-DD
  courierDate: string; // YYYY-MM-DD
  orgId?: string;
  sender: string;
  receiver: string;
  toCity?: string;
  items: LegacyCourierItem[];
  notes?: string;
  dcPrefix?: string; // company short name, e.g. "LMS" — server appends -DC-FY-seq
}) {
  const res = await apiClient.post<OneResponse<any>>(`/couriers`, payload);
  return { success: true, id: res.data?.id, record: toLegacyCourier(res.data) };
}

export async function updateCourier(id: string, payload: Partial<{
  orgId: string; docketNo: string; courierName: string; date: string; type: "Inward" | "Outward";
  sender: string; receiver: string; material: string; status: "Pending" | "Received" | "Delivered"; notes: string;
}>) {
  const res = await apiClient.patch<OneResponse<any>>(`/couriers/${id}`, payload);
  return { success: true, record: toLegacyCourier(res.data) };
}

export async function updateCourierStatus(id: string, status: "Pending" | "Received" | "Delivered", notes?: string) {
  const res = await apiClient.patch<OneResponse<any>>(`/couriers/${id}/status`, { status, notes });
  return { success: true, record: toLegacyCourier(res.data) };
}

export async function deleteCourier(id: string) {
  await apiClient.delete(`/couriers/${id}`);
  return { success: true };
}
