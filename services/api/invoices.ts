import { apiClient } from './client';

// GST tax invoices for plan purchases.
export interface InvoiceLine { description: string; sac: string | null; amount: number }

export interface InvoiceSeller {
    legalName: string;
    tradeName: string | null;
    gstin: string;
    address: string;
    stateName: string;
    stateCode: string;
    sacCode: string | null;
    email: string | null;
    phone: string | null;
    footerNote: string | null;
}

export interface InvoiceSummary {
    id: string;
    invoiceNo: string;
    invoiceDate: string;
    total: number;
    taxableAmount: number;
    gstPercent: number;
    employees: number;
    periodTo: string;
    paymentMethod: string;
    buyerName: string;
    subscriptionRequestId: string;
    companyId: string;
}

export interface Invoice extends InvoiceSummary {
    fy: string;
    seller: InvoiceSeller;
    buyerGstin: string | null;
    buyerAddress: string | null;
    buyerStateName: string | null;
    buyerStateCode: string | null;
    lines: InvoiceLine[];
    periodFrom: string | null;
    interState: boolean;
    cgst: number;
    sgst: number;
    igst: number;
    paymentRef: string | null;
}

interface One<T> { data: T }
interface List<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } }

// Prisma DECIMAL arrives as a string.
const num = (v: unknown) => Number(v) || 0;
function normalize<T extends InvoiceSummary>(i: T): T {
    const x: any = { ...i, total: num(i.total), taxableAmount: num(i.taxableAmount), gstPercent: num(i.gstPercent) };
    if ('cgst' in i) {
        x.cgst = num((i as any).cgst); x.sgst = num((i as any).sgst); x.igst = num((i as any).igst);
        x.lines = ((i as any).lines || []).map((l: InvoiceLine) => ({ ...l, amount: num(l.amount) }));
    }
    return x;
}

// ---- Company Admin (Plan & Renewal) ----
export async function listMyInvoices(page = 1, limit = 20) {
    const res = await apiClient.get<List<InvoiceSummary>>(`/subscription-requests/me/invoices?page=${page}&limit=${limit}`);
    return { items: res.data.map(normalize), total: res.meta.total, totalPages: res.meta.totalPages };
}

export async function getMyInvoice(id: string): Promise<Invoice> {
    const res = await apiClient.get<One<Invoice>>(`/subscription-requests/me/invoices/${id}`);
    return normalize(res.data);
}

// ---- SuperAdmin ----
export async function getInvoiceForPayment(subscriptionRequestId: string): Promise<Invoice> {
    const res = await apiClient.get<One<Invoice>>(`/superadmin/invoices/by-request/${subscriptionRequestId}`);
    return normalize(res.data);
}

export async function createInvoiceForPayment(subscriptionRequestId: string): Promise<Invoice> {
    const res = await apiClient.post<One<Invoice>>(`/superadmin/invoices/by-request/${subscriptionRequestId}`);
    return normalize(res.data);
}

export interface InvoiceSettings {
    legalName: string;
    tradeName: string | null;
    gstin: string;
    address: string;
    stateCode: string;
    stateName?: string;
    sacCode: string | null;
    invoicePrefix: string;
    email: string | null;
    phone: string | null;
    footerNote: string | null;
}

export async function fetchInvoiceSettings(): Promise<InvoiceSettings | null> {
    const res = await apiClient.get<One<InvoiceSettings | null>>('/superadmin/settings/invoice');
    return res.data;
}

export async function saveInvoiceSettings(payload: InvoiceSettings): Promise<InvoiceSettings> {
    const res = await apiClient.put<One<InvoiceSettings>>('/superadmin/settings/invoice', payload);
    return res.data;
}
