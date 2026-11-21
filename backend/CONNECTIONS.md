# Gmail account connections

Taskvyn platform sign-in and a connected Gmail account are separate identities. A connection is owned by the authenticated Taskvyn user and can be reused by that user's future workflows. This phase registers Gmail only; it does not execute workflow steps or poll Gmail.

## Configuration

Set these values in the backend environment (never commit real values):

| Variable | Purpose |
| --- | --- |
| `GOOGLE_GMAIL_CLIENT_ID` | OAuth client for Gmail integrations; separate from the Taskvyn Google Sign-In client IDs. |
| `GOOGLE_GMAIL_CLIENT_SECRET` | Confidential OAuth client secret; backend only. |
| `GOOGLE_GMAIL_REDIRECT_URI` | Exact public backend callback URL, ending in `/connections/gmail/callback`. |
| `APP_MOBILE_REDIRECT_URI` | App deep link after callback; the current app scheme is `mobile`, so the example is `mobile://oauth/gmail`. |
| `OAUTH_TOKEN_ENCRYPTION_KEY_ID` | Non-secret identifier for the active encryption key. |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | Base64 encoding of exactly 32 random bytes. |
| `OAUTH_TOKEN_ENCRYPTION_PREVIOUS_KEYS` | Optional JSON object mapping old key IDs to base64 keys during rotation. |

Generate a key in PowerShell without printing or committing it:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Put the output in the backend's secret environment store. The mobile app does not need the OAuth client secret or encryption key.

## Google Cloud Console

1. In the Google Cloud project, enable the Gmail API.
2. Configure the OAuth consent screen with Taskvyn's app name, support email, privacy policy, and authorized domains.
3. Create a **Web application** OAuth client for the backend integration and add the exact value of `GOOGLE_GMAIL_REDIRECT_URI` as an authorized redirect URI. Do not use the platform Google Sign-In client as a substitute.
4. Add the scopes `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/gmail.readonly`. Taskvyn requests offline access so it can refresh access tokens server-side.
5. While the consent screen is in Testing, add every tester's Google account to the test-user list. Before allowing public users, complete the Google OAuth verification applicable to this app and scope. `gmail.readonly` is a restricted Gmail scope; Google may also require a security assessment depending on the app's data handling. Do not describe this integration as publicly production-ready until Google has approved the required verification.
6. Deploy the callback endpoint over HTTPS and set `GOOGLE_GMAIL_REDIRECT_URI` to that exact deployed URL. The backend then redirects to `APP_MOBILE_REDIRECT_URI`; the app deep link is not the Google authorized redirect URI.

## Database setup

The migration only creates the new connection/state collections and their indexes; it does not drop or rewrite existing user collections. With `MONGODB_URI` set, run from `backend/`:

```powershell
npm run migrate:connections
```

The migration uses additive `createIndexes()` calls and is safe to rerun. It creates a unique `(userId, provider, externalAccountId)` index, user/provider/status and recent-account lookup indexes, a unique OAuth state hash index, and a TTL expiry index.

## Encryption key rotation

1. Generate a new 32-byte key and choose a new key ID.
2. Set the new ID/key as active and add the old ID/key to `OAUTH_TOKEN_ENCRYPTION_PREVIOUS_KEYS` as JSON.
3. With the same variables and `MONGODB_URI` available, run `npm run rotate:connection-keys` from `backend/`. It re-encrypts both stored token fields in place and can be rerun if interrupted.
4. Confirm the migration completed, then remove the previous key from the environment. Keep a protected backup of the old key until the rotation is verified; losing the only key that can decrypt a stored token requires users to reconnect.

## API

- `POST /connections/gmail/connect` (Taskvyn JWT required): starts authorization and returns an authorization URL plus the configured app callback URI.
- `GET /connections/gmail/callback`: validates and consumes state, exchanges the code, saves the account, and redirects to the app with a status and connection ID only.
- `GET /connections?provider=gmail` and `GET /connections/:id` (JWT required): return safe account metadata only.
- `POST /connections/:id/refresh` (JWT required): validates the account and refreshes an expired access token as needed.
- `DELETE /connections/:id` (JWT required): deletes the owned connection and attempts Google revocation.

Access and refresh tokens are encrypted using AES-256-GCM and excluded from normal Mongoose selection. The mobile API never returns them. Disconnect always removes the Taskvyn credential; the response indicates whether Google revocation was confirmed.
