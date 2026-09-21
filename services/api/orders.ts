import { apiClient } from './client';

export interface ApiOrder {
  id: string;
  companyId: string;
  orderRef: string;
  orgId: string | null;
  orgName: string;
  address: string | null;
  city: string | null;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  poNumber: string;
  amount: string | number;
  advanceAmount: string | number;
  balance: string | number;
  paymentStatus: string;
  saleType: string;
  productDetails: string;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  notes: string | null;
  status: string;
  finalBillAmount: string | number | null;
  billedDate: string | null;
  reminderHistory: { date: string; sentBy: string }[] | null;
  lastReminderDate: string | null;
  date: string;
  location: { latitude: number; longitude: number } | null;
  leadId: string | null;
  assignedToId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: ApiOrder[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse {
  data: ApiOrder;
}

// Maps an ApiOrder back to the old Firestore `orders` doc shape.
// Note: senderName/bookedBy aren't stored server-side (only IDs) — the
// employee-name display/filter falls back gracefully, same known gap as
// quotations/demos. PO file upload also isn't wired yet (needs Supabase
// Storage) — poFileUri/poFileName always come back empty.
export function toLegacyOrder(o: ApiOrder): any {
  const dateOnly = o.date ? o.date.split('T')[0] : undefined;
  return {
    id: o.id,
    companyId: o.companyId,
    orderId: o.orderRef,
    orgId: o.orgId || '',
    hospitalName: o.orgName,
    address: o.address || '',
    city: o.city || '',
    contactPerson: o.contactPerson || '',
    mobile: o.mobile || '',
    email: o.email || '',
    poNumber: o.poNumber,
    amount: Number(o.amount) || 0,
    advanceAmount: Number(o.advanceAmount) || 0,
    balance: Number(o.balance) || 0,
    paymentStatus: o.paymentStatus,
    saleType: o.saleType,
    productDetails: o.productDetails,
    paymentTerms: o.paymentTerms || '',
    deliveryTerms: o.deliveryTerms || '',
    notes: o.notes || '',
    status: o.status,
    finalBillAmount: o.finalBillAmount != null ? Number(o.finalBillAmount) : undefined,
    billedDate: o.billedDate,
    reminderHistory: o.reminderHistory || [],
    lastReminderDate: o.lastReminderDate || '',
    date: dateOnly,
    dateIso: dateOnly,
    location: o.location,
    leadId: o.leadId || undefined,
    senderId: o.assignedToId || o.createdById,
    senderName: undefined,
    userId: o.assignedToId || o.createdById,
    createdById: o.createdById,
    bookedBy: undefined,
    poFileName: '',
    poFileUri: '',
    poFileType: '',
    createdAt: o.createdAt,
  };
}

export interface ListOrdersParams {
  status?: string;
  saleType?: string;
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

export async function listOrders(params: ListOrdersParams = {}): Promise<any[]> {
  const res = await apiClient.get<ListResponse>(`/orders${toQueryString({ limit: 100, ...params })}`);
  return res.data.map(toLegacyOrder);
}

export interface CreateOrderPayload {
  orgId?: string;
  orgName: string;
  address?: string;
  city?: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  poNumber: string;
  amount: number;
  advanceAmount?: number;
  saleType?: 'Cash' | 'Credit';
  productDetails: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  notes?: string;
  date?: string;
  location?: { latitude: number; longitude: number } | null;
  leadId?: string;
  assignedToId?: string;
}

export async function createOrder(payload: CreateOrderPayload): Promise<any> {
  const res = await apiClient.post<OneResponse>('/orders', payload);
  return toLegacyOrder(res.data);
}

export async function updateOrder(id: string, payload: Partial<CreateOrderPayload>): Promise<any> {
  const res = await apiClient.patch<OneResponse>(`/orders/${id}`, payload);
  return toLegacyOrder(res.data);
}

export async function updateOrderStatus(
  id: string,
  status: 'Pending' | 'Approved' | 'Rejected' | 'Dispatched' | 'Billed' | 'Completed'
): Promise<any> {
  const res = await apiClient.patch<OneResponse>(`/orders/${id}/status`, { status });
  return toLegacyOrder(res.data);
}

export async function billOrder(id: string, finalBillAmount: number): Promise<any> {
  const res = await apiClient.post<OneResponse>(`/orders/${id}/bill`, { finalBillAmount });
  return toLegacyOrder(res.data);
}

export async function deleteOrder(id: string): Promise<void> {
  await apiClient.delete(`/orders/${id}`);
}

// Phase 6: WhatsApp payment-reminder tracking (records intent only).
export async function remindOrder(id: string): Promise<any> {
  const res = await apiClient.post<OneResponse>(`/orders/${id}/remind`, {});
  return toLegacyOrder(res.data);
}
