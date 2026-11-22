/**
 * Errors thrown by apps. The execution engine decides retry behaviour from the class,
 * never from app-specific status codes.
 */
export abstract class IntegrationError extends Error {
  abstract readonly retryable: boolean;
  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
  }
}

/** Temporary failure (network, 5xx, timeouts). Retried with backoff. */
export class TransientIntegrationError extends IntegrationError {
  readonly retryable = true;
}

/** Provider asked us to slow down. Retried with backoff. */
export class RateLimitError extends IntegrationError {
  readonly retryable = true;
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
  }
}

/** Bad input or a request the provider will never accept. Not retried. */
export class PermanentIntegrationError extends IntegrationError {
  readonly retryable = false;
}

/** Credentials are revoked or missing scopes. Not retried; the user must reconnect. */
export class AuthRequiredError extends IntegrationError {
  readonly retryable = false;
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof IntegrationError) return error.retryable;
  // Unknown errors (bugs, driver hiccups) get a bounded number of retries.
  return true;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return 'Unknown error';
}
