// 🔥 Phase 10: Company profile API adapter (Postgres) — replaces Firestore
// "company_profile" + "companies" collections.
import { apiClient } from "./client";

export interface LegacyCompanyProfile {
  id: string;
  companyName: string;
  shortName: string;
  tagline: string;
  address: string;   // combined "line, city, state - pincode" display string
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber: string;
  email: string;      // alias of contactEmail
  contactEmail: string;
  phone: string;       // alias of contactPhone
  contactPhone: string;
  mobile: string;      // alias of contactPhone
  landline: string;
  website: string;
  logoUrl: string;
  signatureUrl: string;
  qrCodeUrl: string;
  upiId: string;
  officeLatitude: number | null;
  officeLongitude: number | null;
  bankDetails1: { bankName: string; accountNo: string; ifsc: string; branch: string };
  bankDetails2: { bankName: string; accountNo: string; ifsc: string; branch: string };
  bank1_name: string; bank1_acc: string; bank1_ifsc: string; bank1_branch: string;
  bank2_name: string; bank2_acc: string; bank2_ifsc: string; bank2_branch: string;
  // Subscription
  plan: string;
  expiryDate: string | null; // ISO
  maxEmployees: number;
  currentEmployees: number;
  isActive: boolean;
}

interface OneResponse<T> { data: T; }

function toLegacyCompanyProfile(c: any): LegacyCompanyProfile {
  const fullAddress = `${c.addressLine || ''}, ${c.city || ''}, ${c.state || ''} - ${c.pincode || ''}`;
  return {
    id: c.id,
    companyName: c.name ?? '',
    shortName: c.shortName ?? '',
    tagline: c.tagline ?? '',
    address: fullAddress,
    addressLine: c.addressLine ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    pincode: c.pincode ?? '',
    gstNumber: c.gstNumber ?? '',
    email: c.contactEmail ?? '',
    contactEmail: c.contactEmail ?? '',
    phone: c.contactPhone ?? '',
    contactPhone: c.contactPhone ?? '',
    mobile: c.contactPhone ?? '',
    landline: c.landline ?? '',
    website: c.website ?? '',
    logoUrl: c.logoUrl ?? '',
    signatureUrl: c.signatureUrl ?? '',
    qrCodeUrl: c.qrCodeUrl ?? '',
    upiId: c.upiId ?? '',
    officeLatitude: c.officeLatitude ?? null,
    officeLongitude: c.officeLongitude ?? null,
    bankDetails1: { bankName: c.bank1Name ?? '', accountNo: c.bank1Acc ?? '', ifsc: c.bank1Ifsc ?? '', branch: c.bank1Branch ?? '' },
    bankDetails2: { bankName: c.bank2Name ?? '', accountNo: c.bank2Acc ?? '', ifsc: c.bank2Ifsc ?? '', branch: c.bank2Branch ?? '' },
    bank1_name: c.bank1Name ?? '', bank1_acc: c.bank1Acc ?? '', bank1_ifsc: c.bank1Ifsc ?? '', bank1_branch: c.bank1Branch ?? '',
    bank2_name: c.bank2Name ?? '', bank2_acc: c.bank2Acc ?? '', bank2_ifsc: c.bank2Ifsc ?? '', bank2_branch: c.bank2Branch ?? '',
    plan: c.planName ?? 'Free Trial',
    expiryDate: c.expiryDate ?? null,
    maxEmployees: c.employeeLimit ?? 10,
    currentEmployees: c.activeEmployeeCount ?? 0,
    isActive: c.subscriptionStatus === 'ACTIVE' || c.subscriptionStatus === 'TRIAL',
  };
}

export async function fetchCompanyProfile(): Promise<LegacyCompanyProfile> {
  const res = await apiClient.get<OneResponse<any>>(`/companies/me`);
  return toLegacyCompanyProfile(res.data);
}

export interface CompanyProfilePayload {
  companyName?: string;
  shortName?: string;
  tagline?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  landline?: string;
  website?: string;
  logoUrl?: string;
  signatureUrl?: string;
  qrCodeUrl?: string;
  upiId?: string;
  officeLatitude?: number;
  officeLongitude?: number;
  bank1Name?: string; bank1Acc?: string; bank1Ifsc?: string; bank1Branch?: string;
  bank2Name?: string; bank2Acc?: string; bank2Ifsc?: string; bank2Branch?: string;
}

export async function updateCompanyProfile(payload: CompanyProfilePayload) {
  const res = await apiClient.patch<OneResponse<any>>(`/companies/me`, payload);
  return { success: true, record: toLegacyCompanyProfile(res.data) };
}
