import { AppDefinition } from '../core/integration.types';
import { calendarApp } from './google/calendar.app';
import { driveApp } from './google/drive.app';
import { formsApp } from './google/forms.app';
import { gmailApp } from './google/gmail.app';
import { sheetsApp } from './google/sheets.app';

/**
 * Installed apps. To add a new integration (Slack, Notion, Stripe, ...):
 * 1. create `apps/<vendor>/<app>.app.ts` exporting an `AppDefinition`,
 * 2. if it needs a new OAuth provider, register it in `connections/providers`,
 * 3. add it to this list. No engine changes are required.
 */
export const INSTALLED_APPS: AppDefinition[] = [gmailApp, sheetsApp, calendarApp, driveApp, formsApp];
