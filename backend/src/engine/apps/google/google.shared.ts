import { createHash } from 'node:crypto';
import { PermanentIntegrationError } from '../../core/errors';

export const GOOGLE_PROVIDER = 'google';

export const GOOGLE_SCOPES = {
  gmailRead: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailSend: 'https://www.googleapis.com/auth/gmail.send',
  sheets: 'https://www.googleapis.com/auth/spreadsheets',
  calendarRead: 'https://www.googleapis.com/auth/calendar.readonly',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  drive: 'https://www.googleapis.com/auth/drive',
  formsBody: 'https://www.googleapis.com/auth/forms.body',
  formsResponses: 'https://www.googleapis.com/auth/forms.responses.readonly',
} as const;

/** Accepts either a bare id or a Google URL containing `/d/<id>`. */
export function extractGoogleId(value: unknown, label: string): string {
  const text = String(value ?? '').trim();
  const fromUrl = /\/d\/(?!e\/)([a-zA-Z0-9_-]{10,})/.exec(text)?.[1];
  const id = fromUrl ?? text;
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) throw new PermanentIntegrationError(`${label} is not a valid id or URL`);
  return id;
}

/** Escapes a value for a Drive `q` string literal. */
export function driveQueryLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Short deterministic token derived from the engine idempotency key. */
export function idempotencyToken(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

export function sinceDays(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
