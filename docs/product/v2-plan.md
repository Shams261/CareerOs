# Silsila Version 2 — the product plan

Accepted by the owner on 2026-10-25. The polished PDF with the concept screens ("Concept — Not Implemented", fictional data) lives outside the repository; this file is the text the work items follow. Section 4 ("The day, as stories") describes the concepts in words. Work items are delivered in the order of section 10; each has its own handoff.

## 1. Executive summary and product decision

**What V2 is.** Version 2 turns Silsila into a calm, daily study ritual for interview preparation. It runs from a first step in the morning, through a focused session and honest practice, to a clear close of the day. It builds on the loop Silsila already has: Plan → Execute → Record → Review → Continue. It keeps the story plan's "moments, not dashboards" direction and its sparring-partner view of AI.

**Who it serves.** One owner: a software engineer preparing for a job switch, using Silsila on a laptop and as an installed web app on a phone. Every measure below is for that single person. Results are directional evidence, not statistics.

**Primary outcome.** More planned study blocks end in an honest record: a session, a move, or a rest. Fewer blocks quietly turn into "Not recorded". Every number comes from records Silsila already keeps: blocks, sessions and check-ins.

**The decision in one paragraph.** V2 leads with deterministic experience work: a Focus session, Study Nudges, Close the Day, and two practice drills that work without AI. AI arrives later as one narrowly scoped feature, **Grill Me** on roadmap items. It sends only minimal, previewed fields and runs on one pinned, zero-retention endpoint under a US$5 monthly cap that Silsila enforces itself. Revision cards come from the rungs the owner chooses to keep, not from a second AI feature. Day Print, Look Back, Moments, ⌘K and Listen are hypotheses. Each gets validated after the core loop is in daily use.

**Explicitly out of scope for V2:**

- AI that reads the schedule, sessions, jobs, companies, interview rounds, notes or reflections.
- An AI "next move" on Today.
- AI week or day planning.
- AI weekly summaries.
- AI interview prep that uses company data.
- Graded mock interviews and chat.
- Motivational quotes written by a model.
- Streaks, scores, badges, counters, confetti, and comparisons with other people.

### The strongest product insight

Silsila keeps **planned** and **actual** as separate records. Most planners don't. Two things follow:

1. Silsila can tell when a nudge is warranted: a study block passed and no session is recorded.
2. Silsila can create moments from the truth, such as a closed day or a finished focus session, rather than from invented scores.

Neither needs AI. **The V2 differentiator** is a quiet ritual that is honest about what happened, plus an interview sparring partner that never needs the owner's life story.

### What I changed from the story plan, and why

- **Too broad.** Seven work items in one version, and about half of them are aesthetic bets: Day Print, Look Back, Moments, ambient sound. They move to a later phase with explicit validation tests.
- **Two AI study features overlapped.** Grill Me and an AI-generated revision deck both produced study content. The deck now uses only rungs the owner keeps from Grill Me. That means one AI feature, fewer calls, and no stored output the owner didn't choose.
- **Watch It Run and Which Pattern? no longer need AI.** AI traces can be wrong, and AI "disguises" can drift from the problem.
  - Watch It Run: code traces a fixed set of patterns on sample inputs.
  - Which Pattern?: uses the owner's own problem titles and the curriculum's pattern signals.
- **Listen is deferred.** The story plan said scripts would be "grounded in public references". A reference name or URL doesn't prove grounding. Doing it properly needs an explicit fetch of the sources and a display of the passages actually used. That is a pipeline of its own.
- **Sound is off by default.** In the story plan it was on by default. The only sound in the first slice is the optional end-of-focus chime, which the owner switches on.
- **Provider claims are corrected.** On OpenRouter, the zero-data-retention endpoints for the chosen Anthropic models are on Google Vertex and AWS Bedrock, not Anthropic's direct API (checked 2026-10-25, see §8). The pinned provider must be one of those.
- **Study Nudges are added.** This is a new requirement. They fill the gap the story plan left at the start and end of the day.

### Conflicts found in the current product

- **Lock-screen leaks.** Existing push reminders put block titles on the lock screen, for example "Hiring manager chat starts in 15 minutes". Under the new privacy rule that's a leak. Phase 0 fixes it for every reminder type.
- **Guilt-leaning copy.** The existing evening reminder reads "You haven't checked today's progress yet." It also overlaps the planned evening check-in. Study Nudges take over that job, and the two are coordinated under one daily cap.
- **No rest-day concept.** Silsila has no way to mark a day as rest. Study Nudges and Close the Day both need one, so a small schema change comes with Study Nudges.
- **Test and UAT records.** The live workspace has test- and UAT-named records (a TEST routine, its blocks, a TEST company). They must be cleaned up or excluded before nudges or AI can use any record (Phase 0).

### Decisions that need validation before implementation

| Decision                                                     | Why it is uncertain                          | Small test                                                                                                                      |
| ------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Focus session is worth an extra step before the timer starts | It adds a screen to Start                    | For two weeks, compare how often a started block reaches Complete, with and without Focus. Ask once a week "Was Focus helpful?" |
| Study Nudges help rather than nag                            | Notification evidence is mixed; see §11      | Opt-in trial for 14 days. Stop early after two "Too many" answers or a pause                                                    |
| Grill Me's rungs are good enough to study from               | It depends on the model and on the item text | The owner rates 10 ladders on 10 different items before the feature opens to every roadmap                                      |
| Day Print feels rewarding rather than decorative             | Purely aesthetic hypothesis                  | Show it for two weeks after Close the Day, then ask "keep or remove"                                                            |
| Vertex or Bedrock data handling is acceptable to the owner   | Provider-side terms, not only OpenRouter's   | The owner reads the provider's published terms and confirms in writing before Phase 3                                           |

## 2. The two earlier plans, reconciled

The story plan ("ek din ki kahani") is the primary direction. The earlier AI workflow plan proposed five workflows. Each is judged below against a real Silsila need, the generic-text rule, and overlap with the stories.

