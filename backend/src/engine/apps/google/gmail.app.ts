import { AppDefinition, StepContext } from '../../core/integration.types';
import { authorizedRequest } from '../../core/http';
import { PermanentIntegrationError } from '../../core/errors';
import { GOOGLE_PROVIDER, GOOGLE_SCOPES } from './google.shared';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_HYDRATE = 10;

interface GmailPart { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[]; headers?: { name: string; value: string }[] }
interface GmailMessage { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GmailPart }

function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decode(data?: string): string {
  return data ? Buffer.from(data, 'base64url').toString('utf8') : '';
}

function collect(part: GmailPart | undefined, found: { text: string; html: string; attachments: { filename: string; mimeType: string; size: number }[] }) {
  if (!part) return found;
  if (part.filename && part.body?.attachmentId) {
    found.attachments.push({ filename: part.filename, mimeType: part.mimeType ?? '', size: part.body.size ?? 0 });
  } else if (part.mimeType === 'text/plain' && !found.text) found.text = decode(part.body?.data);
  else if (part.mimeType === 'text/html' && !found.html) found.html = decode(part.body?.data);
  part.parts?.forEach((child) => collect(child, found));
  return found;
}

export function toEmailData(message: GmailMessage): Record<string, unknown> {
  const body = collect(message.payload, { text: '', html: '', attachments: [] });
  const from = header(message, 'From');
  return {
    id: message.id,
    thread_id: message.threadId,
    from,
    from_email: /<([^>]+)>/.exec(from)?.[1] ?? from,
    to: header(message, 'To'),
    cc: header(message, 'Cc'),
    subject: header(message, 'Subject'),
    date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : header(message, 'Date'),
    snippet: message.snippet ?? '',
    body_plain: body.text.slice(0, 50_000),
    body_html: body.html.slice(0, 100_000),
    label_ids: message.labelIds ?? [],
    attachment_count: body.attachments.length,
    attachments: body.attachments,
  };
}

async function pollEmails(context: StepContext) {
  const query = [context.input.query, context.input.hasAttachment ? 'has:attachment' : ''].filter(Boolean).join(' ');
  const list = await authorizedRequest<{ messages?: { id: string }[] }>(context.auth, `${API}/messages`, {
    query: { maxResults: 25, q: query || undefined, labelIds: (context.input.labelId as string | undefined) ?? 'INBOX' },
  });
  const ids = (list.messages ?? []).map((item) => item.id);
  const unseen = ids.filter((id) => !context.isSeen?.(id)).slice(0, MAX_HYDRATE);
  const messages = await Promise.all(unseen.map((id) =>
    authorizedRequest<GmailMessage>(context.auth, `${API}/messages/${encodeURIComponent(id)}`, { query: { format: 'full' } })));
  const hydrated = new Map(messages.map((message) => [message.id, toEmailData(message)]));
  // Seen ids are still returned (without data) so the engine keeps its window accurate.
  return ids.map((id) => ({ id, data: hydrated.get(id) ?? { id } })).filter((item) => hydrated.has(item.id) || context.isSeen?.(item.id));
}

function headerValue(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeWord(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export function buildMime(input: Record<string, unknown>): string {
  const html = input.bodyType === 'html';
  const lines = [
    `To: ${headerValue(input.to)}`,
    input.cc ? `Cc: ${headerValue(input.cc)}` : '',
    input.bcc ? `Bcc: ${headerValue(input.bcc)}` : '',
    input.replyTo ? `Reply-To: ${headerValue(input.replyTo)}` : '',
    input.fromName ? `From: ${encodeWord(headerValue(input.fromName))} <me>` : '',
    `Subject: ${encodeWord(headerValue(input.subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  const body = Buffer.from(String(input.body ?? ''), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  return Buffer.from(`${lines.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url');
}

export const gmailApp: AppDefinition = {
  key: 'gmail',
  name: 'Gmail',
  description: 'Watch your inbox and send email from your Gmail account.',
  icon: 'logos:google-gmail',
  category: 'Communication',
  auth: { type: 'oauth2', provider: GOOGLE_PROVIDER, scopes: [GOOGLE_SCOPES.gmailRead, GOOGLE_SCOPES.gmailSend] },
  triggers: [
    {
      key: 'new_email',
      type: 'polling',
      name: 'New Email',
      description: 'Triggers when a new email arrives (optionally matching a Gmail search).',
      inputFields: [
        { key: 'query', label: 'Search', type: 'string', placeholder: 'from:boss@example.com subject:invoice', helpText: 'Any Gmail search query. Leave empty for every new email.' },
        { key: 'labelId', label: 'Label', type: 'select', default: 'INBOX', dynamicOptions: 'labels' },
        { key: 'hasAttachment', label: 'Only emails with attachments', type: 'boolean', default: false },
      ],
      sample: { id: '18c1f0a', thread_id: '18c1f0a', from: 'Ada <ada@example.com>', from_email: 'ada@example.com', to: 'you@example.com', subject: 'Invoice #42', date: '2025-01-01T10:00:00.000Z', snippet: 'Please find attached…', body_plain: 'Please find attached the invoice.', attachment_count: 1 },
      poll: pollEmails,
    },
  ],
  actions: [
    {
      key: 'send_email',
      name: 'Send Email',
      description: 'Sends an email from the connected Gmail account.',
      inputFields: [
        { key: 'to', label: 'To', type: 'string', required: true, helpText: 'Comma-separated addresses.' },
        { key: 'cc', label: 'Cc', type: 'string' },
        { key: 'bcc', label: 'Bcc', type: 'string' },
        { key: 'subject', label: 'Subject', type: 'string', required: true },
        { key: 'body', label: 'Body', type: 'text', required: true },
        { key: 'bodyType', label: 'Body type', type: 'select', default: 'plain', options: [{ label: 'Plain text', value: 'plain' }, { label: 'HTML', value: 'html' }] },
        { key: 'fromName', label: 'From name', type: 'string' },
        { key: 'replyTo', label: 'Reply-To', type: 'string' },
      ],
      sample: { id: '18c1f0b', thread_id: '18c1f0b', label_ids: ['SENT'] },
      async run(context) {
        if (!String(context.input.to ?? '').includes('@')) throw new PermanentIntegrationError('"To" must contain at least one email address');
        const sent = await authorizedRequest<{ id: string; threadId: string; labelIds?: string[] }>(context.auth, `${API}/messages/send`, {
          method: 'POST', json: { raw: buildMime(context.input) },
        });
        return { id: sent.id, thread_id: sent.threadId, label_ids: sent.labelIds ?? [] };
      },
    },
  ],
  optionLoaders: {
    async labels(context) {
      const result = await authorizedRequest<{ labels?: { id: string; name: string }[] }>(context.auth, `${API}/labels`);
      return (result.labels ?? []).map((label) => ({ label: label.name, value: label.id }));
    },
  },
};
