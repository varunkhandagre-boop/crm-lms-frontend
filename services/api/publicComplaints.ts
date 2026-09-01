// Unauthenticated client for the public Customer Complaint form
// (complaint.tsx). Does NOT use apiClient (which always attaches a JWT) —
// this hits a public, no-auth backend route instead.
//
// IMPORTANT: the old screen never carried a companyId anywhere (it only
// used useSaaSDB, not useData/currentUser), so there was no way to tell
// which company a submission belongs to. This adapter requires a
// companyId to be passed in explicitly — wire it in from wherever this
// screen is actually linked/embedded from (e.g. a route param on the
// shared/embedded URL). Submissions will fail with a clear error until
// that's done.

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export interface PublicComplaintPayload {
  hospitalName: string;
  contactPerson?: string;
  mobile: string;
  machine?: string;
  serialNo?: string;
  issue: string;
}

export async function submitPublicComplaint(companyId: string, payload: PublicComplaintPayload): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v1/public/companies/${companyId}/complaints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || 'Could not submit your request.');
  }
}
