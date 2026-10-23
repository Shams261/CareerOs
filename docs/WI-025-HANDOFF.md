# WI-025 — Settings as rows

Date: 2026-10-23. Branch `feat/wi-025-settings-rows` from `main` `5ac7b62` (WI-024). Follows the four work items of the 2026-10-23 plan: Settings now reads like Today too. The owner approved the before/after sample before implementation.

## Outcome

- **Header.** "Settings" with "Download my data" and "Sign out" as utilities (behind More on narrow screens) and one record line from `settingsSummary`: "owner@example.com · America/Toronto · Light theme · Reminders on 2 devices · Google Calendar connected, synced 7 minutes ago". The WI-018 left index stays, as does the getting-started checklist while anything is left.
- **Reminders as rows.** The push controls for this device sit under the heading with the device count beside it; then one row per reminder in Today's recipe (bell tile, the kind as the label, what it reminds, "21:30 · On" / "18:00 · Off" / "60 min before · On" from `reminderContext`). Each row opens its form in a side panel (`SidePanel`), and the form closes the panel after a successful save. The four stacked forms with four Save buttons are gone.
- **Google Calendar.** The panel is the group's heading with "Sync now" (or "Reconnect") as its one primary, the connection as one row ("Connected · Silsila calendar · account · synced 7 minutes ago · healthy · instant updates with a scheduled fallback · 0 pending"), and "Categories to sync" and "Disconnect" as rows that open panels. Conflicts render as before. The not-connected and not-configured states keep their one button and one line.
- **Appearance.** Theme is a Light / Dark control that saves as soon as one is chosen (`ThemeSwitch`, the same cookie and action; a Save button only without JavaScript); keyboard shortcuts are an On/Off toggle on their row (`ShortcutsToggle` with a short label).
- **Account** is one row; **Data** has the export row and the system status as one row with one line ("Database ok · UTC · schema current · reminder job 12 minutes ago · calendar sync 7 minutes ago") in place of the six-cell grid.

`SettingRow` (`src/features/settings/rows.tsx`) renders a row that opens a panel, follows a link, or carries a control; the row recipe and tiles come from Today's attention rows.

## Changes

| Area    | Files                                                                                                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/features/settings/{domain.ts,rows.tsx,theme-switch.tsx}`, `tests/settings-domain.test.ts`, `docs/screenshots/wi-025/`                                                                                                          |
| Changed | `src/app/settings/page.tsx` (rewritten), `src/features/calendar/panel.tsx`, `src/components/shortcuts-toggle.tsx` (label and class props), `src/features/{learning,jobs}/forms.tsx` (`closeOnSuccess`), `src/app/globals.css`, docs |

No migrations, no new dependencies, no route changes. The page's queries are unchanged (the calendar panel still loads its own connection, conflicts, blocks and categories).

## Verification

| Check                                           | Result                                                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `typecheck`, `build`, `docs:check` | Pass on a clean export of the branch                                                                                                                                                                             |
| `pnpm test:ci` (disposable database)            | All files pass; `tests/settings-domain.test.ts` adds two cases                                                                                                                                                   |
| `/settings` at 1440                             | Screenshots 01 and 02: header line, Reminders rows, Google Calendar (not connected on the dev database), Appearance with the theme control, Account, Data; no console errors, no overflow                        |
| Panels and controls                             | Screenshot 03: a reminder row opens its form with focus on the heading and the page behind inert; Save closes the panel and the row's context updates; Escape returns focus; Dark then Light through the control |
| 390                                             | Screenshot 04: utilities behind More, the index as pills, rows in the phone layout with the control under the text                                                                                               |

## Limitations and follow-ups

- The Google Calendar rows were verified on the dev database in the not-connected state; the connected rows render from the same data the old grid used.
- Found and fixed on the way: on phones the settings column was as wide as the unbroken pill row (433 px in a 375 px viewport), so the heading rows and the rows were cut at the right edge; the layout column is now `minmax(0, 1fr)` and the index has `min-width: 0`. This predates WI-025 (the pill row is WI-018).
- `ProgressBar` (`src/components/progress-bar.tsx`) still has no consumer; remove in a clean-up.
