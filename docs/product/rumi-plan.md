# Rumi: a personal AI agent in Silsila (plan v2, after self-review, 2026-10-26)

## Context

Version 2 and all of Phase 4 are live. The owner wants AI as the main feature, in the form of a personal agent called **Rumi**. Rumi should:

- read the owner's data and point out imbalances ("4 days only Backend, no System design");
- plan the next day into the plan and Google Calendar;
- write an interview prep document for a company after researching the web;
- send coach notifications (morning plan, block not started, evening recap).

The owner also asked for two cleanups: no raw JSON in the AI previews, and no Practice hints ladder (hints will come from Rumi).

This reverses ADR-021's rule that AI never reads the schedule, sessions or jobs, so ADR-024 comes before any agent code.

### Owner decisions (2026-10-26)

| Topic          | Decision                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reads          | Everything except the owner's own writing (notes, check-in notes, interview reflections), compensation and contacts. The job description only when ticked. |
| Tone           | Firm, factual, never shaming. `BANNED_WORDS` stay banned.                                                                                                  |
| Lock screen    | General text only (R2 unchanged).                                                                                                                          |
| Practice hints | Removed; Grill Me stays.                                                                                                                                   |
| Chats          | Saved in Silsila, deletable, in the export. Each request sends only the last 12 messages and fetches fresh data through tools.                             |
| Model and cap  | Haiku 5.5 on `google-vertex/global` (ZDR) for everything. The cap stays at US$3.                                                                           |

### Self-review: what changed from plan v1, and why

1. **Search.** v1 said "code builds the query" but picked a server tool where the model writes it, and never checked that search works with `only`/`zdr`. Now a separate spike (R5) proves the search path first. Research runs outside the agent loop, with code-built queries and no write tools.
2. **Request shape.** v1 reused `requestBody`, which forces strict JSON. Chat needs a separate `chatBody` (tools, free text). R5 also checks that tools work alongside or without `response_format` on the pinned endpoint.
3. **Next week.** v1 generated next week's routine days. Now Rumi plans only within today to Sunday. On Sunday it offers "Prepare next week" (the existing action) first and never generates on its own.
4. **Confirm.** v1 applied a stale proposal. Now apply re-checks every slot under one lock and refuses the whole plan if anything changed, as `closeDay` does.
5. **Privacy of non-study blocks.** v1 sent all titles. Now study and job categories send titles; WORK, GYM, PERSONAL and other blocks send only "busy hh:mm–hh:mm".
6. **Cost.** v1 underestimated tool rounds. Tools now return compact summaries (roadmaps as counts plus next and due items, never all 716 items), with a per-message token budget. Limits count owner messages (30 an hour, 100 a day), not model calls.
7. **Insight granularity.** Sessions carry only a category. `get_activity` also returns block titles per day and roadmap items done per roadmap per day, so "Backend vs System design" is visible.
8. **Notifications.** v1 duplicated existing reminders and raised the cap. Now the block-start nudge replaces `OVERDUE_TASK` and `UPCOMING_BLOCK` for study blocks while it is on. The cap stays at 2 Study Nudges plus 1 block-start nudge a day.
9. **AI-written coach lines** are deferred. Fact-based fixed templates first.
10. **Order.** The no-AI coach work comes before the agent; research comes last.
11. **Measures.** Proposals shown versus applied, prep docs kept, and the owner rating 10 chats, all from existing or new records.
12. **Rendering.** Model text goes through a minimal safe renderer (paragraphs, lists, bold; never HTML).
13. **Timeline.** This is several days of work, not today. One WI at a time with the usual gate and live check.

## The owner's problems, the fixes, and how we know (agreed 2026-10-26)

