// 🔥 Phase 8: Visiting-card / stationery-request API adapter (Postgres) —
// replaces Firestore "visiting_cards" collection.
import { apiClient } from "./client";

export interface LegacyVisitingCardItem { type: string; quantity: string; }

export interface LegacyVisitingCard {
  id: string;
  reqId: string;
  date: string;    // YYYY-MM-DD
  dateIso: string;  // YYYY-MM-DD
  shippingAddress: string;
  items: LegacyVisitingCardItem[];
  status: "Pending" | "Sent" | "Received";
  trackingNo: string;
  outDate: string;
  userName: string;
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

export function toLegacyVisitingCard(v: any): LegacyVisitingCard {
  const dateIso = (v.date || "").slice(0, 10);
  return {
    id: v.id,
    reqId: v.reqId,
    date: dateIso,
    dateIso,
    shippingAddress: v.shippingAddress,
    items: v.items ?? [],
    status: v.status,
    trackingNo: v.trackingNo ?? "",
    outDate: (v.outDate || "").slice(0, 10),
    userName: v.createdBy?.name ?? "",
    senderId: v.createdById,
    createdAt: v.createdAt,
  };
}

export async function fetchVisitingCards(opts: {
  userId?: string; // omit = self; 'all' = every employee (office roles only)
  status?: "Pending" | "Sent" | "Received";
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
} = {}): Promise<LegacyVisitingCard[]> {
  const qs = buildQuery({
    userId: opts.userId,
    status: opts.status,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    search: opts.search,
    limit: opts.limit ?? 500,
  });
  const res = await apiClient.get<ListResponse<any>>(`/visiting-cards${qs}`);
  return (res.data ?? []).map(toLegacyVisitingCard);
}

export async function createVisitingCardRequest(payload: { shippingAddress: string; items: LegacyVisitingCardItem[] }) {
  const res = await apiClient.post<OneResponse<any>>(`/visiting-cards`, payload);
  return { success: true, id: res.data?.id, record: toLegacyVisitingCard(res.data) };
}

export async function dispatchVisitingCardRequest(id: string, trackingNo: string) {
  const res = await apiClient.patch<OneResponse<any>>(`/visiting-cards/${id}/dispatch`, { trackingNo });
  return { success: true, record: toLegacyVisitingCard(res.data) };
}

export async function receiveVisitingCardRequest(id: string) {
  const res = await apiClient.patch<OneResponse<any>>(`/visiting-cards/${id}/receive`, {});
  return { success: true, record: toLegacyVisitingCard(res.data) };
}
