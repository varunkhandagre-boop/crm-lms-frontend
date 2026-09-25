import { apiClient } from './client';

export interface ApiSparePart {
  id: string;
  companyId: string;
  partName: string;
  partNo: string;
  price: string | number;
  compatibleModels: string | null;
  officeStock: number;
  stockHolders: Record<string, number>;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: ApiSparePart[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse {
  data: ApiSparePart;
}

// Maps an ApiSparePart back to the old Firestore `spare_parts` doc shape.
// `office_machines` (a separate, unrelated internal-equipment list this
// screen also used to manage) is intentionally NOT covered here — still
// Firestore-only for now.
export function toLegacySparePart(p: ApiSparePart): any {
  return {
    id: p.id,
    companyId: p.companyId,
    partName: p.partName,
    partNo: p.partNo,
    price: Number(p.price) || 0,
    compatibleModels: p.compatibleModels || '',
    officeStock: p.officeStock,
    stockHolders: p.stockHolders || {},
    createdAt: p.createdAt,
  };
}

export interface ListSparePartsParams {
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

export async function listSpareParts(params: ListSparePartsParams = {}): Promise<any[]> {
  const res = await apiClient.get<ListResponse>(`/spare-parts${toQueryString({limit: 1000,  ...params })}`);
  return res.data.map(toLegacySparePart);
}

export interface CreateSparePartPayload {
  partName: string;
  partNo: string;
  price: number;
  compatibleModels?: string;
  officeStock?: number;
}

export async function createSparePart(payload: CreateSparePartPayload): Promise<any> {
  const res = await apiClient.post<OneResponse>('/spare-parts', payload);
  return toLegacySparePart(res.data);
}

export async function updateSparePart(id: string, payload: Partial<CreateSparePartPayload>): Promise<any> {
  const res = await apiClient.patch<OneResponse>(`/spare-parts/${id}`, payload);
  return toLegacySparePart(res.data);
}

export async function issueStock(id: string, employeeId: string, qty: number): Promise<any> {
  const res = await apiClient.post<OneResponse>(`/spare-parts/${id}/issue`, { employeeId, qty });
  return toLegacySparePart(res.data);
}

export async function deleteSparePart(id: string): Promise<void> {
  await apiClient.delete(`/spare-parts/${id}`);
}
