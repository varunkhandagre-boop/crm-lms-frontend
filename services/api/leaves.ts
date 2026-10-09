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

export type LeaveFeedKind = 'leave' | 'absent' | 'short' | 'earned' | 'cancelled';
export interface LeaveFeedFilters {
  userId?: string; fromDate?: string; toDate?: string; search?: string;
  kind?: LeaveFeedKind;
  bucket?: 'CL' | 'SL' | 'EL' | 'COMP' | 'LWP' | 'PAID';
}

/**
 * One page of the Leave screen: leave requests plus system rows (Absent /
 * Half Day / Earned / Leave Cancelled), built on the server. Pending first.
 */
export async function listLeaveFeedPage(
  params: LeaveFeedFilters & { page: number; limit: number },
): Promise<{ items: any[]; total: number; totalPages: number; pending: number }> {
  const res = await apiClient.get<ListResponse<any> & { totals?: { pending: number } }>(`/leaves/feed${buildQuery({ ...params })}`);
  return {
    items: (res.data ?? []).map((x: any) => (x.isAutoRecord ? x : toLegacyLeave(x))),
    total: res.meta.total,
    totalPages: res.meta.totalPages,
    pending: res.totals?.pending ?? 0,
  };
}

/** One request by id — for opening it from a notification when it isn't on the loaded page. */
export async function getLeave(id: string): Promise<LegacyLeave> {
  const res = await apiClient.get<OneResponse<any>>(`/leaves/${id}`);
  return toLegacyLeave(res.data);
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
    // Leave Policy (CL/SL/EL) — present on newer servers
    policy?: LeavePolicyInfo;
    balances?: LeaveTypeBalance[]; // only when policy.enabled
  };
}

export async function applyLeave(payload: { fromDate: string; toDate: string; type: string; reason: string; halfDay?: boolean }) {
  const res = await apiClient.post<OneResponse<any>>(`/leaves`, payload);
  return { success: true, id: res.data?.id, record: toLegacyLeave(res.data) };
}

export async function updateLeaveStatus(leaveId: string, status: "Approved" | "Rejected") {
  const res = await apiClient.patch<OneResponse<any>>(`/leaves/${leaveId}/status`, {
    status: status === "Approved" ? "APPROVED" : "REJECTED",
  });
  return { success: true, record: toLegacyLeave(res.data) };
}

// ── Leave Policy ────────────────────────────────────────────────────────────
export interface LeavePolicyInfo { enabled: boolean; countOffDays: boolean; halfDayAllowed: boolean; otherTypesMode: 'cl' | 'paid' | 'lwp' }
export interface LeaveTypeBalance {
  type: 'CL' | 'SL' | 'EL' | 'COMP';
  label: string;
  opening: number;
  quota: number;
  used: number;
  balance: number;
  overdrawn: number;
}

// Which balance a leave type uses (same mapping as the server).
export function leaveBucket(type: string, otherTypesMode: LeavePolicyInfo['otherTypesMode']): 'CL' | 'SL' | 'EL' | 'COMP' | 'LWP' | 'PAID' {
  switch (type) {
    case 'Casual Leave': return 'CL';
    case 'Sick Leave': return 'SL';
    case 'Earned Leave': return 'EL';
    case 'Compensatory Off': return 'COMP';
    case 'Leave Without Pay': return 'LWP';
    default: return otherTypesMode === 'paid' ? 'PAID' : otherTypesMode === 'lwp' ? 'LWP' : 'CL';
  }
}

export interface EmployeeLeaveBalances { userId: string; name: string; empId: string | null; summary: Awaited<ReturnType<typeof fetchLeaveSummary>> }

export async function fetchAllLeaveBalances(fyStartYear: number): Promise<EmployeeLeaveBalances[]> {
  const res = await apiClient.get<OneResponse<EmployeeLeaveBalances[]>>(`/leaves/balances?fyStartYear=${fyStartYear}`);
  return res.data;
}

export async function saveOpeningBalance(payload: { userId: string; fyStartYear: number; type: 'CL' | 'SL' | 'EL'; days: number }) {
  const res = await apiClient.put<OneResponse<any>>('/leaves/opening-balances', payload);
  return res.data;
}

export interface CarryForwardResult {
  fromFyStartYear: number;
  toFyStartYear: number;
  fyEnded: boolean;
  types: string[];
  rows: { userId: string; name: string; items: { type: string; closing: number; carry: number; skipped: boolean }[] }[];
}

export async function previewCarryForward(fromFyStartYear: number): Promise<CarryForwardResult> {
  const res = await apiClient.get<OneResponse<CarryForwardResult>>(`/leaves/carry-forward/preview?fromFyStartYear=${fromFyStartYear}`);
  return res.data;
}

export async function commitCarryForward(fromFyStartYear: number): Promise<CarryForwardResult> {
  const res = await apiClient.post<OneResponse<CarryForwardResult>>('/leaves/carry-forward', { fromFyStartYear });
  return res.data;
}
