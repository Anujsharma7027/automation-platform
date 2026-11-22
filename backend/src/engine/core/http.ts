import { AuthContext } from './integration.types';
import {
  AuthRequiredError, PermanentIntegrationError, RateLimitError, TransientIntegrationError,
} from './errors';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface AuthorizedRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body. */
  json?: unknown;
  /** Raw body (for multipart uploads). Takes precedence over `json`. */
  body?: string | Buffer;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Bearer-authenticated JSON request shared by every OAuth app. Maps HTTP failures to
 * engine error classes and retries once with a fresh token on 401.
 */
export async function authorizedRequest<T>(auth: AuthContext, url: string, request: AuthorizedRequest = {}): Promise<T> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== '') target.searchParams.set(key, String(value));
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await auth.getAccessToken({ forceRefresh: attempt > 0 });
    let response: Response;
    try {
      response = await fetch(target, {
        method: request.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(request.json !== undefined && request.body === undefined ? { 'Content-Type': 'application/json' } : {}),
          ...request.headers,
        },
        body: typeof request.body === 'string' ? request.body
          : request.body ? new Uint8Array(request.body)
            : request.json !== undefined ? JSON.stringify(request.json) : undefined,
        signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch {
      throw new TransientIntegrationError(`Could not reach ${target.host}`);
    }

    if (response.status === 401 && attempt === 0) continue;
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return (text ? JSON.parse(text) : {}) as T;
    }
    throw await toIntegrationError(response, target.host);
  }
  throw new AuthRequiredError('The connected account is no longer authorized. Reconnect it.');
}

async function toIntegrationError(response: Response, host: string) {
  const message = await providerMessage(response);
  const text = `${host} responded ${response.status}${message ? `: ${message}` : ''}`;
  if (response.status === 401) return new AuthRequiredError(text);
  if (response.status === 403 && /insufficient|scope|permission/i.test(message)) return new AuthRequiredError(text);
  if (response.status === 429 || (response.status === 403 && /rate|quota/i.test(message))) {
    const retryAfter = Number(response.headers.get('retry-after'));
    return new RateLimitError(text, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  if (response.status >= 500 || response.status === 408) return new TransientIntegrationError(text);
  return new PermanentIntegrationError(text);
}

async function providerMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string; error_description?: string; message?: string };
    const message = typeof body.error === 'object' ? body.error?.message : body.error_description ?? body.message ?? body.error;
    return typeof message === 'string' ? message.slice(0, 500) : '';
  } catch {
    return '';
  }
}
