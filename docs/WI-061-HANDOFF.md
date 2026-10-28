# WI-061 handoff — Speed

Date: 2026-10-28. Branch `feat/wi-061-speed` from `main` `640b550` (WI-060).

**Source.** The research is in `output/Silsila-Speed-Research.pdf` (not committed). It was measured in a lab: the production build sat behind a TCP proxy adding 12 ms each way to the database (`scratchpad` scripts; recipe below), and statements were counted with `log_statement`.

**Owner's decisions (2026-10-28).**

- The whole item ships in one go.
- The session cache is 60 seconds.

**Migration:** none. The Prisma `relationJoins` preview feature changes only how queries are built; `prisma migrate diff` reports no drift.

## What the lab found

- **Sign-in was read twice per request.** The proxy and the page each called `resolveSession`, and each made two sequential round trips (session, then user): four round trips before any page work.
- **Snapshots were gone almost every time.** They lived 20 seconds, and the reminder run cleared them every minute.
- **Pages waited in waves.** For example, Today waited for generation before starting reads that did not need it.
- **Detail pages were never cached:** the roadmap detail and the application page.
- **Hosting.** Production's 0.1 CPU and the Ohio ↔ Canada Central link remain the owner's call; nothing here depends on them.

## What changed

| Part                 | Where                                                                                    | What                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 session cache     | `src/server/session.ts`                                                                  | `resolveSession` keeps the session row with its user for `SESSION_CACHE_MS` = 60 s, keyed by token hash, on `globalThis` so the proxy bundle and the page share it. `revokeSession`, `revokeOtherSessions` and every `forgetAll()` (through `onForget`) clear it. The `lastSeenAt` touch updates the cached row. Off under test like the snapshots.                                                                                             |
| B4 snapshot lifetime | `src/server/memo.ts`, `src/server/jobs.ts`, `src/app/api/notifications/process/route.ts` | `SNAPSHOT_TTL_MS` = 3 minutes. `recordRun(name, work, { clearsSnapshots })`; the reminder run passes `false` because it writes only inbox rows. `cacheEnabled` and `onForget` are exported.                                                                                                                                                                                                                                                     |
| B5 detail memo       | `src/features/roadmap/service.ts`, `src/features/jobs/service.ts`                        | `roadmapDetail` (`roadmap:<id>`) and `applicationDetail` (`application:<id>`) go through `memo()`.                                                                                                                                                                                                                                                                                                                                              |
| Day Print answer     | `src/features/day-print/actions.ts`                                                      | `forgetAll()` after saving `User.dayPrint`, since the cached session carries the user row.                                                                                                                                                                                                                                                                                                                                                      |
| B2 joins             | `prisma/schema.prisma`                                                                   | `previewFeatures = ["relationJoins"]`: an `include` is one query with joins instead of one per relation.                                                                                                                                                                                                                                                                                                                                        |
| B1 parallel reads    | `src/app/today/page.tsx`, `src/app/calendar/page.tsx`, `src/app/jobs/[id]/page.tsx`      | **Today** starts the streamed parts' snapshots (`jobTodaySummary`, `revisionDue`, `dsaSnapshot`, `noticedFor`, `setupState`) and `forTodayPicks` with the page, then reads everything in one `Promise.all`; only today's plan waits for generation. **Plan** reads routines, goals and the connection while the week generates, and the generation error is a value. **The application page** starts its side reads before `applicationDetail`. |
| B6 pool              | `src/lib/env.ts`, `.env.example`, `docs/engineering/environment.md`                      | `DATABASE_POOL_MAX` defaults to 10. Production keeps 5 through `render.yaml` (see Production).                                                                                                                                                                                                                                                                                                                                                  |
| C2 router memory     | `next.config.ts`                                                                         | `experimental.staleTimes: { dynamic: 30, static: 30 }`. A page seen in the last 30 seconds shows at once on Back, Forward or a revisit; server actions still clear it.                                                                                                                                                                                                                                                                          |
| C3 menu on intent    | `src/components/navigation.tsx`                                                          | `MenuLink` sets `prefetch` once the owner hovers, focuses or touches a menu link (sidebar and phone bar). List links keep `prefetch={false}` (WI-010, WI-060).                                                                                                                                                                                                                                                                                  |
| F1 timing header     | `src/proxy.ts`                                                                           | Private responses carry `Server-Timing: auth;dur=<ms>`, visible in the browser's network panel.                                                                                                                                                                                                                                                                                                                                                 |
| Docs                 | ADR-017 amendment, `CLAUDE.md`, `CHANGELOG.md`                                           | The three-minute window, the reminder exception and the session cache, with their consequences.                                                                                                                                                                                                                                                                                                                                                 |

