// 🔥 Phase 9: Notifications API adapter (Postgres) — replaces Firestore
// "notifications" collection for in-app notifications. Push (Expo/FCM) is
// untouched — see utils/notificationHelper.ts. The outbound WhatsApp/Email
// queue ("outbound_messages" Cloud Function) is a separate, later piece.
import { apiClient } from "./client";

export interface LegacyNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'alert' | 'info';
  route: string;
  screen: string; // alias some screens read
  read: boolean;
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

function toLegacyNotification(n: any): LegacyNotification {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: (n.type || 'INFO').toLowerCase(),
    route: n.route ?? '',
    screen: n.route ?? '',
    read: !!n.read,
    createdAt: n.createdAt,
  };
}

export async function fetchNotifications(opts: {
  filter?: 'all' | 'unread' | 'read';
  search?: string;
  limit?: number;
} = {}): Promise<LegacyNotification[]> {
  const qs = buildQuery({ filter: opts.filter ?? 'all', search: opts.search, limit: opts.limit ?? 200 });
  const res = await apiClient.get<ListResponse<any>>(`/notifications${qs}`);
  return (res.data ?? []).map(toLegacyNotification);
}

// Fires a notification at one specific colleague (recipientId) or every user
// with a given role (recipientRole, e.g. "ADMIN") — pass exactly one.
export async function createNotification(payload: {
  recipientId?: string;
  recipientRole?: string; // UserRole enum value, e.g. "ADMIN" | "MANAGER" | "HR" | ...
  title: string;
  message: string;
  type?: 'success' | 'warning' | 'alert' | 'info';
  route?: string;
}) {
  const res = await apiClient.post<OneResponse<any>>(`/notifications`, {
    recipientId: payload.recipientId,
    recipientRole: payload.recipientRole,
    title: payload.title,
    message: payload.message,
    type: (payload.type ?? 'info').toUpperCase(),
    route: payload.route,
  });
  return { success: true, id: res.data?.id, record: toLegacyNotification(res.data) };
}

export async function markNotificationRead(id: string) {
  const res = await apiClient.patch<OneResponse<any>>(`/notifications/${id}/read`, {});
  return { success: true, record: toLegacyNotification(res.data) };
}

export async function markAllNotificationsRead() {
  const res = await apiClient.patch<OneResponse<{ updatedCount: number }>>(`/notifications/read-all`, {});
  return { success: true, updatedCount: res.data.updatedCount };
}
