// 🔥 Permissions API adapter (Postgres)
// Replaces Firestore "settings_permissions" collection — a single free-form
// JSON blob per company, keyed by role name or user id/email.
import { apiClient } from './client';

export type PermissionsBlob = Record<string, Record<string, boolean>>;

interface OneResponse<T> { data: T }

export async function fetchPermissions(): Promise<PermissionsBlob> {
    const res = await apiClient.get<OneResponse<PermissionsBlob>>('/permissions');
    return res.data || {};
}

export async function savePermissions(data: PermissionsBlob): Promise<PermissionsBlob> {
    const res = await apiClient.put<OneResponse<PermissionsBlob>>('/permissions', { data });
    return res.data;
}
