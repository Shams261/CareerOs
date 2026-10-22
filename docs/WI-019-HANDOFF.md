# WI-019 handoff — reminder dates, search scope, P0 mark

Branch `feat/wi-019-reminder-dates-search-scope` from `main` (after PR #24). Scope: the two new findings of the second UAT pass (B9 and the search-scope item) and the owner's palette decision. No schema change, no migration, no new dependency.

## 1. Outcome

- **B9, reminders carry the absolute date.** Interview reminders say "is tomorrow, Fri, Oct 23 at 10:00 AM" (or "today, Thu, Oct 22 at …"); follow-up reminders say "overdue since Tue, Oct 20" and "today, Thu, Oct 22". Today's Reminders card prints each reminder's own time under its text ("Thu, Oct 22 · 1:07 PM", the owner's zone), so a reminder read a day late is never ambiguous. The one test that pinned the old wording was updated to the new sentence.
- **Search scope on a roadmap.** The field says "Search this section". While a search is on, the page counts matches in the other sections and the list says "Also in Two Pointers (3) · Trees (3) …" with links that keep the words; when the section has no match the empty state says "No match in this section. Found in …" or "… Nothing in the other sections either."
- **P0 mark.** The purple pair is gone from the tokens, the JSON handoff, the brand doc and CLAUDE.md; the P0 pill uses the teal tint like every other selected state. The rest of the WI-017 palette stays, as the owner decided.

## 2. Changes

| Area          | Files                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notifications | `src/features/notifications/service.ts`, `tests/jobs-database.test.ts` (expected wording)                                                           |
| Today         | `src/app/today/page.tsx` (reminder timestamp)                                                                                                       |
| Roadmap       | `src/app/roadmap/[id]/page.tsx` (matches elsewhere), `src/features/roadmap/item-list.tsx` (empty state, "Also in"), `section-nav.tsx` (placeholder) |
| Tokens        | `src/app/design-tokens.css`, `src/assets/design-tokens.json`, `docs/product/brand-system.md`, `CLAUDE.md`                                           |
| Styles        | `src/app/globals.css` (`.pill.priority`, "WI-019" block)                                                                                            |
| Docs          | `CHANGELOG.md`, `CLAUDE.md`, this file                                                                                                              |

## 3. Verification

| Check                                                              | Result                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prettier, ESLint on changed files, `tsc --noEmit`                  | Verified                                                                                                                                                                                                                             |
| `pnpm test:ci` against `silsila_wi012_test`                        | Verified: 40 files, 268 tests (the interview reminder test expects the new sentence)                                                                                                                                                 |
| `next build` and `pnpm docs:check` on a clean `git archive` export | see the gate line below                                                                                                                                                                                                              |
| Reminder on the dev server                                         | Verified: one run of the reminder processor queued "Your Example Labs (demo) Coding interview is tomorrow, Fri, Oct 23 at 10:00 AM." and Today shows it with "Thu, Oct 22 · 1:07 PM" under it                                        |
| Roadmap search                                                     | Verified: "sum" in Backtracking lists six rows and "Also in Arrays & Hashing (1) · Two Pointers (3) · …"; "zzzz" says "No match in this section. Nothing in the other sections either."; the placeholder reads "Search this section" |
| P0 mark                                                            | Verified: `rgb(228, 239, 234)` on `rgb(30, 107, 91)`                                                                                                                                                                                 |

## 4. Notes

- Reminders already queued in production keep their old text; new ones carry the date. Nothing is rewritten.
- The reminder processor was run once against the dev database to produce the row above; no production call.
