# WI-026 — The privacy page

Date: 2026-10-23. Branch `feat/wi-026-privacy` from `main` `399c9b0` (WI-025). The small follow-up CLAUDE.md listed under "Current next step": a public privacy page so the Google OAuth app can leave Testing (refresh tokens for the Calendar scope expire weekly while it is in Testing).

## Outcome

- **`/privacy`** is a public page (listed in the proxy's `PUBLIC` routes; the only other public page is `/login`). It renders inside the sign-in shell when signed out and inside the app shell when signed in, as one readable card: who runs Silsila and that there are no other users; Google sign-in (`openid email`, the owner check, no Google token kept, the session cookie); Google Calendar (`calendar.app.created`, only the calendar Silsila creates, the encrypted refresh token, Disconnect and revocation) with the Google API Services User Data Policy Limited Use statement; what Silsila stores; where it is hosted and that nothing is shared or sold; retention, export and removal; security; changes and a contact address. The page is indexable; everything else stays `noindex`.
- **Contact address.** `PRIVACY_CONTACT_EMAIL` (optional, validated as an email) names the contact; it defaults to `OWNER_EMAIL`. Set it when the sign-in address should stay off a public page.
- **Sign-in card** links to Privacy under the mantra.
- The page carries no personal data and no form; it is static text plus the contact address.

## Changes

| Area    | Files                                                                                                                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/app/privacy/page.tsx`                                                                                                                                                                                                                                 |
| Changed | `src/proxy.ts` (public route), `src/lib/env.ts` (`PRIVACY_CONTACT_EMAIL`, `privacyContact`), `src/app/login/page.tsx`, `src/app/globals.css`, `tests/proxy.test.ts`, `.env.example`, docs (environment, security, google-production, CHANGELOG, CLAUDE.md) |

No migrations, no new dependencies, no new queries (the page reads the session to pick its shell).

## Verification

| Check                                           | Result                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`, `typecheck`, `build`, `docs:check` | Pass on a clean export of the branch                                                                                     |
| `pnpm test:ci` (disposable database)            | All files pass; `tests/proxy.test.ts` now asserts `/privacy` is reachable without a session                              |
| Signed out                                      | `curl` without a cookie gets 200 HTML (no redirect to `/login`); the page shows the brand, the policy and a Sign in link |
| Signed in                                       | The page renders in the app shell with "Back to Settings"; no console errors, no overflow at 1440 and 390                |

## Owner steps (one time, Google Cloud console)

1. OAuth consent screen → App information → **Application privacy policy link**: `https://usesilsila.me/privacy`. The home page link can be `https://usesilsila.me/login`.
2. Make sure `usesilsila.me` is listed under **Authorized domains**.
3. Publishing status → **Publish app** (In production). With the sensitive Calendar scope the consent screen keeps showing the "unverified app" warning for a personal app; continue past it. No verification submission is needed for a single owner.
4. Settings → Google Calendar → Disconnect, then Connect again, so the refresh token is issued under the published status and stops expiring after seven days.

## Limitations

- The text states the hosting as of today (Render in the United States, Supabase in Canada); move the app and this page needs the same edit.
- Google may still show the unverified-app interstitial; that is expected for an unverified sensitive scope and does not affect token lifetime.
