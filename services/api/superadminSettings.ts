// 🔥 Phase 11: SuperAdmin Support Settings API adapter (Postgres)
// Replaces Firestore "settings/support_config" doc used by
// superadmin-support-settings.tsx.
import { apiClient } from './client';

export interface SupportSettings {
    supportPhone?: string;
    supportEmail?: string;
    userManualUrl?: string;
    videoTutorialUrl?: string;
}

interface OneResponse<T> { data: T }

export async function fetchSupportSettings(): Promise<SupportSettings> {
    const res = await apiClient.get<OneResponse<SupportSettings>>('/superadmin/settings/support');
    return res.data;
}

export async function saveSupportSettings(payload: SupportSettings): Promise<SupportSettings> {
    const res = await apiClient.put<OneResponse<SupportSettings>>('/superadmin/settings/support', payload);
    return res.data;
}

// ---- Payment gateway settings -------------------------------------------
// Note: the backend masks keySecret/webhookSecret in GET responses (never
// returns the real value once set) — see maskGatewayConfig() server-side.
// The screen must treat those two fields as write-only: leave them blank on
// load, and only include them in the save payload if the user actually
// typed a new value.

export interface GatewaySettings {
    isEnabled: boolean;
    isTestMode: boolean;
    provider?: string;
    keyId: string;
    keySecret: string;      // masked ("••••••••") when read back from GET
    webhookSecret?: string; // masked when read back from GET, may be empty
    currency: string;
    companyName: string;
    companyLogo?: string;
    companyColor?: string;
    description?: string;
}

export async function fetchGatewaySettings(): Promise<GatewaySettings> {
    const res = await apiClient.get<OneResponse<GatewaySettings>>('/superadmin/settings/payment-gateway');
    return res.data;
}

export async function saveGatewaySettings(payload: GatewaySettings): Promise<GatewaySettings> {
    const res = await apiClient.put<OneResponse<GatewaySettings>>('/superadmin/settings/payment-gateway', payload);
    return res.data;
}
