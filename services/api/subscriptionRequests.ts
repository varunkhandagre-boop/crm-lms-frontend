// 🔥 Phase 11: Subscription Requests API adapter (Postgres)
// Replaces Firestore "subscription_requests" collection.
// Covers two audiences:
//  - SuperAdmin review: superadmin-payments.tsx (list/approve/reject/delete)
//  - Company self-service: SubscriptionScreen.tsx ("I have paid" submission)
import { apiClient } from './client';

export type SubscriptionRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SubscriptionRequest {
    id: string;
    companyId: string;
    planId: string | null;
    planLabelSnapshot: string;
    modulesSnapshot: string[]; // 'sales' | 'service' | 'hr' — exactly what this request grants on approval
    employeesRequested: number;
    automationRequested: boolean;
    automationAmount: number | null;
    amountPaid: number;
    requestedExpiryDate: string;
    status: SubscriptionRequestStatus;
    paymentMethod?: 'MANUAL' | 'RAZORPAY' | 'WEBSITE'; // RAZORPAY / WEBSITE = activated automatically
    razorpayPaymentId?: string | null;
    approvedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
    // Present when the backend includes the related company (verify against
    // the actual API response — adjust field names here if they differ).
    company?: {
        id: string;
        name: string;
        city: string | null;
        gstNumber: string | null;
        ownerName: string | null;
        contactPhone: string | null;
    } | null;
}

interface OneResponse<T> { data: T }
interface ListResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } }

// ---- SuperAdmin side (superadmin-payments.tsx) -------------------------

export interface ListSubscriptionRequestsParams {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
}

function buildQuery(params: Record<string, any>): string {
    const parts = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return parts.length ? `?${parts.join('&')}` : '';
}

export async function listSubscriptionRequests(params: ListSubscriptionRequestsParams = {}): Promise<ListResponse<SubscriptionRequest>> {
    const query = buildQuery(params);
    return apiClient.get<ListResponse<SubscriptionRequest>>(`/superadmin/subscription-requests${query}`);
}

export async function approveSubscriptionRequest(id: string): Promise<SubscriptionRequest> {
    const res = await apiClient.post<OneResponse<SubscriptionRequest>>(`/superadmin/subscription-requests/${id}/approve`);
    return res.data;
}

export async function rejectSubscriptionRequest(id: string, reason: string): Promise<SubscriptionRequest> {
    const res = await apiClient.post<OneResponse<SubscriptionRequest>>(`/superadmin/subscription-requests/${id}/reject`, { reason });
    return res.data;
}

export async function deleteSubscriptionRequest(id: string): Promise<SubscriptionRequest> {
    const res = await apiClient.delete<OneResponse<SubscriptionRequest>>(`/superadmin/subscription-requests/${id}`);
    return res.data;
}

// ---- Company self-service side (SubscriptionScreen.tsx) ----------------

export interface SubmitSubscriptionRequestPayload {
    planId: string;
    employeesRequested: number;
    automationRequested?: boolean;
    amountPaid: number;
}

export async function submitSubscriptionRequest(payload: SubmitSubscriptionRequestPayload): Promise<SubscriptionRequest> {
    const res = await apiClient.post<OneResponse<SubscriptionRequest>>('/subscription-requests/me', payload);
    return res.data;
}

// ---- Pay Online: the server prices the plan and opens a Razorpay order;
// a verified payment activates the plan at once (no approval step). ------

export interface RenewalOrder {
    renewalId: string;
    amount: number;
    subtotal: number;
    gstPercent: number;
    gstAmount: number;
    planLabel: string;
    razorpay: {
        keyId: string;
        orderId: string;
        amount: number; // paise
        currency: string;
        name: string;
        description: string;
        image?: string;
        color?: string;
        prefill: { name: string; email: string; contact: string };
    };
}

export async function createRenewalOrder(payload: { planId: string; employeesRequested: number; automationRequested: boolean }): Promise<RenewalOrder> {
    const res = await apiClient.post<OneResponse<RenewalOrder>>('/subscription-requests/me/online-order', payload);
    return res.data;
}

export interface RenewalResult {
    planName: string | null;
    expiryDate: string | null;
    employeeLimit: number;
    paymentId: string;
}

export async function verifyRenewal(payload: {
    renewalId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string;
}): Promise<RenewalResult> {
    // Generous timeout: the server also confirms the payment with Razorpay.
    const res = await apiClient.post<OneResponse<RenewalResult>>('/subscription-requests/me/online-verify', payload, { timeoutMs: 90_000 });
    return res.data;
}
