// 🔥 Phase 11: SuperAdmin Plans + Billing Settings API adapter (Postgres)
// Replaces Firestore "settings/pricing" doc used by manage-plans.tsx.
//
// Two backend resources feed this one screen:
//  - /superadmin/plans        (CRUD list of subscription plans)
//  - /superadmin/settings/billing  (UPI details + automation add-on price)
import { apiClient } from './client';

export interface Plan {
  id: string;
  label: string;
  durationMonths: number;
  pricePerEmployee: number;
  discountPercent: number;
  active: boolean;
  sortOrder: number;
}

export interface BillingSettings {
  upiId: string;
  upiPayeeName?: string;
  automationAddonPrice: number;
}

interface OneResponse<T> { data: T }
interface ListResponse<T> { data: T[] }

// ---- Plans CRUD -------------------------------------------------------

export async function listPlans(): Promise<Plan[]> {
  const res = await apiClient.get<ListResponse<Plan>>('/superadmin/plans');
  return res.data;
}

export interface CreatePlanPayload {
  label: string;
  durationMonths: number;
  pricePerEmployee: number;
  discountPercent?: number;
  active?: boolean;
  sortOrder?: number;
}

export async function createPlan(payload: CreatePlanPayload): Promise<Plan> {
  const res = await apiClient.post<OneResponse<Plan>>('/superadmin/plans', payload);
  return res.data;
}

export type UpdatePlanPayload = Partial<CreatePlanPayload>;

export async function updatePlan(id: string, payload: UpdatePlanPayload): Promise<Plan> {
  const res = await apiClient.patch<OneResponse<Plan>>(`/superadmin/plans/${id}`, payload);
  return res.data;
}

// Soft-delete only — deactivates the plan, doesn't hard-delete (see backend
// service comment). Kept as "deletePlan" name so the screen's call site
// doesn't need to change semantics.
export async function deletePlan(id: string): Promise<Plan> {
  const res = await apiClient.delete<OneResponse<Plan>>(`/superadmin/plans/${id}`);
  return res.data;
}

// ---- Billing settings (UPI + automation add-on price) -----------------

export async function fetchBillingSettings(): Promise<BillingSettings> {
  const res = await apiClient.get<OneResponse<BillingSettings>>('/superadmin/settings/billing');
  return res.data;
}

export async function saveBillingSettings(payload: BillingSettings): Promise<BillingSettings> {
  const res = await apiClient.put<OneResponse<BillingSettings>>('/superadmin/settings/billing', payload);
  return res.data;
}
