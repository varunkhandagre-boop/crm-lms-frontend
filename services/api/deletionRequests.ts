import { apiClient } from './client';

// SuperAdmin → Deletion requests (in-app "Delete my account", 30-day promise).
export type DeletionStatus = 'pending' | 'done' | 'all';

export interface DeletionRequest {
    id: string;
    companyId: string;
    companyName: string;
    userId: string | null;
    userName: string;
    userEmail: string;
    userMobile: string | null;
    userRole: string;
    loginActive: boolean;
    mode: 'DEACTIVATED' | 'REQUEST';
    reason: string | null;
    status: 'PENDING' | 'DONE';
    requestedAt: string;
    dueAt: string;
    daysLeft: number;
    dataRemovedAt: string | null;
    completedAt: string | null;
    completedByName: string | null;
    note: string | null;
}

export interface DeletionPage {
    items: DeletionRequest[];
    total: number;
    totalPages: number;
    pending: number;
    overdue: number;
}

interface ListResponse {
    data: DeletionRequest[];
    meta: { page: number; limit: number; total: number; totalPages: number; pending: number; overdue: number };
}

export async function listDeletionRequests(params: { status: DeletionStatus; page: number; limit: number }): Promise<DeletionPage> {
    const qs = `status=${params.status}&page=${params.page}&limit=${params.limit}`;
    const res = await apiClient.get<ListResponse>(`/superadmin/deletion-requests?${qs}`);
    return {
        items: res.data,
        total: res.meta.total,
        totalPages: res.meta.totalPages,
        pending: res.meta.pending,
        overdue: res.meta.overdue,
    };
}

export async function removePersonalData(id: string, note?: string) {
    const res = await apiClient.post<{ data: { notesDeleted: number; locationPointsDeleted: number } }>(
        `/superadmin/deletion-requests/${id}/remove-personal-data`,
        note?.trim() ? { note: note.trim() } : {},
    );
    return res.data;
}

export async function markDeletionDone(id: string, note: string) {
    await apiClient.post(`/superadmin/deletion-requests/${id}/done`, { note: note.trim() });
}
