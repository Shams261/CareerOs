# Silsila design review — enhancements

Companion to [REPORT.md](REPORT.md). F-numbers refer to its findings table; bracketed IDs to the detailed findings files. Everything here is a proposal: nothing has been implemented. Effort: S under half a day, M one to two days, L more.

## A. Quick wins (each under half a day, no schema change)

1. **Fix the Monday review default** (F-01). Default to last week when it is Monday and last week's review is not completed, or show a "Review last week" link above the steps.
2. **Always show the Jobs view control and count visible of total** (F-02). Offers and closed applications stop disappearing.
3. **Add `section` and `show=revision` to Today's "Revise today" links** (F-03). One line in `summary.tsx`.
4. **Keep today's completed items visible in the open filter** (F-04), so Done leaves the confirmation and "Next:" on screen.
5. **Show Revised only when a revision is due** (F-07); return an undo payload from Reopen with an honest message (F-06).
6. **Key the Practice bands by the filter** (F-08) so search and status open the bands that match. Open the first band when nothing is current or due (F-21).
7. **Drop the ARIA table roles on Practice** (F-09). The band buttons then read as what they are.
8. **No preselected outcome on the attempt form** (F-10).
9. **One CSS rule for the hero Stop button** (F-11).
10. **Only the current block's Start is primary** (F-13 on Today); secondary for the reminder and theme saves on Settings, the stage and details saves on the application page, Add items and Copy prompt on the roadmap page.
11. **Daily reminder defaults to off until saved** (F-16).
12. **Routine edit message says what happened** (F-18): "Routine saved. Days already planned keep their times."
13. **Hide Skip and Cancel while a block runs** (F-24); Now/Next and Start only for today (F-38).
14. **Date jump: `key={value}` and navigate on blur or a four-digit year** (F-30).
15. **Separate destructive Remove routine button** (F-29) using the existing `.button.destructive`.
16. **One date helper** (F-44): `MMM d` everywhere ISO strings leak (Plan day labels, Problem next revision, Application dates).
17. **Drop the timezone from eyebrows** (F-45) and add `metadata.title` to every page (F-46).
18. **Label the sidebar landmark** (F-50) and give the chain rings 24 px targets with an `aria-label` that says worked / reviewed (F-23).
19. **Delete the nine explanatory paragraphs under forms** (F-41) and fix the one contradiction in Settings.
20. **Rename "Complexity" to "Difficulty"** (PR-8); "Done means." to "Done when:" (RP-21); "Job search" to "Jobs" (J-19); remove "2 of 3 green in a row" and "about 10 a day" (F-52).

## B. Foundation fixes (one to two days each)

1. **Feedback that survives the row** (F-05, F-17). One `ActionForm` per list, buttons carrying the item id, the message rendered above the list. Apply to notes, review priorities, roadmap Remove, Practice "Make current", application Mark done and Log result. Remember `DisclosureTabs` by label. Add `undo` to job stage changes.
2. **Phone shell** (F-14, F-25). Below 700 px: no capture field in the header (it lives in the More sheet), the running panel one line tall, the daily review and the stage control first in their asides, Jobs in the first four tabs if the job search is active (J-5).
3. **Row recipe** (F-15, F-22, F-35, inventory). One row component with slots icon · title · meta · action, wrapping titles when open, meta on a second line under 700 px, 44 px targets on coarse pointers, quick actions hidden on touch. Use it on the roadmap page, Practice (drop the redundant Pattern column), Jobs and Learn.
4. **Button consolidation** (F-47). Make `Button` work inside `ActionForm` (pass pending down instead of `useFormStatus`), then replace the 23 raw usages; variants primary / secondary / destructive / link; one 44 px floor on touch.
5. **Focus and landmarks** (F-33, F-34, F-32). Restore focus after pending; no `label` on row forms; item names as sr-only text on repeated buttons; a Settings switch for single-key shortcuts, or scope them to the list.
6. **Transitions on navigation** (F-36). `useTransition` with `aria-busy` and dimmed content on section switches and filters; this is the one place the cross-region round trip is felt.
7. **Tokens and duplicates** (F-49), in the batches already proposed in `docs/design/consistency-plan.md`: buttons, cards and rows first; merge the triple `.item-filters` and `.study-prompt` rules; delete dead rules; two breakpoints (1100, 700).
8. **Icons** (F-48). Replace the 36 glyphs with lucide icons, `aria-hidden`, text kept.

