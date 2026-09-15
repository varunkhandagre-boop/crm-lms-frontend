// 🔥 Phase 8: Travel-note API adapter (Postgres) — replaces Firestore "travel_notes" collection.
import { apiClient } from "./client";

export interface LegacyTravelNote {
  id: string;
  date: string;    // DD/MM/YYYY
  dateIso: string;  // YYYY-MM-DD
  from: string;
  to: string;
  mode: string;
  distance: string;
  amount: string;
  purpose: string;
  status: "Pending" | "Approved" | "Settled" | "Rejected";
  settlementDate: string;
  senderName: string;
  senderId: string;
  createdAt: string;
}

interface ListResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number }; }
interface OneResponse<T> { data: T; }

function buildQuery(params: Record<string, string | number | undefined>): string {
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

export function toLegacyTravelNote(t: any): LegacyTravelNote {
  const dateIso = (t.date || "").slice(0, 10);
  return {
    id: t.id,
    date: toDDMMYYYY(dateIso),
    dateIso,
    from: t.fromLocation,
    to: t.toLocation,
    mode: t.mode,
    distance: String(t.distanceKm),
    amount: String(t.amount),
    purpose: t.purpose ?? "",
    status: t.status,
    settlementDate: t.settlementDate ?? "",
    senderName: t.createdBy?.name ?? "",
    senderId: t.createdById,
    createdAt: t.createdAt,
  };
}

export async function fetchTravelNotes(opts: {
  userId?: string; // omit = self; 'all' = every employee (office roles only)
  status?: "Pending" | "Approved" | "Settled" | "Rejected";
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
} = {}): Promise<LegacyTravelNote[]> {
  const qs = buildQuery({
    userId: opts.userId,
    status: opts.status,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    search: opts.search,
    limit: opts.limit ?? 500,
  });
  const res = await apiClient.get<ListResponse<any>>(`/travel-notes${qs}`);
  return (res.data ?? []).map(toLegacyTravelNote);
}

export async function createTravelNote(payload: {
  date: string; // YYYY-MM-DD
  fromLocation: string;
  toLocation: string;
  mode: string;
  distanceKm: number;
  amount: number;
  purpose?: string;
}) {
  const res = await apiClient.post<OneResponse<any>>(`/travel-notes`, payload);
  return { success: true, id: res.data?.id, record: toLegacyTravelNote(res.data) };
}

export async function settleTravelNotesForUser(userId: string) {
  const res = await apiClient.patch<OneResponse<{ settledCount: number }>>(`/travel-notes/settle`, { userId });
  return { success: true, settledCount: res.data.settledCount };
}