| Problem                                                   | Fixed by                                                                                                                                      | Measured from Silsila's own records (before vs after)                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Starting late: a 6–9 block passes unnoticed until evening | WI-039 coach: a morning plan and yesterday's facts, a nudge at the block's start plus 15 minutes (Start 20 min opens Focus), an evening recap | "Not recorded" study blocks per week; minutes from a block's planned start to its session start |
| Planning every night by hand                              | WI-041: "plan tomorrow" or a natural-language quick add, then a proposal with reasons, Add to plan, and Google Calendar                       | Proposals shown versus applied; blocks added by Rumi that are later recorded                    |
| Imbalance (4 days Backend, 0 System design)               | WI-040 chat, patterns, WI-043 "Rumi noticed"                                                                                                  | Minutes per kind across the last 14 days; noticed cards acted on versus dismissed               |
| Interview scramble                                        | WI-042 prep doc with sources, mapped to the owner's roadmap, and a 7-day plan to the calendar                                                 | Prep docs kept; the 7-day plan applied                                                          |
| JSON preview, the hints button                            | WI-038                                                                                                                                        | —                                                                                               |

**Guardrails that apply throughout:**

- Studying stays the owner's work.
- Every write is confirmed and can be undone.
- Every doc shows its sources.
- Notifications have daily caps, quiet hours, pause and "Too many" feedback.
- The owner rates 10 chats.
- No new tracking events.

## Order of work

### WI-038 · Readable previews and removing Practice hints (no AI change, no migration)

- **Readable preview.** A shared `SentFields` `<dl>` (Title / Scope / Done when / References) replaces `<pre className="grill-payload">` in `src/features/ai/grill.tsx:142` and `src/features/listen/listen.tsx:154`.
- **Remove hints:**
  - `src/features/ai/domain.ts:357-463`, including `looksLikeCode`, which only hints use;
  - `problemHints` in `ai/service.ts`, and narrow the `ask()` union;
  - `hintsAction`, `ai/hints.tsx`, and the Hints panel and `aiState` read on `src/app/dsa/[id]/page.tsx`;
  - `.hint-list` and `.grill-payload` CSS, and the fake server's `hintSet`.
- **Keep:**
  - `AiFeature.GRILL_PROBLEM`: ledger rows exist and PostgreSQL cannot drop an enum value. Comment it as "retired".
  - `tests/problem-hints-migration.test.ts`.
  - Move the `revisionDeckRow` tests before deleting `tests/ai-hints-domain.test.ts`, and keep the deck test in `tests/ai-deck-hints-database.test.ts`.
- **Docs:** `/privacy`, `security.md:45,53`, `CLAUDE.md:32`, an ADR-022 "hints removed" note, and the CHANGELOG.

### WI-039 · Coach notifications, deterministic (migration; no AI)

Extends Study Nudges: `src/features/nudges/`, with `processStudyNudges` running first in the every-minute cron.

- **Morning.** `STUDY_MORNING` lists the day's study blocks in the app ("Today: 18:00 DSA · 20:00 System design"). It also includes yesterday's facts ("18:00–21:00 coding: no session recorded").
- **Block start.** A new `STUDY_BLOCK`: a study block's start plus N minutes (default 15) passed with no session or decision. One per block. Quiet hours and pause apply. Its Today card has Start 20 min, Move and Let go. While it is on, `UPCOMING_BLOCK` and `OVERDUE_TASK` skip study blocks.
- **Evening.** `STUDY_EVENING` becomes a recap: recorded minutes per kind, what was left, tomorrow's first block. Same triggers as today.
- **Copy.** Fixed templates filled with facts. Tests check every template against `BANNED_WORDS`.
- **Settings** (five places: `domain.ts` `NudgeSetting`, `DEFAULT_NUDGES` and `nudgeInput`; the `service.ts` Row; `nudgeSettingsAction`; `forms.tsx`; `nudgeContext`): the block-start toggle and offset.
- **Wiring:** `LOCK_SCREEN_TEXT` (general), `notificationPath`, the `nudgeKey` union, `todaysNudge`, `closeNudges`, and the attention exclusion.
- **Owner step before turning on:** clean the production test records until `pnpm data:check` = 0.

### R5 · AI spike (no product code; findings into ADR-024)

Against the real pinned endpoint, with tiny calls costing about US$0.01 in all:

- (a) tools with free-text replies;
- (b) tools together with `response_format`;
- (c) web search (`openrouter:web_search` and the `web` plugin) with `provider.only` + `zdr` + `require_parameters`: does it run, which engine, its cost, and whether code can fix the query.

