# Release criteria

What a release of Silsila must meet, and where the current one stands. Written for the audit of 2026-11-02 (WI-145).

## Current release

- **Released version: 3.1.0** (CHANGELOG, "The audit, its cleanup, Talk and study with Rumi", WI-120 to WI-146, closed by the owner on 2026-11-03). Earlier: 3.0.0, 2.0.0, 1.0.0 (live since 2026-10-20) and 0.1.0.
- **Deployed:** `main`, which Render deploys after CI passes. Nothing is unreleased.
- **Next:** two weeks of owner use, then the next version as proposed in [V2-PROPOSAL.md](V2-PROPOSAL.md) (4.0.0 by CHANGELOG numbering).
- Version numbers live only in the CHANGELOG; the repository has no version tags (its tags are `baseline/wi-002`, `wi-003-verified`, `wi-004-verified` and `docs-archive-2026-11-02`).
- Production on 2026-11-02, read only: `/api/health` answered `{"status":"ok","database":"ok","sessionTimeZone":"UTC","schema":"current","jobs":"ok"}`.

## Criteria

Each line says whether it is verified, by what, or still pending. "Verified" means checked on 2026-11-02 for WI-145, in the environment named.

### Functional

| Criterion                                                                                                                                                                                  | Status                            | Evidence                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------- |
| Every page renders signed in, without a page error, a console error or a CSP violation                                                                                                     | Verified (local production build) | e2e journey "every page loads…" in Chromium, WebKit and Firefox; 25 routes in the sweep |
| Core journeys: first routine, block through Focus, roadmap item, practice attempt, application and rounds, Rumi plan, note, cards, voice, weekly review, Plan, Close the Day, ⌘K, Settings | Verified (local)                  | 21 Playwright journeys, three browsers                                                  |
| Generation is idempotent and never overwrites an edited block                                                                                                                              | Verified                          | `tests/database.test.ts`, `tests/week-plan-database.test.ts`                            |
| One running session per owner                                                                                                                                                              | Verified                          | partial unique index; execution tests                                                   |
| Rumi keeps a change and its Undo when the model fails afterwards                                                                                                                           | Verified                          | `tests/agent-writes-database.test.ts` (WI-145)                                          |
| DST: a repeated time on the spring-forward day never stops a week or the reminders                                                                                                         | Verified                          | `tests/domain.test.ts` (WI-145)                                                         |
| Real Google Calendar sync on the owner's account                                                                                                                                           | Pending (owner)                   | only the fake Google is exercised in tests                                              |
| Real push on the owner's Android phone (Chrome and the installed app)                                                                                                                      | Pending (owner)                   | —                                                                                       |

### Security

| Criterion                                                             | Status                        | Evidence                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Only the allowlisted owner can sign in; private routes need a session | Verified                      | `tests/proxy.test.ts`, auth tests                                                                               |
| Every action and read is owner-scoped                                 | Verified                      | six `*-security.test.ts` suites (Today, Practice, Roadmap, Jobs, Review, Rumi), Rumi's tools and cards included |
| CSP with a nonce, HSTS, frame denial, no sniffing                     | Verified (production headers) | a read-only request to `/login` on 2026-11-02                                                                   |
| Cron endpoints refuse without the bearer secret                       | Verified                      | `tests/proxy.test.ts`                                                                                           |
| Public endpoints are rate-limited, the health check included          | Verified                      | `tests/proxy.test.ts` (WI-145)                                                                                  |
| Calendar tokens: AES-256-GCM with a 16-byte tag enforced              | Verified                      | `tests/calendar-domain.test.ts` (WI-145)                                                                        |
| No high or critical advisories in production dependencies             | Verified at audit time        | `pnpm audit --prod --audit-level high`: "No known vulnerabilities found"                                        |
| The public privacy contact is the address the owner intends           | Pending (owner)               | `/privacy` shows one Gmail address; it comes from `PRIVACY_CONTACT_EMAIL` or falls back to `OWNER_EMAIL`        |

### Browsers and devices

