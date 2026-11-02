# WI-141 handoff: a calmer screen

Date: 2026-11-02. This is the last of the three work items from the re-check of `output/Silsila-Full-Audit.pdf`: the audit's "UX shant karna", which had never been built. Asked before coding, the owner chose:

- **Today's rail:** the rings and Needs attention.
- **Plan:** non-study blocks in a lighter ink, kept in time order.

No migration.

## What changed

- **Today's rail** (`src/features/today/sections/rail.tsx`):
  - The day's rings, or the Day Print once the day is closed, then Needs attention.
  - **This week** is on Plan only. Plan already had the card. Its "Plan →" corner link is gone, since on Plan it led to itself. `todayPage` no longer reads the week's blocks: one query fewer on Today.
  - **The setup card** shows on Today only while three or more of the six steps are left (`setupOnToday`, `src/features/setup/domain.ts`). With fewer left, the steps live in Settings, which lists them anyway.
  - The "Study nudges are off" card stays. It shows only while every nudge is off and can be dismissed for 30 days.
- **Settings order:** Account (the owner, the name Today greets, sessions) · Reminders · Rumi and AI · Calendar · Appearance · Data.
  - `src/features/settings/sections/rumi.tsx` (`RumiGroup`, `#rumi`) holds AI and Grill Me with the monthly limit, Rumi knows, the Rumi button and Voice, which were under Data.
  - Data keeps the curriculum, the export and the system line.
  - The Name row moved from Appearance to Account.
  - Rumi's "Kept. Rumi knows" link points at `#rumi`.
- **Plan:**
  - A block outside the owner's focus kinds (their study categories, DSA, Technical, job search) reads in meta ink with a normal-weight title, so study blocks are what the eye meets.
  - The rule is `isFocusCategory` in `src/lib/categories.ts`, the same one Rumi already used to decide whose titles it sends (`titleVisible` now points at it).
  - `planPage` reads the owner's study categories (one small query).
  - `BlockRowShell` takes `quiet`, written as Tailwind utilities on the row.
- **The problem page** (`src/app/dsa/[id]/page.tsx`):
  - The attempts sit under the revision ladder, so the steps and what happened at each read together.
  - **Watch it run** (`src/features/drills/watch-it-run.tsx`) is a closed band, "Watch it run · Two pointers" with "A sample of the pattern" and a chevron, opened by the owner. The band is new UI, written in Tailwind.
- **The Rumi button's gutter.** On a desktop, while the button sits in the right corner, the content keeps 96 px on its right (`.shell:has(.rumi-fab-wrap[data-side='right']) .content` in `app.css`, beside WI-062's bottom room). It no longer covers a row's chevron or a control.
  - Measured at 1440 px on Today, Plan, Settings, Jobs, Practice, Roadmap and the review: no control under the button. Before, it covered Settings' Daily reminder row.
  - On a phone the page keeps its width and the room under the page. The button can sit over a row until the page scrolls, and then it folds small (WI-115).
- **Tests:** `tests/setup-domain.test.ts` (`setupOnToday`) and `tests/categories.test.ts` (`isFocusCategory`).

## About Tailwind

The new parts are written in Tailwind: the band, the quiet row and the first-run cards (earlier). The existing styles of Today, Settings, Plan and the problem page were left in `app.css`. Moving whole pages would have been a rewrite with nothing to see. CLAUDE.md's rule now says this plainly: what a work item adds or redraws is Tailwind, and a page moves wholly only when it is redrawn.

## Not done

- **The `(public)` route group for `/login` and `/privacy`.** It needs those pages' styles split out of `app.css` and a second root layout. That is a larger change for about 31 KB gzipped on two public pages.

## Gate

prettier, lint, typecheck, knip, `test:ci --coverage` on a fresh database, build, `test:e2e` and `test:e2e:safari` (axe on every journey), docs:check, `git diff --check`. Browser screenshots at 1440 and 390 px, with no horizontal overflow and no console errors. The branch is pushed and green before the merge.
