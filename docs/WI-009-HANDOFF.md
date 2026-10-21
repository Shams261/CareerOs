# WI-009 handoff — UX simplification

Branch `feat/wi-009-ux-simplification` on `main` after PR #13. Source: the UX critique of 2026-10-21 (rated the first-run experience 5.5/10: an engineer's console that explains instead of showing) and the two traps found in the production acceptance pass. Friction fixes only; the feature freeze stands.

## 1. Outcome

A newcomer is handed one job per page until there is data, every page has one visible primary action, the copy uses the owner's words, and the weekly review is three short screens. No schema change, no migration. One behaviour change in the schedule domain, recorded as ADR-015.

## 2. Changes

| Area                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared components   | `src/components/disclosure.tsx`: `Disclosure` (button that opens content in place, focuses the first field, `aria-expanded`/`aria-controls`) and `DisclosureTabs` (a row of link toggles sharing one panel). Replaces every `<details>` that wrapped a form. `src/components/date-jump.tsx`: a bare date field that opens the day or week on change.                                                                                                                                                                                   |
| Form feedback       | `ActionForm` marks the pressed button `aria-busy` (CSS spinner, reduced-motion safe), keeps the other buttons merely disabled, and shows a compact success message with a check mark beside the button that clears after three seconds. Errors and previews stay.                                                                                                                                                                                                                                                                      |
| App shell           | Sidebar: Today, Plan (`/calendar`), Practice (`/dsa`), Learn, Jobs, Weekly review (`/review`), Settings. Routes unchanged. The "PERSONAL WORKSPACE" top bar is removed. Page headings are the date (Today), the week (Plan, Weekly review) or the page name; taglines are gone.                                                                                                                                                                                                                                                        |
| First run           | Today shows one **Start here** card with a compact routine form (title, category, days, time) until the first routine exists; a one-time block is a link below it. Practice, Learn and Jobs show the same card for the first topic, subject and application. Settings' checklist lists only the remaining steps and disappears when done.                                                                                                                                                                                              |
| Schedule (ADR-015)  | `saveRoutine` adds a **new** routine to already-planned days from today on (future slots only, overlapping slots skipped unless allowed, nothing existing edited) and returns `{ changed, added }`. `generateThroughSunday` fills today → Sunday when Today or Plan is viewed. The generate form and `generationAction` are removed. Database test added in `tests/execution-database.test.ts`.                                                                                                                                        |
| Vocabulary          | "Daily override" → "Changed for this day"; "One-off block" → "Added for this day"; "From recurring routine" → "Routine"; "Edit / reschedule this occurrence only" → "Edit this day"; "Log actual time" → "Log time"; "Solved independently?" → "Did you solve it yourself?" with plain options; "Green progression 0/3" → "Green revisions in a row: 0 of 3"; "Carry forward" → "Carry to tomorrow" / "Still to do"; routine scope options and action messages reworded. The attempt validation message no longer says YES/PARTIAL/NO. |
| Progressive display | Filters on Practice, Jobs and a subject's topic list render only when the list has more than eight items or a filter is active. Zero counters, empty "Reminders", "Recent activity" and "Needs attention" cards are omitted; "This week" on Jobs lists only non-zero facts.                                                                                                                                                                                                                                                            |
| Weekly review       | `?step=week` (planned versus done, five facts, one line per day), `?step=reflect` (commitments from last week, five prompts led by what went well / what got in the way / what will change), `?step=plan` (priorities, next-week facts, Prepare next week), `?step=details` (everything else: bars, categories, progress facts, still-open items, schedule preview, past reviews, reminder).                                                                                                                                           |
| Google Calendar     | `GoogleCalendarPanel` renders in Settings (`#google-heading`); the OAuth callback and the conflict/disconnect redirects land there. Plan shows a one-line status with a link. Panel copy shortened; "Updates: instant / scheduled" replaces the push-sync sentence.                                                                                                                                                                                                                                                                    |
| Explanatory copy    | Every muted paragraph under a form is removed or cut to one line (schedule, DSA, learning, jobs, review and settings forms; calendar panel; Today stats line).                                                                                                                                                                                                                                                                                                                                                                         |

## 3. Verification

Local loop: `pnpm google:fake` + `pnpm dev` against an empty migrated database, signed in as the fake owner, in the desktop browser pane.

- First run: Today showed the Start here card; adding "DSA practice" (Mon–Fri, 23:00–23:45) put the block on Today immediately, filled Thursday and Friday on Plan, and the success state showed on the button during the save.
- Practice: Start here → topic saved as current → page-head "Add a problem" opens the form in place with focus on Title. Learn and Jobs show their Start here cards.
- Weekly review: steps render with the stepper; Next week shows priorities and Prepare next week.
- Settings: checklist, notifications, Google Calendar panel (not configured locally), appearance, account, status, export.
- 375 px: Today, Plan, Practice, Learn, Jobs, Weekly review, Settings have no horizontal overflow (`scrollWidth` equals `clientWidth`); the navigation scrolls in its own strip.
- Dark theme spot-checked on Today.
- Not exercised locally: Google Calendar connect (no client configured), push, a populated Jobs pipeline with filters (threshold logic is unit-level and covered by inspection).

## 4. Commands and results

Disposable local PostgreSQL (`silsila_wi009_test`), 2026-10-21:

| Check                                                                | Result                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `prisma format`, `pnpm db:generate`, `pnpm typecheck`                | Passed                                                            |
| Clean `db:deploy` (10 migrations), `prisma migrate diff --exit-code` | Applied, no difference                                            |
| `pnpm lint`                                                          | Passed                                                            |
| `pnpm test:ci`                                                       | 225 passed in 28 files (+1 in `tests/execution-database.test.ts`) |
| `pnpm build`                                                         | Passed                                                            |
| `pnpm docs:check`, `git diff --check`                                | Passed                                                            |

## 5. Follow-ups

- Re-check on usesilsila.me after deploy: Settings → Google Calendar still connected (the panel moved; the connection row did not), Plan status line, the weekly review steps with real data.
- The production workspace already has a routine, so the Today first-run card will not appear there; the Practice and Learn cards will if those are still empty.
- The `TEST`-prefixed production records are still deliberately in place.
