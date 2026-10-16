import { apiClient } from './client';
import { APP_PLATFORM, APP_VERSION } from '../../utils/appVersion';

export interface AppVersionStatus {
    platform: 'android' | 'ios';
    currentVersion: string;
    latestVersion: string | null;
    minVersion: string | null;
    updateAvailable: boolean;
    updateRequired: boolean;
    storeUrl: string | null;
    message: string;
}

/** Asks the server whether this phone build should update. null on web or on any error. */
export async function checkAppVersion(): Promise<AppVersionStatus | null> {
    if (!APP_PLATFORM) return null;
    try {
        const qs = `platform=${APP_PLATFORM}&version=${encodeURIComponent(APP_VERSION)}`;
        const res = await apiClient.get<{ data: AppVersionStatus }>(`/public/app-version?${qs}`, { timeoutMs: 15_000 });
        return res.data;
    } catch {
        return null; // never block the app because the check failed
    }
}

// ---- SuperAdmin → App version -------------------------------------------
export interface AppVersionSettings {
    androidLatestVersion: string | null;
    androidMinVersion: string | null;
    iosLatestVersion: string | null;
    iosMinVersion: string | null;
    iosStoreUrl: string | null;
    message: string | null;
}

export async function fetchAppVersionSettings(): Promise<AppVersionSettings> {
    const res = await apiClient.get<{ data: AppVersionSettings }>('/superadmin/settings/app-version');
    return res.data;
}

export async function saveAppVersionSettings(payload: AppVersionSettings): Promise<AppVersionSettings> {
    const res = await apiClient.put<{ data: AppVersionSettings }>('/superadmin/settings/app-version', payload);
    return res.data;
}
