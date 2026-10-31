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
    /** WhatsApp: language code of the approved template on Meta (empty = en). */
    language?: string | null;
    /** WhatsApp: "document" = the Meta template has a PDF header (e.g. order_confirmed_pdf). */
    headerType?: 'document' | null;
    createdAt: string | null;
    updatedAt: string | null;
    /** Shared by every company (not saved for this company yet). Editing it saves your own copy. */
    isStandard?: boolean;
    /** Your own version of a standard template — deleting it brings the standard back. */
    overridesStandard?: boolean;
    /** OFF = this automatic message is not sent (older servers: absent = on). */
    enabled?: boolean;
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
    language?: string;
    headerType?: 'none' | 'document';
}

export async function createTemplate(payload: SaveTemplatePayload): Promise<MessageTemplate> {
    const res = await apiClient.post<OneResponse<MessageTemplate>>('/message-templates', payload);
    return res.data;
}

export async function updateTemplate(id: string, payload: Partial<SaveTemplatePayload>): Promise<MessageTemplate> {
    const res = await apiClient.patch<OneResponse<MessageTemplate>>(`/message-templates/${id}`, payload);
    return res.data;
}

/** Turns one automatic message (type + name) ON or OFF for the company. */
export async function setTemplateEnabled(type: 'email' | 'whatsapp', name: string, enabled: boolean): Promise<void> {
    await apiClient.put('/message-templates/switch', { type, name, enabled });
}

export async function deleteTemplate(id: string): Promise<void> {
    await apiClient.delete(`/message-templates/${id}`);
}
