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

// ---------------------------------------------------------------------------
// Employee Day Map
// ---------------------------------------------------------------------------
export type DayPointKind =
    | 'DAY_IN' | 'DAY_OUT' | 'TRACK' | 'VISIT' | 'ORDER' | 'SERVICE' | 'INSTALLATION' | 'PMS' | 'ACTIVITY' | 'LEAD';

export interface DayPoint {
    id: string;
    kind: DayPointKind;
    time: string;
    latitude: number;
    longitude: number;
    title: string;
    subtitle?: string;
    address?: string;
}

export interface DayRoute {
    userId: string;
    userName: string;
    date: string;
    dayIn: string | null;
    dayOut: string | null;
    points: DayPoint[];
    summary: {
        workCount: number;
        counts: Partial<Record<DayPointKind, number>>;
        firstWorkAt: string | null;
        lastWorkAt: string | null;
        approxKm: number;
    };
}

export interface LatestPoint {
    userId: string;
    userName: string;
    latitude: number;
    longitude: number;
    time: string;
}

/** One employee's whole day: Day In/Out, tracking points and every record saved with a location. */
export async function fetchDayRoute(date: string, userId: string): Promise<DayRoute> {
    const params = new URLSearchParams({ date, userId });
    const res = await apiClient.get<OneResponse<DayRoute>>(`/location-logs/day-route?${params.toString()}`);
    return res.data;
}

/** "All Staff": last known point of each employee that day. */
export async function fetchLatestPoints(date: string): Promise<LatestPoint[]> {
    const res = await apiClient.get<ListResponse<LatestPoint>>(`/location-logs/latest?date=${date}`);
    return res.data;
}
