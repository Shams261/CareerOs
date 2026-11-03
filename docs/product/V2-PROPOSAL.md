# Silsila V2: product strategy and roadmap proposal

A product-planning document, written on 2026-11-02 after the WI-145 audit. It changes nothing; it proposes. Every claim about the product is checked against the current code (`main` at `a9455b8`), and each section marks what is **verified** and what is a **hypothesis** that needs the owner's use to confirm.

**A note on the name.** The CHANGELOG has already used "Version 2" (2.0.0, WI-027 to WI-098) and released 3.0.0. To avoid confusion, this document calls the proposal "V2" as asked, but the release it describes would be **4.0.0** in the CHANGELOG.

## 1. Executive summary

Silsila is technically strong and functionally broad. In about forty days it grew to:

- 23 pages, 11 API routes and 120 Server Actions;
- 31 feature modules and 43 database models;
- an assistant with about 20 tools, memory, voice, cards and daily lines.

The WI-145 audit found no critical or high defects.

**The evidence points to a usage problem, not a feature gap.** The only usage data available is the row counts printed by the owner's restore drill: counts only, no content. They come from the production backup of 2026-11-02, six days after the fresh start of 2026-10-27.

| Record                   | Count | Meaning                                                           |
| ------------------------ | ----- | ----------------------------------------------------------------- |
| Daily plans              | 12    | Days that were opened and generated                               |
| Blocks                   | 20    | The newest was created on 2026-10-29                              |
| Sessions (recorded work) | 5     |                                                                   |
| Practice attempts        | 0     |                                                                   |
| Learn activities         | 0     |                                                                   |
| Job applications         | 0     |                                                                   |
| Weekly reviews           | 0     |                                                                   |
| Reminders queued         | 0     | Push is enabled on the owner's devices, but nothing was ever sent |

These six days were also the most intense building period (WI-099 to WI-145), so low use is expected and is **not yet a verdict**. Still, it is the only evidence there is, and it says the core loop (plan → record → close the week) has not yet become a habit. Most modules have never been used for real.

**The recommendation.** V2 should make the core loop run every day and measure that it does, before adding capability. Concretely:

1. A small, owner-only usage panel built from records that already exist.
2. One "daily rhythm" setup that actually turns on the nudges the product already has; they are all off by default.
3. Retiring the hidden Learn module.
4. Freezing Rumi's surface until the measures show which entry points earn their place.
5. Two engineering items that protect daily use: no duplicate pushes, and an all-or-nothing Undo.

Bigger ideas (offline Today, free/busy-aware planning, one-region hosting) wait for evidence from use. Several tempting ideas are rejected outright (section 9).

## 2. Current product assessment

### What exists (verified)

| Area          | Route(s)                                     | What the owner can do                                                                                                                                                      | Connected to                                      |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Today         | `/today`, `/`                                | The day's agenda, the launcher (start, update earlier blocks, close the day, let go of yesterday), Focus, rings, Needs attention, Rumi's line card, Day Print              | Plan, Practice, Roadmap, Jobs, nudges, Rumi       |
| Plan          | `/calendar`                                  | The week as a list, routines with a previewed edit, change a block for one day, Prepare next week, Google Calendar sync                                                    | Today, Review, Calendar                           |
| Roadmap       | `/roadmap`, `/roadmap/[id]`, `/roadmap/deck` | Roadmaps by week, item status and spaced revision, the default curriculum, a revision deck, an Ask Rumi card on items                                                      | Practice (`followPractice`), Rumi, goals          |
| Practice      | `/dsa`, `/dsa/[id]`, `/dsa/drill`            | Problems, append-only attempts, the 3/7/14 revision ladder, a pattern quiz                                                                                                 | Roadmap, Jobs (formats), Today (Needs attention)  |
| Jobs          | `/jobs`, `/jobs/[id]`, prep doc and mock     | Applications, stage history, rounds (optionally a block on the plan), results, follow-ups, invites, sourced prep docs, "Plan until the date" (plan cards), mocks, debriefs | Plan, Practice, Roadmap, Rumi                     |
| Weekly review | `/review`, `/review/look-back`               | The week (planned vs done), reflect, plan (priorities, Prepare next week, close), Rumi's summary and week draft, months of records in Look Back                            | Plan, Rumi                                        |
| Settings      | `/settings`                                  | Account and sessions, Rumi and AI (limit, style, memory, button, voice), reminders (5 groups) and push, Google Calendar, appearance, data, first-run steps                 | everything                                        |
| Ask Rumi      | drawer on every page, `/rumi`                | Reads, small writes with Undo, cards for bigger changes, plans, memory, Talk (voice), study cards                                                                          | every feature's services                          |
| Learn         | `/learn/*` (URL only)                        | Subjects, topics, mastery; not in the navigation since WI-063                                                                                                              | Roadmap and prep items (links), reminders, review |

