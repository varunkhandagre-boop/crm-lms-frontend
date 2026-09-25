// 🔥 Phase 7: Attendance API adapter (Postgres) — replaces Firestore "attendance" collection.
// toLegacyAttendance() maps the new API shape back to the old Firestore-doc shape
// (date/inTime/outTime/workHrs/expenses/location/...) so existing screen logic
// (attendance.tsx, dayin.tsx, employee_timeline.tsx) keeps working unchanged.
//
// NOTE: apiClient (services/api/client.ts) is fetch-based, not axios — it
// already prepends /api/v1 to every path, and every method returns the
// parsed JSON body directly (not wrapped in a .data envelope). GET has no
// built-in query-string support, so list/summary calls build ?a=b&c=d by hand.
import { apiClient } from "./client";

export interface LegacyAttendance {
  id: string;
  date: string;        // YYYY-MM-DD
  dateIso: string;
  inTime: string;       // "09:05 AM"
  outTime: string;      // "06:10 PM" or "--"
  workHrs: string;      // "HH:MM:SS"
  status: string;
  workLocationType: string | null; // "Office" | "Field" | null
  expenses: { da: string; hotel: string; misc: string; totalAmount: string; note: string };
  location: { address: string; latitude?: number; longitude?: number } | null;
  outLocation: { latitude?: number; longitude?: number } | null;
  outAddress: string;
  userName: string;
  senderName: string;
  senderId: string;
  userId: string;
  role: string;
  createdAt: string;
}

interface ListResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse<T> {
  data: T;
  meta?: { alreadyExists?: boolean; alreadyDone?: boolean };
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function fmtTime(iso: string | null) {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtWorkHrs(checkInAt: string, checkOutAt: string | null) {
  if (!checkOutAt) return "";
  const ms = new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function toLegacyAttendance(a: any): LegacyAttendance {
  const dateStr = (a.date || "").slice(0, 10);
  return {
    id: a.id,
    date: dateStr,
    dateIso: dateStr,
    inTime: fmtTime(a.checkInAt),
    outTime: a.checkOutAt ? fmtTime(a.checkOutAt) : "--",
    workHrs: fmtWorkHrs(a.checkInAt, a.checkOutAt),
    status: a.checkOutAt ? (a.status || "Present") : "In",
    workLocationType: a.workLocationType ?? null,
    expenses: {
      da: String(a.expenseDa ?? "0"),
      hotel: String(a.expenseHotel ?? "0"),
      misc: String(a.expenseMisc ?? "0"),
      totalAmount: String(a.expenseTotal ?? "0"),
      note: a.expenseNote ?? "",
    },
    location: a.checkInLocation || a.checkInAddress
      ? {
          address: a.checkInAddress ?? a.checkInLocation?.address ?? "Unknown Location",
          latitude: a.checkInLocation?.latitude,
          longitude: a.checkInLocation?.longitude,
        }
      : null,
    outLocation: a.checkOutLocation
      ? { latitude: a.checkOutLocation?.latitude, longitude: a.checkOutLocation?.longitude }
      : null,
    outAddress: a.checkOutAddress ?? "",
    userName: a.user?.name ?? "",
    senderName: a.user?.name ?? "",
    senderId: a.userId,
    userId: a.userId,
    role: a.roleSnapshot ?? "",
    createdAt: a.checkInAt,
  };
}

export async function fetchAttendance(opts: {
  userId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<LegacyAttendance[]> {
  if (opts.limit !== undefined) {
    const qs = buildQuery({ userId: opts.userId, fromDate: opts.fromDate, toDate: opts.toDate, limit: opts.limit });
    const res = await apiClient.get<ListResponse<any>>(`/attendance${qs}`);
    return (res.data ?? []).map(toLegacyAttendance);
  }
  const all: any[] = [];
  let page = 1;
  const MAX_PAGES = 100;
  while (page <= MAX_PAGES) {
    const qs = buildQuery({ userId: opts.userId, fromDate: opts.fromDate, toDate: opts.toDate, limit: 200, page });
    const res = await apiClient.get<ListResponse<any>>(`/attendance${qs}`);
    all.push(...(res.data ?? []));
    if (page >= res.meta.totalPages) break;
    page++;
  }
  return all.map(toLegacyAttendance);
}

export async function fetchAttendanceSummary(opts: { userId?: string; fromDate: string; toDate: string }) {
  const qs = buildQuery({ userId: opts.userId, fromDate: opts.fromDate, toDate: opts.toDate });
  const res = await apiClient.get<OneResponse<any>>(`/attendance/summary${qs}`);
  return res.data;
}

export async function fetchTodayAttendance(): Promise<LegacyAttendance | null> {
  const res = await apiClient.get<OneResponse<any>>(`/attendance/today`);
  return res.data ? toLegacyAttendance(res.data) : null;
}

export async function dayIn(payload: {
  date: string; // YYYY-MM-DD
  checkInAt: string; // ISO
  checkInLocation?: { latitude: number; longitude: number };
  checkInAddress?: string;
  note?: string;
}) {
  const res = await apiClient.post<OneResponse<any>>(`/attendance`, payload);
  return { success: true, id: res.data?.id, record: toLegacyAttendance(res.data), alreadyExists: !!res.meta?.alreadyExists };
}

export async function dayOut(
  attendanceId: string,
  payload: {
    checkOutAt: string; // ISO
    checkOutLocation?: { latitude: number; longitude: number };
    checkOutAddress?: string;
    expenseDa: number;
    expenseHotel: number;
    expenseMisc: number;
    expenseNote?: string;
  }
) {
  const res = await apiClient.patch<OneResponse<any>>(`/attendance/${attendanceId}`, payload);
  return { success: true, record: toLegacyAttendance(res.data) };
}
