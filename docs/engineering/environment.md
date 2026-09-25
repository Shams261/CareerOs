# Environment reference

Every variable is read on the server only. None is exposed to the browser (there are no `NEXT_PUBLIC_` variables); the VAPID **public** key reaches the browser only through the rendered Settings page. Validation lives in `src/lib/env.ts`. At start-up, `src/instrumentation.ts` runs `configProblems()`: in production any problem **stops the server**, and elsewhere it is logged as a warning. Messages name the variable and the rule, never the value.

Store production values in the host's secret store. Never commit them, paste them into issues or chat, or print them in logs. [`.env.example`](../../.env.example) is the template.

## Required

| Variable               | Rule                                                | Purpose                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`         | `postgres://` or `postgresql://` URL                | The owner's database. Use the provider's TLS options (for example `sslmode=require`). Every session is pinned to UTC ([ADR-009](../architecture/decisions.md#adr-009--utc-database-sessions-and-guarded-legacy-timestamp-repair-wi-0051)). |
| `OWNER_EMAIL`          | Email address                                       | The only Google account allowed to sign in. Compared case-insensitively on **every request**, so changing it locks out existing sessions.                                                                                                  |
| `CRON_SECRET`          | ≥ 32 characters (`openssl rand -base64 36`)         | Bearer credential for the two scheduler endpoints. Distinct from every other secret.                                                                                                                                                       |
| `APP_BASE_URL`         | URL; **HTTPS in production** (loopback excepted)    | Public origin. Builds the sign-in redirect URI `${APP_BASE_URL}/api/auth/callback`; `https://` turns on `Secure` cookies and `upgrade-insecure-requests`.                                                                                  |
| `AUTH_SECRET`          | 32 random bytes, base64 (`openssl rand -base64 32`) | AES-256-GCM key for the 10-minute sign-in state cookie (state, PKCE verifier, nonce). Rotating it only cancels sign-ins in progress.                                                                                                       |
| `GOOGLE_CLIENT_ID`     | Non-empty                                           | Google OAuth **web** client used for sign-in and (optionally) Calendar.                                                                                                                                                                    |
| `GOOGLE_CLIENT_SECRET` | Non-empty                                           | Secret of that client.                                                                                                                                                                                                                     |

## Optional

| Variable                                                                                                | Default / rule                                                 | Purpose                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_POOL_MAX`                                                                                     | `5` (1–50)                                                     | Connections per server process. Keep it inside the provider's connection limit, leaving room for migrations and backups. |
| `CALENDAR_TOKEN_ENCRYPTION_KEY`                                                                         | 32 random bytes, base64. **Setting it enables Calendar sync.** | Encrypts Google refresh tokens (AES-256-GCM). Separate from `AUTH_SECRET`. Rotating it requires reconnecting Calendar.   |
| `GOOGLE_OAUTH_REDIRECT_URI`                                                                             | `${APP_BASE_URL}/api/calendar/oauth/callback`                  | Calendar consent redirect. Set only if it must differ.                                                                   |
| `GOOGLE_CALENDAR_WEBHOOK_BASE_URL`                                                                      | HTTPS URL or empty                                             | Public origin for Google push channels. Empty keeps Calendar on cron/manual sync.                                        |
| `VAPID_PUBLIC_KEY`                                                                                      | base64url P-256 public key. **Setting it enables Web Push.**   | Generate once with `pnpm exec web-push generate-vapid-keys`.                                                             |
| `VAPID_PRIVATE_KEY`                                                                                     | base64url P-256 private key; required with the public key      | Signs push requests. Rotating the pair invalidates every browser subscription (each device must re-enable).              |
| `VAPID_SUBJECT`                                                                                         | `mailto:` or `https:`; required with the public key            | Contact given to push services.                                                                                          |
| `GOOGLE_OAUTH_AUTH_URL`, `GOOGLE_OAUTH_TOKEN_URL`, `GOOGLE_OAUTH_REVOKE_URL`, `GOOGLE_CALENDAR_API_URL` | Official Google endpoints; overrides must be **loopback** URLs | Only for `pnpm google:fake` and automated browser tests. A non-loopback override is rejected at start-up.                |
| `BACKUP_DIR`                                                                                            | `backups` (git-ignored)                                        | Output directory for `pnpm db:backup`.                                                                                   |
| `RESTORE_VERIFY_SERVER_URL`                                                                             | `DATABASE_URL`'s server                                        | Server on which `pnpm db:restore:verify` creates its scratch database (the role needs `CREATEDB`).                       |
| `TEST_DATABASE_URL`                                                                                     | unset                                                          | Disposable migrated database for integration tests. Never a personal database.                                           |

## Local development

Real Google credentials are optional locally. Start the fake identity provider with `pnpm google:fake` (port 4455; `FAKE_LOGIN_EMAIL` chooses the signed-in address, default `owner@example.com`) and use the commented block in `.env.example`. Set `OWNER_EMAIL` to the same address. The loopback-only rule means these overrides can never point a deployment at a fake provider by mistake.

## Checks

`APP_PASSWORD` (WI-001 Basic Auth) is no longer read; delete it from existing environments. Settings → System status shows database, UTC session, schema and job health without revealing configuration. `GET /api/health` returns the same status without secrets.
