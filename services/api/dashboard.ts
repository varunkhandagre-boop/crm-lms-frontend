// 🔥 Dashboard summary API adapter (Postgres)
// Replaces dashboard.tsx's old pattern of fetching leads/orders/tasks/
// couriers/service-calls/sales-visits/attendance in full and reducing them
// client-side — the backend now computes all counts/sums/breakdowns via
// SQL (see dashboard.service.ts), matching migration priority #1.
import { apiClient } from './client';

export interface LeadActionCounts {
    overdue: number;
    dueToday: number;
    hot: number;
}

export interface DashboardFinancials {
    fyLabel: string;
    totalSales: number;
    marketOutstanding: number;
    recoveryThisMonth: number;
}

export interface DashboardAttendance {
    todayCount: number;
    myStatus: 'not_marked' | 'checked_in' | 'checked_out';
}

export interface DashboardTasks {
    mine: number;
    assignedByMe: number;
    total: number;
}

export interface DashboardOps {
    pendingCourier: number;
    openService: number;
}

export interface DashboardFollowUps {
    activeVisits: number;
    activeLeads: number;
    total: number;
}

export interface TopDue {
    orgName: string;
    dueDate: string;
    amount: number;
}

export interface DashboardCharts {
    monthLabels: string[];
    monthlySales: number[];       // in ₹K, 6 entries oldest→newest
    monthlyCollection: number[];  // in ₹K
    monthlyServiceTickets: number[];
    orderStatusBreakdown: { status: string; count: number }[];
    leadStatusBreakdown: { status: string; count: number }[];
}

export interface DashboardSummary {
    isAdmin: boolean;
    leadActionCounts: LeadActionCounts;
    financials: DashboardFinancials;
    attendance: DashboardAttendance;
    tasks: DashboardTasks;
    ops: DashboardOps;
    followUps: DashboardFollowUps;
    topDues: TopDue[];
    charts: DashboardCharts;
}

interface OneResponse<T> { data: T }

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
    const res = await apiClient.get<OneResponse<DashboardSummary>>('/dashboard/summary');
    return res.data;
}
