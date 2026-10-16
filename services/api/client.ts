import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { appVersionHeaders } from '../../utils/appVersion';

// Point this at your machine's LAN IP when testing on a physical device
// (localhost only works in an iOS simulator / Android emulator on the same
// machine). e.g. EXPO_PUBLIC_API_URL=http://192.168.1.5:4000
// Once deployed, this becomes your Railway URL.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

const TOKEN_KEY = 'backend_jwt';

// SecureStore has no web version; the browser keeps the login token in localStorage.
const isWeb = Platform.OS === 'web';
const webStore = {
  get: () => { try { return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null; } catch { return null; } },
  set: (v: string) => { try { globalThis.localStorage?.setItem(TOKEN_KEY, v); } catch { /* private mode */ } },
  clear: () => { try { globalThis.localStorage?.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

export async function getToken(): Promise<string | null> {
  return isWeb ? webStore.get() : SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (isWeb) webStore.set(token);
  else await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (isWeb) webStore.clear();
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

interface ApiErrorBody {
  message: string;
  code?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  storeUrl?: string | null; // APP_UPDATE_REQUIRED only
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

// Session / plan problems any screen can hit — DataContext logs out on an
// expired session and shows the "Plan expired" screen for a locked company.
export type AuthProblem = 'SESSION_EXPIRED' | 'SUBSCRIPTION_EXPIRED' | 'COMPANY_SUSPENDED';
let authProblemListener: ((problem: AuthProblem, message: string) => void) | null = null;
export function onAuthProblem(listener: (problem: AuthProblem, message: string) => void): () => void {
  authProblemListener = listener;
  return () => { if (authProblemListener === listener) authProblemListener = null; };
}

// The server answers 426 APP_UPDATE_REQUIRED when this build is older than the
// minimum version — components/AppUpdateGate shows the Update screen.
export interface UpdateRequired { message: string; storeUrl: string | null }
let updateRequiredListener: ((info: UpdateRequired) => void) | null = null;
export function onUpdateRequired(listener: (info: UpdateRequired) => void): () => void {
  updateRequiredListener = listener;
  return () => { if (updateRequiredListener === listener) updateRequiredListener = null; };
}

// Generous by default (uploads, exports, OCR); Day In / Day Out pass a shorter one.
const DEFAULT_TIMEOUT_MS = 60_000;

export interface RequestOpts { timeoutMs?: number }

async function request<T>(path: string, options: RequestInit = {}, opts: RequestOpts = {}): Promise<T> {
  const token = await getToken();

  // Without a timeout a weak network kept the spinner going for minutes.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...appVersionHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    // status 0 = never reached the server (no internet / timed out)
    throw controller.signal.aborted
      ? new ApiRequestError(0, { message: 'The server took too long to answer. Check your internet and try again.', code: 'TIMEOUT' })
      : new ApiRequestError(0, { message: 'Could not reach the server. Check your internet and try again.', code: 'NETWORK' });
  } finally {
    clearTimeout(timer);
  }

  // 204 No Content (DELETE) has no body to parse
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));

  if (!res.ok) {
    // Log the full error (incl. fieldErrors) to Metro so it's visible during
    // development, even where the calling screen only shows err.message.
    console.log(`[API ${options.method || 'GET'} ${path}] ${res.status}`, body.error || body);
    const error: ApiErrorBody = body.error || { message: 'Request failed' };
    if (res.status === 401 && token && !path.startsWith('/auth/login')) {
      authProblemListener?.('SESSION_EXPIRED', error.message);
    } else if (res.status === 403 && (error.code === 'SUBSCRIPTION_EXPIRED' || error.code === 'COMPANY_SUSPENDED')) {
      authProblemListener?.(error.code, error.message);
    } else if (res.status === 426 && error.code === 'APP_UPDATE_REQUIRED') {
      updateRequiredListener?.({ message: error.message, storeUrl: error.storeUrl ?? null });
    }
    throw new ApiRequestError(res.status, error);
  }

  return body as T;
}

export const apiClient = {
  get: <T>(path: string, opts?: RequestOpts) => request<T>(path, { method: 'GET' }, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }, opts),
  put: <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }, opts),
  delete: <T>(path: string, opts?: RequestOpts) => request<T>(path, { method: 'DELETE' }, opts),
};
