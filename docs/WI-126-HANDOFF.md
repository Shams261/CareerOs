# WI-126 handoff: the application page as a loader and sections

Date: 2026-11-02. The second page loader from the full audit (`output/Silsila-Full-Audit.pdf`, page 3). No migration and no visible change.

## Before

`src/app/jobs/[id]/page.tsx` was 951 lines. The default export ran from line 72 to 907 as one function, with:

- five direct database queries;
- the link options, the prep-doc preview and the details rows;
- an 8-case `describe(activity)` switch;
- a local `'MMM d, HH:mm'` formatter;
- the markup of every section.

## After

- **`src/features/jobs/page-data.ts` (server-only).** `applicationPage(user, id, now)` returns one view model (`ApplicationView`), or null when the id is not the owner's. The side lists still load alongside the application (WI-061). It holds:
  - the five queries;
  - the follow-up state and the page's primary;
  - the round whose result is due, the loop practice, the link options;
  - Prepare with Rumi's preview, the next-move context and the details rows.
- **`activityLine(activity, zone)`** in `jobs/domain.ts` is the timeline's words, formerly `describe`.
- **`src/features/jobs/application/`** (server components taking `{ v: ApplicationView }`): `head.tsx`, `next-move.tsx`, `interviews.tsx`, `formats-card.tsx`, `timeline.tsx`, `rail.tsx`, `prep-tools.tsx` (used in the next round or in the rail) and `prep-link.tsx`. The markup moved line for line.
- **`src/app/jobs/[id]/page.tsx`** is 49 lines: `generateMetadata` (unchanged, 404 for a foreign id), the loader, and the grid of sections.

## Proof

The lab database got one application with every kind of content:

- a coming round with prep, a weak area and a problem link;
- a past round awaiting its result;
- a completed round with a reflection;
- a next action, details, a job description and formats.

Beside it were one plain open application and one closed (rejected) one, plus the Jobs list. Computed styles of every element and the page text were taken at 1440 and 390 px, before and after: **0 differences** across 8 page views (two old runs agreed exactly). An unknown id still renders the not-found page (`NEXT_HTTP_ERROR_FALLBACK;404`), as in WI-090.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (149 files, 838 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.

## Next

The same split for `src/app/settings/page.tsx` (703 lines).