## C. Flow improvements

Step counts: clicks + required fields, from the page the task starts on.

| Flow                                        | Today                                                                                                        | Proposed                                                                                                                         | Change                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Start the current block                     | Today → scroll past Now card and stats → Start in the timeline (2 actions, one search)                       | Start inside the Now card; `S` still works (1)                                                                                   | 2 → 1, no search               |
| Close the day on the phone                  | Today → scroll past timeline and 6 aside cards → rating + notes → Save (3 fields, long scroll)               | Review card first in the aside; rating + optional notes → Save                                                                   | same fields, no scroll         |
| Study an item from Today                    | Today "Revise today" → wrong item → find the right one → Copy → study → Done → panel vanishes (4–6)          | link opens the right item → checkpoint and scope first → Copy → Done → "Done. Revision in 7 days. Next: …" (3)                   | 4–6 → 3, with confirmation     |
| Work the revision queue                     | Overview due count (not clickable) → open roadmap → "1 due" → section → next section by hand (5+)            | due count links to the first due section with `show=revision`; empty queue links to the next section with due items (2 per item) | 5+ → 2                         |
| Find a problem in Practice                  | search → bands stay closed → open each band (3+)                                                             | search opens matching bands (1)                                                                                                  | 3+ → 1                         |
| Record an attempt from the roadmap          | item → Record attempt → answer → Save → scroll to top → Back (5)                                             | same, with the back link repeated under Save and a `show=all` return (4)                                                         | 5 → 4, lands on the right item |
| Add an application                          | Add → 6-field form → Save → find the row → open (4 + 2 fields)                                               | Add → company + role → Save → "Open application" in the message (3 + 2 fields)                                                   | 4 → 3                          |
| Schedule a round and put it on the calendar | Add interview → 10 fields (title, timezone required) → Save → Add to schedule (3 + 10)                       | type, start, end visible; title from type; timezone from the owner; "Add to my schedule" on by default (2 + 3)                   | 3 → 2, 10 → 3 fields           |
| Move a stage on the phone                   | scroll past rounds and timeline → Stage card → select → Change stage (3, long scroll)                        | "Change stage" disclosure beside the stage pill in the summary line (2)                                                          | 3 → 2, no scroll               |
| Monday review                               | lands on the empty new week → press ← → This week → Reflect (loses text on Next) → Next week → Complete (6+) | lands on last week → Reflect → Save and continue → priorities → Complete (4)                                                     | 6+ → 4, nothing lost           |
| Change a routine for this week              | Plan → Edit → save → nothing changes → Today → Edit this day per day (5+)                                    | Edit → "Also this week's planned days (preview first)" → confirm (3)                                                             | 5+ → 3                         |

## D. Design direction (principles to hold while fixing)

1. **One primary per page, and it is the next thing to do.** Start on Today, Done on the roadmap page, Save attempt on a problem, Log the result on an application. Everything else is secondary or a link. This is already the rule in CLAUDE.md; the fixes above make it true.
2. **Feedback never disappears with the row.** Every write that removes or hides something shows its message and its Undo somewhere that stays: the list header, the card, or the status line.
3. **The phone is the "mark it and move on" device.** First screen: the title and the one action. Shell chrome stays under 15% of the viewport. Titles wrap; metadata takes the second line; targets are 44 px.
4. **Labels say what you do, dates look like dates.** No raw keys, no ISO strings, no timezone ids, no glyphs doing the work of icons. One helper per format.
5. **Same thing, same recipe.** One button, one row, one filter bar, one form stack, one feedback pattern, two breakpoints. New screens compose these; they do not add a sixth row style.

## E. Optional concepts

Text wireframes in `concepts/`: [today-launcher.md](concepts/today-launcher.md) (the Now card as the launcher, the aside reordered) and [phone-shell.md](concepts/phone-shell.md) (the header, More sheet and row layout on a phone). They illustrate B.2, B.3 and the first three flows in C; they are not mocks to copy pixel for pixel.

## F. Prioritised roadmap

**Status 2026-10-22:** all fifteen rows are implemented (row 1 in WI-013, rows 2–10 in WI-014, rows 11–15 in WI-015; see the handoffs).

Order by (user impact × frequency) / effort. Each row is a small WI or a batch inside one.

