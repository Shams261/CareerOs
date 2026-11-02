# WI-127 handoff: Settings as a loader and groups

Date: 2026-11-02. The third page loader from the full audit (`output/Silsila-Full-Audit.pdf`, page 3). No migration and no visible change.

## Before

`src/app/settings/page.tsx` was 703 lines. One function ran from line 85 to the end, with:

- six direct database queries;
- the cookie reads, the health line and the "last sent" helper;
- every group's markup and panels.

## After

- **`src/features/settings/page-data.ts` (server-only).** `settingsPage(user, flash, now)` returns one view model (`SettingsView`) holding:
  - the theme, text size and Rumi button cookies;
  - push, the sixteen parallel reads, the setup cookie;
  - the derived preferences, `nudgesPaused`, `remaining`, `healthy`, `statusLine` and `sent()`.
- **`src/features/settings/sections/`** (server components taking `{ v: SettingsView }`): `head.tsx`, `setup.tsx`, `reminders.tsx`, `appearance.tsx`, `account.tsx`, `data.tsx`. The markup moved line for line.
- **`src/app/settings/page.tsx`** is 51 lines: the index, the groups in order, and the Google Calendar panel (already its own component).
- Two files from WI-126 (`jobs/application/rail.tsx`, `timeline.tsx`) lost a stray blank line in their imports.

## Proof

Computed styles of every element and the page text, at 1440 and 390 px, before and after:

- `/settings`, `?google=connected` and `?google=error`;
- `/settings` with the setup card hidden on Today (`silsila-setup-hidden`), where "Make Silsila yours" shows.

That is 8 page views with **0 differences**; two old runs agreed exactly.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (149 files, 838 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.

## Next

Today (`src/app/today/page.tsx`, eight direct queries) is the last page that reads the database itself.
