import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl;
const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
const configuredUrl = typeof configuredApiUrl === 'string' ? configuredApiUrl.trim() : '';
// 10.0.2.2 is only valid inside an Android emulator. Prefer the host that
// Expo is already using so a physical device reaches the same dev machine.
const isEmulatorHost = /^https?:\/\/10\.0\.2\.2(?::3000)?\/?$/i.test(configuredUrl);
const API_URL = (configuredUrl && !(isEmulatorHost && expoHost)
  ? configuredUrl
  // On web, reach the backend on the same host that served the page so a phone
  // browser on the LAN does not try to call its own localhost.
  : Platform.OS === 'web' ? `http://${typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost'}:3000`
  : `http://${expoHost || (Platform.OS === 'android' ? '10.0.2.2' : 'localhost')}:3000`).replace(/\/$/, '');
const ACCESS_KEY = 'taskvyn.access-token';
const REFRESH_KEY = 'taskvyn.refresh-token';
const REQUEST_TIMEOUT_MS = 15_000;

// A fetch to an unreachable host can hang indefinitely on mobile networks,
// which left the sign-in button permanently busy. Always bound requests.
async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); }
}

type Tokens = { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number };
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function apiBaseUrl() { return API_URL; }

async function get(key: string): Promise<string | null> {
  if (Platform.OS === 'web') { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); } catch { return null; } }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}
async function set(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); return; } catch { throw new Error('Browser storage is unavailable.'); } }
  await SecureStore.setItemAsync(key, value);
}
async function remove(key: string): Promise<void> {
  if (Platform.OS === 'web') { try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); return; } catch { return; } }
  await SecureStore.deleteItemAsync(key);
}

export async function saveTokens(tokens: Tokens) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  await Promise.all([set(ACCESS_KEY, tokens.accessToken), set(REFRESH_KEY, tokens.refreshToken)]);
}

export async function clearTokens() {
  accessToken = refreshToken = null;
  await Promise.all([remove(ACCESS_KEY), remove(REFRESH_KEY)]);
}

async function loadTokens() {
  if (!accessToken) accessToken = await get(ACCESS_KEY);
  if (!refreshToken) refreshToken = await get(REFRESH_KEY);
}

async function rotateTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      await loadTokens();
      if (!refreshToken) return false;
      try {
        const response = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
        });
        // Only a rejected refresh token ends the session; transient errors keep it.
        if (response.status === 401) { await clearTokens(); return false; }
        if (!response.ok) return false;
        await saveTokens(await response.json() as Tokens);
        return true;
      } catch { return false; }
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}

export async function api<T>(path: string, options: RequestInit = {}, authenticated = false): Promise<T> {
  const send = async () => {
    await loadTokens();
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    if (authenticated && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetchWithTimeout(`${API_URL}${path}`, { ...options, headers });
  };
  let response: Response;
  try {
    response = await send();
  } catch {
    throw new ApiError(`Cannot reach Taskvyn API at ${API_URL}. Set EXPO_PUBLIC_API_URL to the backend address reachable from this device.`, 0);
  }
  if (authenticated && response.status === 401 && await rotateTokens()) response = await send();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.message === 'string' ? body.message : Array.isArray(body.message) ? body.message.join('\n') : 'Request failed. Please try again.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export const authApi = {
  signup: (input: { name: string; email: string; password: string }) => api<{ message: string; email: string }>('/auth/signup', { method: 'POST', body: JSON.stringify(input) }),
  verifyEmail: (input: { email: string; code: string }) => api<Tokens>('/auth/verify-email', { method: 'POST', body: JSON.stringify(input) }),
  resendOtp: (input: { email: string; purpose: 'verification' | 'password-reset' }) => api<{ message: string }>('/auth/resend-otp', { method: 'POST', body: JSON.stringify(input) }),
  signin: (input: { email: string; password: string }) => api<Tokens>('/auth/signin', { method: 'POST', body: JSON.stringify(input) }),
  google: (input: { idToken: string }) => api<Tokens>('/auth/google', { method: 'POST', body: JSON.stringify(input) }),
  forgotPassword: (email: string) => api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (input: { email: string; code: string; password: string }) => api<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(input) }),
  me: () => api<{ id: string; name: string; email: string; avatarUrl?: string | null; isEmailVerified: boolean }>('/auth/me', {}, true),
  logout: async () => {
    await loadTokens();
    const token = refreshToken;
    if (token) await fetchWithTimeout(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) }).catch(() => undefined);
    await clearTokens();
  },
};

export async function hasStoredSession() {
  await loadTokens();
  return Boolean(accessToken || refreshToken);
}
