// 🔥 Phase 10: Organizations API adapter (Postgres) — replaces Firestore
// "organizations" collection. Renaming an org now cascades server-side into
// 8 other already-migrated tables in one transaction (see organization.service.ts)
// — the old client-side Firestore batch-write for this is gone entirely.
import { apiClient } from "./client";

export interface LegacyOrganization {
  id: string;
  name: string;
  orgName: string; // alias some screens read
  type: string;
  beds: string;
  address1: string;
  address: string; // alias
  address2: string;
  city: string;
  state: string;
  district: string;
  pincode: string;
  country: string;
  salutation: string;
  firstName: string;
  lastName: string;
  contactPerson: string;
  designation: string;
  mobile: string;
  phone: string;
  email: string;
  territory: string;
  gstNumber: string;
  dob: string;         // YYYY-MM-DD
  anniversary: string; // YYYY-MM-DD
  equipment: Record<string, number>;
  createdAt: string;
}

interface ListResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number }; }
interface OneResponse<T> { data: T; }

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function toLegacyOrganization(o: any): LegacyOrganization {
  return {
    id: o.id,
    name: o.name,
    orgName: o.name,
    type: o.type ?? '',
    beds: o.beds ?? '',
    address1: o.address1 ?? '',
    address: o.address1 ?? '',
    address2: o.address2 ?? '',
    city: o.city ?? '',
    state: o.state ?? '',
    district: o.district ?? '',
    pincode: o.pincode ?? '',
    country: o.country ?? 'India',
    salutation: o.salutation ?? '',
    firstName: o.firstName ?? '',
    lastName: o.lastName ?? '',
    contactPerson: o.contactPerson ?? '',
    designation: o.designation ?? '',
    mobile: o.mobile ?? '',
    phone: o.phone ?? '',
    email: o.email ?? '',
    territory: o.territory ?? '',
    gstNumber: o.gstNumber ?? '',
    dob: (o.dob || '').slice(0, 10),
    anniversary: (o.anniversary || '').slice(0, 10),
    equipment: o.equipment ?? { ventilator: 0, anesthesia: 0, bubble: 0, compressor: 0, monitor: 0 },
    createdAt: o.createdAt,
  };
}


export async function fetchOrganizations(opts: { search?: string; limit?: number } = {}): Promise<LegacyOrganization[]> {
  if (opts.limit !== undefined) {
    const qs = buildQuery({ search: opts.search, limit: opts.limit });
    const res = await apiClient.get<ListResponse<any>>(`/organizations${qs}`);
    return (res.data ?? []).map(toLegacyOrganization);
  }
  const all: any[] = [];
  let page = 1;
  const MAX_PAGES = 100;
  while (page <= MAX_PAGES) {
    const qs = buildQuery({ search: opts.search, limit: 500, page });
    const res = await apiClient.get<ListResponse<any>>(`/organizations${qs}`);
    all.push(...(res.data ?? []));
    if (page >= res.meta.totalPages) break;
    page++;
  }
  return all.map(toLegacyOrganization);
}

export interface OrganizationPayload {
  name: string;
  type?: string;
  beds?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  district?: string;
  pincode?: string;
  country?: string;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  designation?: string;
  mobile: string;
  phone?: string;
  email?: string;
  territory?: string;
  gstNumber?: string;
  dob?: string;         // YYYY-MM-DD
  anniversary?: string; // YYYY-MM-DD
  equipment?: Record<string, number>;
}

export async function createOrganization(payload: OrganizationPayload) {
  const res = await apiClient.post<OneResponse<any>>(`/organizations`, payload);
  return { success: true, id: res.data?.id, record: toLegacyOrganization(res.data) };
}

export async function updateOrganization(id: string, payload: Partial<OrganizationPayload>) {
  const res = await apiClient.patch<OneResponse<any>>(`/organizations/${id}`, payload);
  return { success: true, record: toLegacyOrganization(res.data) };
}

export async function deleteOrganization(id: string) {
  await apiClient.delete(`/organizations/${id}`);
  return { success: true };
}