| Criterion                                                      | Status               | Evidence                                                                                       |
| -------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| Chromium (desktop)                                             | Verified             | e2e on every push; sweep at 8 widths                                                           |
| WebKit (Safari's engine)                                       | Verified (emulation) | e2e weekly in CI and locally; sweep                                                            |
| Firefox                                                        | Verified (emulation) | `pnpm test:e2e:firefox` (new in WI-145); sweep                                                 |
| The owner's Android phone (Chrome, installed app, push, voice) | Pending (owner)      | emulation is not a device; there is no iPhone to check, so Safari rests on the WebKit journeys |

### Mobile and layout

| Criterion                                                                | Status                                                                          | Evidence                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| No horizontal overflow at 320, 360, 375, 390, 430, 768, 1024 and 1440 px | Verified (emulation)                                                            | sweep across 25 routes per width                                                          |
| Touch targets at least 24 px (WCAG 2.2 AA) on phones                     | Verified, with listed exceptions (inline links, the skip link, a hidden submit) | sweep's small-target probe                                                                |
| Row menus (⋯) on phones stay on screen                                   | Verified (WI-146)                                                               | a phone-width journey opens a roadmap item's ⋯ and checks its list is inside the viewport |

### Accessibility

| Criterion                                                                          | Status       | Evidence                                  |
| ---------------------------------------------------------------------------------- | ------------ | ----------------------------------------- |
| axe (WCAG 2.2 AA tags) reports no violation on the journeys' pages, light and dark | Verified     | e2e `accessible()` in three browsers      |
| Screen-reader walkthrough                                                          | Not verified | no assistive-technology run in this audit |

### Performance

| Criterion                                         | Status       | Evidence                                        |
| ------------------------------------------------- | ------------ | ----------------------------------------------- |
| The public health check answers quickly when warm | Measured     | production, 5 requests: 0.10–0.36 s total       |
| The login page's first byte                       | Measured     | production, 3 requests: about 0.04 s first byte |
| Signed-in page timings in production              | Not measured | the audit made no signed-in production requests |
| Zod stays off the shell and public pages          | Verified     | `tests/boundaries.test.ts`                      |

### Data integrity

| Criterion                                                       | Status         | Evidence                                           |
| --------------------------------------------------------------- | -------------- | -------------------------------------------------- |
| Schema matches migrations; upgrade from the previous migration  | Verified in CI | `prisma migrate diff --exit-code`, migration tests |
| Append-only history; unique keys for retries; CHECK constraints | Verified       | schema and database tests                          |
| Time rules (DATE labels, UTC instants, UTC sessions)            | Verified       | time and DST tests                                 |

### Deployment, backups and integrations

| Criterion                                                | Status                                               | Evidence                                                                                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render deploys only green `main`                         | Documented                                           | operations runbook; dashboard not inspected                                                                                                                 |
| Daily encrypted backup with a restore check              | Documented; workflow present                         | `.github/workflows/backup.yml` (daily 07:23 UTC)                                                                                                            |
| A timed restore (RTO)                                    | Verified 2026-11-02                                  | the owner's first drill: 3 s from download to a verified restore (`docs/engineering/backup-restore.md`); a new database and repointing Render are not timed |
| External uptime monitor                                  | Documented (owner set up Better Stack on 2026-11-02) | operations runbook                                                                                                                                          |
| Scheduled jobs fresh                                     | Verified at audit time                               | production health `jobs: ok`                                                                                                                                |
| AI provider check (zero data retention, pinned endpoint) | Verified in tests; production runs it daily          | `tests/ai-*`                                                                                                                                                |

## Remaining production risks

1. **Free tiers.** A sleeping instance, 0.1 CPU and a 500 MB database; the app in Ohio and the database in Canada Central, so every statement crosses regions.
2. **Recovery point of a day.** Supabase Free keeps no provider backups; the daily dump is the only copy.
3. **TLS without certificate verification** to the database (`DATABASE_SSL=no-verify`).
4. **In-process rate limits and cache**: correct for one instance only.
5. **Manual device checks** (push and voice on the owner's Android phone) are not automated; no real iPhone is available, so iOS Safari is covered by WebKit emulation only.

## How to release

The gate in [CONTRIBUTING](../../CONTRIBUTING.md#the-gate), then the [release checklist](../engineering/operations.md#release-checklist): a green branch run, a backup, merge, watch `/api/health`, smoke-test, read the log. A migration is applied to the personal database before its merge.
