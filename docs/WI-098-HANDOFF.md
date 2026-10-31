# WI-098 handoff: Today, checked again

Date: 2026-10-31. Source: `output/Silsila-Today-Check.pdf` (not committed): 38 scripted checks on the lab, four black-box probes, a three-case security test, one read-only look at production; seven bugs and seven suggestions, every one accepted, plus the owner's own request afterwards: the band centred, as the roadmap's goal card is. No migration.

## The band

`DailyLine` (`src/features/today/daily-line-card.tsx`) is one centred column: the date eyebrow, the live clock (`daily-clock`, 30 px, a step above the greeting), the greeting (44 px, `text-wrap: balance`) and the quotation (60ch, balanced) with its refresh button a 32 px round target. On a phone 26 / 30 / 15 px. The part-of-day word under the clock is gone (the tint says it); the `data-band` handshake with the header is unchanged. The three tints, the first-run header and dark are untouched.

## Bugs fixed

| #   | Bug                                                                                       | Fix                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | On a phone the row's ⋯ menu opened to the right of the ⋯ and was cut by the screen edge.  | The menu hangs from `.agenda-actions`' right edge on a phone (`position: relative` on the actions, `static` on the `.exec-menu`), so it is inside the screen whatever the row.                                           |
| B2  | A "Recorded · Needs update" row offered Log time and Reschedule; Mark done was only in ⋯. | `agenda.tsx`: a needs-update row carries a `row-decide` form with Mark done and Let go (skip, reason "Let go", `broadcast="blocks"`); a not-recorded row keeps Log time · Reschedule; Log time stays in ⋯ and the modal. |
| B3  | "Starts in 5 h 12 min".                                                                   | `startsInLabel` in `today/domain.ts`: "5 min", "1h", "5h 12m".                                                                                                                                                           |
| B4  | A past day read "2 blocks · none left ahead".                                             | `planCountLine(blocks, now, past)`: "N to decide" or "all decided" on a past day; "still ahead" / "none left ahead" on today and later.                                                                                  |
| B5  | Phone targets under 24 px.                                                                | The refresh icon 32 px round; `.today-fact-button` 28 px; `.rail-card-link`, the setup card's Hide for now and View full schedule 24 px.                                                                                 |
| B6  | Notes: Done had no Undo.                                                                  | `noteOpAction` returns `reopen-note`; `undo/service.ts` clears `doneAt` for the owner's note; `NoteList` keeps its hidden rows per list, so the list the server sends back after Undo shows the note again.              |
| B7  | Two Pause and two Complete on /focus.                                                     | `HideOnFocus` (`src/features/execution/hide-on-focus.tsx`) wraps `RunningNow` in the layout and hides it on `/focus`; it stays mounted so `PipHost` keeps the pop-out.                                                   |

## Suggestions

S1 Make Silsila yours is a `card rail-card` in the rail (`SetupCard rail`); S2 More says "Add a block"; S3, S4, S5, S6, S7 are B2, B1 + B5, B6, B7, B3 + B4 above.

## Tests

- `tests/today-domain.test.ts`: `planCountLine`, `startsInLabel`.
- `tests/today-security.test.ts` (from the check): six executions, Log time and an unlinked Pause on another owner's block or session refused; Edit, Delete, a foreign goal, a foreign session, a foreign note and the restore-block undo refused; the restore-session undo keeps the session the owner's own and unlinked; Close the day and Let go touch only the owner's day.
- The e2e journeys are unchanged: the Focus journey already walks Start, Focus and Done; the phone menu's position and the row's decision actions were verified on the lab (`scratchpad` scripts, not committed).

## Gate

prettier on the changed files, `pnpm lint` (only the untracked docs/audit and uat-review files warn, as before), `pnpm typecheck`, `pnpm test:ci` on a fresh database (690 tests), `pnpm build`, `pnpm test:e2e`, `pnpm test:e2e:safari`, `pnpm docs:check`, `git diff --check`.
