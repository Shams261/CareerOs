# WI-048 handoff — Ready by January

Date: 2026-10-28. Branch `feat/wi-048-ready-by-january` from `main` `ba49df6` (WI-047). This is the second P1 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, sections 3 and 7). The owner has 716 roadmap items, about 400 of them P0, and nine weeks to a January offer. The overview showed every list in full and did not help choose a week's work. No migration.

## What changed

**The weekly mix** (`src/features/roadmap/week.ts`, pure). `WEEKLY_MIX` is a fixed, achievable week covering the 2025–2026 formats:

| Row                 | Target |
| ------------------- | ------ |
| DSA problems        | 3      |
| Code review         | 1      |
| Bug squash          | 1      |
| Practical task      | 1      |
| System design       | 1      |
| Behavioural stories | 2      |

**`weekMix`** builds the week's rows from the owner's items and records:

- **Counts.** "DSA problems" counts distinct problems with an attempt in the owner's week. Every other row counts its items done in the week, using `completedAt` with `formatSet` from WI-047.
- **Next item.** Each row's next item comes from `formatPractice`.
- **Interviews first.** Formats of interviews in the next `INTERVIEW_HORIZON_DAYS` (14) come first, by date, with the company and day. A format the mix lacks, such as AI-assisted coding, joins with a target of 1. A behavioural interview puts that company's own section before the stories.

**Other pure helpers:**

- **`readyLine`** gives the nearest active goal with a target date and the P0 items left: "Offer from a product company · 7 weeks left · 406 P0 items left". It shows counts only, never a pace.
- **`planQuestion`** is the question Plan with Rumi hands over: the rows still short this week. Its words are checked against `BANNED_WORDS`.

**Service:**

- `weekPlan` (`src/features/roadmap/service.ts`, memoized as `week-plan`) reads four things in parallel:
  - open applications with a round in the next 14 days;
  - this week's distinct attempted problems;
  - the P0 items left;
  - the nearest goal.
- Then one `formatItems` query loads the material.
- Test-named applications are left out.
- `formatItems` moved into `jobs/service.ts` as the shared loader for the WI-047 loop card and this week.

**Roadmap overview** (`src/app/roadmap/page.tsx`):

- **This week** sits above the Roadmaps list.
- It shows the ready line, then one row per format: "Code review 0 of 1 · Northwind Labs · Nov 4 · Next: …".
- A row that met its target shows its count in the success colour.
- **Plan with Rumi** appears when AI is configured. It is a secondary, small button; Continue stays the page's one primary. It hands the question over through the tab's storage (`AskRumiButton`).

**Roadmap sections:** `?show=p0` and the **P0 not done** option in the section filter. An item done today stays visible until tomorrow, as in Not done.

## Tests

| File                               | Tests | Covers                                                                                                                                                                                                                                 |
| ---------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/week-mix-domain.test.ts`    | 3     | the mix order and counts (this week only); interview formats first, with an added AI-assisted row and the company's behavioural section first; the ready line and the Rumi question (capitals kept, no banned words, the covered week) |
| `tests/week-plan-database.test.ts` | 2     | `weekPlan` from real rows, described below; an owner without material gets empty rows                                                                                                                                                  |

The `weekPlan` database test checks:

- the goal's line;
- distinct problems attempted this week, where two attempts on one problem count once and last week's attempt is not counted;
- a drill done this week;
- a Northwind AI-assisted round leading;
- a test-named application left out;
- a round three weeks out left out.

The format tests from WI-047 still pass after `formatSet` and `formatItems` were refactored.

## Browser check (local, `silsila_dev_empty`)

- **1440 px:** This week appears above Roadmaps. Northwind Labs' Nov 4 formats lead the rows, then DSA problems at "1 of 3" and Practical task. Each row has its Next link.
- **Plan with Rumi:** it opened `/rumi` with the question "Plan the rest of this week's practice: 1 code review, …". The local fake model was not running, so Rumi answered "unavailable", as expected.
- **P0 not done:** Arrays & Hashing showed 8 P0 items left plus the item done today.
- **390 px:** no horizontal overflow. On the phone the Due for revision rail comes first, as before.

## Production

No migration and no data change: merge and deploy. The ready line needs a goal with a target date. The imported goal is "Offer from a product company"; set its date in Roadmap → Goals if it has none.

## Not in this item

- A Today row for the week.
- An editable mix (the fixed one is a starting point).
- The other P1 items: UI fixes, setup checklist, backups and alerts, smoke tests.

## Gate

Lint, typecheck, build and docs check (86 files) pass on an export of the working tree; `pnpm test:ci`: 92 files, 546 tests; `git diff --check` clean.
