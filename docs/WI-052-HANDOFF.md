# WI-052 handoff — browser smoke tests and axe in CI

Date: 2026-10-28. Branch `feat/wi-052-smoke-tests` from `main` `81f506f` (WI-051). This is the last P1 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, section 10): the unit and database tests were strong, but nothing exercised the real pages in a browser, and accessibility was checked only by hand. No migration.

## What changed

**Suite.** `@playwright/test` 1.64 and `@axe-core/playwright` 4.14 are dev dependencies.

- `playwright.config.ts` runs three loopback servers:
  - the fake Google (`tests/support/fake-google-server.ts`, 4455);
  - the fake OpenRouter (4466);
  - `next start --port 3197` on the production build, with `e2e/env.ts` (3197 since WI-054: 3100 was taken by another local app).
- `e2e/env.ts` holds throwaway values only: fixed test keys, loopback endpoints, `owner@example.com`.
- One worker; reduced motion, so axe judges settled colours; traces and screenshots on failure.
- `scripts/e2e-db.ts` drops and recreates the database in `E2E_DATABASE_URL` (default `silsila_e2e` on local PostgreSQL), then applies every migration. It refuses any name not ending in `_e2e`.
- `pnpm test:e2e` runs the script, then Playwright. Run `pnpm build` first.
- `e2e/.auth/`, `test-results/` and `playwright-report/` are git-ignored.

**Journeys** (`e2e/auth.setup.ts`, `e2e/journeys.spec.ts`). They run in order as one owner who signs in once through the fake Google:

1. A new workspace: Start here and Make Silsila yours read 0 of 6. The first routine is added, then Today shows its agenda and 1 of 6.
2. A one-time block for today goes through Focus (an intention, Begin, Complete) back to Today as Done.
3. A roadmap is created, two items are added from lines, and one is marked Done, giving "1 done".
4. An application is added, and its Interview formats card shows Code review and System design.
5. Ask Rumi "kal ka plan bana do": the plan card appears, Add to plan, then Undo.
6. Settings switches to Dark (the `dark` class) and back.

**Checks on each page:**

- axe for WCAG 2.0/2.1/2.2 A and AA, failing on any violation;
- no horizontal overflow at 375 px on Today, the roadmap and Settings.

**CI** (`.github/workflows/quality.yml`, job `e2e`):

- a `postgres:17` service;
- `playwright install --with-deps chromium`;
- `pnpm build`, then `pnpm test:e2e`;
- the report and traces uploaded only when a journey fails (7 days). They hold fake data only.

**Two accessibility fixes the suite found:**

- **Search button.** It had `aria-label="Search"`, while its visible text read "Search ⌘K" (axe `label-content-name-mismatch`, WCAG 2.5.3). The label is gone, so the name is the visible word. On a phone, where only the icon shows, the word is now visually hidden rather than `display: none`, so the button keeps its name.
- **Next action label.** On an application's Next move box, the meta grey on the tint measured 4.43:1. The label now uses the secondary ink, at 7.4:1.

**Docs:** README commands, CLAUDE.md (commands and the pre-handoff gate) and the CHANGELOG.

## Results

Locally, `pnpm build` then `pnpm test:e2e` passed 7 of 7 (sign-in plus six journeys) in about 13 seconds, three runs in a row. The gate below passes.

## Notes

- The routine is set at 05:00–05:30, so a run never depends on the clock. The Focus journey uses a one-time block, because a new routine adds only future slots to today (ADR-015).
- Rumi's journey depends on the fake's answer to "plan" or "kal" (`pickTool` in the fake server). If that fake changes, keep the card's `Plan for …` group name.
- The suite is a smoke check, not full coverage. Add a journey when a core flow changes.

## Gate

Lint, typecheck and docs check (90 files) pass on an export of the working tree; `pnpm build`; `pnpm test:ci`: 97 files, 554 tests; `pnpm test:e2e`: 7 passed; `git diff --check` clean.
