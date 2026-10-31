// 🔥 Automation Settings API adapter (Postgres)
// Replaces two Firestore reads (companies/{id}.automationAddonEnabled +
// tenants/{id}/settings/notifications) with one GET that returns both.
import { apiClient } from './client';

export interface AutomationSettings {
    whatsappEnabled: boolean;
    whatsappProvider: 'meta_cloud' | 'aisensy' | 'wati' | 'gupshup'; // gupshup: old value, not offered
    whatsappApiKey: string | null;
    whatsappSenderId: string | null;
    /** Test mode: comma-separated numbers; WhatsApp goes only to them. Empty = every customer. */
    whatsappTestNumbers?: string | null;
    emailEnabled: boolean;
    emailProvider: 'brevo' | 'resend' | 'sendgrid';
    emailApiKey: string | null;
    emailFromAddress: string | null;
}

export interface AutomationSettingsResponse {
    entitled: boolean;
    settings: AutomationSettings;
}

interface OneResponse<T> { data: T }

export async function fetchAutomationSettings(): Promise<AutomationSettingsResponse> {
    const res = await apiClient.get<OneResponse<AutomationSettingsResponse>>('/automation-settings');
    return res.data;
}

/** Sends one test email with the saved settings (save first). */
export async function sendTestEmail(to: string): Promise<{ sent: boolean; to: string; provider: string }> {
    const res = await apiClient.post<OneResponse<{ sent: boolean; to: string; provider: string }>>('/automation-settings/test-email', { to });
    return res.data;
}

// WhatsApp delivered / read receipts: the URL (and Meta's Verify Token) to
// paste into the provider's webhook settings. Regenerate makes the old URL stop working.
export interface StatusWebhook { url: string; verifyToken: string }
export async function fetchStatusWebhook(): Promise<StatusWebhook> {
    const res = await apiClient.get<OneResponse<StatusWebhook>>('/automation-settings/status-webhook');
    return res.data;
}
export async function regenerateStatusWebhook(): Promise<StatusWebhook> {
    const res = await apiClient.post<OneResponse<StatusWebhook>>('/automation-settings/status-webhook/regenerate', {});
    return res.data;
}

export async function saveAutomationSettings(payload: AutomationSettings): Promise<AutomationSettings> {
    const res = await apiClient.put<OneResponse<AutomationSettings>>('/automation-settings', payload);
    return res.data;
}
