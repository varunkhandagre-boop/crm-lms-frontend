import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, clearToken, setToken } from './client';

export interface BridgeUser {
  id: string;
  name: string;
  email: string;
  role: string;       // raw UserRole enum (ADMIN, MANAGER, FIELD_USER, ...)
  legacyRole: string;  // granular display role the rest of the app checks against (Admin, Sales Executive, Service Engineer, ...)
  companyId: string;
  empId: string | null;
  mobile: string | null;
  profileImage: string | null;
}

interface LoginResponse {
  data: {
    token: string;
    user: BridgeUser;
  };
}

const POSTGRES_USER_KEY = 'postgresUser';

/**
 * Logs in. Stores the JWT (for API calls) and the user (for session restore
 * on the next app start). Throws on a wrong password (status 401) or a
 * network error.
 */
export async function bridgeLogin(email: string, password: string): Promise<BridgeUser> {
  const res = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  await setToken(res.data.token);
  await AsyncStorage.setItem(POSTGRES_USER_KEY, JSON.stringify(res.data.user));
  return res.data.user;
}

export async function bridgeLogout() {
  await clearToken();
  await AsyncStorage.removeItem(POSTGRES_USER_KEY);
}

/**
 * Reads back the last-stored Postgres user for cold-start restore. Trusts
 * the locally-stored JWT is still valid (no refresh/expiry check here) —
 * if it's expired, the first API call will 401 and existing error handling
 * takes over from there.
 */
export async function getStoredPostgresUser(): Promise<BridgeUser | null> {
  try {
    const raw = await AsyncStorage.getItem(POSTGRES_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