| Idea                                               | Source          | Decision                               | Reason                                                                                                                                                                                            |
| -------------------------------------------------- | --------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus session (intention, ring, completion moment) | Story           | **Keep: first slice**                  | It is the most-used moment, it needs no AI, and every nudge's "start a short session" lands there                                                                                                 |
| Study Nudges                                       | New requirement | **Add: Phase 1**                       | It answers the motivation gap with records Silsila already has, without AI                                                                                                                        |
| Close the Day (Tomorrow / Let go / one line)       | Story           | **Keep: Phase 1**                      | Deterministic. It ends the day honestly and gives the owner the "rest" and "move" actions that nudges also need                                                                                   |
| Which Pattern?                                     | Story           | **Keep, changed: deterministic first** | Titles and curriculum signals are enough. AI disguises are an optional later experiment                                                                                                           |
| Watch It Run                                       | Story           | **Keep, changed: traced in code**      | Correctness matters more than coverage. Start with 4 array-shaped patterns                                                                                                                        |
| Grill Me                                           | Story           | **Keep: the one AI feature of V2**     | It is the clearest differentiator and needs only minimal, previewed item fields                                                                                                                   |
| Practice Tutor (staged hints on a DSA problem)     | AI plan         | **Merge into Grill Me**                | The same ladder engine, run on a problem's title, difficulty and pattern, with the full solution never shown. Phase 3, after item ladders prove useful                                            |
| Revision deck                                      | Story           | **Change**                             | Cards are rungs the owner kept from Grill Me. The deck itself is deterministic: no second AI feature, no unchosen stored output                                                                   |
| Interview Prep                                     | AI plan         | **Defer**                              | Useful prep needs company and round context, which is personal. The generic part (round formats) is already roadmap items that Grill Me covers                                                    |
| Today Focus (AI next action)                       | AI plan         | **Drop for V2**                        | Today's launcher and Needs attention already pick one next move deterministically (WI-020). AI would need the schedule, which breaks the generic-text rule. The morning nudge covers "first step" |
| Plan Assist (AI day or week draft)                 | AI plan         | **Defer**                              | It needs personal schedule data, the owner rejected the week draft, and Close the Day covers day changes. A later deterministic "find a free slot" would solve most of it without AI              |
| Weekly Review AI summary                           | AI plan         | **Drop**                               | A factual summary already exists (WI-024). Reflections are the owner's own words                                                                                                                  |
| Listen (audio explainer)                           | Story           | **Defer, hypothesis**                  | Grounding requires fetching sources explicitly and showing them. Quality of on-device voices is unproven                                                                                          |
| Day Print, Look Back, Moments                      | Story           | **Defer, hypotheses**                  | They may be delightful, but nothing shows they change behaviour. Validate after Phase 1                                                                                                           |
| ⌘K command bar                                     | Story           | **Defer**                              | Modest value for one user, since keyboard shortcuts already exist. Revisit when there are more actions                                                                                            |
| Morning brief, week draft                          | First V2 plan   | **Dropped**                            | The owner found them unexciting. They also need personal data                                                                                                                                     |

**On Today Focus and Plan Assist in the first release:** neither belongs there. Both repeat what the deterministic product already does, and both would send the owner's day to a model. The owner already deprioritised both in the story plan. The first release also contains no AI at all: Focus core, then Study Nudges, then Close the Day.

## 3. Phased roadmap

| Phase                       | Work item                                                                                            | AI           | Depends on                                                  | Schema change |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------- | ------------- |
| **0 · Readiness**           | R1 Data readiness: clean-out runbook plus read-only data check                                       | No           | none                                                        | No            |
|                             | R2 Lock-screen privacy for all reminders                                                             | No           | none                                                        | No            |
|                             | R3 Usage measures: notification opened and feedback fields, and the record queries the measures need | No           | none                                                        | Yes, small    |
|                             | R4 AI provider validation (a paper exercise, no code)                                                | No           | none                                                        | No            |
| **1 · Daily loop**          | **WI-027 Focus session core (first slice)**                                                          | No           | none                                                        | No            |
|                             | WI-028 Study Nudges, plus Rest today                                                                 | No           | R1, R2, R3                                                  | Yes           |
|                             | WI-029 Close the Day                                                                                 | No           | WI-028 (rest)                                               | No            |
| **2 · Practice without AI** | WI-030 Which Pattern? plus Watch It Run (traced in code)                                             | No           | none                                                        | No            |
| **3 · AI sparring**         | WI-031 AI foundation plus Grill Me on roadmap items, with Keep as card                               | Yes          | R1, R4, R3                                                  | Yes           |
|                             | WI-032 Revision deck from kept cards, plus the Grill Me ladder on DSA problems                       | Yes (ladder) | WI-031                                                      | Yes           |
| **4 · Hypotheses**          | Day Print · Look Back · Moments · ⌘K · Listen · ambient sound · view-transition polish               | Mostly no    | Phase 1 in use for 14 days, plus each one's validation test | Some          |

Phase 1 and Phase 2 can run in either order after WI-027. Phase 3 does not start until R4 is signed off and the Phase 1 measures have run for 14 days.

## 4. The day, as stories (concepts)

### 08:00 · A first step, not a perfect day

The owner turned on morning encouragement for weekdays at 08:00. Today has a study block at 18:00, so Silsila sends one general notification. Opening it shows the same words on Today, with the block and two calm actions.

### 09:00 · Focus

Start on a block opens Focus. The owner writes one line of intention and watches a ring drain for the planned length. On the laptop the ring can pop out over the editor.

### 13:00 · Grill Me (Phase 3)

On a roadmap item, Grill Me first shows exactly what will be sent, and the owner can untick fields. Then the ladder runs: each rung changes one constraint, the owner thinks first, then reveals what a strong answer covers and self-marks.

### 18:00 · Practice without AI (Phase 2)

### 19:45 · An honest evening check-in

The 18:00 study block passed. No session is recorded, the owner didn't move, skip or rest it, the day isn't closed, and Silsila isn't open. So one general notification goes out. In the app the check-in offers a short session, logging what happened, moving the block, or resting.

