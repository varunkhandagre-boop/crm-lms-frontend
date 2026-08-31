import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Raw API shape (matches the backend's Prisma model)
// ---------------------------------------------------------------------------

export interface ApiLead {
  id: string;
  companyId: string;
  orgName: string;
  orgId: string | null;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  assignedToId: string;
  ownerName: string | null;
  status: string;
  stage: string | null;
  type: 'HOT' | 'WARM' | 'COLD';
  isHot: boolean;
  source: string | null;
  requirements: string[];
  discussion: string | null;
  nextDate: string | null;
  closingDate: string | null;
  history: { date: string; msg: string; type: string; by: string }[] | null;
  location: { latitude: number; longitude: number } | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ListLeadsResponse {
  data: ApiLead[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneLeadResponse {
  data: ApiLead;
}

// ---------------------------------------------------------------------------
// Legacy shape adapter — makes an ApiLead look like the old Firestore lead
// doc so leads.tsx / add_lead.tsx / lead_details.tsx keep working with
// minimal changes. Remove this once those screens are fully rewritten
// against the new field names (not a Phase 1 goal — go slow, per the
// migration plan).
// ---------------------------------------------------------------------------

function titleCaseType(type: ApiLead['type']): 'Hot' | 'Warm' | 'Cold' {
  return type === 'HOT' ? 'Hot' : type === 'COLD' ? 'Cold' : 'Warm';
}

export function toLegacyLead(l: ApiLead): any {
  const dateOnly = l.createdAt ? l.createdAt.split('T')[0] : undefined;
  return {
    id: l.id,
    companyId: l.companyId,
    org: l.orgName,
    orgName: l.orgName,
    orgId: l.orgId || '',
    address: l.address || '',
    city: l.city || '',
    contactPerson: l.contactPerson || '',
    mobile: l.mobile || '',
    email: l.email || '',
    allocatedTo: l.ownerName || '',
    ownerName: l.ownerName || '',
    userId: l.createdById,
    senderId: l.createdById,
    senderUid: l.createdById,
    uid: l.createdById,
    assignedTo: l.assignedToId, // old field name the screens filter/compare on
    status: l.status,
    stage: l.stage || '',
    type: titleCaseType(l.type),
    isHot: l.isHot,
    requirements: l.requirements || [],
    product: (l.requirements || []).join(', '),
    discussion: l.discussion || '',
    nextDate: l.nextDate,
    closingDate: l.closingDate,
    date: dateOnly,
    dateIso: dateOnly,
    createdAt: l.createdAt,
    history: l.history || [],
    location: l.location,
  };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export interface ListLeadsParams {
  status?: string;
  stage?: string;
  type?: 'HOT' | 'WARM' | 'COLD';
  assignedToId?: string;
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

/** Returns leads already mapped to the legacy shape — drop-in replacement
 *  for `await fetchSaaSData("leads")`. */
export async function listLeads(params: ListLeadsParams = {}): Promise<any[]> {
  // limit=100: covers a company's active pipeline in one call for now.
  // Move to real cursor pagination in the screen if a company outgrows this.
  const res = await apiClient.get<ListLeadsResponse>(`/leads${toQueryString({ limit: 100, ...params })}`);
  return res.data.map(toLegacyLead);
}

export async function getLead(id: string): Promise<any> {
  const res = await apiClient.get<OneLeadResponse>(`/leads/${id}`);
  return toLegacyLead(res.data);
}

export interface CreateLeadPayload {
  orgName: string;
  orgId?: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  address?: string;
  city?: string;
  assignedToId?: string;
  ownerName?: string;
  status?: string;
  stage?: string;
  type?: 'HOT' | 'WARM' | 'COLD';
  isHot?: boolean;
  source?: string;
  requirements?: string[];
  discussion?: string;
  nextDate?: string;
  closingDate?: string;
  location?: { latitude: number; longitude: number } | null;
}

export async function createLead(payload: CreateLeadPayload): Promise<any> {
  const res = await apiClient.post<OneLeadResponse>('/leads', payload);
  return toLegacyLead(res.data);
}

export async function updateLead(id: string, payload: Partial<CreateLeadPayload>): Promise<any> {
  const res = await apiClient.patch<OneLeadResponse>(`/leads/${id}`, payload);
  return toLegacyLead(res.data);
}

export async function deleteLead(id: string): Promise<void> {
  await apiClient.delete(`/leads/${id}`);
}