### How the modules connect (verified)

The connections are richer than an outsider would expect:

- A round can put its block on the plan.
- A prep doc becomes plan cards ("Plan until the date", `planFromDoc`).
- A job's interview formats tick practice links.
- A roadmap item linked to a problem follows Practice.
- Revisions due appear in Today's Needs attention.
- The weekly review prepares next week and can hand it to Rumi.

**The product does not lack connections. It lacks use.**

### Breadth versus use (verified counts, with the caveat in section 1)

| Measure                             | Value                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages, routes, actions              | 23 pages, 11 API routes, 120 Server Actions                                                                                                                                                |
| Rumi entry points                   | Sidebar, the round button, ⌘/, ⌘K, the line card, Rumi noticed, roadmap items, the prep doc page, the roadmap page, the review summary, the week draft, Plan until the date, mock, debrief |
| First-run steps                     | 3 on an empty Today, then 6 in "Make Silsila yours"                                                                                                                                        |
| Reminder groups in Settings         | 5 (study nudges, daily, revision, job follow-up, interview); every study nudge is off by default (`DEFAULT_NUDGES`)                                                                        |
| Usage measures visible to the owner | None. The Rumi 2 and 3 plan defines them (lines rated, fallback share, writes kept vs undone, cards applied vs dismissed, messages by voice), but reading them needs SQL                   |

## 3. Existing strengths

These should stay as they are:

- **The core model.** Routine → dated plan → block → session, with planned and actual kept apart. This is the product's real differentiator against generic to-do and habit apps, and it is enforced in the schema.
- **Calm by construction.** No streaks, scores or pace forecasts. Undo instead of confirmation. One primary action per page. Plain copy. This is rare and valuable; V2 must not trade it for engagement tricks.
- **Interview preparation as a connected chain.** Application → rounds → sourced prep doc → plan cards → practice formats → debrief and mock. Few products connect these at all.
- **Privacy-first AI.** A pinned zero-retention model, explicit field exclusions, an owner-set monthly limit, small writes with Undo, bigger ones as cards.
- **Engineering quality.** Owner scoping, idempotent scheduling, DST-correct time, about 900 tests, three-browser journeys, encrypted daily backups with a verified restore (3 s on 2026-11-02).
- **Look Back and the weekly review.** These already provide fact-based progress reporting (month facts, planned vs done per category). V2 does not need a new analytics screen for the owner's career progress.

## 4. Product gaps and user problems

