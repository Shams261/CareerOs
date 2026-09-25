# Google production checklist

CareerOS uses one Google Cloud OAuth client for two separate consents: **sign-in** (`openid email`) and, optionally, **Calendar** (`calendar.app.created` plus `openid email`, ADR-010). Automated tests use a local fake provider only; everything below is a manual step for the owner, done once. Google's console changes over time, so check labels against the current UI.

## Project and client

1. Create (or reuse) a Google Cloud project dedicated to CareerOS.
2. **APIs & Services → Library:** enable **Google Calendar API** (only if you will use Calendar sync).
3. **OAuth consent screen / Google Auth Platform:**
   - User type **External** (personal Gmail) or **Internal** (Google Workspace, your domain only).
   - App name `CareerOS`, your support email, your developer contact email. Optional: an app logo (adding one may trigger brand verification).
   - Authorized domain: the registrable domain of `APP_BASE_URL`.
   - Scopes (Data access): `openid`, `.../auth/userinfo.email`, and for Calendar `https://www.googleapis.com/auth/calendar.app.created`. Add nothing else.
4. **Credentials → Create OAuth client ID → Web application:**
   - Authorized JavaScript origins: none needed (server-side flow).
   - Authorized redirect URIs, exactly (scheme, host, path, no trailing slash):
     - `https://<host>/api/auth/callback`
     - `https://<host>/api/calendar/oauth/callback` (Calendar)
   - Copy the client ID and secret into the host's secret store as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## Publishing status (important for Calendar)

- **Testing:** only listed test users can sign in (add your own account). Google expires refresh tokens for apps in Testing after about **7 days** when they hold scopes beyond basic profile, so Calendar would show _Reconnect required_ every week. Sign-in itself is unaffected (it stores no Google token).
- **In production:** refresh tokens persist. `calendar.app.created` is a sensitive scope, so an unverified app shows an "unverified app" warning on consent and is capped at 100 users. For a personal, single-owner app you can proceed past the warning without submitting for verification; do not ask others to use it.
- Internal (Workspace) apps skip both concerns for accounts in your domain.

Choose **In production** if you use Calendar sync and accept the warning; otherwise **Testing** is fine for sign-in only.

## Environment

```sh
APP_BASE_URL=https://<host>
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
AUTH_SECRET=<openssl rand -base64 32>
OWNER_EMAIL=<the Google account you sign in with>
# Calendar (optional)
CALENDAR_TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>
GOOGLE_CALENDAR_WEBHOOK_BASE_URL=https://<host>   # optional push channels
```

Never set `GOOGLE_OAUTH_AUTH_URL`, `GOOGLE_OAUTH_TOKEN_URL`, `GOOGLE_OAUTH_REVOKE_URL` or `GOOGLE_CALENDAR_API_URL` in production (they are loopback-only overrides for tests).

## Verify with the real account

1. Open `https://<host>/today` in a private window → redirected to `/login`.
2. **Sign in with Google** → Google shows the account chooser and asks only for email → back on Today.
3. Sign in with a different Google account → "This CareerOS workspace is private"; no data shown.
4. Calendar → **Connect Google Calendar** → consent lists only "see, create, change and delete events on calendars this app creates" (plus email) → a calendar named **CareerOS** appears in Google Calendar with this week's blocks.
5. Move one event in Google Calendar, press **Sync now** → the block moves in CareerOS for that day only.
6. Settings → System status: Google Calendar connected, calendar sync job has a recent success (after the scheduler runs).
7. Sign out → `/login?signed_out=1`; reloading any private page returns to `/login` (pages are sent `no-store`).

## Revocation and incidents

- Remove access: Google Account → Security → Third-party connections → CareerOS. CareerOS shows _Reconnect required_ for Calendar; sign-in simply asks for consent again.
- Client secret leaked: rotate it in the console (add new secret, deploy, delete old), then reconnect Calendar.
- Wrong redirect URI (`redirect_uri_mismatch`): the registered URI must equal `${APP_BASE_URL}/api/auth/callback` exactly, including `https` and no trailing slash.
