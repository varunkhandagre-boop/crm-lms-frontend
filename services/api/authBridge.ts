import { apiClient, setToken, clearToken } from './client';

interface LoginResponse {
  data: {
    token: string;
    user: { id: string; name: string; email: string; role: string; companyId: string };
  };
}

/**
 * Call this right after your existing Firebase signInWithEmailAndPassword
 * succeeds, with the SAME email/password the person typed. It logs into
 * the new backend too and stores its JWT, so leads.tsx / add_lead.tsx /
 * lead_details.tsx can call the new API.
 *
 * IMPORTANT (Phase 1 limitation): this only works for users that already
 * have a matching row in the new Postgres `users` table (currently just
 * the seeded demo accounts). Real staff accounts get migrated into
 * Postgres in a later step — until then, this silently fails for them
 * and they simply won't see data on the leads screens yet, everything
 * else in the app keeps working on Firebase as before.
 */
export async function bridgeLogin(email: string, password: string) {
  try {
    const res = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    await setToken(res.data.token);
    return res.data.user;
  } catch (err) {
    console.warn('Backend API login failed (leads screens will show no data for this user):', err);
    return null;
  }
}

export async function bridgeLogout() {
  await clearToken();
}
