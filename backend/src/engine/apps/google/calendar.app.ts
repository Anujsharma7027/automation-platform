import { AppDefinition } from '../../core/integration.types';
import { authorizedRequest } from '../../core/http';
import { PermanentIntegrationError } from '../../core/errors';
import { GOOGLE_PROVIDER, GOOGLE_SCOPES, sinceDays } from './google.shared';
import { createHash } from 'node:crypto';

const API = 'https://www.googleapis.com/calendar/v3';

interface CalendarEvent {
  id: string; status?: string; summary?: string; description?: string; location?: string; htmlLink?: string;
  created?: string; updated?: string; start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string }; organizer?: { email?: string };
  attendees?: { email?: string; responseStatus?: string }[]; hangoutLink?: string;
}

const calendarField = { key: 'calendarId', label: 'Calendar', type: 'select' as const, default: 'primary', dynamicOptions: 'calendars' };

function toEventData(event: CalendarEvent): Record<string, unknown> {
  return {
    id: event.id,
    status: event.status ?? '',
    summary: event.summary ?? '',
    description: event.description ?? '',
    location: event.location ?? '',
    start: event.start?.dateTime ?? event.start?.date ?? '',
    end: event.end?.dateTime ?? event.end?.date ?? '',
    all_day: Boolean(event.start?.date && !event.start?.dateTime),
    html_link: event.htmlLink ?? '',
    meet_link: event.hangoutLink ?? '',
    organizer_email: event.organizer?.email ?? '',
    attendee_emails: (event.attendees ?? []).map((attendee) => attendee.email).filter(Boolean),
    created: event.created ?? '',
  };
}

/** Calendar accepts client ids (base32hex, 5-1024 chars), making creation retry-safe. */
function eventIdFor(key: string): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuv';
  const bytes = createHash('sha256').update(key).digest();
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let id = 'tv';
  for (let index = 0; index + 5 <= bits.length; index += 5) id += alphabet[parseInt(bits.slice(index, index + 5), 2)];
  return id;
}

export const calendarApp: AppDefinition = {
  key: 'google_calendar',
  name: 'Google Calendar',
  description: 'Watch calendars for new events and create events.',
  icon: 'logos:google-calendar',
  category: 'Productivity',
  auth: { type: 'oauth2', provider: GOOGLE_PROVIDER, scopes: [GOOGLE_SCOPES.calendarRead, GOOGLE_SCOPES.calendarEvents] },
  triggers: [
    {
      key: 'new_event',
      type: 'polling',
      name: 'New Event',
      description: 'Triggers when an event is created in a calendar.',
      inputFields: [calendarField, { key: 'search', label: 'Search', type: 'string', helpText: 'Only events containing this text.' }],
      sample: { id: 'abc123', summary: 'Team sync', start: '2025-01-02T10:00:00Z', end: '2025-01-02T10:30:00Z', organizer_email: 'you@example.com', attendee_emails: ['ada@example.com'], html_link: 'https://calendar.google.com/…' },
      async poll(context) {
        const calendarId = encodeURIComponent(String(context.input.calendarId || 'primary'));
        const since = sinceDays(7);
        const result = await authorizedRequest<{ items?: CalendarEvent[] }>(context.auth, `${API}/calendars/${calendarId}/events`, {
          query: { updatedMin: since.toISOString(), showDeleted: false, maxResults: 100, q: context.input.search as string | undefined },
        });
        return (result.items ?? [])
          .filter((event) => event.status !== 'cancelled' && event.created && new Date(event.created) >= since)
          .sort((a, b) => String(b.created).localeCompare(String(a.created)))
          .slice(0, 50)
          .map((event) => ({ id: event.id, data: toEventData(event) }));
      },
    },
  ],
  actions: [
    {
      key: 'create_event',
      name: 'Create Detailed Event',
      description: 'Creates an event in a calendar.',
      inputFields: [
        calendarField,
        { key: 'summary', label: 'Title', type: 'string', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'location', label: 'Location', type: 'string' },
        { key: 'start', label: 'Start date & time', type: 'datetime', required: true, placeholder: '2025-01-02T10:00:00Z' },
        { key: 'end', label: 'End date & time', type: 'datetime', required: true },
        { key: 'timeZone', label: 'Time zone', type: 'string', placeholder: 'Europe/London' },
        { key: 'attendees', label: 'Attendees', type: 'string[]', helpText: 'Comma-separated emails.' },
        { key: 'addMeet', label: 'Add Google Meet link', type: 'boolean', default: false },
        { key: 'sendUpdates', label: 'Notify attendees', type: 'select', default: 'none', options: [{ label: 'No', value: 'none' }, { label: 'Yes', value: 'all' }] },
      ],
      sample: { id: 'tv0abc', summary: 'Kick-off', start: '2025-01-02T10:00:00Z', end: '2025-01-02T11:00:00Z', html_link: 'https://calendar.google.com/…' },
      async run(context) {
        const input = context.input;
        if (new Date(String(input.end)) <= new Date(String(input.start))) throw new PermanentIntegrationError('End must be after start');
        const calendarId = encodeURIComponent(String(input.calendarId || 'primary'));
        const id = eventIdFor(context.idempotencyKey);
        const timeZone = input.timeZone ? String(input.timeZone) : undefined;
        const body = {
          id,
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: { dateTime: input.start, timeZone },
          end: { dateTime: input.end, timeZone },
          attendees: ((input.attendees as string[] | undefined) ?? []).map((email) => ({ email })),
          ...(input.addMeet ? { conferenceData: { createRequest: { requestId: id, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
        };
        try {
          const event = await authorizedRequest<CalendarEvent>(context.auth, `${API}/calendars/${calendarId}/events`, {
            method: 'POST', query: { sendUpdates: String(input.sendUpdates ?? 'none'), conferenceDataVersion: input.addMeet ? 1 : 0 }, json: body,
          });
          return toEventData(event);
        } catch (error) {
          // A retry after a lost response: the deterministic id already exists.
          if (error instanceof PermanentIntegrationError && / 409/.test(error.message)) {
            return toEventData(await authorizedRequest<CalendarEvent>(context.auth, `${API}/calendars/${calendarId}/events/${id}`));
          }
          throw error;
        }
      },
    },
  ],
  optionLoaders: {
    async calendars(context) {
      const result = await authorizedRequest<{ items?: { id: string; summary: string; primary?: boolean; accessRole?: string }[] }>(
        context.auth, `${API}/users/me/calendarList`, { query: { minAccessRole: 'reader' } });
      return (result.items ?? []).map((item) => ({ label: item.primary ? `${item.summary} (primary)` : item.summary, value: item.primary ? 'primary' : item.id }));
    },
  },
};