### Not done, on purpose

- **C1, a Suspense boundary around the launcher's pick.** For today now loads alongside the page, so the launcher no longer waits for it. A skeleton would only add a layout shift.
- **B3, counting roadmap items in SQL.** `roadmapList` already selects nine narrow columns in one query (one with joins now) and is memoized. The cost is one round trip, not the row count.
- **D1 and D2, opening Practice bands and roadmap sections on demand.** After the cache changes, Practice takes 63 ms and a roadmap 150 ms on a revisit, so the trade (a request per opened band, and a change to the e2e journeys) is not worth it now. Revisit if the curriculum grows a lot.
- **F2, a statement budget in CI.** The lab needs a delayed database link and `log_statement` on the server's log, which CI does not have. The recipe below stays manual.

## Measurements

Lab: the production build, `silsila_e2e` with the UI audit's seeded data, 12 ms each way to the database, 1440 px. All figures are milliseconds to the end of the document response.

| Page           | Before: first visit after 21 s | After: revisit after 21 s | Before: warm | After: warm |
| -------------- | ------------------------------ | ------------------------- | ------------ | ----------- |
| Today          | 684                            | 126                       | 353          | 114         |
| Practice       | 394                            | 63                        | 200          | 49          |
| Roadmap        | 354                            | 117                       | 172          | 35          |
| A roadmap      | 375                            | 150                       | 320          | 86          |
| Plan           | 249                            | 75                        | 228          | 59          |
| Weekly review  | 299                            | 160                       | 167          | 34          |
| Jobs           | 226                            | 74                        | 166          | 32          |
| An application | 368                            | 138                       | 347          | 83          |
| Rumi           | 187                            | 100                       | 166          | 58          |
| Settings       | 352                            | 212                       | 237          | 117         |

The first columns are not a like-for-like cold load. Before, 21 seconds had emptied the cache; after, it has not, which is the point of the change. The worst case, with every cache expired (more than three minutes idle), was measured separately:

| Page    | Before          | After           |
| ------- | --------------- | --------------- |
| Today   | 684 ms, 66 stmt | 389 ms, 45 stmt |
| Roadmap | 354 ms          | 262 ms, 19 stmt |

A first visit to each page within the cache window costs between 4 statements (Practice) and 17 (Weekly review).

**Recipe.**

1. Run a delay proxy: `node delay-proxy.mjs 55499 5432 12`. It delays chunks in parallel, so a large result costs one trip.
2. Start the e2e servers with `E2E_DATABASE_URL=postgresql://$USER@127.0.0.1:55499/silsila_e2e`.
3. Turn on statement logging: `ALTER DATABASE silsila_e2e SET log_statement='all'`. Count `statement`/`execute` lines in the PostgreSQL log per page.
4. Reset afterwards with `ALTER DATABASE silsila_e2e RESET log_statement`.

## Tests

- `tests/sessions.test.ts`: a resolved session answers from the cache for a minute even when its row changes outside the app, and a sign-out through the app ends it at once.
- The existing memo, proxy and session tests are unchanged and pass.

## Gate

- `pnpm typecheck` passes.
- `pnpm lint` (ESLint): no errors.
- Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 106 files, 589 tests.
- `pnpm build` passes.
- `prisma migrate diff --from-config-datasource --to-schema` reports no difference.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification

Browser, on the production build:

- **Before hover.** On Today, no menu page is fetched.
- **Hover Roadmap.** Its page is fetched.
- **Click.** It shows in 32 ms with no new request.
- **Back to Today.** No request.
- **Console.** No errors.

## Production

- **Deploy.** Merge and deploy; there is no database step.
- **Expected effect.** In production every round trip costs about 80 ms instead of the lab's 24, so the gains should be larger in absolute terms. Compare Today, Practice and Roadmap with the WI-060 figures (warm ~0.6, ~0.7 and ~0.8 s). `Server-Timing: auth` in the network panel should read near 0 on a second click.
- **Optional, owner: raise the pool to 10.** Set `DATABASE_POOL_MAX=10` on Render and in `render.yaml`. First check that the Supabase session pooler's pool size leaves room for backups and migrations. The lab showed about 10% on Today's cold load.
