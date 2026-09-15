import { apiClient } from './client';

export interface RegisterCompanyPayload {
  companyName: string;
  ownerName: string;
  email: string;
  password: string;
  mobile: string;
  address?: string;
  state: string;
  city: string;
  pincode?: string;
  gstNumber?: string;
  employeeLimit: number;
}

interface RegisterResponse {
  data: {
    company: { id: string; name: string; subscriptionStatus: string; expiryDate: string | null };
    user: { id: string; name: string; email: string; role: string; companyId: string };
  };
}

/**
 * Registers this company + its first Admin user on the new Postgres
 * backend, in parallel with the existing Firestore registration flow in
 * register_company.tsx. Same "additive, non-blocking" pattern as
 * bridgeLogin() in authBridge.ts — if this fails, the Firestore-based
 * signup the person already completed is NOT rolled back; they just won't
 * show up in the SuperAdmin panel yet and bridgeLogin() will silently fail
 * for them on next login, same as any other not-yet-migrated account.
 *
 * IMPORTANT: this call is independent of the Firestore company doc — it
 * creates its OWN Postgres company row with its own UUID, unrelated to the
 * Firestore `COMP-<timestamp>` id. Nothing in this phase links the two
 * (SubscriptionScreen.tsx still uses the Firestore id) — that reconciliation
 * is a later migration step, not part of this call.
 */
export async function registerCompanyOnBackend(payload: RegisterCompanyPayload) {
  const res = await apiClient.post<RegisterResponse>('/companies/register', payload);
  return res.data;
}
