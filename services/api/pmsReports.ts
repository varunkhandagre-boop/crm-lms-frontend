import { apiClient } from './client';

export interface ApiPmsReport {
  id: string;
  companyId: string;
  pmsId: string;
  orgId: string | null;
  orgName: string;
  city: string | null;
  address: string | null;
  department: string | null;
  machine: string | null;
  model: string | null;
  serialNo: string | null;
  type: string;
  remarks: string | null;
  status: string;
  date: string;
  dueDate: string;
  location: { latitude: number; longitude: number } | null;
  createdById: string;
  createdAt: string;
  /** List endpoint only. */
  createdBy?: { name: string } | null;
  organization?: { address1: string | null; address2: string | null; city: string | null } | null;
  updatedAt: string;
}

interface ListResponse {
  data: ApiPmsReport[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse {
  data: ApiPmsReport;
}

// Maps an ApiPmsReport back to the old Firestore `pms_reports` doc shape.
export function toLegacyPmsReport(p: ApiPmsReport): any {
  const dateOnly = p.date ? p.date.split('T')[0] : undefined;
  const dueOnly = p.dueDate ? p.dueDate.split('T')[0] : undefined;
  return {
    id: p.id,
    companyId: p.companyId,
    pmsId: p.pmsId,
    orgId: p.orgId || '',
    hospitalName: p.orgName,
    city: p.city || '',
    address: p.address || '',
    department: p.department || '',
    machine: p.machine || '',
    machineName: p.machine || '',
    model: p.model || '',
    serialNo: p.serialNo || '',
    type: p.type,
    contractType: p.type,
    remarks: p.remarks || '',
    status: p.status,
    date: dateOnly,
    dateIso: dateOnly,
    lastDoneDate: dateOnly,
    dueDate: dueOnly,
    nextServiceDate: dueOnly,
    location: p.location,
    senderId: p.createdById,
    ...(p.createdBy ? { senderName: p.createdBy.name } : {}),
    ...(p.organization
      ? { orgAddress: [p.organization.address1, p.organization.address2].filter(Boolean).join(', '), orgCity: p.organization.city || '' }
      : {}),
    userName: undefined,
    createdAt: p.createdAt,
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

export interface PmsPageFilters {
  view?: 'All' | 'Upcoming' | 'Completed' | 'Overdue';
  fromDate?: string;
  toDate?: string;
  createdById?: string;
  search?: string;
  today?: string; // phone's date, for Upcoming / Overdue
}

/** One page for the PMS screen; tab, dates, employee and search run on the server. */
export async function listPmsReportsPage(
  params: PmsPageFilters & { page: number; limit: number },
): Promise<{ items: any[]; total: number; totalPages: number }> {
  const res = await apiClient.get<ListResponse>(`/pms-reports${toQueryString(params)}`);
  return { items: res.data.map(toLegacyPmsReport), total: res.meta.total, totalPages: res.meta.totalPages };
}

export async function listPmsReports(params: { search?: string } = {}): Promise<any[]> {
  const res = await apiClient.get<ListResponse>(`/pms-reports${toQueryString({limit: 1000,  ...params })}`);
  return res.data.map(toLegacyPmsReport);
}

export interface CreatePmsReportPayload {
  orgId?: string;
  orgName: string;
  city?: string;
  address?: string;
  department?: string;
  machine?: string;
  model?: string;
  serialNo: string;
  type?: 'Preventive' | 'Breakdown' | 'Installation';
  remarks?: string;
  date?: string;
  dueDate: string;
  location?: { latitude: number; longitude: number } | null;
}

export async function createPmsReport(payload: CreatePmsReportPayload): Promise<any> {
  const res = await apiClient.post<OneResponse>('/pms-reports', payload);
  return toLegacyPmsReport(res.data);
}
