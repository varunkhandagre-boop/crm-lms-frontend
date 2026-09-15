// 🔥 Phase 11: Public/company-facing active plans list (Postgres)
// Used by SubscriptionScreen.tsx — any logged-in user can read the active
// plan catalog. Distinct from superadminPlans.ts (SuperAdmin CRUD version).
import { apiClient } from './client';

export interface ActivePlan {
    id: string;
    label: string;
    durationMonths: number;
    pricePerEmployee: number;
    discountPercent: number;
    active: boolean;
    sortOrder: number;
}

interface ListResponse<T> { data: T[] }

export async function listActivePlans(): Promise<ActivePlan[]> {
    const res = await apiClient.get<ListResponse<ActivePlan>>('/plans');
    return res.data;
}