### 21:00 · Close the Day (Phase 1)

### Opting in to nudges

### Later ideas (Phase 4, hypotheses)

## 5. Work item specifications

### Phase 0 · Readiness

**R1 Data readiness.**

- The owner completes the pending production clean-out runbook: verified backup, then removing the TEST routine, blocks and company in the app, then `scripts/reset-owner-data.sql`, as documented in `docs/engineering/backup-restore.md`.
- A new read-only script, `pnpm data:check`, lists records whose titles or names match `\b(test|uat|demo|sample|dummy)\b`, case-insensitive. It covers routines, blocks, roadmap items, problems, applications and notes, and prints counts and ids only.
- Nudge and AI code also excludes matching records at runtime, logged as a count.
- _Acceptance:_ the script exits 0 with zero matches on production before WI-028 or WI-031 is enabled. A unit test proves the exclusion rule.

**R2 Lock-screen privacy.**

- Every push title and body becomes general text. Examples: "A block starts in 15 minutes", "A follow-up is due today", "An interview is coming up".
- The named detail shows only in the app.
- Covers `UPCOMING_BLOCK`, `OVERDUE_TASK`, `JOB_FOLLOW_UP`, `INTERVIEW`, `TECHNICAL_REVIEW`, `DSA_REVISION` and `WEEKLY_REVIEW`.
- _Acceptance:_ a test renders every reminder type with fictional records. No push payload contains a block title, company, round title, note or item title.

**R3 Usage measures.**

- `NotificationLog` gains `openedAt` and `feedback` (`helpful | not-today | too-many`).
- Opening Silsila from a notification records `openedAt`.
- Measures are queries over existing records (sessions, blocks, check-ins), so no tracking events are needed.
- _Acceptance:_ migration with an upgrade test. Opening a notification sets `openedAt` exactly once.

**R4 AI provider validation.** No code.

- Confirm with `GET /api/v1/models/<id>/endpoints` and `GET /api/v1/endpoints/zdr` that the chosen model id exists and that the chosen provider endpoint is on the ZDR list.
- The owner reads that provider's published data terms.
- Set the OpenRouter key's credit limit to US$5 with a monthly reset.
- Record the decision in ADR-021.
- _Acceptance:_ the ADR names the model id, provider slug, prices and check date, with the owner's sign-off.

### WI-027 · Focus session core (first slice)

