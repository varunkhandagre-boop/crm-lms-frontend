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

export async function sendBroadcast(payload: {
    channel: 'whatsapp' | 'email' | 'both';
    templateName: string;
    recipients: BroadcastRecipient[];
}): Promise<{ total: number; results: { to: string; channel: string; status: string }[] }> {
    const res = await apiClient.post<OneResponse<{ total: number; results: any[] }>>('/outbound-messages/broadcast', payload);
    return res.data;
}
