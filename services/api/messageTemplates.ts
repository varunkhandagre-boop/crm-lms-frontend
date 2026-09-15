// 🔥 Message Templates API adapter (Postgres)
// Replaces Firestore "message_templates" collection.
import { apiClient } from './client';

export interface MessageTemplate {
    id: string;
    companyId: string;
    name: string;
    type: 'email' | 'whatsapp';
    subject: string | null;
    body: string;
    createdAt: string;
    updatedAt: string;
}

interface OneResponse<T> { data: T }
interface ListResponse<T> { data: T[] }

export async function fetchTemplates(type?: 'email' | 'whatsapp'): Promise<MessageTemplate[]> {
    const qs = type ? `?type=${type}` : '';
    const res = await apiClient.get<ListResponse<MessageTemplate>>(`/message-templates${qs}`);
    return res.data;
}

export interface SaveTemplatePayload {
    name: string;
    type: 'email' | 'whatsapp';
    subject?: string;
    body: string;
}

export async function createTemplate(payload: SaveTemplatePayload): Promise<MessageTemplate> {
    const res = await apiClient.post<OneResponse<MessageTemplate>>('/message-templates', payload);
    return res.data;
}

export async function updateTemplate(id: string, payload: Partial<SaveTemplatePayload>): Promise<MessageTemplate> {
    const res = await apiClient.patch<OneResponse<MessageTemplate>>(`/message-templates/${id}`, payload);
    return res.data;
}

export async function deleteTemplate(id: string): Promise<void> {
    await apiClient.delete(`/message-templates/${id}`);
}
