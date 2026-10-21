# WI-011 handoff — UX pass: undo, summaries, phone navigation

Branch `feat/wi-011-ux-pass` on `main` after PR #16. Items 1 to 5 of the UX list and 8 to 10 of the UI list from the 2026-10-21 product analysis.

## 1. Outcome

Eight of the thirteen items from the analysis: undo, application summary, interview-day prep, phone navigation, review step memory (verified, no change), surface levels, density and status tones. No schema change. The remaining five (shortcut overlay, reminders preview, category icons, dark-mode tuning, empty-state mark) wait for a week of real use.

## 2. Changes

| Item | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Undo | `ActionState.undo` carries `{ kind, payload }`. Actions that remove or set aside something return it: Skip and Cancel block (`block-reset`), Remove note (`restore-note`), Remove roadmap item (`restore-roadmap-item`, with status, marks, notes and links), Remove priority (`restore-priority`). `ActionForm` shows an **Undo** link beside the success message for eight seconds; it calls `undoAction`, which runs `restore()` in `src/features/undo/service.ts` under the signed-in owner, refreshes the page and reports "Note restored." and the like. No soft deletes and no schema change: an undo re-creates the record from the payload, and links are kept only when they still point at the owner's own records. Tested in `tests/undo-database.test.ts` (note, roadmap item with marks and ownership, skipped block, unknown kind). |

| Application summary | The application page opens with one line: stage pill, next action with its due state, next interview with its time, applied date and source, job posting link. Replaces the "Stage · Applied · Source · Priority" tagline. |
| Interview day | The Today interview hero lists the round's open prep items with a Mark done button each; the counts line is gone. `todaysInterviews` now selects id, title, kind and completed. |
| Phone navigation | On screens up to 700 px the sidebar list is hidden and a fixed bottom bar shows Today, Plan, Roadmap, Practice and More; More opens a sheet with Learn, Jobs, Weekly review and Settings, closes on navigation and Escape. Content keeps bottom padding so the bar never covers a button. Safe-area inset respected. |
| Review step memory | Checked: forms on the weekly review keep the open step, because actions revalidate the current URL and the week links carry the step. No change needed. |
| Surface levels | `.card.flat`: lists sit on the canvas with a hairline heading; cards remain for things that act. Applied to Practice (library, recent attempts), Learn (subjects, recent activity), Jobs (applications), the application page (timeline, contacts, notes), Settings (system status) and roadmap sections. |
| Density | List rows tighter than forms: `.dsa-item`, `.roadmap-item`, `.execution-block`, `.learning-history`. |
| Status tones | `executionTone()` maps each execution label to a quiet tone: completed green, skipped amber, overdue red, current and in progress teal, cancelled struck through; used by the Today pill and a left edge on week-grid blocks. The label still carries the meaning. |

| Shortcuts | `PageShortcuts` replaces the Today-only component: Today (N add a block, S start, T today, arrows for days), Plan (N add routine, arrows for weeks), Roadmap (N add goal) and a roadmap (N add items). `?` opens an overlay listing the page's keys; Escape or a click outside closes it. |
| Reminders preview | Weekly review step three ends with "Reminders next week": one line per reminder type read from the same preferences and dates the scheduler uses (daily, DSA revisions, technical reviews, follow-ups with their days and companies, interviews with their times, weekly review), each marked Off when disabled, with a link to Settings. `src/features/notifications/preview.ts`; facts only, nothing written. |
| Category icons | `CategoryIcon` maps a block category to a small glyph (DSA, system design, technical, job search, LinkedIn, gym, work, personal, interview, other) in the Today timeline and the week grid. Decorative; the category text stays. |
| Empty-state mark | The brand rings, small and quiet, open each Start here card (Today, Roadmap, Practice, Learn, Jobs). |
| Dark mode | Checked on Today, Weekly review and a roadmap with the dark cookie: the teal live card, chain, week chart, flat sections, status tones, phone bar and shortcuts overlay all read correctly on the dark palette; no token changes were needed. |

## 3. Verification

Local fake-Google loop: Skip on Today showed "Skipped. Undo"; Undo returned the block to Upcoming; the phone bar and the More sheet render at 375 px with no overflow; flat sections and status tones checked at 1440 px on Today, Practice and a roadmap; no console errors from this branch (the pane's console still lists entries from an earlier compile error that is long fixed).

## 4. Commands and results

Disposable local PostgreSQL, 2026-10-21:

| Check                                                                                                    | Result                                                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm lint` (eslint; prettier on tracked files), `pnpm typecheck`, `pnpm docs:check`, `git diff --check` | Passed                                                       |
| Clean `db:deploy` (12 migrations)                                                                        | Applied                                                      |
| `pnpm test:ci`                                                                                           | 244 passed in 35 files (+3 in `tests/undo-database.test.ts`) |
| `pnpm build`                                                                                             | Passed                                                       |
