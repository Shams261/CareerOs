# WI-054 handoff — Weekly review step 1 as a summary

Date: 2026-10-28. Branch `feat/wi-054-review-summary` from `main` `a5e5112` (WI-053). This is the second P2 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, section 4.7: "Weekly review step 1: chart, then the week's days again"). No migration, no data change.

## What changed

**Domain.** `weekSummary(days, limit = 5)` in `src/features/review/domain.ts` is pure:

- `line` is `dayHeading` over the whole week, for example "0 of 10 done · 4 not recorded · 1 recorded, needs update".
- `open` holds the blocks still without a decision (`unrecorded` or `needs-update`), with their day, earliest first and capped at `limit`.
- `more` is the count beyond the cap.

**Page.** `src/app/review/page.tsx`, step `week`. The chart, the bar and the patterns line stay as they were. The seven day sections that followed are replaced by **The week in short**:

- the line;
- one row per kind from `schedule.rows`: "DSA · 3m recorded of 6h 50m planned";
- **Still to decide**: those blocks on the shared `BlockRowShell`. The time column shows the clock, and the meta line starts with the weekday ("Mon · No session recorded"), which keeps the phone column narrow. Each title links to its day on Today. "And N more." follows when there are more;
- **See every day on Plan**, to `/calendar?date=<monday>`.

Details keeps its own "Day by day" list. The unused `.review-days` CSS gave way to `.review-summary` and `.review-kinds`.

## Tests

`tests/review-summary.test.ts` has 2 tests:

- the week line, with cancelled blocks left out of the count;
- only undecided blocks, earliest first, with their days;
- the cap and the "more" count;
- an empty week reads "No plan".

## Browser check (local, `silsila_dev_empty`)

- **1440 px.** The summary shows its line, two kinds, five blocks still to decide and the link to Plan.
- **375 px.** No overflow, and the time column no longer collides with the timeline dot.

Also here: the e2e server port moved from 3100 to 3197 (`E2E_PORT` in `e2e/env.ts`), because another local app already listened on 3100 and Playwright refused to start.

## Gate

Lint, typecheck and docs check (92 files) pass on an export of the working tree; `pnpm build`; `pnpm test:ci`: 98 files, 556 tests; `pnpm test:e2e`: 7 passed; `git diff --check` clean.