If (c) fails, the prep doc falls back to the item references fetched as in Listen, plus owner-pasted links.

### ADR-024 · The agent's data rules (owner sign-off before WI-040)

Amends ADR-021, ADR-022 and ADR-023.

- **Reads:** the tool field lists. The never-read list as above. Non-study block titles are masked. Roadmaps with `studyAi = false` and test-named records are excluded.
- **Writes:** only through confirmation cards, re-checked under the lock.
- **Search:** code-built queries (company, role, round type) only.
- **Stored records:** conversations, prep docs with sources, and content-free ledger rows. All are in the export and deletable.
- **Limits:** US$3 cap, per-message limits, at most 6 tool rounds, 20 seconds per call, and a per-message token budget.
- **Docs:** `/privacy`, `security.md`, CLAUDE.md.

### WI-040 · Rumi chat, read-only (migration)

- **UI:**
  - A `/rumi` page: conversations (New, Delete), suggested prompts, and a safe text renderer.
  - "Ask Rumi · '…'" in the ⌘K bar opens it with the typed text.
  - A shell link beside Search.
  - **Navigation (owner, 2026-10-26):** "Ask Rumi" is a sidebar entry like Today, Plan and Roadmap, at the top on desktop. The phone bar becomes Today · Rumi · Roadmap · Jobs · More, and Practice moves into More, since hints now come from Rumi.
- **Code:** `src/features/agent/{domain,tools,service,actions}.ts`.
  - **Request:** a new `chatBody` with the same pinning as `requestBody`, plus `tools` and `tool_choice`. `evaluateProvider` and `SENT_PARAMETERS` require `tools`.
  - **Engine:** the loop reuses `ask()`'s reservation, ledger, provider check and timeout.
- **Tools** (owner-scoped, compact):
  - `get_today`
  - `get_schedule(from,to)`, at most 14 days
  - `get_activity(days)`, at most 28: minutes per `categoryGroup` per day, study block titles, roadmap items done per roadmap per day
  - `get_roadmaps`: progress, next and due items per roadmap
  - `get_practice`: counts by confidence and the last 10 attempts
  - `get_jobs`: active applications and upcoming rounds with their prep item titles
  - All reuse the existing readers (the Today query pattern, `review/service.ts:38` sessions, `roadmapList`, `revisionDue`, `continueTarget`, the jobs service).
- **Schema:** `AgentConversation`, `AgentMessage` (role, content, metadata Json; raw tool output is not stored), `AiFeature.AGENT_CHAT`, export, a health bump, and an upgrade test.
- **Tests:**
  - A forbidden-field property test over every tool, using `PRIVATE-NOTE` fixtures.
  - Non-study title masking.
  - The loop limit, cap and limits, the window of 12, and owner scoping.
  - The fake OpenRouter learns tool calls.

### WI-041 · Rumi plans (writes after confirmation)

- **Proposal.** `propose_blocks({ day, blocks[] })` for a day from today to Sunday. The server validates times (`localInstant`), overlaps (export a `takenOn`-style reader from `close-day/service.ts:33`), and never touches interview blocks. The card shows each block with a reason ("System design: 0 min in 4 days") and any conflicts.
- **Add to plan.** One `locked` transaction re-checks every slot and refuses everything if one changed. It runs `saveBlockIn` per block, which makes manual blocks ("Added for this day"), then `forgetAll()` and `syncSoon()` for Google Calendar. Undo is a new `cancel-blocks` kind.
- **On Sunday** Rumi offers "Prepare next week" first.
- **Measure:** proposals shown versus applied, in the message metadata.

### WI-042 · Interview prep research doc (migration; depends on R5)

- **Entry points:** "Prepare with Rumi" on `src/app/jobs/[id]/page.tsx`, or a chat request that hands over to the same flow.
- **Preview first:** the search terms, the job description tick and the estimated cost.
- **A separate pipeline, not the agent loop:** code-built searches (at most 8), then one writing call.
- **Output: an `InterviewPrepDoc`.**
  - Sections: rounds and process, what each round tests, topics mapped to the owner's roadmap items and problems, a 7-day plan, questions to ask.
  - Every section cites its sources, shown with their link and date, marked as web sources.
