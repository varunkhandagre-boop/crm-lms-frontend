import { apiClient } from './client';

export interface ApiActivityPlan {
  id: string;
  companyId: string;
  hospital: string;
  address: string | null;
  city: string | null;
  state: string | null;
  contactPerson: string | null;
  contactNumber: string | null;
  email: string | null;
  type: string | null;
  activity: string;
  purpose: string;
  status: string;
  planningNotes: string | null;
  date: string;
  location: { latitude: number; longitude: number } | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

function toLegacyActivityPlan(a: ApiActivityPlan): any {
  const d = a.date ? new Date(a.date) : null;
  const formattedDate = d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
  return {
    id: a.id,
    companyId: a.companyId,
    hospital: a.hospital,
    address: a.address || '',
    city: a.city || '',
    state: a.state || '',
    contactPerson: a.contactPerson || '',
    contactNumber: a.contactNumber || '',
    email: a.email || '',
    type: a.type || '',
    activity: a.activity,
    purpose: a.purpose,
    status: a.status,
    planningNotes: a.planningNotes || '',
    date: formattedDate,
    dateIso: a.date ? a.date.split('T')[0] : undefined,
    location: a.location,
    senderId: a.createdById,
    senderName: undefined,
    createdAt: a.createdAt,
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

export async function listActivityPlans(params: { status?: string } = {}): Promise<any[]> {
  const res = await apiClient.get<{ data: ApiActivityPlan[] }>(`/activity-plans${toQueryString({limit: 1000,  ...params })}`);
  return res.data.map(toLegacyActivityPlan);
}

export interface CreateActivityPlanPayload {
  hospital: string;
  address?: string;
  city: string;
  state?: string;
  contactPerson: string;
  contactNumber?: string;
  email?: string;
  type?: string;
  activity: string;
  purpose: string;
  planningNotes?: string;
  date?: string;
  location?: { latitude: number; longitude: number } | null;
}

export async function createActivityPlan(payload: CreateActivityPlanPayload): Promise<any> {
  const res = await apiClient.post<{ data: ApiActivityPlan }>('/activity-plans', payload);
  return toLegacyActivityPlan(res.data);
}

export async function updateActivityPlanStatus(id: string, status: 'Planned' | 'Started' | 'Completed'): Promise<any> {
  const res = await apiClient.patch<{ data: ApiActivityPlan }>(`/activity-plans/${id}/status`, { status });
  return toLegacyActivityPlan(res.data);
}

// Drop-in replacement for DataContext's old Firestore-backed
// updateActivityStatus(activityId, status) — used by add_installation,
// add_pms, add_demo, add_service_call, add_sales after they finish saving.
export async function completeActivityPlan(id: string): Promise<any> {
  return updateActivityPlanStatus(id, 'Completed');
}
