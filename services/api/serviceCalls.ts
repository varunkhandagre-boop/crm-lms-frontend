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
    // Old records may hold a phone-local path — only show real uploads.
    imageUri: s.imageUri && /^https?:\/\//i.test(s.imageUri) ? s.imageUri : null,
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

// One page of the Service Calls screen — every filter runs on the server.
export interface ServiceCallPageParams {
  page?: number;
  limit?: number;
  outcome?: 'open' | 'closed';
  search?: string;
  engineerId?: 'me' | string;
  employeeId?: string;
  from?: string; // YYYY-MM-DD (IST), on created date
  to?: string;
  sortBy?: 'createdAt' | 'date';
  sortOrder?: 'asc' | 'desc';
}

export async function listServiceCallsPage(params: ServiceCallPageParams): Promise<{ items: any[]; total: number; totalPages: number }> {
  const res = await apiClient.get<ListResponse>(`/service-calls${toQueryString({ limit: 20, sortBy: 'createdAt', sortOrder: 'desc', ...params })}`);
  return { items: res.data.map(toLegacyServiceCall), total: res.meta.total, totalPages: res.meta.totalPages };
}

export async function getServiceCall(id: string): Promise<any> {
  const res = await apiClient.get<OneResponse>(`/service-calls/${id}`);
  return toLegacyServiceCall(res.data);
}

// Open = Open + Assigned, scoped like the list (field users: their own calls).
export async function getServiceCallCounts(): Promise<{ open: number; assignedToMe: number }> {
  const res = await apiClient.get<{ data: { open: number; assignedToMe: number } }>('/service-calls/counts');
  return res.data;
}

// Full download (up to 1000) — still used by reports; the Service Calls screen pages instead.
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

/** partsUsed (optional): parts used on the visit — saved on the call and taken out of stock. */
export async function closeServiceCall(
  id: string,
  resolutionNote: string,
  partsUsed?: { id: string; partName: string; partNo?: string; usedQty: string | number }[]
): Promise<any> {
  const body: Record<string, any> = { resolutionNote };
  if (partsUsed) {
    body.partsUsed = partsUsed;
    body.partsText = partsUsed.map((p) => `${p.partName} (${p.usedQty})`).join(', ');
  }
  const res = await apiClient.post<OneResponse>(`/service-calls/${id}/close`, body);
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

// Photo as a base64 data URI; replaces any earlier photo.
export async function uploadServiceCallPhoto(id: string, dataUri: string): Promise<any> {
  const res = await apiClient.put<OneResponse>(`/service-calls/${id}/photo`, { dataUri });
  return toLegacyServiceCall(res.data);
}

// Also deletes the file from storage.
export async function deleteServiceCallPhoto(id: string): Promise<any> {
  const res = await apiClient.delete<OneResponse>(`/service-calls/${id}/photo`);
  return toLegacyServiceCall(res.data);
}
