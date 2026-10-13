import { apiClient } from './client';
import { toLegacySalesVisit } from './salesVisits';

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
  const res = await apiClient.get<ListResponse>(`/demos${toQueryString({limit: 1000,  ...params })}`);
  return res.data.map(toLegacyDemo);
}

/** How many demos fall between two dates (YYYY-MM-DD) — one row fetched, the count comes from meta. */
export async function countDemos(fromDate: string, toDate: string): Promise<number> {
  const res = await apiClient.get<ListResponse>(`/demos${toQueryString({ fromDate, toDate, limit: 1 })}`);
  return res.meta.total;
}

export interface DemoFeedFilters {
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
  createdById?: string;
  search?: string;
}

/**
 * One page of the Demo screen: demos + DSR visits that mention a demo
 * ("From Sales"), newest first — merged, filtered and paged on the server.
 * `org` carries the linked organization's city / state for the detail popup.
 */
export async function listDemoFeedPage(
  params: DemoFeedFilters & { page: number; limit: number },
): Promise<{ items: any[]; total: number; totalPages: number }> {
  const res = await apiClient.get<{ data: any[]; meta: { total: number; totalPages: number } }>(`/demos/feed${toQueryString(params)}`);
  const items = res.data.map((x: any) => {
    if (x.kind === 'demo') {
      const d = x.demo;
      return { ...toLegacyDemo(d), senderName: d.createdBy?.name || 'Unknown', city: d.city || d.organization?.city || '', org: d.organization || null };
    }
    const v = toLegacySalesVisit(x.visit);
    return {
      id: v.id,
      hospital: v.hospital,
      orgId: v.orgId || '',
      date: v.date,
      product: 'See Details',
      result: v.outcome || 'N/A',
      status: 'Completed',
      isFromSales: true,
      fullData: v,
      senderId: v.senderId,
      senderName: v.senderName || 'Unknown',
      city: v.city || '',
      org: x.visit.organization || null,
    };
  });
  return { items, total: res.meta.total, totalPages: res.meta.totalPages };
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
