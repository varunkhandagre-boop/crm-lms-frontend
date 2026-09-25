import { apiClient } from './client';

export interface ApiProject {
  id: string;
  companyId: string;
  name: string;
  client: string;
  orgId: string | null;
  location: string | null;
  address: string | null;
  state: string | null;
  pincode: string | null;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  totalValue: string | number;
  totalExpense: string | number;
  totalReceived: string | number;
  description: string | null;
  status: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiProjectExpense {
  id: string;
  projectId: string;
  orgId: string | null;
  orgName: string | null;
  amount: string | number;
  category: string;
  note: string | null;
  date: string;
  createdById: string;
}

export interface ApiProjectPayment {
  id: string;
  projectId: string;
  orgId: string | null;
  orgName: string | null;
  amount: string | number;
  mode: string;
  note: string | null;
  date: string;
  createdById: string;
}

export interface ApiProjectItem {
  id: string;
  projectId: string;
  orgId: string | null;
  orgName: string | null;
  name: string;
  qty: string;
  value: string | number;
  status: string;
  deliveredBy: string | null;
  deliveryMode: string | null;
  deliveryDate: string | null;
  date: string;
  createdById: string;
}

function toLegacyProject(p: ApiProject): any {
  return {
    id: p.id,
    companyId: p.companyId,
    name: p.name,
    client: p.client,
    orgId: p.orgId || '',
    location: p.location || '',
    address: p.address || '',
    state: p.state || '',
    pincode: p.pincode || '',
    contactPerson: p.contactPerson || '',
    mobile: p.mobile || '',
    email: p.email || '',
    totalValue: Number(p.totalValue) || 0,
    totalExpense: Number(p.totalExpense) || 0,
    totalReceived: Number(p.totalReceived) || 0,
    description: p.description || '',
    status: p.status,
    createdBy: undefined,
    dateIso: p.createdAt ? p.createdAt.split('T')[0] : undefined,
    createdAt: p.createdAt,
  };
}

function toLegacyExpense(e: ApiProjectExpense): any {
  return {
    id: e.id,
    projectId: e.projectId,
    orgId: e.orgId || '',
    orgName: e.orgName || '',
    amount: Number(e.amount) || 0,
    category: e.category,
    note: e.note || '',
    date: e.date,
    addedBy: undefined,
    type: 'Expense',
  };
}

function toLegacyPayment(p: ApiProjectPayment): any {
  return {
    id: p.id,
    projectId: p.projectId,
    orgId: p.orgId || '',
    orgName: p.orgName || '',
    amount: Number(p.amount) || 0,
    mode: p.mode,
    note: p.note || '',
    date: p.date,
    addedBy: undefined,
    type: 'Payment',
  };
}

function toLegacyItem(i: ApiProjectItem): any {
  return {
    id: i.id,
    projectId: i.projectId,
    orgId: i.orgId || '',
    orgName: i.orgName || '',
    name: i.name,
    qty: i.qty,
    value: Number(i.value) || 0,
    status: i.status,
    deliveredBy: i.deliveredBy || undefined,
    deliveryMode: i.deliveryMode || undefined,
    deliveryDate: i.deliveryDate || undefined,
    date: i.date,
    addedBy: undefined,
    type: 'Item',
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

export async function listProjects(params: { status?: string; search?: string } = {}): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiProject[] }>(`/projects${toQueryString({limit: 1000,  ...params })}`);
  return res.data.map(toLegacyProject);
}

export async function getProject(id: string): Promise<any> {
  const res = await apiClient.get<{ data: ApiProject }>(`/projects/${id}`);
  return toLegacyProject(res.data);
}

export interface CreateProjectPayload {
  name: string;
  client: string;
  orgId?: string;
  location?: string;
  address?: string;
  state?: string;
  pincode?: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  totalValue: number;
  description?: string;
}

export async function createProject(payload: CreateProjectPayload): Promise<any> {
  const res = await apiClient.post<{ data: ApiProject }>('/projects', payload);
  return toLegacyProject(res.data);
}

export async function updateProject(id: string, payload: { totalValue?: number; description?: string; status?: string }): Promise<any> {
  const res = await apiClient.patch<{ data: ApiProject }>(`/projects/${id}`, payload);
  return toLegacyProject(res.data);
}

// --- Expenses -----------------------------------------------------------

export async function listProjectExpenses(projectId: string): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiProjectExpense[] }>(`/projects/${projectId}/expenses`);
  return res.data.map(toLegacyExpense);
}

export async function addProjectExpense(projectId: string, payload: { amount: number; category: string; note: string }): Promise<any> {
  const res = await apiClient.post<{ data: ApiProjectExpense }>(`/projects/${projectId}/expenses`, payload);
  return toLegacyExpense(res.data);
}

export async function deleteProjectExpense(projectId: string, expenseId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/expenses/${expenseId}`);
}

// --- Payments -----------------------------------------------------------

export async function listProjectPayments(projectId: string): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiProjectPayment[] }>(`/projects/${projectId}/payments`);
  return res.data.map(toLegacyPayment);
}

export async function addProjectPayment(projectId: string, payload: { amount: number; mode: string; note?: string }): Promise<any> {
  const res = await apiClient.post<{ data: ApiProjectPayment }>(`/projects/${projectId}/payments`, payload);
  return toLegacyPayment(res.data);
}

export async function deleteProjectPayment(projectId: string, paymentId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/payments/${paymentId}`);
}

// --- Items ------------------------------------------------------------

export async function listProjectItems(projectId: string): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiProjectItem[] }>(`/projects/${projectId}/items`);
  return res.data.map(toLegacyItem);
}

export async function addProjectItem(projectId: string, payload: { name: string; qty?: string; value?: number }): Promise<any> {
  const res = await apiClient.post<{ data: ApiProjectItem }>(`/projects/${projectId}/items`, payload);
  return toLegacyItem(res.data);
}

export async function deliverProjectItem(projectId: string, itemId: string, deliveryMode: string): Promise<any> {
  const res = await apiClient.post<{ data: ApiProjectItem }>(`/projects/${projectId}/items/${itemId}/deliver`, { deliveryMode });
  return toLegacyItem(res.data);
}

export async function deleteProjectItem(projectId: string, itemId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/items/${itemId}`);
}
