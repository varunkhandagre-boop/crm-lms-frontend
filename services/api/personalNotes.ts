// 🔥 Personal Notes API adapter (Postgres)
// Replaces Firestore "personal_notes" collection — strictly scoped to the
// current user server-side (never shared across the team).
import { apiClient } from './client';

export interface PersonalNote {
    id: string;
    companyId: string;
    userId: string;
    title: string;
    content: string;
    color: string;
    isPinned: boolean;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
}

interface OneResponse<T> { data: T }
interface ListResponse<T> { data: T[] }

export async function listPersonalNotes(archived: boolean, search?: string): Promise<PersonalNote[]> {
    const params = new URLSearchParams({ archived: String(archived) });
    if (search) params.set('search', search);
    const res = await apiClient.get<ListResponse<PersonalNote>>(`/personal-notes?${params.toString()}`);
    return res.data;
}

export interface SaveNotePayload {
    title: string;
    content: string;
    color: string;
    isPinned: boolean;
}

export async function createPersonalNote(payload: SaveNotePayload): Promise<PersonalNote> {
    const res = await apiClient.post<OneResponse<PersonalNote>>('/personal-notes', payload);
    return res.data;
}

export async function updatePersonalNote(id: string, payload: Partial<SaveNotePayload & { isArchived: boolean }>): Promise<PersonalNote> {
    const res = await apiClient.patch<OneResponse<PersonalNote>>(`/personal-notes/${id}`, payload);
    return res.data;
}

export async function deletePersonalNote(id: string): Promise<void> {
    await apiClient.delete(`/personal-notes/${id}`);
}
