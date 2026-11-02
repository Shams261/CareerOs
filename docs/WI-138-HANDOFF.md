# WI-138 handoff: ops and truth

Date: 2026-11-02. This is the first of three work items made from the re-check of `output/Silsila-Full-Audit.pdf` against the code (WI-138 ops and truth, WI-139 code hardening, WI-140 calmer UX). The owner chose this order. No migration, and nothing on screen changes.

## What changed

- **Server errors are logged with their reference.** `onRequestError` in `src/instrumentation.ts` writes one line through `requestErrorLine` (`src/lib/request-error.ts`): `[request] failed <routeType> <routePath> <ErrorClass> <code> ref <digest>`.
  - The digest is what `error.tsx` already shows the owner as "Reference …", so a reported reference finds its line in Render.
  - It never logs the request's path, query, headers, body or the error's message. Next's redirects and not-found are skipped.
  - Tested in `tests/request-error.test.ts`. Actions keep their own `[area] action failed … ref` line (WI-122).
- **The export includes `AgentSetting`** as `rumi.setting` (notes on or off, line language, voice consent and language, speak replies). It was the only owner-scoped model missing. Sessions, push subscriptions and sync conflicts stay out by design. Asserted in `tests/agent-database.test.ts`.
- **A branch is green before it is merged.**
  - Quality now runs on pushes to `feat/**`, `fix/**` and `chore/**` as well as `main`.
  - The flow (CONTRIBUTING step 7, the release checklist): gate locally, push the branch, wait for green, merge `--no-ff`, push.
  - This replaces the audit's "PR gate". GitHub branch protection with required checks would refuse the direct push of a `--no-ff` merge commit, which has no checks of its own.
- **Weekly WebKit.** `.github/workflows/webkit.yml` runs the journeys and axe in Safari's engine every Sunday (GitHub starts it late, which is fine weekly) and on demand.
- **Dependabot.**
  - The three Actions updates (#34 `setup-node` 7.1.0, #35 `cache` 6.1.0, #36 `checkout` 7.0.1) are applied by SHA to every workflow. Their own CI runs were green.
  - From the npm group (#37), the patch and minor updates are applied after checking release dates: `react`/`react-dom` 19.3.1, `pg` 8.23.1, `prettier` 3.9.10, `dotenv` 18.0.9, `@types/node` 26.6.6.
  - `lucide-react` stays at 1.47.0. Its new versions (1.65.0 and 1.66.0) were two to three days old, and icons carry no security fix. Take it in a later Dependabot round.
  - #37's red e2e was the Monday review journey fixed in WI-121; the PR branch predates it.
  - Dependabot closes the PRs itself once `main` has the versions. #37 will reopen for `lucide-react`.
- **The recovery drill.** `scripts/restore-drill.sh` downloads the newest green Backup artifact, decrypts it with the owner's age key, and restores it into a scratch database that `db:restore:verify` checks and drops. It prints download, decrypt, restore and total seconds, and shreds the plain dump on exit. `backup-restore.md` has the command and a table for the results. Production is never touched.
- **Docs made true.**
  - `security.md`: Rumi's two write classes and every card, replacing "Rumi has no write tool"; the plan window of seven days; the `[request] failed` log line.
  - `operations.md`:
    - the release checklist rewritten for this repository (branch green, Backup run first, a migration applied before merge and expand-only, health, smoke test, the log);
    - the second caller as measured;
    - Better Stack as the real monitor (set up by the owner);
    - backups daily with the drill, in place of the weekly copy and the retired NFR register.
  - `scheduler.yml`'s header says the same.

## What was measured

- **GitHub's schedules.** The hourly Uptime workflow started every 3.5 to 8 hours (25 runs, 2026-10-27 to 2026-11-02). The Scheduler workflow (every 15 minutes, merged 13:12 UTC) had no scheduled start at all by 19:20 UTC; its one run was by hand and green.
  - So GitHub is a best-effort backstop, not a second clock.
  - If cron-job.org stops, `jobs` goes `stale` and Better Stack alerts within minutes.
  - A true second clock needs another always-on caller holding `CRON_SECRET`. That is the owner's choice, since it hands the secret to one more party.

## Not done, and why

- **`Server-Timing` with `db` and `render`.** Pages stream, so the response headers leave before the database reads and the render finish; a header cannot carry their duration. The `auth` entry stays. To time a page's database work, use the recipe in `operations.md` ("Measuring a page's queries"). A real p50/p95 needs request logging, which the fixed log vocabulary does not allow today.
- **Branch protection** is not set, for the reason above. The branch-green step is the gate.

## Owner steps

1. **Tomorrow:** check that the daily Backup ran (Actions → Backup; due 07:23 UTC, GitHub may start it hours late). It is the first run since WI-121 made it daily.
2. **Once:** run the recovery drill (`backup-restore.md`) and write the total and the data age into its table. That gives the recovery time.
3. **Optional:** decide whether a second always-on caller should hold `CRON_SECRET`.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database, build, `test:e2e` and `test:e2e:safari`, docs:check, `git diff --check`. Results at merge. The branch is pushed and its Quality run is green before the merge (the new flow).
