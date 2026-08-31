import { apiClient } from './client';

export interface ApiSalesVisit {
  id: string;
  companyId: string;
  visitType: string;
  orgName: string;
  orgId: string | null;
  contactPerson: string | null;
  mobile: string | null;
  city: string | null;
  address: string | null;
  products: string[];
  discussion: string | null;
  outcome: string | null;
  nextFollowUp: string | null;
  location: { latitude: number; longitude: number } | null;
  leadId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: ApiSalesVisit[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse {
  data: ApiSalesVisit;
}

// Maps an ApiSalesVisit back to the shape the old Firestore `sales_reports`
// doc had, so sales.tsx (which reads `salesVisitList` from DataContext)
// keeps working unchanged — same adapter pattern used for leads.
export function toLegacySalesVisit(v: ApiSalesVisit): any {
  const dateOnly = v.createdAt ? v.createdAt.split('T')[0] : undefined;
  return {
    id: v.id,
    companyId: v.companyId,
    visitType: v.visitType,
    hospital: v.orgName,
    orgName: v.orgName,
    orgId: v.orgId || '',
    person: v.contactPerson || '',
    mobile: v.mobile || '',
    city: v.city || '',
    address: v.address || '',
    product: v.products || [],
    discussion: v.discussion || '',
    outcome: v.outcome || '',
    nextFollowUp: v.nextFollowUp,
    date: dateOnly,
    dateIso: dateOnly,
    senderId: v.createdById,
    senderUid: v.createdById,
    userId: v.createdById,
    timestamp: v.createdAt ? new Date(v.createdAt).getTime() : undefined,
    location: v.location,
    leadId: v.leadId,
    createdAt: v.createdAt,
  };
}

export interface ListSalesVisitsParams {
  outcome?: string;
  visitType?: string;
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

export async function listSalesVisits(params: ListSalesVisitsParams = {}): Promise<any[]> {
  const res = await apiClient.get<ListResponse>(`/sales-visits${toQueryString({ limit: 100, ...params })}`);
  return res.data.map(toLegacySalesVisit);
}

export interface CreateSalesVisitPayload {
  visitType: string;
  orgName: string;
  orgId?: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  city?: string;
  address?: string;
  products?: string[];
  discussion?: string;
  outcome?: string;
  nextFollowUp?: string;
  location?: { latitude: number; longitude: number } | null;
  // Pass this when logging a follow-up visit on an EXISTING lead (e.g. from
  // the lead details screen) — the backend links to it directly instead of
  // auto-creating a new lead for a positive outcome.
  leadId?: string;
}

// Returns the raw API shape (not adapted) since add_sales.tsx only needs
// to know whether a lead was auto-created (`.leadId`), not render it.
export async function createSalesVisit(payload: CreateSalesVisitPayload): Promise<ApiSalesVisit> {
  const res = await apiClient.post<OneResponse>('/sales-visits', payload);
  return res.data;
}

export async function deleteSalesVisit(id: string): Promise<void> {
  await apiClient.delete(`/sales-visits/${id}`);
}
