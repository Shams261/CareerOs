# WI-049 handoff — five UI fixes

Date: 2026-10-28. Branch `feat/wi-049-ui-fixes` from `main` `c08ea5d` (WI-048). These are the five UI frictions named in the UAT audit (`output/Silsila-UAT-Audit.pdf`, sections 4 and 10). No migration, no data change.

## What changed

1. **The empty band on Today.** `.today-workspace.is-today` places the rail across two grid rows. With rows sized `auto`, a tall Needs attention rail spread its height over both rows, and a band of about 230 px opened under the launcher. The rows are now `auto 1fr`, so the launcher row keeps its own height and the agenda row takes the rest. Narrow screens, Jobs and Roadmap reset the rows (`grid-template-rows: none`), because their layouts differ.
2. **Roadmap rows name first** (`src/app/roadmap/page.tsx`). Each row's title is now the roadmap, and the context reads "Next: item · section". It used to show the roadmap as a small eyebrow with the next item as the big title, so an item such as "Online assessment" looked like a roadmap. With nothing left the row says "Everything done", and an empty roadmap says "No items yet".
3. **The Jobs rail repeating the list.** `railRepeatsList` (`src/features/attention/domain.ts`, pure) is true when two things hold: the shown list has at most five applications, and every attention row's link names one of them. The rail then says "The 3 moves are in Applications." and keeps View all, Next job search block and This week. With a longer list, or a row about an application not shown, the rail stays as it was.
4. **Today's header on a phone** (`src/features/today/header.tsx`, at 700 px and narrower):
   - It is one row: the title, a short date ("Tue 27 Oct"), the arrows and More.
   - The date field moves into More (`.today-util-date`). The extra "Today" link on another day is hidden, because the tab bar's Today does the same.
   - On another day the short date is the heading. "Past day" or "Upcoming day" and the long date stay for screen readers.
   - The More panel opens under the row.
   - At 375 px the launcher's top moved from 316 px to 209 px.
5. **Reminder copy** (`src/features/notifications/domain.ts`):

   | Before                                                | After                                                      |
   | ----------------------------------------------------- | ---------------------------------------------------------- |
   | "You haven't checked today's progress yet."           | `DAILY_REVIEW_TEXT`: "Today is ready to review."           |
   | "You planned X from … and haven’t recorded progress." | `overdueText`: "X (18:00–19:30) has nothing recorded yet." |
   | Settings: "Remind me when I haven’t reviewed my day"  | Settings: "Remind me to review my day"                     |

   "haven't" is now in `BANNED_WORDS`, so Study Nudges and Rumi's rules exclude it too. Inbox rows already stored keep their old words.

## Tests

`tests/ui-fixes-domain.test.ts` has 2 tests:

- `railRepeatsList` returns true for a short list it covers. It returns false when a row names another application, when the list is long, when there are no rows or no link, and for a look-alike path.
- The reminder copy is checked against `BANNED_WORDS`.

The existing notification, nudge, Today, attention and agent tests pass unchanged. One Today fixture keeps an old reminder title as stored data.

## Browser check (local, `silsila_dev_empty`)

- **1440 px:**
  - Today: Your day sits directly under the launcher, with the rail beside it.
  - Jobs: with 4 applications, the rail reads "The 3 moves are in Applications."
  - Roadmap: rows read "Backend engineering / Next: Browser-to-backend security boundary · Week 1 · …".
  - Today's desktop header is unchanged.
- **375 px:**
  - Today shows "Today Tue 27 Oct ‹ › More" on one row, and the launcher is fully visible.
  - A past day shows "Tue 20 Oct ‹ › More". More opens under the row with the date field, Add and Close the day.
  - There is no horizontal overflow.
- No console errors from the app.

## Production

Nothing to run: merge and deploy.

## Gate

Lint, typecheck, build and docs check (87 files) pass on an export of the working tree; `pnpm test:ci`: 93 files, 548 tests; `git diff --check` clean.
