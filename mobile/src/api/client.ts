import Constants from 'expo-constants';
import { deleteSecure, getSecure, setSecure } from '../lib/secureStorage';
import type { Tokens } from './types';

/**
 * The API base URL is public configuration (not a secret). Set
 * EXPO_PUBLIC_API_URL in mobile/.env, e.g. http://192.168.1.20:4000/api/v1 for
 * a physical device on your Wi-Fi, or your Render URL in production.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://10.0.2.2:4000/api/v1'; // Android emulator → host machine

const REFRESH_KEY = 'skillsprint.refreshToken';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.code === 'NETWORK_ERROR';
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export const session = {
  setOnExpired(fn: () => void) {
    onSessionExpired = fn;
  },
  async save(tokens: Tokens) {
    accessToken = tokens.accessToken;
    await setSecure(REFRESH_KEY, tokens.refreshToken);
  },
  async clear() {
    accessToken = null;
    await deleteSecure(REFRESH_KEY);
  },
  getRefreshToken: () => getSecure(REFRESH_KEY),
  hasAccessToken: () => Boolean(accessToken),
};

async function rawFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach SkillSprint. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

/** Single-flight refresh: concurrent 401s share one rotation request. */
export async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = await getSecure(REFRESH_KEY);
    if (!refreshToken) return false;
    const res = await rawFetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      if (res.status === 401) await session.clear();
      return false;
    }
    const json = await res.json();
    await session.save(json.data.tokens);
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; meta?: Record<string, number> }> {
  const { method = 'GET', body, auth = true, timeoutMs } = opts;
  const doFetch = () =>
    rawFetch(path, {
      method,
      timeoutMs,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  if (auth && !accessToken) await refreshSession();
  let res = await doFetch();
  if (res.status === 401 && auth) {
    const refreshed = await refreshSession();
    if (refreshed) res = await doFetch();
    else {
      onSessionExpired?.();
    }
  }

  let json: { success?: boolean; data?: T; meta?: Record<string, number>; error?: { code: string; message: string; details?: unknown } } = {};
  try {
    json = await res.json();
  } catch {
    // Non-JSON (e.g. a proxy error page)
  }
  if (!res.ok || json.success === false) {
    throw new ApiError(
      res.status,
      json.error?.code ?? 'HTTP_ERROR',
      json.error?.message ?? `Request failed (${res.status})`,
      json.error?.details,
    );
  }
  return { data: json.data as T, meta: json.meta };
}

export const api = {
  get: <T>(path: string) => request<T>(path).then((r) => r.data),
  getPage: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'POST', body: body ?? {} }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }).then((r) => r.data),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }).then((r) => r.data),
};
