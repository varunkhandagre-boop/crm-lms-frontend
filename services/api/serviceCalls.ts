import { apiClient } from './client';

export interface ApiServiceCall {
  id: string;
  companyId: string;
  scrId: string;
  orgId: string | null;
  orgName: string;
  city: string | null;
  address: string | null;
  contactPerson: string | null;
  mobile: string | null;
  machine: string | null;
  model: string | null;
  serialNo: string | null;
  department: string | null;
  installationDate: string | null;
  serviceType: string | null;
  type: string | null;
  source: string;
  status: string;
  remark: string | null;
  resolutionNote: string | null;
  imageUri: string | null;
  partsUsed: { id: string; partName: string; partNo?: string; usedQty: string | number }[] | null;
  partsText: string | null;
  date: string;
  location: { latitude: number; longitude: number } | null;
  createdById: string | null;
  assignedEngineerId?: string | null;
  assignedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: ApiServiceCall[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse {
  data: ApiServiceCall;
}

// Maps an ApiServiceCall back to the old Firestore `service_calls` doc
// shape. senderName isn't stored server-side (only createdById) — same
// known gap as orders/quotations; display falls back gracefully.
export function toLegacyServiceCall(s: ApiServiceCall): any {
  const dateOnly = s.date ? s.date.split('T')[0] : undefined;
  return {
    id: s.id,
    companyId: s.companyId,
    scrId: s.scrId,
    orgId: s.orgId || '',
    hospitalName: s.orgName,
    city: s.city || '',
    address: s.address || '',
    contactPerson: s.contactPerson || '',
    mobile: s.mobile || '',
    machine: s.machine || '',
    model: s.model || '',
    serialNo: s.serialNo || '',
    department: s.department || '',
    installationDate: s.installationDate || '',
    serviceType: s.serviceType || '',
    type: s.type || '',
    source: s.source,
    status: s.status,
    remark: s.remark || '',
    resolutionNote: s.resolutionNote || '',
    imageUri: s.imageUri,
    partsUsed: s.partsUsed || [],
    partsText: s.partsText || '',
    date: dateOnly,
    dateIso: dateOnly,
    location: s.location,
    senderId: s.createdById || undefined,
    senderName: undefined,
    userName: undefined,
    assignedToId: s.assignedEngineerId || undefined, // the screens already filter on this name
    assignedAt: s.assignedAt || null,
    closedAt: s.closedAt || null,
    createdAt: s.createdAt,
  };
}

function toQueryString(params: Record<string, any>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export interface ListServiceCallsParams {
  status?: string;
  search?: string;
}

export async function listServiceCalls(params: ListServiceCallsParams = {}): Promise<any[]> {
  const res = await apiClient.get<ListResponse>(`/service-calls${toQueryString({limit: 1000,  ...params })}`);
  return res.data.map(toLegacyServiceCall);
}

export interface CreateServiceCallPayload {
  orgId?: string;
  orgName: string;
  city?: string;
  address?: string;
  machine?: string;
  model?: string;
  serialNo: string;
  department?: string;
  installationDate?: string;
  serviceType?: string;
  type?: string;
  status?: 'Open' | 'Assigned' | 'Resolved' | 'Closed';
  remark: string;
  resolutionNote?: string;
  imageUri?: string;
  partsUsed?: { id: string; partName: string; partNo?: string; usedQty: string | number }[];
  partsText?: string;
  date?: string;
  location?: { latitude: number; longitude: number } | null;
}

export async function createServiceCall(payload: CreateServiceCallPayload): Promise<any> {
  const res = await apiClient.post<OneResponse>('/service-calls', payload);
  return toLegacyServiceCall(res.data);
}

export async function updateServiceCall(id: string, payload: Partial<CreateServiceCallPayload>): Promise<any> {
  const res = await apiClient.patch<OneResponse>(`/service-calls/${id}`, payload);
  return toLegacyServiceCall(res.data);
}

export async function closeServiceCall(id: string, resolutionNote: string): Promise<any> {
  const res = await apiClient.post<OneResponse>(`/service-calls/${id}/close`, { resolutionNote });
  return toLegacyServiceCall(res.data);
}

/** Assign the call to an engineer (Admin/Manager). null = unassign. */
export async function assignServiceCall(id: string, engineerId: string | null): Promise<any> {
  const res = await apiClient.post<OneResponse>(`/service-calls/${id}/assign`, { engineerId });
  return toLegacyServiceCall(res.data);
}

export interface EngineerStat {
  engineerId: string;
  name: string;
  openNow: number;
  closed: number;
  avgHours: number | null;
}

/** Per-engineer open calls, calls closed in the period, average hours to close. */
export async function getEngineerStats(from?: string, to?: string): Promise<{ engineers: EngineerStat[]; unassignedOpen: number }> {
  const res = await apiClient.get<{ data: { engineers: EngineerStat[]; unassignedOpen: number } }>(
    `/service-calls/engineer-stats${toQueryString({ from, to })}`
  );
  return res.data;
}
