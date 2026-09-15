// 🔥 Home summary API adapter (Postgres)
// Replaces index.tsx's old pattern of fetching tasks/leads/pms/dues/
// couriers/services/sales/attendance/leaves/expenses/advances/orders/cards/
// installs/demos/payments in full and reducing them client-side — the
// backend now computes every badge count via SQL (see homeSummary.service.ts).
import { apiClient } from './client';

export interface HomeSummary {
    isBoss: boolean;
    isHRBoss: boolean;
    isLogistics: boolean;
    taskCount: number;
    dueCount: number;
    courierCount: number;
    serviceCount: number;
    pmsDueCount: number;
    leadCount: number;           // leads due today
    installCount: number;        // installations today
    demoCount: number;           // demos today
    paymentCount: number;        // payment collections today
    salesFollowUpCount: number;  // visits + leads due today
    leaveCount: number;
    expenseCount: number;
    advanceCount: number;
    orderCount: number;
    cardCount: number;
    attendanceStatus: 'not_marked' | 'checked_in' | 'checked_out';
}

interface OneResponse<T> { data: T }

export async function fetchHomeSummary(): Promise<HomeSummary> {
    const res = await apiClient.get<OneResponse<HomeSummary>>('/home/summary');
    return res.data;
}
