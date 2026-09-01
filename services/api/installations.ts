import { apiClient } from './client';

export interface ApiInstallation {
  id: string;
  companyId: string;
  installId: string;
  orgId: string | null;
  orgName: string;
  city: string | null;
  address: string | null;
  contactPerson: string | null;
  mobile: string | null;
  department: string | null;
  engineer: string | null;
  product: string;
  model: string | null;
  serialNo: string;
  warrantyExpiry: string | null;
  note: string | null;
  status: string;
  date: string;
  location: { latitude: number; longitude: number } | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: ApiInstallation[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse {
  data: ApiInstallation;
}
interface BatchResponse {
  data: { installId: string; installations: ApiInstallation[] };
}

// Maps an ApiInstallation back to the old Firestore `installations` doc shape.
export function toLegacyInstallation(i: ApiInstallation): any {
  const dateOnly = i.date ? i.date.split('T')[0] : undefined;
  return {
    id: i.id,
    companyId: i.companyId,
    installId: i.installId,
    orgId: i.orgId || '',
    orgName: i.orgName,
    hospital: i.orgName,
    city: i.city || '',
    address: i.address || '',
    contactPerson: i.contactPerson || '',
    mobile: i.mobile || '',
    department: i.department || '',
    engineer: i.engineer || '',
    product: i.product,
    productName: i.product,
    model: i.model || '',
    serialNo: i.serialNo,
    warrantyExpiry: i.warrantyExpiry ? i.warrantyExpiry.split('T')[0] : '',
    note: i.note || '',
    status: i.status,
    date: dateOnly,
    displayDate: dateOnly,
    dateIso: dateOnly,
    location: i.location,
    senderId: i.createdById,
    senderName: undefined,
    createdAt: i.createdAt,
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

export async function listInstallations(params: { search?: string } = {}): Promise<any[]> {
  const res = await apiClient.get<ListResponse>(`/installations${toQueryString({ limit: 100, ...params })}`);
  return res.data.map(toLegacyInstallation);
}

export interface InstallMachineInput {
  product: string;
  model?: string;
  serialNo: string;
  warrantyExpiry?: string;
  note?: string;
}

export interface CreateInstallationBatchPayload {
  orgId?: string;
  orgName: string;
  city?: string;
  address?: string;
  contactPerson?: string;
  mobile?: string;
  department?: string;
  engineer?: string;
  date?: string;
  location?: { latitude: number; longitude: number } | null;
  machines: InstallMachineInput[];
}

// Submits every machine added on add_installation.tsx as one batch. Returns
// the shared installId plus each created row (legacy-shape mapped).
export async function createInstallationBatch(payload: CreateInstallationBatchPayload): Promise<{ installId: string; installations: any[] }> {
  const res = await apiClient.post<BatchResponse>('/installations', payload);
  return { installId: res.data.installId, installations: res.data.installations.map(toLegacyInstallation) };
}

export async function updateInstallation(id: string, payload: Partial<CreateInstallationBatchPayload> & { product?: string; serialNo?: string }): Promise<any> {
  const res = await apiClient.patch<OneResponse>(`/installations/${id}`, payload);
  return toLegacyInstallation(res.data);
}

export async function deleteInstallation(id: string): Promise<void> {
  await apiClient.delete(`/installations/${id}`);
}
