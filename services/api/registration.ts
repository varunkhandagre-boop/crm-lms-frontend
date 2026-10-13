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

/** Registers a company + its first Admin user (7-day free trial). Throws with the server's message on failure. */
export async function registerCompanyOnBackend(payload: RegisterCompanyPayload) {
  const res = await apiClient.post<RegisterResponse>('/companies/register', payload);
  return res.data;
}
