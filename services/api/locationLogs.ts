// 🔥 Location Logs API adapter (Postgres)
// Replaces Firestore "location_logs" collection — background GPS auto-
// tracking (writer, in _layout.tsx) + Tracking tab (reader, in manage_team.tsx).
import { apiClient } from './client';

export interface LocationLog {
    id: string;
    userId: string;
    userName: string;
    latitude: number;
    longitude: number;
    type: string;
    device: string;
    timestamp: string;
}

interface OneResponse<T> { data: T }
interface ListResponse<T> { data: T[] }

export async function recordLocationLog(payload: { latitude: number; longitude: number; type?: string; device?: string }): Promise<LocationLog> {
    const res = await apiClient.post<OneResponse<LocationLog>>('/location-logs', payload);
    return res.data;
}

export async function fetchLocationLogs(date: string, userId?: string): Promise<LocationLog[]> {
    const params = new URLSearchParams({ date });
    if (userId) params.set('userId', userId);
    const res = await apiClient.get<ListResponse<LocationLog>>(`/location-logs?${params.toString()}`);
    return res.data;
}
