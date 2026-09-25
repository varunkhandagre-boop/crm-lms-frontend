import { apiClient } from './client';

export interface ApiQuotationItem {
  id?: string;
  name: string;
  model?: string;
  specifications?: string;
  qty: number;
  price: number;
  gstRate?: number;
  isCustom?: boolean;
}

export interface ApiQuotation {
  id: string;
  companyId: string;
  estimateNo: string;
  docTitle: string | null;
  orgId: string | null;
  orgName: string;
  orgAddress: string | null;
  orgPhone: string | null;
  items: ApiQuotationItem[];
  termsAndConditions: string | null;
  taxType: string | null;
  subTotal: string | number;
  totalGst: string | number;
  grandTotal: string | number;
  status: string;
  date: string;
  validTill: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: ApiQuotation[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse {
  data: ApiQuotation;
}

// Maps an ApiQuotation back to the shape the old Firestore `quotations` doc
// had, so quotations.tsx / add_quotation.tsx keep working unchanged.
// Note: `senderName` isn't stored on the backend (only `createdById`) — the
// employee-filter-by-name UI will show "Admin" as a fallback for these
// records until a proper user lookup is wired in; filtering by "All" still
// works correctly since that doesn't depend on senderName.
export function toLegacyQuotation(q: ApiQuotation): any {
  const dateOnly = q.date ? q.date.split('T')[0] : undefined;
  const validTillOnly = q.validTill ? q.validTill.split('T')[0] : undefined;
  return {
    id: q.id,
    companyId: q.companyId,
    estimateNo: q.estimateNo,
    docTitle: q.docTitle || 'ESTIMATE',
    orgId: q.orgId || '',
    orgName: q.orgName,
    orgAddress: q.orgAddress || '',
    orgPhone: q.orgPhone || '',
    items: q.items || [],
    termsAndConditions: q.termsAndConditions || '',
    taxType: q.taxType || 'CGST/SGST',
    subTotal: Number(q.subTotal) || 0,
    totalGST: Number(q.totalGst) || 0,
    grandTotal: Number(q.grandTotal) || 0,
    status: q.status,
    date: dateOnly,
    dateIso: dateOnly,
    validTill: validTillOnly,
    senderId: q.createdById,
    senderName: undefined,
    createdAt: q.createdAt,
  };
}

export interface ListQuotationsParams {
  status?: string;
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

export async function listQuotations(params: ListQuotationsParams = {}): Promise<any[]> {
  const res = await apiClient.get<ListResponse>(`/quotations${toQueryString({limit: 1000,  ...params })}`);
  return res.data.map(toLegacyQuotation);
}

export interface CreateQuotationPayload {
  estimateNo?: string;
  docTitle?: string;
  orgId?: string;
  orgName: string;
  orgAddress?: string;
  orgPhone?: string;
  items: ApiQuotationItem[];
  termsAndConditions?: string;
  taxType?: string;
  subTotal?: number;
  totalGst?: number;
  grandTotal?: number;
  status?: string;
  date?: string;
  validTill?: string;
}

export async function createQuotation(payload: CreateQuotationPayload): Promise<any> {
  const res = await apiClient.post<OneResponse>('/quotations', payload);
  return toLegacyQuotation(res.data);
}

export async function updateQuotation(id: string, payload: Partial<CreateQuotationPayload>): Promise<any> {
  const res = await apiClient.patch<OneResponse>(`/quotations/${id}`, payload);
  return toLegacyQuotation(res.data);
}

export async function deleteQuotation(id: string): Promise<void> {
  await apiClient.delete(`/quotations/${id}`);
}