Each gap is marked **Verified** (seen in code or counts) or **Hypothesis** (needs the owner's use to confirm).

| #   | Gap                                                                                                                                                                                    | Evidence                                                                               | Status                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| G1  | The core loop has not become a habit: 5 sessions in six days, no review, no attempts                                                                                                   | Restore-drill counts                                                                   | Verified (counts); cause is a hypothesis: building time vs friction vs fit |
| G2  | Nothing reaches the owner's phone to start the day or close it. All study nudges and Rumi's lines are off by default, and no reminder was queued in six days, although push is enabled | `DEFAULT_NUDGES`; NotificationLog = 0                                                  | Verified                                                                   |
| G3  | Turning the rhythm on is spread across many controls: 3 + 6 first-run steps, 5 reminder groups, separate push and voice set-ups                                                        | `features/setup/domain.ts`, `settings/sections/reminders.tsx`                          | Verified (the structure); that it blocks use is a hypothesis               |
| G4  | The owner cannot see whether Rumi's features are used or wanted, so every Rumi decision (keep, remove, budget) is a guess. The previous audit asked for this; it is still open         | No surface reads `metadata.actions` status, card status, line feedback or `via: voice` | Verified                                                                   |
| G5  | Learn is hidden but still maintained: about 1,750 lines, its own reminders, links from roadmap and prep items, and its pages are in the e2e walk. It has no recorded activity          | `features/learning/`, `app/learn/`; LearningActivity = 0                               | Verified (cost); whether the owner wants it is for the owner to say        |
| G6  | Rumi has 14 entry points for one owner. More doors make it unclear where to ask, and each door is code to keep working                                                                 | Section 2                                                                              | Verified (count); harm is a hypothesis                                     |
| G7  | The installed Android app shows nothing offline (the service worker has no `fetch` handler), so Today cannot be read without a connection                                              | `public/sw.js`                                                                         | Verified (behaviour); need is a hypothesis                                 |
| G8  | Plans are made blind to the owner's other commitments: Silsila sees only its own calendar (ADR-010), so a study block can sit on top of a meeting                                      | ADR-010; `features/calendar/`                                                          | Verified (design); collisions happening is a hypothesis                    |

**Already handled well, so no V2 work is needed:**

- interview → plan (`planFromDoc`);
- revisions due on Today;
- month progress facts (Look Back);
- next-week preparation (review → Prepare next week, Rumi's week draft);
- the app staying awake (the per-minute scheduler keeps the Render instance from sleeping).

## 5. V2 product vision

> **Silsila V2 makes the daily loop run by itself.** The plan reaches you in the morning, the day closes in a minute in the evening, the week closes on Sunday, and you can see, in plain facts, which parts of Silsila you actually use, so the product keeps only what earns its place.

**Primary problems V2 solves:** G1, G2, G3 and G4. G5 and G6 are simplifications.

**Measurable objectives** (to be validated by the owner; section 11 has the measures):

1. **The loop runs:** recorded work on most days of a normal week, and a weekly review closed most weeks.
2. **The rhythm reaches the phone:** the morning plan and evening close are on, and the owner does not mark them "Too many".
3. **Rumi earns its place:** most of Rumi's at-once changes are kept, not undone, and its unused entry points are removed after UAT.
4. **The product gets smaller, not larger:** V2 ends with fewer lines of feature code and no new navigation item.

**Core V2 improvements:** R1 to R4 in section 6, plus the engineering items E1 and E2 (section 7).

**Explicit non-goals:**

- New modules or navigation items.
- New Rumi tools.
- Multiple users.
- Native apps.
- Charts, dashboards and scores.
- Reading the owner's other calendars' contents.
- Automatic job applications.

**What stays unchanged:**

- The navigation (Today, Plan, Roadmap, Practice, Jobs, Weekly review, Settings, Ask Rumi).
- The core model and its invariants.
- The voice and brand.
- Opt-in notifications.
- The AI privacy rules.
- The owner-set AI limit.
- Learn stays out of the navigation.

**First, improve what exists:** finish two weeks of real use (Phase 0) and ship the usage panel before any new capability.

**How V2 feels different:** the morning starts with one line on the phone and the evening ends with one press. Settings is shorter. The owner knows which parts of the app they rely on. Nothing new to learn.

## 6. Recommended V2 features

Five recommendations, each tied to a gap. Fewer, better ones over a long list.

### R1 · "How I use Silsila": an owner-only usage panel (P0)

1. **Problem (G4, G1):** the owner cannot tell which parts of Silsila are used, so V2 and Rumi decisions are guesses.
2. **Why the current app does not solve it:**
   - Look Back shows career facts (time, attempts, rounds), not product use.
   - Rumi's measures live in `AgentMessage.metadata` (`actions[].status`, `requests[].status`, `via`), `NotificationLog.feedback` and `metadata.rumi`, and are readable only with SQL.
3. **Solution and workflow:** a section in Settings → Data showing the last 14 and 30 days as plain counts:
   - days with recorded work, sessions, blocks planned vs recorded;
   - weekly reviews closed, practice attempts, applications touched;
   - Rumi: questions (typed or spoken), changes kept or undone, cards applied or dismissed, lines written or fallen back, line feedback;
   - reminders sent and opened (`openedAt`).

   Facts only, no scores, no comparisons, no charts.

4. **Example:** on day 14 of UAT the owner opens Settings → Data and reads "Rumi: 31 questions, 4 changes (1 undone), 6 cards (2 applied), 0 spoken". They decide to keep voice off and remove two Rumi doors.
5. **Value:** every later decision in this proposal (R3, R4, hosting, the AI limit) becomes evidence-based.
6. **Complexity:** Low–Medium. Reads only, no migration, one loader in `features/settings/page-data.ts`. Counts can be computed on view, since the volume is tiny.
7. **Dependencies:** none. Architecturally a read model over `agent`, `notifications`, `execution`, `review`, `dsa` and `jobs`. Put the aggregation in `settings` (or a small `usage` module) so no new two-way feature pair appears.
8. **Risks:** it could drift into a scoreboard. Guard it with the copy rules (no percentages framed as performance, no "best", no trends) and keep it in Settings, never on Today.
9. **Success:** the owner uses it at the end of UAT to make the R3 and R4 decisions.
10. **Release:** V2, first.

### R2 · One "Daily rhythm" set-up (P1)

1. **Problem (G2, G3):** the product promises "show up daily", but nothing reaches the phone unless the owner finds and turns on several separate settings. In six days no reminder was queued.
2. **Why the current app does not solve it:**
   - Study nudges, the block-start nudge and Rumi's lines are all off by default.
   - Turning them on is spread across Settings → Reminders (5 groups), push set-up and Rumi.
   - The first-run steps include "Turn on notifications on your phone" but not the rhythm itself.
3. **Solution and workflow:** one guided card, replacing the scattered first steps for this purpose, asks three questions and shows the result before saving:
   - When does your study day start? (the morning plan time)
   - When do you close the day? (the evening check-in)
   - At what time on Sunday do you close the week? (the weekly review reminder; the review day is Sunday, `isReviewDay`)

   It saves through the existing settings (`StudyNudgeSetting`, `NotificationPreference`). Everything stays opt-in and editable in Settings.

4. **Example:** the owner answers 08:00, 21:30 and 18:00 on Sunday. The next morning one push opens Today. At 21:30 the evening check-in leads to Close the day. On Sunday the review opens.
5. **Value:** the loop that Silsila is built around actually starts every day, without the owner having to remember the app.
6. **Complexity:** Low–Medium. UI over existing settings and existing delivery (nudges, push, inbox), no migration.
7. **Dependencies:** E1 (no duplicate pushes) should land first, so the first pushes the owner turns on are clean. R1 shows whether it works.
8. **Risks:**
   - Notification fatigue. Mitigate with the existing per-day caps, the "Too many" feedback that pauses midday, quiet hours, and nothing on by default.
   - Android battery or OS settings may delay pushes; this can be checked on the owner's phone.
9. **Success:** after two weeks, reminders are sent and opened on most days, no "Too many", and more days with recorded work than before (R1).
10. **Release:** V2.

### R3 · Retire Learn (P1, needs the owner's decision)

1. **Problem (G5):** a hidden module costs real maintenance (about 1,750 lines, reminders, tests, e2e coverage, links from roadmap and prep items) and adds nothing the owner uses. Roadmap and Practice cover study; LearningActivity has no rows.
2. **Why the current app does not solve it:** Learn was removed from the navigation (WI-063) but not from the code. The previous audit asked for an ADR, "remove the UI or bring it back", and it is still open.
3. **Solution:** an ADR, then one work item that:
   - removes the Learn pages, its reminders and the Learn links in roadmap and prep items, which become plain text or point at the roadmap item;
   - keeps the tables and the export, so no data is lost and the change is reversible;
   - leaves dropping the tables to a much later migration, if ever.
4. **Example:** nothing visible changes in the navigation. Settings → Reminders loses a group that never fired.
5. **Value:** less code to keep working, a simpler Settings, faster future work.
6. **Complexity:** Medium. Several features reference it (jobs prep items, roadmap items, review, notifications, settings); the boundaries and e2e tests must be updated.
7. **Dependencies:** the owner's decision. Keeping the data means no migration at first.
8. **Risks:** the owner may want Learn back later. Mitigate by keeping the data, and by tagging the commit so the code can be restored.
9. **Success:** feature code shrinks by about 1,500 lines, and every suite and journey passes.
10. **Release:** V2, after R1 (in case the panel shows unexpected use).

### R4 · Rumi: fewer doors, no new tools until the measures say so (P1)

1. **Problem (G6):** 14 ways to reach Rumi, and Rumi 2 and 3 shipped faster than their measures could be read.
2. **Why the current app does not solve it:** each entry point was added for a good local reason, but none was ever removed.
3. **Solution:**
   - Freeze Rumi's tools and features for V2.
   - After two weeks of R1 data, remove entry points with no recorded use. For example, the prep doc's Ask button and the roadmap page's Ask button duplicate the drawer.
   - Keep the drawer, ⌘/ and the roadmap item card.
4. **Example:** R1 shows the debrief and mock were never opened from Rumi. Those buttons go, and the prep page keeps its own forms.
5. **Value:** one clear place to ask, less code, and a Rumi decision (budget, voice, lines) made on data.
6. **Complexity:** Low (removals).
7. **Dependencies:** R1.
8. **Risks:** removing a door the owner liked. Mitigate with data and the owner's sign-off per door.
9. **Success:** the number of entry points goes down, and Rumi questions per week do not.
10. **Release:** V2, late (needs R1 data).

### R5 · Today readable offline in the installed Android app (P2, validate first)

1. **Problem (G7):** opening the installed app without a connection shows the browser's offline page. The plan for the day is unreadable on a train or in a basement.
2. **Why the current app does not solve it:** `public/sw.js` handles push only; there is no `fetch` handler or cache.
3. **Solution:** cache the last Today page read-only in the service worker, with a clear "offline, as of 08:05" line. No writes offline.
4. **Example:** on the metro the owner opens the app and sees today's blocks from the morning.
5. **Value:** a calmer morning on a phone. It only matters if this situation is common.
6. **Complexity:** Medium. Server-rendered pages, a nonce CSP and per-session HTML make naive caching risky: there is a risk of stale or leaked HTML after sign-out.
7. **Dependencies:** sign-out must clear the cache. Privacy: personal plan data at rest on the owner's own device.
8. **Risks:** showing a stale plan as if it were live; cache bugs are hard to see.
9. **Success:** the owner reports needing it during UAT. If not, do not build it.
10. **Release:** later, only if UAT shows the need.

## 7. Engineering and technical debt

Kept separate from product work, as asked. Each item is checked against the current code.

| Item                                                                                                                     | What it is today                                                                                                                                                                                                                           | Classification                                         | Recommendation                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **E1 · Duplicate push prevention** (BE-4)                                                                                | Two schedulers now call `/api/notifications/process` (cron-job.org every minute, GitHub Actions every 15 minutes, WI-121). `deliverPending` reads rows, then sends, without claiming them, so two overlapping runs can send one push twice | Maintenance / reliability                              | **Do in Phase 1, before R2** turns pushes on: claim rows with a conditional update (or `FOR UPDATE SKIP LOCKED`) before sending. S                                       |
| **E2 · All-or-nothing Undo** (BE-10, BE-11)                                                                              | Some Undo kinds restore in several steps without one transaction, and a double press can act twice                                                                                                                                         | Maintenance / reliability                              | Phase 1. Undo is a core product promise. M                                                                                                                               |
| **E3 · Three indexes** (BE-12: `ActualSession.taskId`, `DsaAttempt.actualSessionId`, `LearningActivity.actualSessionId`) | Missing foreign-key indexes, used by deletes and undos                                                                                                                                                                                     | Performance (negligible at today's volume: 5 sessions) | Bundle into the next migration that is needed anyway. Drop the `LearningActivity` one if R3 retires Learn. S                                                             |
| **E4 · Thirteen two-way feature pairs**                                                                                  | Listed in `tests/boundaries.test.ts`; the list may only shrink                                                                                                                                                                             | Architecture                                           | Not V2-enabling. Shrink pairs only inside work items that touch those modules: R1 must not add `settings ↔ agent`; R3 removes Learn's links. Never a standalone refactor |
| E5 · No error capture beyond logs                                                                                        | Errors are found by reading Render's log by reference                                                                                                                                                                                      | Maintenance / observability                            | Later; the owner chooses a provider, payloads must be scrubbed                                                                                                           |
| E6 · Database TLS without certificate verification                                                                       | `DATABASE_SSL=no-verify`                                                                                                                                                                                                                   | Security hardening                                     | Later; test on a branch deploy                                                                                                                                           |
| E7 · Free tiers, app and database in different regions                                                                   | Every statement crosses regions                                                                                                                                                                                                            | Performance / platform                                 | A hosting decision after UAT (ROADMAP.md), with R1's data on real usage                                                                                                  |

None of these is a V2 feature. E1 is a prerequisite for R2.

## 8. Prioritisation matrix

| ID    | Item                                                           | Type                   | Priority       | Value      | Effort | Evidence                  | Needs validation                 |
| ----- | -------------------------------------------------------------- | ---------------------- | -------------- | ---------- | ------ | ------------------------- | -------------------------------- |
| P0-a  | Two weeks of real use with a short daily note, no new features | Process                | P0             | High       | —      | G1 counts                 | —                                |
| R1    | Usage panel                                                    | Product                | P0             | High       | S–M    | G4 verified               | No                               |
| E1    | Duplicate push prevention                                      | Engineering            | P0 (before R2) | Medium     | S      | Two schedulers verified   | No                               |
| R2    | Daily rhythm set-up                                            | Product                | P1             | High       | S–M    | G2 verified, G3 structure | Yes: does the owner want pushes? |
| E2    | All-or-nothing Undo                                            | Engineering            | P1             | Medium     | M      | Audit BE-10/11            | No                               |
| R3    | Retire Learn                                                   | Product simplification | P1             | Medium     | M      | G5 verified               | Yes: the owner's decision        |
| R4    | Fewer Rumi doors                                               | Product simplification | P1             | Medium     | S      | G6 count verified         | Yes: R1 data per door            |
| R5    | Offline Today                                                  | Product                | P2             | Low–Medium | M      | G7 behaviour verified     | Yes: is it needed?               |
| R6    | Free/busy-aware planning                                       | Product                | P2             | Medium     | M–L    | G8 design verified        | Yes: do collisions happen?       |
| E3–E7 | Indexes, pairs, errors, TLS, hosting                           | Engineering            | P2             | Low–Medium | S–M    | Audit                     | Hosting: R1 data                 |

**R6, free/busy-aware planning (P2, described briefly):** with a separate, optional consent for Google's free/busy scope (busy intervals only, never titles or details), Plan, Rumi's plan cards and the week draft could avoid busy times.

- It needs an ADR-010 amendment, a new consent and a new token scope.
- Build it only if the owner reports study blocks landing on meetings during UAT.

## 9. Ideas we should NOT build

| Tempting idea                                                    | Why not                                                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A "readiness score" or "interview readiness %"                   | A score is exactly what the brand rules forbid. It also invents precision: no model of readiness exists, and the facts in Look Back and the review already say what was done |
| A pace forecast to the goal date ("at this rate you finish on…") | Forbidden by the voice rules (no pace forecasts); creates pressure; unreliable with gaps in use                                                                              |
| Streaks, a day counter on the chain, badges                      | Against ADR-027 and the brand; guilt-based engagement                                                                                                                        |
| Notifications on by default                                      | Pressure without consent. R2 asks once instead                                                                                                                               |
| More Rumi tools, agents or autonomous planning                   | Rumi's existing surface is unmeasured (G4). Autonomy beyond cards breaks the Undo/press model                                                                                |
| Reading the owner's other calendars' events                      | ADR-010's privacy line; free/busy (R6) gives the useful part without contents                                                                                                |
| A job-board feed, scraping, or auto-apply                        | Legal and fragile; with 0 applications recorded, the job module's next need is use, not supply                                                                               |
| A resume or cover-letter builder                                 | A different product; many good tools exist; it does not serve the daily loop                                                                                                 |
| A charts dashboard ("analytics")                                 | Look Back and the review already give facts; charts invite comparison and scores                                                                                             |
| Multi-user, sharing, accountability partners, leaderboards       | A single-owner design throughout (owner scoping, the lock, sign-in); a rewrite for an unproven need                                                                          |
| A native Android or iOS app                                      | The installed web app covers push and voice; a native app doubles maintenance                                                                                                |
| Bringing Learn back into the navigation                          | Removed deliberately, with no recorded use; R3 goes the other way                                                                                                            |
| Email (Gmail) import of application updates                      | A new sensitive data flow (email bodies) for a module with no use yet                                                                                                        |

## 10. Proposed V2 roadmap

No dates. Effort is relative (S/M/L) for one maintainer. Each work item starts only when the owner says so, one at a time, as today.

### Phase 0 · Use and prerequisites

| Work item                                                                         | Dependencies | Priority | Effort | Expected outcome                        | Acceptance criteria                                                                                   |
| --------------------------------------------------------------------------------- | ------------ | -------- | ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Two weeks of real use, with a one-line daily note (what helped, what was skipped) | None         | P0       | —      | A real baseline                         | 14 days of notes; the owner's list of "used / never used"                                             |
| Owner checks already open                                                         | None         | P0       | S      | Known device behaviour                  | Android: push, voice and the installed app checked; the `/privacy` contact confirmed                  |
| E1 · Claim push rows before sending                                               | None         | P0       | S      | No duplicate pushes with two schedulers | A database test with two concurrent deliveries sends each push once; the inbox row survives a failure |

### Phase 1 · The loop and its measures

| Work item                           | Dependencies | Priority | Effort | Expected outcome           | Acceptance criteria                                                                                                                                                                 |
| ----------------------------------- | ------------ | -------- | ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 · Usage panel in Settings → Data | None         | P0       | S–M    | Decisions on data          | Shows the 14- and 30-day counts listed in R1 from existing records; owner-scoped; facts only (copy reviewed against `BANNED_WORDS`); no new two-way pair; a database test per count |
| R2 · Daily rhythm set-up            | E1           | P1       | S–M    | The loop reaches the phone | One card, three questions, a preview, saving through the existing settings; nothing on until saved; e2e journey; reminders delivered once in a scheduler test                       |
| E2 · All-or-nothing Undo            | None         | P1       | M      | Undo always complete       | Every undo kind runs in one transaction and is idempotent on a double press (tests per kind)                                                                                        |

### Phase 2 · Simplify

| Work item                                  | Dependencies                   | Priority | Effort | Expected outcome                            | Acceptance criteria                                                                                                   |
| ------------------------------------------ | ------------------------------ | -------- | ------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ADR: Learn retired                         | The owner's decision, R1 data  | P1       | S      | A recorded decision                         | ADR merged                                                                                                            |
| R3 · Retire Learn's code                   | The ADR                        | P1       | M      | About 1,500 fewer lines, a shorter Settings | Pages, reminders and links removed; data kept and exported; all suites and journeys pass; the boundaries test updated |
| R4 · Remove unused Rumi doors              | R1 data (two weeks)            | P1       | S      | One clear place to ask                      | Each removed door listed with its zero-use evidence and the owner's sign-off; the drawer, ⌘/ and roadmap card stay    |
| E3 · Indexes, in the next needed migration | A migration for another reason | P2       | S      | Bounded deletes later                       | Migration with upgrade test; applied to production before merge                                                       |

### Phase 3 · Only if use asks for it

| Work item                     | Dependencies                                | Priority | Effort | Expected outcome               | Acceptance criteria                                                                          |
| ----------------------------- | ------------------------------------------- | -------- | ------ | ------------------------------ | -------------------------------------------------------------------------------------------- |
| R5 · Offline Today            | Owner reports the need                      | P2       | M      | Today readable offline         | Read-only, timestamped, cleared on sign-out, no cached HTML across sessions                  |
| R6 · Free/busy-aware planning | Owner reports collisions; ADR-010 amendment | P2       | M–L    | Plans avoid busy times         | Separate consent, free/busy scope only, no event contents stored, plan cards skip busy slots |
| Hosting decision (E7)         | R1 data                                     | P2       | —      | Faster pages or confirmed fine | Decision recorded in ADR-014's addendum                                                      |

## 11. Success metrics

All are read from existing records, through R1. They are for the owner as the product's decision-maker, never shown on Today as a score.

| Objective                    | Measure (from existing records)                                                                                            | Baseline (2026-11-02 backup)   | Direction                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------- |
| The loop runs                | Days per week with a recorded session (`ActualSession`)                                                                    | 5 sessions in 6 days           | Up                                     |
| The week closes              | Weekly reviews completed per 4 weeks (`WeeklyReview.completedAt`)                                                          | 0                              | Most weeks                             |
| The rhythm reaches the phone | Reminders sent and opened per week (`NotificationLog.sentAt`, `openedAt`); "Too many" feedback                             | 0 sent                         | Up, with no "Too many"                 |
| Rumi earns its place         | Changes kept vs undone (`metadata.actions[].status`); cards applied vs dismissed (`requests[].status`); questions per week | Not measured                   | The owner decides thresholds after UAT |
| Smaller product              | Feature code lines; Rumi entry points; Settings reminder groups                                                            | 31 modules; 14 doors; 5 groups | Down                                   |

## 12. Risks and dependencies

- **Building instead of using.** The main risk to V2 is the pattern the previous audit named: new work items start before the measures are read. Phase 0 exists to stop this.
- **One user's data.** Every metric is n = 1; trends over two weeks are noisy. Treat them as signals for the owner, not statistics.
- **Notification fatigue** (R2): the existing caps, quiet hours and "Too many" must stay intact.
- **Removal regret** (R3, R4): keep data, tag commits, remove only with evidence and the owner's sign-off.
- **Privacy** (R5, R6): new data at rest on the device or a new Google scope each need an ADR and explicit consent.
- **Dependencies:** E1 before R2. R1 before R3 and R4. The owner's decisions for R3 and the hosting choice.

## 13. Assumptions requiring validation

| Assumption                                                           | How to validate                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low use in the first six days is mostly building time, not friction  | Two weeks of use without building (Phase 0), then R1's counts                                                                                                                                     |
| The owner wants pushes in the morning and evening                    | The R2 card is opt-in; check opens and "Too many" after two weeks                                                                                                                                 |
| Learn has no value to the owner                                      | Ask the owner; check R1 for any Learn visits before R3                                                                                                                                            |
| Some Rumi doors are unused                                           | R1 per-door counts. This needs a small addition: store the entry point with each question. The page path is already sent with every question (WI-117) but is not stored in the message's metadata |
| Offline Today is needed                                              | The owner's daily notes mention it                                                                                                                                                                |
| Study blocks collide with other commitments                          | The owner's daily notes during UAT                                                                                                                                                                |
| The job and practice modules will be used once the job search starts | R1 counts once the owner starts applying; until then, no new job features                                                                                                                         |

## 14. Final recommendation

Do not start V2 with a new feature.

1. Run two weeks of real use and land E1.
2. Build R1, the usage panel, so the product can be judged by its own records.
3. With that evidence, turn the rhythm on (R2).
4. Simplify: retire Learn (R3) and close the unused Rumi doors (R4).
5. Make Undo all-or-nothing (E2).

Offline Today and free/busy planning wait until real use asks for them. Everything in section 9 stays out.

If V2 succeeds, Silsila will be **smaller, quieter and used every day**. That is a stronger next version than a longer feature list.
