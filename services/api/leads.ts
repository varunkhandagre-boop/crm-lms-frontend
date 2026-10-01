import { apiClient } from './client';
import type { LostReason, PipelineColumn } from '../../constants/leadStatus';

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
  lostReason: string | null;
  lostReasonNote: string | null;
  lostAt: string | null;
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
    lostReason: l.lostReason || '',
    lostReasonNote: l.lostReasonNote || '',
    lostAt: l.lostAt,
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
  // 🔥 Bumped 100 → 1000: a real company hit 388 leads and the old cap
  // was silently hiding 288 of them (no pagination UI anywhere calls this
  // with a page/cursor param — every caller just wants "all my leads").
  // Move to real cursor pagination in the screen if a company outgrows
  // even this.
  const res = await apiClient.get<ListLeadsResponse>(`/leads${toQueryString({ limit: 1000, ...params })}`);
  return res.data.map(toLegacyLead);
}

// ---------------------------------------------------------------------------
// Server-side filtered + paginated list (Leads screen). Unlike listLeads()
// above, this never downloads the whole table — one page at a time.
// ---------------------------------------------------------------------------

export interface LeadPageParams extends ListLeadsParams {
  page: number;
  limit?: number;
  outcome?: 'open' | 'won' | 'lost';
  quick?: 'overdue' | 'today' | 'hot';
  from?: string; // YYYY-MM-DD
  to?: string;
}

export async function listLeadsPage(params: LeadPageParams): Promise<{ items: any[]; total: number; totalPages: number }> {
  const res = await apiClient.get<{ data: ApiLead[]; meta: { total: number; totalPages: number } }>(
    `/leads${toQueryString({ limit: 20, sortBy: 'nextDate', sortOrder: 'asc', view: 'card', ...params })}`
  );
  return { items: res.data.map(toLegacyLead), total: res.meta.total, totalPages: res.meta.totalPages };
}

export interface LeadCounts { open: number; overdue: number; today: number; hot: number }

export async function getLeadCounts(assignedToId?: string): Promise<LeadCounts> {
  const res = await apiClient.get<{ data: LeadCounts }>(`/leads/counts${toQueryString({ assignedToId })}`);
  return res.data;
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
  lostReason?: LostReason;
  lostReasonNote?: string;
}

export async function createLead(payload: CreateLeadPayload): Promise<any> {
  const res = await apiClient.post<OneLeadResponse>('/leads', payload);
  return toLegacyLead(res.data);
}

// `note` is appended on top of the existing discussion server-side (unlike
// `discussion`, which replaces it) — used by the Kanban board's move dialog.
export async function updateLead(id: string, payload: Partial<CreateLeadPayload> & { note?: string }): Promise<any> {
  const res = await apiClient.patch<OneLeadResponse>(`/leads/${id}`, payload);
  return toLegacyLead(res.data);
}

export async function deleteLead(id: string): Promise<void> {
  await apiClient.delete(`/leads/${id}`);
}

// ---------------------------------------------------------------------------
// Bulk reassign (Admin / Manager only — enforced server-side)
// ---------------------------------------------------------------------------

export async function getAssigneeSummary(userId: string): Promise<{ total: number; open: number }> {
  const res = await apiClient.get<{ data: { total: number; open: number } }>(`/leads/assignee-summary${toQueryString({ userId })}`);
  return res.data;
}

export async function bulkReassignLeads(payload: {
  fromUserId: string;
  toUserId: string;
  scope: 'open' | 'all';
}): Promise<{ count: number; fromUserName: string; toUserName: string }> {
  const res = await apiClient.post<{ data: { count: number; fromUserName: string; toUserName: string } }>('/leads/bulk-reassign', payload);
  return res.data;
}

// ---------------------------------------------------------------------------
// Duplicate check — searches the whole company's open leads server-side
// ---------------------------------------------------------------------------

export interface DuplicateLeadMatch {
  id: string;
  orgName: string;
  contactPerson: string | null;
  status: string;
  stage: string | null;
  assignedToId: string;
  assignedToName: string;
  nextDate: string | null;
  matchedOn: 'org' | 'mobile';
  isMine: boolean;
  canOpen: boolean;
}

export async function checkDuplicateLeads(params: { orgName?: string; orgId?: string; mobile?: string }): Promise<DuplicateLeadMatch[]> {
  const res = await apiClient.get<{ data: DuplicateLeadMatch[] }>(`/leads/check-duplicate${toQueryString(params)}`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Pipeline (Kanban) board — each column is a small server-side page
// ---------------------------------------------------------------------------

export interface PipelineCard {
  id: string;
  orgName: string;
  contactPerson: string | null;
  city: string | null;
  status: string;
  stage: string | null;
  isHot: boolean;
  type: 'HOT' | 'WARM' | 'COLD';
  nextDate: string | null;
  requirements: string[];
  assignedToId: string;
  assignedToName: string;
}

export interface PipelineColumnData {
  column: PipelineColumn;
  count: number;
  leads: PipelineCard[];
}

export async function getPipeline(params: { assignedToId?: string; perColumn?: number } = {}): Promise<PipelineColumnData[]> {
  const res = await apiClient.get<{ data: PipelineColumnData[] }>(`/leads/pipeline${toQueryString(params)}`);
  return res.data;
}

export async function getPipelineColumnPage(params: {
  column: PipelineColumn;
  page: number;
  limit?: number;
  assignedToId?: string;
}): Promise<{ data: PipelineCard[]; meta: { total: number; totalPages: number } }> {
  return apiClient.get<{ data: PipelineCard[]; meta: { total: number; totalPages: number } }>(`/leads/pipeline/column${toQueryString(params)}`);
}

// ---------------------------------------------------------------------------
// Lead Insights — funnel, lost reasons, source conversion (all server-side)
// ---------------------------------------------------------------------------

export interface LeadAnalytics {
  summary: {
    total: number; won: number; lost: number; open: number;
    conversionPct: number; winRatePct: number; lostWithReasonRecorded: number;
  };
  funnel: { stage: string; count: number; pctOfTotal: number; pctOfPrevious: number }[];
  lostReasons: { reason: string; count: number; pct: number }[];
  bySource: { source: string; total: number; won: number; lost: number; open: number; conversionPct: number; winRatePct: number }[];
}

export async function getLeadAnalytics(params: { from?: string; to?: string; assignedToId?: string }): Promise<LeadAnalytics> {
  const res = await apiClient.get<{ data: LeadAnalytics }>(`/leads/analytics${toQueryString(params)}`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Close stale leads (Admin / Manager only — enforced server-side)
// ---------------------------------------------------------------------------

export async function getStaleLeadsCount(params: { olderThanDays: number; assignedToId?: string }): Promise<number> {
  const res = await apiClient.get<{ data: { count: number } }>(`/leads/stale-summary${toQueryString(params)}`);
  return res.data.count;
}

export async function closeStaleLeads(payload: {
  olderThanDays: number;
  assignedToId?: string;
  lostReason?: LostReason;
  note?: string;
}): Promise<number> {
  const res = await apiClient.post<{ data: { count: number } }>('/leads/close-stale', payload);
  return res.data.count;
}