- **The 7-day plan** can go to the WI-041 flow.
- **Housekeeping:** `AiFeature.PREP_RESEARCH`, export, tests with a fake search.

### Smart-app layer (owner, 2026-10-26)

Not a full Jarvis and not premium. A modern smart app that the owner uses alone for 1–2 months. The principles:

- AI only where it saves a step.
- Natural-language input.
- Suggestions always say why.
- Nothing is written without a confirm, and every write has an Undo.
- Quiet by default.

These are folded into the work items above rather than added as new screens.

- **Natural-language quick add (in WI-041).** ⌘K understands "kal 6 baje 2 ghante system design" and "aaj ka baaki kal pe daal do". Either produces the same proposal card and Add to plan. Typing in ⌘K can start a Rumi request directly.
- **Smart rescheduling (in WI-041).** When a block is left (Close the Day, the block-start nudge, or a request in chat), the move suggests the best free slot from the owner's free time and best focus hours, not only "same time tomorrow". It extends `tomorrowSlot` and `previewSlots` in `src/features/close-day/`.
- **Pattern learning (deterministic, in WI-040 and used by WI-041).** A pure `patterns()` computes the owner's best focus hours (recorded minutes by hour over 28 days) and the planned-to-actual ratio per kind ("you record about 70% of planned DSA time"). Rumi's proposals use them to plan realistic lengths and slots, and they show as one line under Weekly review. No AI is needed for this.
- **"Rumi noticed" (new WI-043, after WI-041).** At most two cards a day on Today, found by code and phrased from fixed templates, each with a one-tap action and Dismiss:
  - a kind with 0 minutes in 5+ days;
  - an interview within 3 days with prep items open;
  - a day planned well beyond the owner's usual recorded time;
  - the same routine slot left 3 weeks running, with "move it to 20:00?" leading to the routine editor's preview.
  - Dismissals are counted to measure usefulness.
- **Light memory (in WI-040).** A small "Rumi knows" list in Settings that the owner can see, edit and delete: preferred hours, rest day, subject order. It is sent as part of the system prompt, and Rumi may suggest additions that the owner confirms. No silent memory.

### Later (not now)

- Voice ("Hey Rumi"; Chrome's speech recognition sends audio to Google, so it needs its own decision).
- A spoken mock interview and post-interview debrief.
- AI-written coach lines.
- A conversation summary beyond 12 messages.
- Sonnet for docs if Haiku's quality falls short.
- Premium or multi-user, which needs multi-user login, billing, per-user AI caps, terms, and Google verification of the Calendar scope. The owner decides after 1–2 months of personal use.

## Critical files

- `src/features/ai/{domain,service,actions}.ts`, `grill.tsx`, `src/features/listen/listen.tsx`
- `src/features/nudges/*`, `src/features/notifications/service.ts`, `src/features/push/domain.ts`
- `src/features/schedule/{editing,service}.ts`, `src/features/close-day/service.ts`, `src/features/undo/service.ts`
- `src/features/command/{bar,service}`, `src/app/jobs/[id]/page.tsx`, `src/features/jobs/service.ts`
- `prisma/schema.prisma`, `src/server/{health,export}.ts`, `docs/architecture/decisions.md`, `docs/engineering/security.md`, `src/app/privacy/page.tsx`

## Verification (per WI)

- **The gate:** prisma format, generate, lint, typecheck, `test:ci` on a disposable database, build, docs:check, `git diff --check`.
- **For migrations:** a fresh deploy, the drift check, an upgrade test, and the seed run twice.
- **Local:** browser checks with the fake OpenRouter (tool calls and search added) at 1440 and 375, in light and dark, with axe.
- **Production:** the owner applies the migration before the merge. After the deploy, a live check in the owner's Chrome, with Render logs (counts and codes only) and the ledger cost per message.
- **Privacy tests:** no forbidden field in any payload or tool result; no personal field in a search query.
