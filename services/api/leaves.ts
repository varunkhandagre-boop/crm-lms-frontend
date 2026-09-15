// 🔥 Phase 7: Leaves API adapter (Postgres) — replaces Firestore "leaves" collection.
// See attendance.ts for notes on the fetch-based apiClient (no /api/v1 prefix,
// no .data envelope, no built-in query-string support).
import { apiClient } from "./client";

export interface LegacyLeave {
  id: string;
  fromDate: string;    // DD/MM/YYYY
  toDate: string;
  fromDateIso: string; // YYYY-MM-DD
  toDateIso: string;
  days: string;
  type: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  senderName: string;
  senderId: string;
  role: string;
  createdAt: string;
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

function toDDMMYYYY(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function toLegacyStatus(status: string): LegacyLeave["status"] {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Pending";
}

export function toLegacyLeave(l: any): LegacyLeave {
  const fromIso = (l.fromDate || "").slice(0, 10);
  const toIso = (l.toDate || "").slice(0, 10);
  return {
    id: l.id,
    fromDate: toDDMMYYYY(fromIso),
    toDate: toDDMMYYYY(toIso),
    fromDateIso: fromIso,
    toDateIso: toIso,
    days: String(l.days),
    type: l.type,
    reason: l.reason,
    status: toLegacyStatus(l.status),
    senderName: l.user?.name ?? "",
    senderId: l.userId,
    role: l.roleSnapshot ?? "",
    createdAt: l.createdAt,
  };
}

export async function fetchLeaves(opts: {
  userId?: string; // omit = self; 'all' = every employee (managers only)
  status?: "Pending" | "Approved" | "Rejected";
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
} = {}): Promise<LegacyLeave[]> {
  const statusMap: Record<string, string> = { Pending: "PENDING", Approved: "APPROVED", Rejected: "REJECTED" };
  const qs = buildQuery({
    userId: opts.userId,
    status: opts.status ? statusMap[opts.status] : undefined,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    search: opts.search,
    limit: opts.limit ?? 200,
  });
  const res = await apiClient.get<ListResponse<any>>(`/leaves${qs}`);
  return (res.data ?? []).map(toLegacyLeave);
}

export async function fetchLeaveSummary(opts: { userId?: string; fyStartYear?: number } = {}) {
  const qs = buildQuery({ userId: opts.userId, fyStartYear: opts.fyStartYear });
  const res = await apiClient.get<OneResponse<any>>(`/leaves/summary${qs}`);
  return res.data as {
    fyLabel: string;
    baseQuota: number;
    earned: number;
    totalQuota: number;
    used: number;
    absents: number;
    shortDays: number;
    balance: number;
    lwp: number;
  };
}

export async function applyLeave(payload: { fromDate: string; toDate: string; type: string; reason: string }) {
  const res = await apiClient.post<OneResponse<any>>(`/leaves`, payload);
  return { success: true, id: res.data?.id, record: toLegacyLeave(res.data) };
}

export async function updateLeaveStatus(leaveId: string, status: "Approved" | "Rejected") {
  const res = await apiClient.patch<OneResponse<any>>(`/leaves/${leaveId}/status`, {
    status: status === "Approved" ? "APPROVED" : "REJECTED",
  });
  return { success: true, record: toLegacyLeave(res.data) };
}
