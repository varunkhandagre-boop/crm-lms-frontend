import * as SecureStore from 'expo-secure-store';

// Point this at your machine's LAN IP when testing on a physical device
// (localhost only works in an iOS simulator / Android emulator on the same
// machine). e.g. EXPO_PUBLIC_API_URL=http://192.168.1.5:4000
// Once deployed, this becomes your Railway URL.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

const TOKEN_KEY = 'backend_jwt';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

interface ApiErrorBody {
  message: string;
  code?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  constructor(status: number, error: ApiErrorBody) {
    // Fold field-level validation errors into the message so Alert.alert(...)
    // and console logs actually show *what* was invalid, not just "Validation failed".
    const detail = error.fieldErrors
      ? Object.entries(error.fieldErrors)
          .filter(([, msgs]) => msgs && msgs.length)
          .map(([field, msgs]) => `${field}: ${msgs!.join(', ')}`)
          .join(' | ')
      : undefined;
    super(detail ? `${error.message} — ${detail}` : error.message);
    this.status = status;
    this.code = error.code;
    this.fieldErrors = error.fieldErrors;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  // 204 No Content (DELETE) has no body to parse
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));

  if (!res.ok) {
    // Log the full error (incl. fieldErrors) to Metro so it's visible during
    // development, even where the calling screen only shows err.message.
    console.log(`[API ${options.method || 'GET'} ${path}] ${res.status}`, body.error || body);
    throw new ApiRequestError(res.status, body.error || { message: 'Request failed' });
  }

  return body as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
