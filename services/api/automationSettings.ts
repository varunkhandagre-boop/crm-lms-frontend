// 🔥 Automation Settings API adapter (Postgres)
// Replaces two Firestore reads (companies/{id}.automationAddonEnabled +
// tenants/{id}/settings/notifications) with one GET that returns both.
import { apiClient } from './client';

export interface AutomationSettings {
    whatsappEnabled: boolean;
    whatsappProvider: 'aisensy' | 'meta_cloud' | 'gupshup';
    whatsappApiKey: string | null;
    whatsappSenderId: string | null;
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

export async function saveAutomationSettings(payload: AutomationSettings): Promise<AutomationSettings> {
    const res = await apiClient.put<OneResponse<AutomationSettings>>('/automation-settings', payload);
    return res.data;
}
