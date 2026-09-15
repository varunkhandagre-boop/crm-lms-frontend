import { apiClient } from './client';

export interface ApiDemo {
  id: string;
  companyId: string;
  demoRef: string | null;
  orgName: string;
  address: string | null;
  city: string | null;
  department: string | null;
  contactPerson: string | null;
  designation: string | null;
  contactNumber: string | null;
  product: string | null;
  model: string | null;
  serialNo: string | null;
  date: string;
  duration: number;
  outcome: string | null;
  notes: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: ApiDemo[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse {
  data: ApiDemo;
}

// Maps an ApiDemo back to the old Firestore `demos` doc shape.
// Notes on gaps vs the old shape (kept simple for Phase 2 — not blocking):
// - `email` isn't stored on the backend Demo table; dropped silently.
// - `orgId` isn't stored either; org lookups in demo.tsx already fall back
//   to matching by orgName, so this degrades gracefully.
export function toLegacyDemo(d: ApiDemo): any {
  const dateOnly = d.date ? d.date.split('T')[0] : undefined;
  return {
    id: d.id,
    companyId: d.companyId,
    demoId: d.demoRef || d.id,
    hospital: d.orgName,
    orgName: d.orgName,
    orgId: '',
    address: d.address || '',
    city: d.city || '',
    department: d.department || '',
    contactPerson: d.contactPerson || '',
    designation: d.designation || '',
    contactNumber: d.contactNumber || '',
    product: d.product || '',
    productName: d.product || '',
    model: d.model || '',
    serialNo: d.serialNo || '',
    date: dateOnly,
    dateIso: dateOnly,
    displayDate: dateOnly,
    duration: d.duration,
    result: d.outcome || '',
    outcome: d.outcome || '',
    notes: d.notes || '',
    status: 'Completed',
    engineer: undefined,
    senderId: d.createdById,
    senderName: undefined,
    createdAt: d.createdAt,
  };
}

export interface ListDemosParams {
  search?: string;
}

function toQueryString(params: Record<string, any>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function listDemos(params: ListDemosParams = {}): Promise<any[]> {
  const res = await apiClient.get<ListResponse>(`/demos${toQueryString({ limit: 100, ...params })}`);
  return res.data.map(toLegacyDemo);
}

export interface CreateDemoPayload {
  demoRef?: string;
  orgId?: string;
  orgName: string;
  address?: string;
  city?: string;
  department?: string;
  contactPerson?: string;
  designation?: string;
  contactNumber?: string;
  product?: string;
  model?: string;
  serialNo?: string;
  date?: string;
  duration?: number;
  outcome?: string;
  notes?: string;
}

export async function createDemo(payload: CreateDemoPayload): Promise<any> {
  const res = await apiClient.post<OneResponse>('/demos', payload);
  return toLegacyDemo(res.data);
}

export async function updateDemo(id: string, payload: Partial<CreateDemoPayload>): Promise<any> {
  const res = await apiClient.patch<OneResponse>(`/demos/${id}`, payload);
  return toLegacyDemo(res.data);
}

export async function deleteDemo(id: string): Promise<void> {
  await apiClient.delete(`/demos/${id}`);
}
