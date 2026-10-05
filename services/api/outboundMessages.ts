// 🔥 Outbound Messages API adapter (Postgres)
// Replaces Firestore "outbound_messages" (WhatsApp queue) and "mail"
// (Firebase Trigger-Email extension) collections.
//
// WhatsApp now sends automatically via Meta Cloud API server-side — no more
// manual "tap to open WhatsApp" step. Email has no send-service yet, so it
// stays queued until a staff member sends it manually (see the Pending
// Emails screen, which opens a mailto: link and then marks it sent).
import { apiClient } from './client';

export type MessageChannel = 'whatsapp' | 'email';
export type MessageStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface OutboundMessage {
    id: string;
    companyId: string;
    channel: MessageChannel;
    to: string;
    templateName: string;
    variables: Record<string, any>;
    status: MessageStatus;
    scheduledFor: string | null;
    sentAt: string | null;
    failureReason: string | null;
    retryCount: number;
    createdAt: string;
}

interface OneResponse<T> { data: T }
interface ListResponse<T> { data: T[] }

export async function fetchOutboundMessages(filters: { channel?: MessageChannel; status?: MessageStatus } = {}): Promise<OutboundMessage[]> {
    const params = new URLSearchParams();
    if (filters.channel) params.set('channel', filters.channel);
    if (filters.status) params.set('status', filters.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get<ListResponse<OutboundMessage>>(`/outbound-messages${qs}`);
    return res.data;
}

// One page of Sent History — channel/status/search filtered on the server.
export async function fetchOutboundMessagesPage(params: {
    channel?: MessageChannel; status?: MessageStatus; search?: string; page: number; limit: number;
}): Promise<{ items: OutboundMessage[]; total: number; totalPages: number }> {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
    const res = await apiClient.get<{ data: OutboundMessage[]; meta: { total: number; totalPages: number } }>(`/outbound-messages?${q.toString()}`);
    return { items: res.data, total: res.meta.total, totalPages: res.meta.totalPages };
}

// ── Broadcast audience (one row per mobile/email, built on the server) ──
export type AudienceKind = 'customers' | 'leads' | 'both';
export interface AudienceFilter { audience: AudienceKind; type?: string; search?: string }
export interface AudienceContact { id: string; name: string; orgName: string; mobile: string | null; email: string | null; type: string }

export async function fetchAudiencePage(params: AudienceFilter & { page: number; limit: number }): Promise<{ items: AudienceContact[]; total: number; totalPages: number }> {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
    const res = await apiClient.get<{ data: AudienceContact[]; meta: { total: number; totalPages: number } }>(`/outbound-messages/audience?${q.toString()}`);
    return { items: res.data, total: res.meta.total, totalPages: res.meta.totalPages };
}

export async function fetchAudienceTypes(): Promise<string[]> {
    const res = await apiClient.get<OneResponse<string[]>>('/outbound-messages/audience-types');
    return res.data;
}

export async function markEmailSent(id: string): Promise<OutboundMessage> {
    const res = await apiClient.patch<OneResponse<OutboundMessage>>(`/outbound-messages/${id}/mark-sent`);
    return res.data;
}

export async function cancelMessage(id: string): Promise<OutboundMessage> {
    const res = await apiClient.patch<OneResponse<OutboundMessage>>(`/outbound-messages/${id}/cancel`);
    return res.data;
}

export interface BroadcastRecipient {
    email?: string;
    phone?: string;
    variables?: Record<string, any>;
}

// Either explicit recipients (test / hand-picked), or an audience filter:
// "everyone matching, except excludeIds" — resolved on the server.
export async function sendBroadcast(payload: {
    channel: 'whatsapp' | 'email' | 'both';
    templateName: string;
    recipients?: BroadcastRecipient[];
    audienceFilter?: AudienceFilter;
    excludeIds?: string[];
    variables?: Record<string, any>;
}): Promise<{ total: number; results: { to: string; channel: string; status: string }[] }> {
    const res = await apiClient.post<OneResponse<{ total: number; results: any[] }>>('/outbound-messages/broadcast', payload);
    return res.data;
}
