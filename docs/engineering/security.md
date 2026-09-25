# Security architecture (WI-008)

CareerOS is a **single-owner** application: one allowlisted Google account, one database. This page describes the controls that exist and the limits that remain. It is not an audit or certification. For vulnerability reporting see [SECURITY.md](../../SECURITY.md). The decision is [ADR-012](../architecture/decisions.md#adr-012--single-owner-google-sign-in-server-sessions-and-web-push-wi-008).

## Threat model

Protected assets: the owner's schedule, study and job records (including recruiter contacts, compensation notes and reflections), Google refresh tokens, push subscriptions and all server secrets. Considered adversaries: anyone on the internet who can reach the app URL, a different Google account holder, a malicious page in another tab (CSRF, clickjacking, open redirect), a network observer, and accidental leaks through logs, exports or backups. Out of scope: a compromised owner device or Google account, a compromised host or database provider, and multi-user tenancy (US-026).

## Sign-in

Google OpenID Connect, Authorization Code flow with PKCE (S256), `state` and `nonce`, scopes `openid email` only (`src/features/auth/`). Calendar access is a separate consent (ADR-010); signing in never grants it.

1. **Sign in with Google** is a Server Action (same-origin check by Next.js). It stores `{state, verifier, nonce, next, exp}` in an AES-256-GCM encrypted, httpOnly, SameSite=Lax cookie scoped to `/api/auth`, valid 10 minutes, and redirects with `prompt=select_account`.
2. `/api/auth/callback` requires that cookie, compares `state` in constant time, checks expiry, deletes the cookie (one use), and exchanges the code server-to-server with the client secret and PKCE verifier.
3. The ID token arrives directly from Google's token endpoint over TLS, so its claims are validated without a JWKS signature check (OIDC Core §3.1.3.7): issuer is Google, audience is our client ID, not expired, `iat` not in the future, nonce matches, `email_verified` is true, and the email equals `OWNER_EMAIL`. The access token is discarded.
4. Any failure redirects to `/login?error=<code>` with a generic message. A different account sees "This CareerOS workspace is private"; nothing is created for it.
5. `next` is only ever a same-origin path (`safeNext` rejects `//host`, `/\host`, schemes and `/login`), so there is no open redirect.

## Sessions

Server-side `Session` rows (`src/server/session.ts`). The browser holds a random 256-bit token in `careeros_session` (httpOnly, SameSite=Lax, `Secure` whenever `APP_BASE_URL` is HTTPS, path `/`, 30 days). Only its SHA-256 is stored, so a database leak does not yield usable cookies. Every request checks: well-formed token, row exists, not revoked, not expired, and the user's email still equals `OWNER_EMAIL`. `lastSeenAt` is updated at most hourly. **Sign out** revokes the row server-side, so a copied cookie stops working immediately (verified in all three browser engines). Changing `OWNER_EMAIL` locks out every existing session. There is no idle timeout shorter than 30 days, no device list and no MFA beyond what the Google account enforces.

## Access control

`src/proxy.ts` runs before every route except static build assets:

| Path                                                                                             | Rule                                                                                                            |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/api/notifications/process`, `/api/calendar/sync`                                               | `Authorization: Bearer $CRON_SECRET` (constant-time), otherwise 401. A session cookie is not accepted.          |
| `/login`, `/api/auth/callback`, `/api/health`, `/api/calendar/webhook`, manifest, `sw.js`, icons | Public. Health returns status words only; the webhook validates channel ID, resource ID, token hash and expiry. |
| Every other page                                                                                 | Valid session, else redirect to `/login?next=<path>`. No navigation or data is rendered while signed out.       |
| Every other `/api/*` route                                                                       | Valid session, else `401 {"error":"unauthorized"}`.                                                             |

The proxy is the first gate, not the only one: pages and Server Actions call `owner()`, which re-resolves the session and redirects if it is gone, and every service scopes queries and writes to that owner. Server Actions keep Next.js' Origin check (CSRF); cookies are SameSite=Lax; there are no state-changing GET routes (export is read-only).

## HTTP hardening

- **CSP** per request with a fresh nonce: `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `unsafe-inline`/`unsafe-eval` in production), `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'` plus Google's sign-in origin, `connect-src`/`img-src`/`worker-src`/`manifest-src 'self'`. `style-src` allows inline styles (React style attributes); no user content is rendered as HTML. `upgrade-insecure-requests` is sent only when `APP_BASE_URL` is HTTPS.
- **Static headers** (`next.config.ts`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production. `X-Powered-By` is removed.
- **Caching:** private pages and APIs send `Cache-Control: private, no-store`. The service worker caches nothing.
- **Rate limits** (in-process, per client IP per minute): sign-in action 20, `/api/auth/callback` 30, `/login` 60, calendar webhook 300; excess gets 429. The IP is the first `X-Forwarded-For` entry, so the limit is only as trustworthy as the proxy in front of the app. It is defense in depth for public endpoints, not an authentication control, and a multi-instance deployment gets a per-instance limit.

## Secrets and logging

Secrets are environment-only and validated at start-up without printing values ([environment reference](environment.md)). Logs use a fixed vocabulary: `[auth] signed-in`, `[auth] sign-in rejected <code>`, `[notifications] processed {counts}`, `[calendar] … {userId, counts, codes}`, and failures as a fixed message plus the error class name (`Notification processing failed TypeError`). They never contain tokens, codes, cookies, keys, push endpoints or keys, email bodies, notes, reflections or contacts. `JobRun.lastError` stores only the error class name. A scan of 479 production-server log lines from the WI-008 browser runs found no secret values or token patterns.

## Data leaving the server

- **Google:** during sign-in, only the OAuth exchange. Calendar: see ADR-010 (titles, instants, category, private IDs).
- **Push services** (Google FCM, Mozilla, Apple): an encrypted payload (RFC 8291, aes128gcm) with a title, one short reminder line, a tag and a same-origin path, plus a VAPID JWT (RFC 8292). Push services cannot read the payload. Reminder text never includes notes, contacts or reflections.
- **Export** (`/api/export`, signed-in only): a JSON copy of domain records. It excludes the refresh token, sync token, channel tokens, session hashes, push endpoints and keys, and maintenance records.

## Dependencies

`pnpm audit` (2026-09-24) reports three advisories, all inside the Prisma CLI's tooling dependencies (`deepmerge-ts` < 8, `mysql2` < 3.23.1). The application uses PostgreSQL through `@prisma/adapter-pg` at runtime; neither package is loaded by the served app. They are carried over from before WI-008 and tracked under US-027; no forced major-version override was applied. `web-push` has no open advisories.

## Known limits

Single owner only (no tenant isolation or roles). The rate limiter is per process. No audit log of sign-ins beyond the `Session` rows. The health endpoint is public by design (status words only). No automated secret rotation. Backups are as safe as the storage the operator chooses.