- **User story:** as the owner, when I start a study block, I want a calm space with my intention and the time I have left, so that I stay on one thing and leave a short record of what I learned.
- **Trigger:** Start on a block (launcher, agenda row, or a nudge's "Start 20 min"). The shell's running strip gains a Focus link.

**Main flow**

1. The Focus view opens with the block title and an optional one-line Intention (≤140 characters, empty by default).
2. Begin calls the existing start action. The ring is driven by the running session's start time and the block's planned end, so a refresh keeps it.
3. Pop out is shown only where the Document Picture-in-Picture API exists. Keep screen on is shown only where the Screen Wake Lock API exists.
4. At planned end the ring closes. If the owner enabled "Chime at the end", a soft synthesised two-note chime plays once.
5. "What did you learn?" appears: one line, ≤200 characters, optional. Complete calls the existing complete action. Stop and Keep going behave as today.

**Confirmation and write behaviour**

- Only the existing start, stop and complete actions write.
- Intention and Learned are appended to `ActualSession.notes` as `Intention: …` and `Learned: …`, never replacing existing text.
- There is no automatic completion at time-up.

**Error and empty states**

- No block (an ad-hoc session) shows "Focus" with an untimed ring.
- If start fails, the existing error message shows and Focus stays closed.
- If PiP or Wake Lock is unavailable, the control is not rendered (no disabled state).
- If the pop-out window is closed, the main view continues.

**Data sent and saved:** nothing leaves the server. Saved: session notes lines, plus a `silsila-focus-chime` cookie with no personal content.

**Accessibility and mobile**

- The ring has a text equivalent ("22 minutes left of 60"), announced at most every 5 minutes through `aria-live="polite"`.
- All controls are at least 44 px.
- The phone layout is full screen.
- Under reduced motion the ring updates without animation.
- Esc returns to Today.
- Laptop-only features degrade silently on iPhone.

**Acceptance criteria**

1. Start opens Focus, and Begin creates exactly one running session.
2. A refresh shows the same remaining time, within 1 minute.
3. At planned end the chime plays once, only when enabled.
4. Complete with a learned line stores `Intention:` and `Learned:` lines appended to existing notes.
5. PiP and Wake Lock controls are absent where unsupported.
6. No console errors and no horizontal overflow at 1440 and 390, in light and dark.
7. axe is clean.
8. Today's statement count is unchanged.

### WI-028 · Study Nudges, plus Rest today

The full specification is in §7.

**Schema, in one migration (`study_nudges`)**

- A new model `StudyNudgeSetting`, one row per owner:
  - `morningEnabled` (default false), `morningTime` (default `"08:00"`).
  - `eveningEnabled` (default false), `eveningTime` (default `"19:30"`).
  - `days`: a 7-bit weekday mask, default Mon–Fri.
  - `onlyStudyDays` (default true).
  - `quietStart` (default `"22:00"`), `quietEnd` (default `"07:30"`).
  - `pausedUntil` (DATE, optional).
  - `studyCategories` (default `["DSA", "Technical"]`).
- New `NotificationType` values `STUDY_MORNING` and `STUDY_EVENING`, used for the log rows.
- `DailyPlan.restAt` (timestamptz, optional).
- `User.lastActiveAt` (timestamptz, optional).

**New pieces**

- A pure `studyNudgeDue()` in `src/features/notifications/domain.ts`, unit-tested with the rules in §7.
- A presence endpoint, `POST /api/presence`, gated by the session.
- A **Rest today** action on Today and in the evening check-in.
- The coordination rules for `DAILY_PROGRESS` and `OVERDUE_TASK`, both described in §7.

### WI-029 · Close the Day

- **User story:** as the owner, at my stop time, I want to see what happened, write one line, and decide what to do with what is left, so the day ends with no open loops.
- **Trigger:** the "Review day" button becomes "Close the day" after the stop time, which is the existing daily reminder time (default 21:00), or on any past day.

**Main flow:** a three-step panel.

1. What happened: blocks with their resolution and recorded minutes.
2. "Anything to remember?": one line saved into the existing check-in notes.
3. What is left: each unresolved block gets **Tomorrow** or **Let go**. Tomorrow uses the existing move writer to the same time tomorrow, or the next free slot. Let go uses the existing skip writer with reason "Let go".

Close the day saves the check-in, which sets `reviewedAt`.

**Confirmation and write behaviour**

- Nothing changes until Close the day is pressed.
- Choices show as a preview, for example "Moves to Wed 11:00".
- If a move conflicts, the row says "Wed 11:00 is taken. Pick a time" and opens the existing block editor.

**Error and empty states**

- No blocks: "Nothing was planned today", with the one-line note and Close.
- A rest day: "Rested today", with the note and Close.

**Data:** none leaves the server. Saved: check-in notes, block moves and skips through existing writers.

**Accessibility and mobile:** works as a side panel on the laptop and a full sheet on the phone. Each step is a headed region. Choices are radio buttons, not toggling buttons.

**Acceptance criteria**

1. No write occurs before Close.
2. Tomorrow on a conflicting slot never overwrites.
3. Let go marks the block skipped with reason "Let go".
4. After Close, the day shows "Reviewed" and Study Nudges for that day stop.

### WI-030 · Which Pattern? and Watch It Run

**Which Pattern?**

- A drill of 10 cards chosen by code: RED and YELLOW problems first, then unattempted, then oldest seen, all from the owner's own Practice list.
- Each card shows the problem title and difficulty.
- Four options: the problem's own topic, plus three distractors drawn from the curriculum's pattern list (the same family first).
- After the pick, reveal the topic and the curriculum's one-line pattern signal.
- No timer by default. The optional timer is a thin line with no red.
- Results read "7 of 10" and "Mixed up: Monotonic stack ↔ Two pointers". Nothing is recorded as an attempt. Each card offers "Open the problem".
- _Acceptance:_ the distractors never include the correct topic, the drill works with no AI key, and a deck with fewer than 4 problems shows "Add a few problems to Practice to drill patterns".

**Watch It Run**

- Tracers written in code for two pointers (Container With Most Water style), sliding window (longest substring without repeating characters), binary search (first true), and monotonic stack (next greater element). Each has a fixed sample input and an optional owner input (≤12 numbers, validated).
- Step, Play and Back controls, with a one-line narration per step from a template.
- Shown only on problems whose topic maps to one of the four tracers.
- _Acceptance:_ the tracers are unit-tested against brute force on 200 random inputs, every step is keyboard reachable, and reduced motion disables auto-play animation.

### WI-031 · AI foundation and Grill Me on roadmap items

- **User story:** as the owner, revising a roadmap topic, I want to be questioned the way an interviewer would follow up, think before I see an answer, and keep only the rungs worth revising.
- **Trigger:** "Grill me" in the open item's action bar. Shown only when AI is configured, the roadmap allows study AI, the item passes the readiness check, and the monthly cap is not reached.

**Main flow**

1. The "What will be sent" panel shows the exact payload: title, scope and done-when are ticked by default; reference names are unticked; notes are disabled and never sent. It also shows the pinned model and provider, the privacy requirement, and the budget used this month.
2. Send and start makes one request.
3. The response is validated against a schema: exactly 5 rungs, each with a question, the changed constraint, and 3–5 strong-answer points.
4. Rung by rung: the owner thinks, optionally types in a scratch box that stays in the browser and is cleared on close, presses Reveal, and self-marks Had it, Partly or Missed.
5. On any rung, **Keep as card** saves the question and strong-answer points as a `RevisionCard` linked to the item.
6. At the end the item's existing Mark revised and Done buttons are offered. Nothing is marked automatically.

**Confirmation and write behaviour**

- Only Keep as card and the existing item actions write.
- Marks live in the browser for the session and are not stored. A later decision may store them as owner records.
- No prompt or response is stored on the server.

**Error and empty states**

| Condition                                               | What the owner sees                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Cap reached                                             | "This month's AI budget is used. Grill Me returns on 1 November."                          |
| No compliant endpoint, or the provider returns an error | "Grill Me is unavailable right now." The rest of the page works as normal                  |
| Output fails validation after one retry                 | "Couldn't build a useful ladder for this item. Try again later." Nothing is shown or saved |
| Item has only a title                                   | "Add a scope or 'done when' line for better questions"                                     |

**Data sent:** only the ticked fields, within their length limits (§8). **Data saved:** kept cards, plus an `AiUsage` ledger row with feature, model, provider, token counts, cost and time, and no content.

**Accessibility and mobile:** each rung is a headed region. Reveal moves focus to the revealed list. The phone version is a full sheet. Keyboard: g opens, Space reveals, 1/2/3 mark, k keeps.

**Acceptance criteria**

1. The request body contains only ticked, length-limited fields.
2. It also contains a single `model`, no `models` array, and `provider` with `order: [pinned]`, `allow_fallbacks: false`, `zdr: true`, `data_collection: "deny"` and `require_parameters: true`.
3. With the cap reached, no request is sent.
4. Notes and askedNote can never appear in a payload (property-based test).
5. With the key removed, no AI control renders and the item works as before.
6. Kept cards appear in the item and in the deck.

### WI-032 · Revision deck, plus the Grill Me ladder on DSA problems

**Revision deck**

- Deterministic over kept cards.
- On a day when items with kept cards are due for revision, Today's Needs attention shows one row: "Revision deck · 6 cards".
- The deck is finite: flip (Space), then Had it, Partly or Missed, then "That's today's revision."
- After every card of an item is marked, the item's Mark revised is offered.

**Problem ladder**

- The Grill Me engine on a DSA problem.
- Inputs: title, difficulty, platform and topic name only.
- Rungs are hints that never contain a full solution or code. The schema rejects code fences, and output longer than 160 characters per hint is rejected.

**Acceptance criteria:** the deck never shows cards the owner didn't keep. The ladder never shows code.

## 6. Phase 4 hypotheses: what would make each one worth building

| Idea                   | Hypothesis                                                          | Validation                                                           | Build only if                                                      |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Day Print              | A generated picture of the day makes closing the day feel rewarding | Two weeks after WI-029: show a static print, then ask keep or remove | Owner keeps it, and the Close the Day rate does not fall           |
| Look Back and Moments  | A season view motivates during a long job search                    | Paper mock with the owner's real counts                              | Owner asks for it again after one month                            |
| Ambient sound in Focus | Sound helps start                                                   | Offer it as an experiment flag in Focus                              | Used in at least half of the Focus sessions over two weeks         |
| ⌘K                     | Faster navigation                                                   | Count how often the owner uses `?` shortcuts                         | The shortcuts overlay is used weekly                               |
| Listen                 | Audio helps revision on walks                                       | Needs explicit source fetching, plus a display of passages used      | The grounding pipeline exists and the owner rates 5 scripts useful |

## 7. Study Nudges, complete specification

### User story

As the owner, on the days and at the times I choose, I want a gentle reminder that my plan is there in the morning. In the evening, I want a check-in only when a study block passed and nothing is recorded. Every reminder should offer a useful next step and never make me feel I failed.

### Modes (both optional, both off by default)

1. **Morning encouragement.** Chosen days (default Mon–Fri), chosen local time (default 08:00), and by default only on days that have at least one study block.
2. **Evening check-in.** Chosen days, earliest local time (default 19:30). Sent only under the trigger rules below.

### Definitions

- **Study block:** a non-cancelled `TimeBlock` whose category is in the owner's study categories. The default is the `DSA` and `Technical` groups from `categoryGroup`, and the owner can edit the list in Settings.
- **Relevant session:** an `ActualSession` linked to the block (`taskId = block.id`), or any study-category session started on that local day.
- **Rest day:** `DailyPlan.restAt` is set (new). **Closed day:** `DailyPlan.reviewedAt` is set.
- **Silsila is open:** `User.lastActiveAt` is within the last 5 minutes. The shell sends a heartbeat at most every 2 minutes while the page is visible.
- **Local time:** the owner's `User.timezone`, with DST handled through the existing `localInstant`/`dayKey` helpers. Every rule is evaluated against the latest plan when the cron job runs.

### Trigger rules

**Morning sends when all of these hold:**

- Mode on and not paused.
- Today is a chosen day.
- Now is at or after the morning time and within 3 hours of it. Late runs are skipped, never sent at noon.
- Outside quiet hours.
- At least one study block today, if that option is on.
- Not a rest day.
- No running session.
- No morning nudge already logged today.
- The daily cap is not reached.

**Evening sends when all of these hold:**

- Mode on and not paused.
- Today is a chosen day.
- Now is at or after the evening time and before the start of quiet hours.
- At least 4 hours since today's morning nudge, if one was sent.
- There is a study block B that has ended, is still `PLANNED`, and has no relevant session.
- B was not moved into the future or skipped, the day is not a rest day, and the day is not closed.
- No running session.
- No evening nudge already logged today.
- The daily cap is not reached.

### Suppression and coordination

| Situation                          | Behaviour                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Silsila is open                    | Deliver in the app only: a card on Today and an inbox row, with no push                              |
| Quiet hours (default 22:00–07:30)  | Never send; morning waits until the end of quiet hours, but only within its 3-hour window            |
| A focus session is running         | Defer the evening nudge until the session ends; drop it if quiet hours begin first                   |
| Daily cap                          | At most 2 Study Nudges a day, with a minimum spacing of 4 hours                                      |
| Existing `DAILY_PROGRESS` reminder | When an evening nudge was sent, the daily reminder is not pushed that evening and stays in the inbox |
| Existing `OVERDUE_TASK` reminders  | Suppressed for study-category blocks while the evening check-in is on                                |
| Test- or UAT-named blocks          | Excluded (R1)                                                                                        |
| Duplicates                         | `dedupeKey` per owner, mode and local day; a retried cron run can't resend                           |

The OS permission rule is deliberately server-side. Safari does not allow invisible pushes and revokes permission when a push isn't shown (Apple, §11), so the service worker must never swallow a push to suppress it.

### Copy (reviewed, written by Silsila, never generated)

**Morning variants**, rotated by day:

1. "Good morning. You don't need a perfect day—just a first step. Your plan is here when you're ready."
2. "Good morning. One block is enough to begin. Your plan is ready when you are."
3. "Good morning. Start small today. Your plan is here."

**Evening variants:**

1. "I don't see a study session recorded for today yet. Would a short session still help, or would you rather move it?"
2. "No study session is recorded yet today. A short one, a move, or rest are all fine."

**Lock-screen titles:** "Good morning" and "Study check-in". Bodies never name a task, company, interview or note.

**In-app card:**

- It may name the block, since the screen is already unlocked and Today shows titles anyway.
- It may use "Keep the chain going, gently." at most once a week, only in the morning card, and never next to a miss.
- Words that never appear: "missed", "failed", "you didn't", "streak", "don't break".
- No quotations from people.

### In-app actions (each change is reviewed before it is saved)

| Action                                 | Result                                                                  | Confirmation                                                      |
| -------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Start 20 min**                       | Opens Focus for the block with a 20-minute target                       | Begin is the confirmation; the existing start action writes       |
| **Log what happened**                  | Opens the existing manual session form, prefilled with the block's time | Save writes                                                       |
| **Move to tomorrow**                   | Previews "Moves to Wed 18:00"                                           | Confirm uses the existing move writer; conflicts open the editor  |
| **Rest today**                         | Asks "Mark today as a rest day? Evening check-ins stop for today."      | Confirm sets `restAt`; Undo is available for 8 seconds            |
| **Useful? Yes / Not today / Too many** | Stores feedback on the notification                                     | "Too many" offers "Morning only", "Pause this week" or "Turn off" |

### Settings

A "Study nudges" row under Reminders opens a panel. It has:

- The two mode switches, each with its days and time.
- "Only on days with a study block".
- Study categories.
- Quiet hours.
- Pause for this week, or until turned back on.
- A per-device status line: "Notifications allowed", "In-app only" or "Not supported on this browser".
- The exact copy shown as a preview.

Settings re-evaluate immediately. Changing the plan or the week needs no settings change, because rules read the latest plan at run time.

### Permission flow and platform behaviour

1. The owner turns on a mode, then Save.
2. If this device has no push subscription, an in-app explainer sheet shows what will be sent, the cap, the quiet hours, and the iPhone note.
3. **Continue to permission** calls `Notification.requestPermission()` inside that tap, as the browser's user-gesture rule requires, then subscribes through the existing VAPID push.
4. If the permission is denied or push is unsupported, the device stays **in-app only**, and the panel explains how to allow notifications later in the system settings.
5. **iPhone and iPad:** web push works only for a web app added to the Home Screen, on iOS or iPadOS 16.4 or later (WebKit, 2023). In plain Safari the sheet shows "Add Silsila to your Home Screen to get notifications" and offers in-app only.
6. Notification action buttons are not supported on iOS (caniuse). Tapping a notification opens `/today?nudge=<id>`, which records `openedAt` and focuses the card.

### Accessibility

- The card is a labelled region with a heading. When it is opened from a notification, focus moves to its heading.
- Buttons are at least 44 px and arranged in a 2×2 grid on the phone.
- The copy carries no time pressure. No colour carries meaning alone.
- Reduced motion is respected.
- Screen-reader text includes the block time.

### Privacy

- No AI is involved.
- Push payloads contain only the fixed general copy and a path.
- `NotificationLog` stores the same fixed text.
- The heartbeat stores only a timestamp.
- Nothing new leaves the server beyond the existing push service delivery.

### Acceptance criteria

1. Both modes are off for a new and an existing owner.
2. A morning nudge is not sent on a day with no study block (default), on a rest day, during quiet hours, during a running session, or more than 3 hours late.
3. An evening nudge is not sent when a relevant session exists, the block has not ended, the block is skipped or moved, the day is rested or closed, or Silsila was active in the last 5 minutes. In the last case, an in-app card appears instead.
4. Never more than 2 Study Nudges in one local day, and never less than 4 hours apart.
5. A cron retry never duplicates a nudge.
6. DST: on 2026-11-01 in America/Toronto, a 08:00 morning nudge goes out at 08:00 local time.
7. Payloads never contain titles, companies or notes (fixture test).
8. iOS Safari outside the Home Screen shows the install note and offers in-app only.
9. Every action writes only after its confirmation step.
10. "Too many" offers reduce, pause or turn off.

### Success and failure measures (14-day review, one owner)

**Helpful signals**

- Share of nudges answered "Yes".
- Share of evening nudges followed within 90 minutes by a session, a move or a rest. All three count as success, because each one is an honest record.
- Nudged study blocks ending "Not recorded", compared with the 14 days before.

**Failure signals**

- Two or more "Too many" answers.
- Any pause, or a mode turned off.
- A rising share of nudges left unopened for more than 12 hours.

**Decision rule:** any failure signal triggers a review. Candidate responses are fewer days, later times, or morning-only. Open rate alone is never the goal.

## 8. AI trust, privacy, provider, budget, readiness, failure and rollback

### Field allowlist (the only path to a model)

| Field                                                                                                                        | Sent by default      | Limit                  | Notes                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------- | ---------------------------------------------------------------------- |
| Item title                                                                                                                   | Yes                  | 120 chars              | Shown in preview; can be unticked (then Grill Me needs scope)          |
| Item scope                                                                                                                   | Yes                  | 300 chars              |                                                                        |
| Item "done when"                                                                                                             | Yes                  | 240 chars              |                                                                        |
| Reference names                                                                                                              | No                   | 5 × 80 chars           | URLs are not sent; a name is not a source                              |
| Problem title, difficulty, platform, topic                                                                                   | Yes (problem ladder) | 120 / enum / enum / 60 |                                                                        |
| Notes, askedNote, owner URL, doubt, scratch box, answers, schedule, sessions, jobs, companies, rounds, reflections, contacts | **Never**            | —                      | Enforced by a single `studyInput()` function with property-based tests |

These fields are treated as potentially sensitive even though they look generic. That's why the owner sees and controls them on every send. A roadmap-level **Study AI** switch is off for the Behavioural roadmap, which is built from the owner's handbook, and for owner-created roadmaps until switched on.

### Provider and routing

- **Gateway:** OpenRouter, called server-side only. The key is never sent to the browser, and the CSP stays `connect-src 'self'`.
- **Model and provider:** one model id and one provider endpoint, both named in ADR-021 at R4. The candidate checked on 2026-10-25 is `anthropic/claude-haiku-5.5`, listed at US$0.10 input / US$0.50 output per million tokens (US$0.11 / US$0.55 on regional endpoints). Its ZDR-listed endpoints are on Google Vertex and AWS Bedrock; Anthropic's direct endpoint is not on OpenRouter's ZDR list. Revalidate the model, provider, ZDR status and prices at implementation.
- **Request:**
  - One `model`, with no `models` array and no Auto Router.
  - `provider: { order: ["<pinned slug>"], allow_fallbacks: false, zdr: true, data_collection: "deny", require_parameters: true }`.
  - `response_format` with a strict JSON schema.
  - `max_tokens` per feature: Grill Me 900, problem ladder 600.
- **No silent fallback.** OpenRouter's `allow_fallbacks` defaults to true, so it is set to false explicitly. If the pinned endpoint is unavailable or no longer ZDR-listed, the request fails closed and the AI feature shows "unavailable". Every other Silsila workflow keeps working.
- **Daily preflight.** A cron step checks the endpoints API and the ZDR list. If the pinned endpoint has disappeared, AI is disabled until the owner re-approves.
- **Alternative endpoints.** A second endpoint can be configured only by the owner, after the same checks, and is shown by name in the "What will be sent" panel.

**What the controls do and do not establish**

- OpenRouter says it does not store prompts or responses unless the account opts in to logging. It keeps metadata such as token counts and latency.
- `zdr: true` restricts routing to endpoints OpenRouter lists as zero data retention. In-memory caching is not counted as retention.
- The upstream provider's handling is governed by that provider's own terms. Google and AWS act as processors for their hosted models. Anthropic's direct API keeps API inputs and outputs for up to 30 days unless an organisation has a ZDR agreement.
- Silsila can enforce routing and its own non-storage. It cannot audit a provider's internals.

### Budget

- **Hard cap:** US$5.00 per calendar month in the owner's timezone, enforced in Silsila.
- **Ledger:** an `AiUsage` row per request: feature, model, provider, input tokens, output tokens, cost and timestamp. No content.
- **Pre-call reservation:** reservation = input tokens × input price + `max_tokens` × output price. A request is refused when the month's spend plus the reservation would exceed US$5.00.
- **Actual cost:** read from the response's usage data where provided, otherwise computed from tokens and the ADR prices.
- **Backstop:** the OpenRouter key's credit limit is also US$5 with a monthly reset.
- **Rate limits:** 20 AI requests an hour and 60 a day per owner.
- **When the cap is reached:** the AI controls show the cap message and nothing else changes.

**Estimate, with assumptions shown.** These are revalidated at implementation.

- Grill Me input is about 700 tokens: fixed instructions of about 500, plus a payload of at most 200 at the length limits above.
- Output is at most 900 tokens.
- At US$0.10 / US$0.50 per million tokens, one ladder costs at most US$0.00007 + US$0.00045 = **about US$0.0005**. At the regional price of US$0.11 / US$0.55 it's about US$0.00057.
- On these assumptions the US$5 cap allows roughly 8,700–10,000 ladders a month. The cap is a safety net, not a forecast.

### Retention

- No prompt or answer history is stored.
- The ladder exists only in the page for that session.
- The scratch box and self-marks never leave the browser.
- Only **Keep as card** writes content: the owner's chosen rung, as a `RevisionCard`.
- `AiUsage` holds no content.
- Logs contain `[study] grill made {model, provider, tokens, ms}` or `[study] grill failed <ErrorClass>` only.

### Web research

Web research is not in V2. If it is added later, it runs only after an explicit "Use public sources" action, fetches only the item's reference URLs on allow-listed domains, and shows the passages actually used with their link and fetch date.

### Data readiness

AI and nudges stay disabled until R1 passes. Runtime exclusion of test- and UAT-named records remains as defence in depth.

### Failure behaviour

| Failure                                   | Behaviour                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Provider error or timeout (20 s)          | "Grill Me is unavailable right now", no retry loop, nothing saved                     |
| Endpoint no longer ZDR-listed (preflight) | AI disabled; Settings shows why                                                       |
| Invalid output                            | One retry with the validation issues; then a calm failure message                     |
| Prompt injection inside an item's text    | Text is data; no tools; output rendered as escaped text; schema rejects anything else |
| Cap reached                               | Message with the reset date                                                           |

### Rollback

- Remove `OPENROUTER_API_KEY` or set `STUDY_AI_ENABLED=false`, and every AI control disappears.
- Kept `RevisionCard`s stay as owner records.
- The migrations are additive.

## 9. Success measures by phase (no streaks, scores or vanity metrics)

| Phase             | Measure (from existing records)                                                                     | Healthy direction             | Failure signal                              |
| ----------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------- |
| 0                 | Test-data check matches; payloads with names                                                        | 0 and 0                       | Any match                                   |
| 1 · Focus         | Started study blocks that reach Complete; sessions with a Learned line; weekly "Was Focus helpful?" | Up, versus the 14 days before | Owner bypasses Focus most of the time       |
| 1 · Nudges        | §7 measures                                                                                         | "Yes" and honest records up   | "Too many", pause, opt-out                  |
| 1 · Close the Day | Days with `reviewedAt` set; unresolved blocks left at midnight                                      | Up; down                      | Close the Day skipped most nights           |
| 2 · Drills        | Drill sessions per week; mix-ups that repeat; RED/YELLOW problems later attempted                   | Repeat mix-ups fall           | Drill unused after the first week           |
| 3 · Grill Me      | Owner usefulness rating of ladders; share of rungs kept; items marked revised after a ladder        | Rating good on 8 of 10        | Ladders rated generic, or cap reached early |

With one owner these are directional comparisons, not statistical results. Every review compares two weeks before and two weeks after a change.

## 10. First implementation slice and later slices

### First slice: WI-027 Focus session core

**Scope:** intention, ring, Pop out where supported, Keep screen on where supported, optional end chime, Learned line, the shell Focus link. **Not in this slice:** ambient sound, completion sounds elsewhere, view transitions, PiP styling beyond the ring.

**Definition of done**

- The 8 acceptance criteria in §5 pass.
- `pnpm lint`, `typecheck`, `test:ci` on a disposable database, `build`, `docs:check` and `git diff --check` all pass.
- Browser-checked at 1440 and 390 in light and dark, with screenshots in `docs/screenshots/wi-027/`.
- The PiP path is checked in desktop Chrome. Wake Lock is checked on a real iPhone Home Screen install, and the result is recorded, because the iOS fix is unconfirmed.
- `docs/WI-027-HANDOFF.md`, the CHANGELOG, the CLAUDE.md state line and ADR-021 "Version 2 rules" are updated.
- The owner merges, and the change is verified live.

### Later slices, in order

1. **R1–R3**: readiness and privacy.
2. **WI-028** Study Nudges.
3. **WI-029** Close the Day.
4. **WI-030** drills.
5. **R4**, then **WI-031** Grill Me.
6. **WI-032** deck and problem ladder.
7. **Phase 4** hypotheses, each only after its validation.

## 11. Evidence and references

All sources were checked on **2026-10-25**. "Page date" is the date shown on the page, where one is shown.

**Studies.** They describe other populations and tasks, so they are not predictions for Silsila.

- **Bastani, H. et al., "Generative AI without guardrails can harm learning", PNAS 122(26) e2422633122, published online 25 June 2025.** https://www.pnas.org/doi/10.1073/pnas.2422633122
  - Design: classroom-randomised, nearly 1,000 students in about 50 classes at one high school in Turkey, Fall 2023, with four maths sessions.
  - Findings: a plain GPT-4 interface improved practice grades by 48% but cut later unassisted exam grades by 17%. A guarded "GPT Tutor" improved practice grades by 127%, and its exam effect was not significant.
  - Limitations: one subject, one school, short-term outcomes, and an early period of generative AI use. _Use in this plan:_ it supports "ask first, reveal later". It does not predict Silsila outcomes.
- **Bell, L. et al., "How Notifications Affect Engagement With a Behavior Change App: Results From a Micro-Randomized Trial", JMIR mHealth uHealth 11:e38342, 9 June 2023.** https://pmc.ncbi.nlm.nih.gov/articles/PMC10337295/
  - Design: 350 new users of the UK Drink Less app over 30 days, randomised each day at 20:00 to a standard message, a new message or none.
  - Findings: a notification raised the chance of opening the app in the next hour about 3.5-fold. No significant decline over 30 days was detected, but confidence intervals were wide. Notifications did not significantly delay disengagement.
  - Limitations: the planned sample size was not reached, recruitment overlapped COVID, and times of day were not compared.
  - _Use in this plan:_ reminders can prompt short-term action. Evidence that they sustain engagement is weak. That is why Study Nudges are opt-in, capped, measured for helpfulness rather than opens, and reviewed after 14 days.

**Platform guidance**

- **Apple Human Interface Guidelines, "Managing notifications"** (no page date). https://developer.apple.com/design/human-interface-guidelines/managing-notifications
  - Permission is needed before sending any notification.
  - Marketing content is not allowed without explicit agreement.
  - Urgency must be represented accurately; Time Sensitive is only for things relevant now.
  - People must be able to manage notification settings in the app.
  - Note: the lock-screen privacy and frequency rules in this plan are Silsila's own. They are not stated on that page.
- **Apple Developer, "Sending web push notifications in web apps and browsers"** (no page date). https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
  - Web push is for Home Screen web apps on iOS 16.4 or later.
  - Permission must be requested from a user gesture.
  - Safari does not support invisible pushes and revokes permission when a push is not shown.
  - Badging is through `setAppBadge`.
- **WebKit, "Web Push for Web Apps on iOS and iPadOS", 16 February 2023.** https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ A web app added to the Home Screen can request push permission, in response to direct user interaction.
- **Document Picture-in-Picture.**
  - Sources: MDN (page date 21 August 2026), Chrome for Developers (10 September 2024), caniuse.
  - Supported in Chrome and Edge 116+ on desktop, and Firefox 151+ per caniuse. Not supported in Safari or on Android.
  - https://developer.chrome.com/docs/web-platform/document-picture-in-picture · https://caniuse.com/mdn-api_documentpictureinpicture
- **Screen Wake Lock.**
  - caniuse lists Safari and iOS Safari 16.4+.
  - A WebKit bug for installed Home Screen apps (254545) is marked fixed. The fix version could not be confirmed from Apple or WebKit, so test it on a device.
  - https://caniuse.com/wake-lock
- **Notification action buttons:** not supported in Safari on iOS. https://caniuse.com/mdn-api_notification_actions

**OpenRouter and the provider.** None of these docs pages shows a date.

- ZDR: https://openrouter.ai/docs/features/zdr — use `provider.zdr: true`. In-memory caching is not retention.
- Provider routing: https://openrouter.ai/docs/features/provider-routing — `allow_fallbacks` (default true), `data_collection` (default "allow"), `order`, `only`, `require_parameters`.
- Data collection: https://openrouter.ai/docs/guides/privacy/data-collection — prompts and responses are not stored unless the account opts in. Metadata is kept.
- Key credit limits: https://openrouter.ai/docs/features/provisioning-api-keys — optional credit limit with daily, weekly or monthly reset.
- Structured outputs: https://openrouter.ai/docs/features/structured-outputs — support is decided per endpoint.
- Model endpoints and the ZDR list, checked 2026-10-25:
  - https://openrouter.ai/api/v1/models/anthropic/claude-haiku-5.5/endpoints
  - https://openrouter.ai/api/v1/endpoints/zdr
  - Haiku 5.5 (created 2026-10-07): US$0.10 / US$0.50 per million tokens, regional US$0.11 / US$0.55, rising to US$0.50 / US$2.50 for prompts of 100k tokens or more. ZDR-listed only on Vertex and Bedrock.
- Anthropic data retention, privacy article updated 1 July 2026: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data — API inputs and outputs are deleted within 30 days by default. Under a ZDR arrangement, nothing is stored at rest after the response is returned.

**Product references** (inspiration, not evidence of outcomes)

- Apple, "2025 App Store Award winners", 4 December 2025: Tiimo is the iPhone App of the Year. https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/
- Sunsama changelog, "Daily shutdown" (no page date). https://roadmap.sunsama.com/changelog/daily-shutdown
- Superhuman Help Center, "Achieve Inbox Zero" (text seen in a search snippet; the page returned 403): a daily Inbox Zero image. https://help.superhuman.com/hc/en-us/articles/46005833597709-Achieve-Inbox-Zero
- Daylio, "Year in Pixels". https://daylio.net/
- Google, "NotebookLM Audio Overviews", 11 September 2024. https://blog.google/innovation-and-ai/products/notebooklm-audio-overviews/

**Claims removed after checking:** a Things 3 user quote (not found) and a Readwise "1,000-day habit" vendor claim (only a single user's blog).

**Assumptions:** one owner, so no statistical inference. Model prices and ZDR listings change, so revalidate at implementation. The iOS Wake Lock behaviour is unconfirmed. The concept screens use fictional data from a disposable development database or invented sample values.
