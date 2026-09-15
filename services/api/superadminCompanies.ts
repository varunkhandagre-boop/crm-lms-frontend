// 🔥 Phase 11: SuperAdmin Companies API adapter (Postgres)
// Replaces Firestore "companies" collection used by super_admin.tsx.
//
// Note on subscription lifecycle: companies now get subscriptionStatus =
// TRIAL automatically at registration (registerCompanySchema) — there is no
// "pending approval" state anymore, unlike the old Firestore flow. The
// status-update endpoint only accepts ACTIVE/SUSPENDED (an admin manually
// toggling access), not TRIAL/EXPIRED — those are set by the system.
import { apiClient, getToken } from './client';

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
export type StatusFilter = 'ALL' | SubscriptionStatus | 'EXPIRING_SOON';

export interface Company {
    id: string;
    name: string;
    subscriptionStatus: SubscriptionStatus;
    employeeLimit: number;
    planName: string | null;
    expiryDate: string | null; // ISO
    ownerName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    city: string | null;
    state: string | null;
    gstNumber: string | null;
    website: string | null;
    automationAddonEnabled: boolean;
    createdAt: string;
}

export interface CompanyStats {
    total: number;
    active: number;
    expiringSoon: number;
    expired: number;
    automationActive: number;
}

export interface UsageAnalyticsRow {
    companyId: string;
    name: string;
    city: string | null;
    thisMonth: number;
    prevMonth: number;
}

interface OneResponse<T> { data: T }
interface ListResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } }

export interface ListCompaniesParams {
    page?: number;
    limit?: number;
    search?: string;
    status?: StatusFilter;
    automationOnly?: boolean;
    sort?: 'createdAt_desc' | 'createdAt_asc' | 'name_asc';
}

function buildQuery(params: Record<string, any>): string {
    const parts = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return parts.length ? `?${parts.join('&')}` : '';
}

export async function listCompanies(params: ListCompaniesParams = {}): Promise<ListResponse<Company>> {
    const query = buildQuery(params);
    return apiClient.get<ListResponse<Company>>(`/superadmin/companies${query}`);
}

export async function getCompanyStats(): Promise<CompanyStats> {
    const res = await apiClient.get<OneResponse<CompanyStats>>('/superadmin/companies/stats');
    return res.data;
}

export interface UsageAnalyticsResponse {
    month: string;
    companies: UsageAnalyticsRow[];
    totalOpens: number;
    activeToday: number;
    activeThisWeek: number;
    mostActive: UsageAnalyticsRow | null;
}

export async function getUsageAnalytics(month?: string): Promise<UsageAnalyticsResponse> {
    const query = buildQuery({ month });
    const res = await apiClient.get<OneResponse<UsageAnalyticsResponse>>(`/superadmin/companies/analytics/usage${query}`);
    return res.data;
}

export async function getCompany(id: string): Promise<Company> {
    const res = await apiClient.get<OneResponse<Company>>(`/superadmin/companies/${id}`);
    return res.data;
}

export async function updateCompanyStatus(id: string, subscriptionStatus: 'ACTIVE' | 'SUSPENDED'): Promise<Company> {
    const res = await apiClient.patch<OneResponse<Company>>(`/superadmin/companies/${id}/status`, { subscriptionStatus });
    return res.data;
}

export async function extendCompany(id: string, days: 7 | 30 | 365): Promise<Company> {
    const res = await apiClient.patch<OneResponse<Company>>(`/superadmin/companies/${id}/extend`, { days });
    return res.data;
}

export async function updateEmployeeLimit(id: string, employeeLimit: number): Promise<Company> {
    const res = await apiClient.patch<OneResponse<Company>>(`/superadmin/companies/${id}/employee-limit`, { employeeLimit });
    return res.data;
}

export async function updateAutomationAddon(id: string, enabled: boolean): Promise<Company> {
    const res = await apiClient.patch<OneResponse<Company>>(`/superadmin/companies/${id}/automation-addon`, { enabled });
    return res.data;
}

// CSV export — the backend returns raw CSV text (not JSON), so this bypasses
// apiClient and does its own authenticated fetch.
export async function fetchCompaniesExportCsv(params: ListCompaniesParams = {}): Promise<string> {
    const token = await getToken();
    const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
    const query = buildQuery(params);
    const res = await fetch(`${API_BASE_URL}/api/v1/superadmin/companies/export${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Could not export companies list.');
    return res.text();
}
