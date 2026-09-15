// 🔥 Phase 11: Company-facing settings reads (Postgres)
// These hit the /settings/* routes (requireAuth only, no SUPER_ADMIN role
// needed) — distinct from superadminSettings.ts, which hits /superadmin/
// settings/* and requires SUPER_ADMIN. Use this file for any screen a
// regular company user opens (e.g. SubscriptionScreen.tsx).
import { apiClient } from './client';

export interface PublicBillingSettings {
    upiId: string | null;
    upiPayeeName: string | null;
    automationAddonPrice: number;
}

export interface PublicGatewayConfig {
    isEnabled: boolean;
    isTestMode: boolean;
    keyId: string | null;
    currency: string;
    companyName: string | null;
    companyLogo: string | null;
    companyColor: string | null;
    description: string | null;
}

export interface PublicSupportSettings {
    supportPhone: string | null;
    supportEmail: string | null;
    userManualUrl: string | null;
    videoTutorialUrl: string | null;
}

interface OneResponse<T> { data: T }

export async function fetchPublicBillingSettings(): Promise<PublicBillingSettings> {
    const res = await apiClient.get<OneResponse<PublicBillingSettings>>('/settings/billing');
    return res.data;
}

export async function fetchPublicGatewayConfig(): Promise<PublicGatewayConfig> {
    const res = await apiClient.get<OneResponse<PublicGatewayConfig>>('/settings/payment-gateway');
    return res.data;
}

export async function fetchPublicSupportSettings(): Promise<PublicSupportSettings> {
    const res = await apiClient.get<OneResponse<PublicSupportSettings>>('/settings/support');
    return res.data;
}