| #   | Item                                                                                                                                                   | Findings                           | Impact                                         | Effort | Suggested WI              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------- | ------ | ------------------------- |
| 1   | Three P0s: Monday review week, Jobs visibility, Revise-today link                                                                                      | F-01, F-02, F-03                   | core tasks write or land in the wrong place    | S      | WI-013 "Daily loop fixes" |
| 2   | Done keeps its confirmation and Next; Revised only when due; Reopen undo                                                                               | F-04, F-06, F-07                   | the study loop ends well                       | S      | WI-013                    |
| 3   | Practice: bands follow the filter, valid ARIA, a starting point, no preselected outcome                                                                | F-08, F-09, F-10, F-21             | search works; axe clean again                  | S      | WI-013                    |
| 4   | Undo that is reachable: list-level forms on notes, priorities, roadmap Remove, Make current; job stage undo; tab memory by label                       | F-05, F-17                         | destructive taps become safe                   | M      | WI-014 "Feedback"         |
| 5   | Today hierarchy: Start in the Now card, hero Stop visible, one primary, Skip/Cancel hidden while running, today-only Start                             | F-11, F-12, F-13, F-24, F-38       | the most-used screen reads at a glance         | S      | WI-015 "Today"            |
| 6   | Phone shell and asides: capture field out of the header, review and stage first, Jobs in the bar                                                       | F-14, F-25, J-5                    | every phone visit                              | M      | WI-016 "Phone"            |
| 7   | Row recipe: wrapping titles, meta line, 44 px targets, Pattern column removed, filter widths                                                           | F-15, F-22, F-35, F-51             | readable lists on phones and laptops           | M      | WI-016                    |
| 8   | Settings and reminders: daily default, job reminders in Settings, one reminder pattern, disconnect flow, push errors                                   | F-16, S-2, S-4, S-7, S-8           | reminders actually fire; one place to set them | S      | WI-017 "Settings"         |
| 9   | Jobs forms and vocabulary: quick add two fields, round form defaults, calendar checkbox, one "your move" pair, applied date for Saved                  | F-26, F-27, F-28, F-40             | the application flow halves its fields         | M      | WI-018 "Jobs"             |
| 10  | Weekly review and Plan: unsaved-text guard, Complete on step 3, past-week explanation, routine edit message, Remove button, date jump, Prepare on Plan | F-18, F-19, F-29, F-30, F-31, P-8  | planning becomes predictable                   | M      | WI-019 "Week"             |
| 11  | Copy and formats: dates, eyebrows, page titles, raw keys, explanatory paragraphs, streak-like phrases                                                  | F-39, F-41, F-44, F-45, F-46, F-52 | consistency the owner sees daily               | S      | consistency batch 1       |
| 12  | Accessibility pass: focus restore, landmarks, shortcut switch, chain targets, glyphs to icons, sidebar label                                           | F-23, F-32, F-33, F-34, F-48, F-50 | keyboard and screen-reader use                 | M      | consistency batch 2       |
| 13  | Buttons and tokens: `Button` everywhere, destructive variant, tokens in hot paths, duplicate and dead CSS, two breakpoints                             | F-47, F-49                         | stops the drift                                | M      | consistency batch 3       |
| 14  | Transitions on section and filter navigation                                                                                                           | F-36                               | production latency becomes visible, not frozen | S      | with batch 3              |
| 15  | Error and not-found pages; login sr-only "Sign in" and the unverified-app line                                                                         | F-42, L-1, L-2                     | rare, but the dead ends go away                | S      | with the `/privacy` WI    |

## G. Not recommended now

- **A redesign, a new visual language or a component library.** The token set and the in-place form model are sound; the problems are behavioural and consistency debt, not style.
- **Client-side state stores, optimistic updates or a modal system.** The server-rendered, one-open-panel model is working; the fixes above stay inside it.
- **Pagination or virtualisation on Practice or the roadmap page.** Pages already render one section or closed bands; 101 KB and about 0.15 s per roadmap section is fine.
- **Removing Learn.** It is off the menu and harmless; decide after real usage, as CLAUDE.md already says. Only the duplicate reminder and the orphaned nav state (LE-1, LE-2) are worth touching.
- **AI preparation suggestions.** Deferred by the owner; nothing here depends on it.
- **Streaks, scores, badges or per-day quotas.** Two phrases that drift that way are flagged for removal (F-52); nothing should be added.
- **Replacing the bottom bar with a drawer or hamburger.** Four tabs plus More is right for five daily destinations; the only change is which four.
