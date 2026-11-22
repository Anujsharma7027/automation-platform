TO DO in Future/before production
1. ```Improve drag and drop system in canvas - 1. not able to attach node to the node which have one node already(to make new node) 2. sometimes node get selec sometimes not and when moving canvas, node get move```

First automation ai response 
```I've built the automation platform: five Google apps (Gmail, Sheets, Calendar, Drive, Forms), all five systems on your NestJS backend with Redis and BullMQ, and a canvas that now connects to them. The engine isn't tied to Google: a new app is one file, and a new login provider (Microsoft, Slack…) is one provider class.

What's verified:

I ran the backend against real MongoDB and Redis. The app catalog, the Google sign-in link, workflow validation, account listing and activation all worked, and a background worker polled immediately. Account tokens never appeared in any response.
I couldn't test against real Google accounts, because that needs your Google OAuth app and real logins. With a fake account, Google rejected the token and the workflow handled it correctly: it stayed on and will try again on the next check.
Backend: build passes and 46 of 47 tests pass. The one failure is the existing MailService test, which I didn't touch: its test setup is missing a config service.
Mobile: typecheck and lint show no new problems. The canvas file and _layout.tsx already had lint/type errors before my changes.
Tests need Node 24.9 or newer; on Node 22 most of them fail to load.
What each system does:

Connect accounts: a user can connect as many Google accounts as they want. One Google login covers all five apps, and Google asks only for the permissions the chosen app needs. Tokens are encrypted, refreshed on the server and never sent to the phone. Accounts you'd already connected for Gmail keep working.
App definitions: each app lists its triggers, actions, fields and dropdowns. The canvas builds its forms from this list.
Gmail: New Email → Send Email
Sheets: New Row → Add Row, Update Row
Calendar: New Event → Create Event
Drive: New File → Create File, Create Folder
Forms: New Response → Create Form
Triggers: each active workflow is checked every 2 minutes (adjustable). Old items aren't replayed when you turn a workflow on, and each event runs only once.
Actions: fields can use data from earlier steps, like {{trigger.subject}}. Calendar and Drive actions are safe to retry and won't create duplicates. Gmail, Sheets and Forms actions can repeat once in a rare edge case: a retry after the app did the work but its reply was lost.
Running steps: steps run in order and every result is saved. Temporary errors retry up to 5 times with increasing waits, continuing from the step that failed. Bad input fails the run. A revoked account turns the workflow off with the reason shown. Run history is kept for 30 days.
In the canvas: tap a step → Set up step → pick the event or action → choose or connect an account → fill the fields (tap a field to insert data from earlier steps) → Test shows real trigger data. Run once runs the workflow now with your latest real data. The Save button turns the workflow on.

Limits:

Workflows must be one straight line of steps; branches show a clear message instead.
Instant (webhook) triggers are prepared in the engine but not built yet.
Connecting accounts only works in the Android/iOS app, not in the web version.
Before going live: Google requires app verification, including a security assessment, for the Gmail and Drive permissions before the public can use them.

How to run the backend
1. Install these:

Node.js 24 (from nodejs.org)
MongoDB (or a free MongoDB Atlas database)
Redis 7 (on Windows use Docker or Memurai; or a hosted Redis)
2. Start MongoDB and Redis. With Docker:

docker run -d -p 27017:27017 mongo:7
docker run -d -p 6379:6379 redis:7-alpine
3. Install the backend packages:

cd backend
npm install
4. Create a Google OAuth app in Google Cloud Console:

Turn on the Gmail, Google Sheets, Google Calendar, Google Drive and Google Forms APIs.
Set up the OAuth consent screen and add yourself as a test user.
Create an OAuth client of type "Web application" with this redirect URI: http://localhost:3000/connections/google/callback
5. Create your settings file: copy backend/.env.example to backend/.env and fill in:

MONGODB_URI and REDIS_URL
JWT_ACCESS_SECRET and JWT_REFRESH_SECRET: two different random texts, at least 32 characters each
GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI
OAUTH_TOKEN_ENCRYPTION_KEY: make one with node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
RESEND_API_KEY and EMAIL_FROM (needed for sign-up emails)
6. Create the database indexes: npm run migrate:connections

7. Start the backend: npm run start:dev. It runs at http://localhost:3000.

8. For production:

Build with npm run build, then start with npm run start:prod.
For more traffic, run one process with PROCESS_ROLE=api (handles requests) and one or more with PROCESS_ROLE=worker (runs workflows).
9. Check the tests (optional): npm test

10. Mobile: in mobile/.env, set EXPO_PUBLIC_API_URL to your backend address, then run npx expo start.

backend/AUTOMATION.md has the architecture and the steps for adding new apps.```