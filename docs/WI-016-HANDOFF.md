# WI-016 handoff — design review leftovers

Branch `feat/wi-016-review-leftovers` from `main` (after PR #21). Scope: the sub-items of `docs/design-review/ENHANCEMENTS.md` sections A–C that WI-013 to WI-015 had not covered. No schema change, no migration, no new dependency.

## 1. Outcome

- **Copy.** Roadmap panels say "Done when:" (RP-21). The Jobs page heading, the application back link and Today's card say "Jobs" (J-19); the block category "Job search" and the review's category heading are unchanged because they name the category.
- **Revision queue (RO-2, RP-11).** `roadmapList` now returns `dueSection`, the section of the earliest item due; the overview row shows "N due for revision" as its own link to that section with `show=revision`. On the roadmap page, an empty revision view says "Nothing due in this section" and links to the next section with items due (wrapping around), via `ItemList`'s new `show` and `nextDue` props.
- **Back to the roadmap (PB-2, PB-3).** The problem page's return link carries `show=all`, so a done item in a long section is visible when you land, and the link is repeated under the attempt form.
- **Open application (J-4).** `ActionState` gains `link?: { href, label }`; `ActionForm` renders it beside the success message and keeps such messages on screen as long as ones with Undo. The jobs `perform` passes it through; quick add answers "Application added. Open application".
- **Disconnect flow (S-4).** `src/features/calendar/disconnect-form.tsx` (client): the calendar-name field appears only when "Also delete" is ticked, and the button turns destructive and says "Disconnect and delete the calendar".
- **Button `link` variant (B.4).** `Button` takes `variant` (`primary` default, `secondary`, `destructive`, `link` → `.link-button`); the roadmap's Edit, Remove, Read more and Next use it.
- **Phone running strip (B.2).** Under 700 px the running session panel is one line: title, timer, Stop.
- **Rows (B.3, J-7, LE-6).** Jobs rows: body-size company name (`.row-title`), the follow-up line in bold when due today or overdue (`.row-urgent`), larger tap area on coarse pointers. Learn's topic list uses `.plain-list` instead of decimal numbering.

## 2. Changes

| Area             | Files                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New              | `src/features/calendar/disconnect-form.tsx`                                                                                                                                 |
| Components       | `src/components/ui/button.tsx` (variants), `src/components/action-form.tsx` (link, timing)                                                                                  |
| Roadmap          | `src/features/roadmap/{item-list.tsx,service.ts}`, `src/app/roadmap/page.tsx`, `src/app/roadmap/[id]/page.tsx`                                                              |
| Practice         | `src/app/dsa/[id]/page.tsx`                                                                                                                                                 |
| Jobs             | `src/app/jobs/page.tsx`, `src/app/jobs/[id]/page.tsx`, `src/features/jobs/{actions.ts,components.tsx,summary.tsx}`, `src/features/schedule/actions.ts` (`ActionState.link`) |
| Calendar / Learn | `src/features/calendar/panel.tsx`, `src/features/learning/components.tsx`                                                                                                   |
| Styles           | `src/app/globals.css` ("WI-016" block)                                                                                                                                      |
| Docs             | `CHANGELOG.md`, `CLAUDE.md`, `docs/design-review/ENHANCEMENTS.md` (status), this file                                                                                       |

## 3. Verification

| Check                                                              | Result                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prettier, ESLint on changed files, `tsc --noEmit`                  | Verified                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm test:ci` against `silsila_wi012_test`                        | Verified: 40 files, 268 tests                                                                                                                                                                                                                                                                                                                                                            |
| `next build` and `pnpm docs:check` on a clean `git archive` export | see the gate line below                                                                                                                                                                                                                                                                                                                                                                  |
| Browser at 1440                                                    | Verified: overview "1 due for revision" opens the Week 1 revision view with one row; an empty revision view links "Next: Week 1 … (1 due)"; "Done when:"; Edit and Remove render as link buttons; the problem page shows two back links with `show=all`; Jobs heading "Jobs"; quick add answers "Application added. Open application" with the new record's link; company names at 15 px |
| Browser at 390                                                     | Verified: the running session is a 50 px strip (title, timer, Stop), no horizontal overflow                                                                                                                                                                                                                                                                                              |
| Disconnect form                                                    | Needs manual verification with a connected calendar (not connected locally); the component compiles and the action contract is unchanged (`remove`, `confirm`)                                                                                                                                                                                                                           |

## 4. Notes

- Two test applications ("WI-016 Co", "WI-016 Link Co") were added to the local dev database during verification; they are not in production.
- The disconnect action still validates `confirm` server-side; the client only hides the field until it is relevant.
