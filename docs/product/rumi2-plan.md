# Rumi 2 and 3: a personal agent that speaks first, remembers, acts within bounds, listens, and researches (plan v1, 2026-10-31)

## Context

The Rumi plan (v2, 2026-10-26) is complete: WI-038 to WI-043 and WI-060 are live. Rumi answers from read-only tools, plans through cards the owner presses, keeps a hand-written 20-line "Rumi knows" list, and the coach notifications (WI-039) are fixed fact templates. After using it, the owner wants Rumi to work like Meta's Muse (the personal agent of September 2026): it should **speak first** (morning, midday, evening, reaching the phone), **remember and keep one persona**, **do things** (small ones at once, bigger ones with one press), **listen and talk**, and **research** an interview the way a good friend with a browser would. Later, when other people get access, the same Rumi must already be a product: every part per user, every rule visible, every write reversible or confirmed.

This plan merges two phases the owner asked to see together: **Rumi 2** (the four Muse-like areas) and **Rumi 3** (the enhancements on top: interview-invite deep research, the pattern coach, the week draft, the debrief and mock interview, reminders that learn, the review summary). The architecture, the data flow diagrams and the user flows are in `docs/architecture/rumi-2.md`; the story and the diagrams the owner approved are `output/Silsila-Rumi-2-Story.pdf` and `output/Silsila-Rumi-2-Architecture.pdf` (not committed).

Three earlier rules change, so ADR-030 is part of this work item: ADR-021 ruled out AI-written coach lines and a morning line; ADR-024 allowed writes only by the owner's press on a card; the Rumi plan deferred voice. ADR-022 (one pinned model on one zero-retention endpoint, the US$3 stop, the US$5 key) does not change.

### Owner decisions (2026-10-31)

| Topic       | Decision                                                                                                                                                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Areas       | All four of Muse's: proactive coach, memory and persona, agentic actions, voice. Plus the Rumi 3 enhancements E1–E5 and E8 below. Not E6 (reading Gmail) and not E7 (WhatsApp).                                                                                                                                                              |
| Rumi's line | AI-written, inside the deterministic schedule of WI-039 (the reversal of ADR-021's rule), with a fixed fallback line. Three a day at most.                                                                                                                                                                                                   |
| Push        | Stays generic (`LOCK_SCREEN_TEXT` unchanged). The line lives in the app.                                                                                                                                                                                                                                                                     |
| Writes      | Two classes. **A, at once with Undo:** add a note, add a block on a free slot, rest today. **B, a card with one press, re-checked under the lock:** move or delete a block, change an application's stage, write a review draft, record an attempt. An attempt has no Undo (attempts are append-only, ADR-006).                              |
| Memory      | Rumi keeps it itself from the owner's own messages, in four kinds with caps and expiry, visible and deletable in Settings → Rumi knows; never from never-read fields.                                                                                                                                                                        |
| Voice       | Browser Web Speech API for input behind an explicit one-time consent that names Google (Chrome) and Apple (Safari) as recipients outside the zero-retention rule; the transcript is shown before Send; replies and the line spoken by `speechSynthesis`. No audio stored.                                                                    |
| Research    | Web only through Exa with code-built queries (company, role, round type), as WI-042; an interview invite is sent only when ticked; never the owner's notes or name. Rumi never signs into the owner's accounts.                                                                                                                              |
| Budget      | Option A: Haiku 5.5 on `google-vertex/global`, the US$3 stop (since WI-114 the owner's own monthly limit, none by default). About US$1.1 a month for everything here at 15 messages a day. Free models were considered and set aside: most OpenRouter free endpoints and the Gemini free tier keep or train on prompts. Revisited after UAT. |
| Multi-user  | Not now. Rumi's parts are already per user (lock, ledger, memory, conversations); sign-in, caps, billing and ops come when the owner opens access.                                                                                                                                                                                           |

### Self-review: the choices made here, and why

1. **Order.** Persona and memory first: it is the shared prompt every other slice uses, it has no new write path, and it costs least. Rumi's line second: the highest daily value, on the WI-039 pipeline that already exists. Writes third and fourth: each tool needs its own confirm and Undo class and its own tests. Voice after a device spike. Rumi 3 after two weeks of UAT, deep research first because it is the one the owner asked for by name.
2. **Who decides when Rumi speaks.** Code, never the model. The schedule, quiet hours, pause, rest, closed day, spacing and the daily cap are WI-039's rules; the model writes one sentence into a slot code opened. A model that cannot answer (cap, block, timeout, a rejected line) leaves the fixed template, so the coach never goes silent and never goes rogue.
3. **The model call never runs inside the owner lock.** `processNotifications` holds the lock for seconds; a model call can take 20. The line is queued inside the lock as a pending row and written after it; push waits for the line (two minutes at most, then the template).
4. **Record an attempt is a card, not an at-once write.** Attempts are append-only (core invariant). The press is the confirmation; the card says "Attempts stay on the record."
5. **Memory by a post-answer extraction call, not a tool in the loop.** A tool round carries the system prompt, the tool list, the history and every tool result again; the extraction call carries only the owner's last two messages and the current list, with a 160-token ceiling, after the answer is sent. Cheaper and far more reliable than hoping the model calls `suggest_memory`, which is retired.
6. **Rumi's line reuses `NotificationLog`.** The line is the body of the day's nudge row (`STUDY_MORNING`, the new `STUDY_MIDDAY`, `STUDY_EVENING`), so the inbox row, Today's card, the generic push, `inAppOnly`, feedback and `closeNudges` come for free. `metadata.rumi` records `pending`, `written` or `fallback`.
7. **Never guess a number, checked by code.** Every digit run in a written line must occur in the reads sent; otherwise the line is rejected, retried once, then the template stands. `BANNED_WORDS`, a shaming list, length, no markdown, no URL are checked the same way. The review summary (E8) and the pattern coach line (E2) use the same checker.
8. **Ids from reads, never invented.** Write tools name records by ids the model read in this conversation (`seen`); an unknown id is refused. Every write goes through the existing owner-scoped, locked service.
9. **Voice is push-to-talk, transcript shown before Send.** No wake word, no open microphone. "Always on" means Rumi's line waits on Today and the drawer is one tap away on every page.
10. **Deep research stays the WI-042 shape.** Searches are built by code from the company, the role and the round types; the invite text is parsed by the model only to find rounds and dates, and it is sent only when ticked. Every point of the doc cites a source or is dropped. The plan of blocks that follows is `propose_blocks`, cards the owner presses.
11. **No new tracking events.** Every measure is read from existing records and message metadata.
12. **Two migrations, not six.** WI-100 carries the memory columns, `AgentSetting` (voice fields included, used from WI-104) and `AiSetting.rumiStyle`; WI-101 carries `STUDY_MIDDAY`, `AiFeature.AGENT_LINE` and the nudge columns. Rumi 3 needs no migration except E1's `InterviewPrepDoc.inviteText`-free design (it stores the rounds it found on the doc, not the invite).

## The owner's problems, the fixes, and how we know

| Problem                                                     | Fixed by                                                                                                                   | Measured from Silsila's own records                                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rumi only answers; the day starts without it                | WI-101: a line Rumi writes from the morning's reads, on Today and the phone; a midday line while a block is ahead; a recap | Feedback on the three rows (HELPFUL / NOT_TODAY / TOO_MANY); `openedAt`; a study block started within 30 minutes of a line; the `fallback` share |
| Rumi forgets between conversations; the voice drifts        | WI-100: one `PERSONA` for chat, lines, extraction and research; memory Rumi keeps itself, by kind, with expiry             | Lines Rumi noted still kept after 14 days; lines removed in Settings; "Forget everything" presses                                                |
| Every action is a card, even "add a note"                   | WI-102 class A at once with Undo; WI-103 class B cards with one press                                                      | At-once writes kept versus undone; cards applied versus dismissed (message metadata)                                                             |
| Typing on a phone is slow                                   | R6, WI-104: push-to-talk with the transcript in the composer; spoken replies and a spoken line                             | Messages sent by voice (`metadata.via`), how often the transcript was edited before sending                                                      |
| An interview invite means an evening of searching           | WI-105 (E1): paste the invite, get a sourced doc mapped to the roadmap and Practice, and blocks until the date             | Docs made, sources opened, cards applied, prep items ticked before the round                                                                     |
| Four days on one topic without noticing                     | WI-106 (E2): a deterministic detector, a Rumi noticed row with Next topic / Mixed set, an optional one-line hint           | Rows shown, acted, dismissed; the topic change after                                                                                             |
| Planning the week is a blank page                           | WI-107 (E3): Rumi drafts next week's blocks in free slots from the goal, the mix and the patterns, a card a day            | Cards applied versus edited versus dismissed; Prepare next week still pressed                                                                    |
| After an interview nothing is written down; no way to drill | WI-108 (E4): a three-question debrief in the owner's words; a spoken mock interview from the prep doc                      | Debriefs saved; mocks run; never a score                                                                                                         |
| Reminders at the wrong time                                 | WI-109 (E5): times shift in 15-minute steps from feedback and "started within 30 minutes", by code                         | Feedback mix over weeks                                                                                                                          |
| The week in short is numbers only                           | WI-110 (E8): a two-line Rumi summary on Weekly review step 1, numbers checked, edited before Save                          | Summaries kept versus edited versus removed                                                                                                      |

**Guardrails throughout:** studying stays the owner's work; every write has Undo or a press; the never-read list and non-study masking stand; the lock screen stays generic; no streak, score, pace or guilt, and "missed" never from Rumi; quiet hours, pause, rest and caps apply to every line; the US$3 stop and provider pinning stand; Rumi never signs into the owner's accounts.

## Order of work

Every slice is its own work item with the house gate. Migration slices apply their migration to the personal database before the merge (`docs/engineering/backup-restore.md`; the Render health check fails a deploy on a schema gap).

### WI-099 · This plan, ADR-030 and the architecture document (docs only)

`docs/product/rumi2-plan.md` (this file), ADR-030 in `docs/architecture/decisions.md`, `docs/architecture/rumi-2.md` (layers, DFD level 0 and 1, user flows), `docs/README.md`, CLAUDE.md's next step, CHANGELOG.

### Rumi 2

#### WI-100 · Persona and memory (migration A)

- **Persona.** `PERSONA` in `src/features/agent/domain.ts`: first person, warm but firm, leads with the fact and one next step, uses the owner's first name sparingly, never cheers with exclamation marks, never counts streaks or scores, never compares, never uses `BANNED_WORDS` or "missed", uses "Rumi knows" quietly without quoting it back, answers in the owner's language (English or Hinglish in chat; the line's language is a setting). `systemPrompt` is rebuilt from it; the line prompt, the extraction prompt, the research prompt and the summary prompt reuse it. A style chip `AiSetting.rumiStyle` (`firm` default · `warm` · `brief`) adds one line (`STYLE_LINES`), saved on choice in Settings like `ThemeSwitch`.
- **Memory model.** `AgentMemory` gains `kind` (`GOAL | HABIT | PREFERENCE | SITUATION`), `source` (`OWNER | RUMI`), `lastUsedAt`, `expiresAt` (a DATE label, null = never), `messageId` (nullable, SetNull). Caps `MEMORY = { items: 40, rumi: 25, text: 200 }`: owner lines are never evicted; at the Rumi cap the stalest `RUMI` row goes. Expiry: `SITUATION` 30 days from `lastUsedAt`, `GOAL` 7 days after its date, `HABIT` and `PREFERENCE` never (Settings marks "not mentioned since …" after 60 days). A daily sweep beside `dailyProviderCheck` deletes expired rows.
- **Extraction.** New `src/features/agent/memory-domain.ts` (pure) and `memory.ts`. After the answer is stored, `extractMemories` runs once per turn behind a deterministic gate (`shouldExtract`: the message is 40 characters or more, not a question, has a first-person trigger word; `AgentSetting.memoryEnabled`; spend under 90 % of the cap; under 20 extractions a day). One `ask<T>()` call (`AiFeature.AGENT_MEMORY`, strict `{ memories: [{ kind, text, expiresInDays }] }`, at most 2, 160 tokens) whose input is **only the owner's last two messages** (`extractionInput`, tested so no assistant text or tool JSON can enter) plus the current list for dedupe. Dedupe: `normaliseMemory` and `sameMemory` (equal normalised text, or a word-set Jaccard of 0.8 or more) bump `lastUsedAt` and add nothing. Written under the owner lock. The streaming route sends one more NDJSON line `{"kept":[…]}` after `done`; the chat shows "Noted in Rumi knows: “…” · Undo" (new undo kinds `remove-memory`, `restore-memory`). `suggest_memory` leaves `TOOLS`; stored cards still render.
- **Settings → Rumi knows.** Grouped by kind with chips, "you" / "by Rumi · 31 Oct", "until 30 Nov" for situations, Remove with Undo, Add with a kind select, "Forget everything Rumi noted", the switch "Rumi keeps notes from conversations".
- **Plumbing used by later slices.** `callModel` gains `perFeatureDay` (counted inside the existing lock); `FEATURE_RATE` in `src/features/ai/domain.ts`; Grill Me's per-call scope excludes the new features. New `AgentSetting` per owner: `memoryEnabled` (true), `lineLanguage` ('en'), `voiceConsentAt` (null), `voiceLang` ('en-IN'), `speakReplies` (false).
- **Migration A** `*_rumi_memory_persona`: the enums and columns, `AiFeature.AGENT_MEMORY`, `AiSetting.rumiStyle`, `AgentSetting`; `LATEST_MIGRATION`; export and `/privacy` updated.
- **Tests.** `tests/agent-memory-domain.test.ts` (gate, input isolation, dedupe, grouping, expiry, style lines against `BANNED_WORDS`); `tests/agent-memory-database.test.ts` (extraction stores `RUMI` rows, dedupe bumps, the Rumi cap evicts only `RUMI`, remove and undo owner-scoped); a migration test; the fake OpenRouter learns the `memories` format.

#### WI-101 · Rumi's line: morning, midday, evening (migration B)

- **Settings.** The Study nudges panel gains "Rumi writes the lines" (`StudyNudgeSetting.rumiLines`, off by default, shown only when AI is configured), a midday line (`middayEnabled`, `middayTime` 13:00) and the line's language. Off, everything is exactly WI-039.
- **When: code, never the model** (`src/features/nudges/domain.ts`). `morningDue` unchanged; `middayDue` (a 120-minute window, an active day, not rested or closed, no session running, a study block still ahead, at least `NUDGE_SPACING_MIN` after the morning line); `recapDue` for the evening when Rumi is on (every active evening; carries the first study block left for Move and Let go). Three lines plus one block-start nudge a day; "Too many" on any line pauses the midday line for seven days (`middayPausedUntil`).
- **What.** `processStudyNudges` queues the row (new type `STUDY_MIDDAY`; morning and evening reuse their types) with the fixed template body and `metadata.rumi = 'pending'`. After the locked loop and before `deliverPending`, `writeRumiLines(now)` (new `src/features/agent/lines.ts`) takes at most one pending row per cron run: `ready()` → code runs the reads with `runTool` (morning: `get_today`, `get_activity(7)`, `get_jobs`, `get_patterns`; midday: `get_today`; evening: `get_today`, `get_activity(7)`, `get_schedule(tomorrow)`), each cut to 3,000 characters → one `ask<T>()` (`AiFeature.AGENT_LINE`, strict `{ line }`, 150 tokens, an 8-second timeout, one retry only for a rejected line) with `PERSONA`, the style, "Rumi knows", the goal and the reads as data → `lineOk(text, reads)` (new pure `src/features/agent/line-domain.ts`: 220 characters or fewer, one or two sentences, no newline, markdown, URL or emoji, no `BANNED_WORDS` or shaming word, every digit run present in the reads) → the body is replaced and `metadata.rumi = 'written'`; after two failed runs `'fallback'`. `deliverPending` skips pending rows; a pending row older than two minutes falls back. Lines never count against `AGENT_RATE`.
- **Where.** Today's `NudgeCard` under the band: heading "Rumi · Morning / Afternoon / Evening" when `metadata.rumi` is set, the same Start, Move, Let go, Rest and Useful? actions, "Ask Rumi about this" (`askRumi`) and Reply, which prefills the drawer (`prefillRumi` in `events.ts`, nothing sent). The inbox row and the push as today, with `LOCK_SCREEN_TEXT.STUDY_MIDDAY = 'Rumi has a line for the afternoon.'`. `sendMessage` appends "Lines you wrote today (as data)" when `rumiLines` is on. No unread dot (the WI-010 cost rule).
- **Migration B** `*_rumi_lines`: `NotificationType.STUDY_MIDDAY`, `AiFeature.AGENT_LINE`, the nudge columns.
- **Tests.** `tests/agent-lines.test.ts` (`lineOk` rejects invented numbers, banned words, length and markup; fallbacks clean; prompts under budget); `tests/nudges-domain.test.ts` (`middayDue`, `recapDue`, the cap, the pause); `tests/coach-database.test.ts` (one row per part per day across repeated runs; pending → written; blocked or near the cap → fallback with no ledger row; push held while pending; `inAppOnly`; dismiss owner-scoped); a migration test; e2e: the morning line shows under the band after `POST /api/notifications/process` with the e2e `CRON_SECRET`, Reply prefills the drawer.
- **Owner step.** Rate ten lines over a week with the fallback share visible in Settings before turning the midday line on.

#### WI-102 · Small writes at once, with Undo

- **Reads carry ids** (`src/features/agent/tools.ts`): `blockOut` adds `id` on visible blocks only, `getJobs` adds application and round ids, `getPractice` adds problem ids, and a new read `find_problems({ text })` returns at most 8 owner-scoped rows. The loop keeps `seen`, the ids read in this message plus those in the conversation's last `HISTORY` assistant messages (`metadata.seen`, ids only); a write naming an unseen id is refused ("Read it first").
- **Tools** (new `src/features/agent/writes.ts`, run inside the loop under the owner lock through the existing services): `add_note({ body })` → `addNote`, undo `remove-note` (new); `add_block({ day, title, kind, start, end })` → only inside `planWindow`, `checkBlocks` and `takenOn` clear, three hours at most, a start in the future → `saveBlock`, undo the existing `cancel-block`; a conflict returns the conflict and "use `propose_blocks`"; `rest_today()` → `setRestDay`, undo `clear-rest-day`.
- **Limits and prompt.** `WRITES_PER_ANSWER = 2`, `WRITES_PER_DAY = 20` (counted from metadata under the lock); no write on the last two rounds; the prompt says "say what you did ('Added …') and that Undo is on the card; never claim an action without a `done: true` result". `metadata.actions: [{ id, tool, label, detail, undo, status }]`; the route streams `{"write":"add_note"}`; `cards.tsx` renders `ActionRows` with a persistent Undo (`undoWriteAction` → `restore`, status `undone`). `afterWrites` runs `forgetAll()`, `syncSoon` and the revalidations.
- **Tests.** `tests/agent-writes-domain.test.ts` (args, `collectIds`, unseen-id refusal, caps, metadata shapes); `tests/agent-writes-database.test.ts` (written for the owner only; an overlap, a past time, a day beyond Sunday and a fourth hour refused with no write; Undo); `tests/rumi-security.test.ts` (foreign ids smuggled into `seen`, tampered undo payloads touch only the owner's rows); the fake router learns `/note|yaad rakh/` → `add_note`; e2e "Rumi adds a note and it is undone".

#### WI-103 · Bigger writes as one-press cards

- `Proposal` and `Suggestion` generalise to `ActionCard` in `plan-domain.ts` (`{ id, kind, args, summary[], snapshot, status: shown | applied | dismissed, undo? }`, stored as `metadata.requests`, at most 2 per answer). One Server Action `applyRequestAction(messageId, requestId)` (new `src/features/agent/requests.ts`, reusing `answerOf` from `plans.ts`) loads the answer by id and owner, re-checks the target under the lock against `snapshot`, performs through the existing service and returns `ActionState` with Undo; `dismissRequestAction`; reopen after Undo like the plan card.

| Tool                                                             | Does                                                                      | Re-check                                                    | Undo                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| `move_block({ blockId, day, start, end })`                       | `saveBlockIn` with the version, overlap refused, never an interview block | exists, version unchanged, no running session               | new `restore-block-slot`             |
| `delete_block({ blockId })`                                      | `deleteBlock` (`deletes/service.ts`)                                      | exists, not running                                         | existing `restore-block`             |
| `change_stage({ applicationId, stage })`                         | `changeStage` with the card id as `requestId` (idempotent)                | still at the stage the card saw                             | existing `restore-stage`             |
| `log_attempt({ problemId, confidence, solved, minutes? })`       | `recordAttempt` with the card id as `requestId`; notes empty              | the problem exists; the `attemptInput` refine               | none (append-only); the card says so |
| `write_review({ day, notes, blocker?, carryForward?, rating? })` | `recordReview` as a draft the owner edits in the card before Save         | day on or before today, no check-in yet, no running session | new `unreview-day`                   |

- Rumi never writes free text into an owner field except a note in the owner's words and a review draft the owner edits. Close the Day stays the owner's flow. Confidence arrives as shaky / okay / solid.
- **Tests.** `tests/agent-cards.test.ts` (each kind applies for the owner only, refuses after a change, is idempotent on a double press, undoes); the security test gains `applyRequest` with a foreign `messageId`; e2e "a move card is applied and undone".

#### R6 · Voice spike (no product code)

On the owner's devices with a throwaway static page: iOS Safari as a tab and as the Home Screen app (`webkitSpeechRecognition`, en-IN and en-US, interim results, the silence stop, whether the microphone permission persists), `speechSynthesis` in the Home Screen app after a tap and under screen lock, Chrome desktop and Android, Firefox (expected none), and OpenRouter prompt caching on the pinned endpoint (`cache_control` on the system prompt and `TOOLS`; it must pass `require_parameters` and the provider check). Findings go into ADR-030 and `docs/engineering/notifications-pwa.md`. If recognition fails standalone, WI-104 hides the microphone button there.

#### WI-104 · Voice: push-to-talk in, replies and the line spoken out

- **Consent.** Settings → a "Voice" row (`src/features/agent/voice-settings.tsx`): plain text that the browser's recognition is used, that Chrome sends audio to Google and Safari to Apple, outside Silsila's zero-retention AI rule, and that Rumi receives the same text as if typed; a check "I understand; show the microphone button" saves `AgentSetting.voiceConsentAt`; a language select (en-IN default, en-US, hi-IN). The button renders only with consent (a server prop into `RumiChat` and `RumiDrawer`).
- **UX.** `src/features/agent/voice.tsx` with a hook `useDictation` in a new `src/lib/speech.ts`, where Listen's `useVoices` and `speechSupported` move. The microphone button toggles (tap to start, tap or two seconds of silence to stop, Escape cancels); `continuous = false`, `interimResults = true`; interim words in the textarea in meta ink; nothing is sent until the owner presses Send. Errors read as plain lines. The message carries `metadata.via = 'voice'` and `edited`. No audio or transcript is stored.
- **Speak.** `AgentSetting.speakReplies` (off): a reply is spoken line by line as Listen does, with Stop; cancelled on a new send, a new reply, the drawer closing and unmount; on iOS only after a tap (R6). Today's Rumi line card gains Listen (the line only).
- **Tests.** The metadata shape; e2e: the microphone button is absent without consent and present with it (`webkitSpeechRecognition` stubbed with `addInitScript`); `/privacy`, `security.md`, `notifications-pwa.md`.

#### UAT · two weeks

The measures in the table above, read from the records; ten rated lines; the fallback share; writes undone versus kept; cards applied versus dismissed; messages by voice. Then the budget option is confirmed or changed (ADR-022 amendment if a second model or a higher stop).

### Rumi 3

#### WI-105 · E1 · Deep research for an interview invite

- **Entry.** On an application, "Prepare with Rumi" gains "I have the invite" (a textarea, sent only when the owner ticks "Send the invite text", as the job description is today) and from the chat: "Company X ka interview aaya" hands over to the same panel.
- **Parse.** One `ask<T>()` (`PREP_RESEARCH`, strict `{ rounds: [{ type, date?, start?, minutes?, format?, aiPolicy? }], topics: string[] }`) reads only the invite text; the rounds it finds are offered as cards that create `InterviewRound`s (`scheduleRound`) and tick `formats`. The invite text is not stored; the rounds and the topics are, on the doc.
- **Search.** `searchQueries` (WI-042) gains the found round types and topics: at most 8 code-built queries (company + round type + "interview", company + "system design interview", company + topic, the official careers page). Exa as today, three results each, outside the chat loop, no write tools.
- **Doc.** `PREP_FORMAT` gains sections "What this round asks", "What to study, in order" and "From your own material" (roadmap items by title, Practice problems by title, both as R#/P# ids resolved by code), each point with a source id; `readPrepDoc` drops unsourced points as today. A "Plan until the date" button runs `propose_blocks` through `proposeBlocks` with the doc's study order as the titles, in free slots only, six blocks at most per card, one card per day; the owner presses Add to plan.
- **Cost.** About US$0.08–0.15 per doc; five docs a day as today.
- **Tests.** `tests/prep-domain.test.ts` (the invite parse format, queries from rounds and topics, no personal field in a query); `tests/prep-database.test.ts` (rounds created only on press; the doc stores no invite text); the fake router learns the parse format.

#### WI-106 · E2 · The pattern coach

- **Detector** (pure, `src/features/noticed/domain.ts`, new kind `stuck`): the same topic for four or more days with attempts whose confidence has not risen, or the same roadmap item open for four days; the reverse, `cold`: a topic with a revision step due that has not been opened for four days. Fixed templates through `cleanCopy`: "4 days on Sliding Window; 2 problems still shaky." with Next topic (`nextProblemFor`), Mixed set (the drill deck filtered to the last four topics), Keep going (snooze 3 days).
- **Optional line.** When `rumiLines` is on, the row carries one Rumi sentence written from the topic's attempts through `lineOk` (an `AGENT_LINE` call, one a day for this kind): why this pattern is hard and one hint, never a solution.
- **Tests.** `tests/noticed-domain.test.ts` (both detectors, snooze, copy against `BANNED_WORDS`); `tests/noticed-database.test.ts`.

#### WI-107 · E3 · The week draft

- On Sunday's Weekly review step 3, "Draft next week with Rumi": inputs by code (the goal and its date, the routines as busy time, the interviews, `WEEKLY_MIX`, the last four weeks' patterns, Rumi knows), one `callModel` round with `propose_blocks` only (`PROPOSAL_BLOCKS` raised to 8 for this entry, `PROPOSALS_PER_ANSWER` 7, one per day), free slots only through `checkBlocks`. The answer renders one card per day with edit time, drop and add; Add to plan writes the day through `applyProposal`; Prepare next week stays for the routines. Routines are never edited.
- **Tests.** `tests/agent-plans.test.ts` (seven cards, free slots only, the mix honoured, interviews untouched); e2e "the week draft adds Monday and Undo removes it".

#### WI-108 · E4 · The debrief and the mock interview

- **Debrief.** When a round is marked completed, the round form offers "Debrief with Rumi": three fixed questions (what was asked, what went well, what to improve) asked one at a time in the drawer; the answers are saved as the round's `topicsAsked`, `wentWell`, `toImprove` in the owner's words through `recordRoundResult`; Rumi never reads these fields back (ADR-024). No model call is needed for the questions; one optional `AGENT_CHAT` turn may rephrase the owner's answer when asked.
- **Mock interview.** From a prep doc, "Mock interview": five questions drawn by code from the doc's "What this round asks", asked one at a time, by voice when WI-104 is on; the owner answers by voice or text; Rumi gives one paragraph of feedback per answer (`AGENT_CHAT`, the doc as data) and never a score. The transcript is a conversation like any other, deletable.
- **Tests.** The debrief writes through the existing round service and is owner-scoped; the mock's questions come from the doc, not the model.

#### WI-109 · E5 · Reminders that learn

- By code only: once a week, for each part of the day, the feedback mix (HELPFUL, NOT_TODAY, TOO_MANY) and "a study block started within 30 minutes of the line" over the last four weeks move that part's time by 15 minutes toward the time blocks actually started, within the owner's window, or turn the part off after three TOO_MANY in a row (Settings shows "paused by your feedback", one tap to resume). `nudgeContext` names the shift.
- **Tests.** `tests/nudges-domain.test.ts` (the shift rule, the bounds, the pause).

#### WI-110 · E8 · The review summary

- Weekly review step 1 gains a two-line Rumi summary above The week in short (`AGENT_LINE`, two sentences, 300 characters, `lineOk` with the week's reads) with Edit and Remove; the edited text is saved as the review's `biggestWin` draft only when the owner presses Keep. Off when `rumiLines` is off.
- **Tests.** `lineOk` at the longer limit; the summary never writes without Keep.

### Later (not now)

A wake word or an open microphone; reading Gmail or the calendar for invites (E6); a WhatsApp channel (E7); a conversation summary beyond 12 messages; an unread dot on the Rumi button; `mark_item_done`, prep-item ticks and other writes beyond the twelve tools above; Sonnet for the lines or chat; images (a screenshot of a problem); premium or multi-user (sign-in for any verified Google account, per-user caps and billing, the Calendar scope review, per-user rate limits, an admin page).

## Cost model (ADR-022 prices: input US$0.10, output US$0.50 per million tokens)

| Unit                              | Calls          | Input  | Output | About        |
| --------------------------------- | -------------- | ------ | ------ | ------------ |
| Chat message (2.5 rounds)         | 2.5            | 12,500 | 400    | US$0.0015    |
| An at-once write (one more round) | +1             | +5,000 | +50    | +US$0.0005   |
| Rumi's line (reads by code)       | 1 (+0.2 retry) | 2,500  | 80     | US$0.0003    |
| Memory extraction                 | 1              | 1,200  | 100    | US$0.0002    |
| Prep doc, deep research           | 8 searches + 2 | —      | —      | US$0.08–0.15 |
| Week draft                        | 1              | 6,000  | 600    | US$0.001     |
| Mock interview (5 answers)        | 5              | 15,000 | 1,500  | US$0.002     |

A month at 15 chat messages a day (5 with a write), 3 lines a day, extraction on every eligible message, 4 docs, 2 mocks and 30 ladders: about **US$1.2 (option A)**, about US$2.3 at 30 messages a day. Options B (US$5 on Haiku), C (Sonnet for the lines, about US$1.7) and D (Sonnet for chat, about US$14) are recorded in `output/Silsila-Rumi-2-Story.pdf`; nothing changes until the owner chooses after UAT. Free models were set aside because most OpenRouter free endpoints and the Gemini free tier keep or train on prompts; a free endpoint tagged zero-retention may be tried for the line only, with the same provider check and fallback, as option B2.

## What stays deterministic

Whether and when a line is due, its fallback body, the push text and path, the block-start nudges, Rumi noticed and the pattern detectors, patterns, the card actions, the free-slot check, every re-check under the lock, every Undo kind, the memory gate, caps, dedupe and expiry, the banned-word and invented-number checks, the voice transcript, the search queries, the reminder shifts, and which class a write belongs to.

## Critical files

- `src/features/agent/{domain,service,tools,plans,plan-domain,actions}.ts`, `chat.tsx`, `cards.tsx`, `drawer.tsx`, `memory.tsx`, `events.ts`; new `memory-domain.ts`, `memory.ts`, `lines.ts`, `line-domain.ts`, `writes.ts`, `requests.ts`, `voice.tsx`, `voice-settings.tsx`
- `src/features/ai/{domain,service}.ts` (`callModel`, `ask<T>`, `PINNED_PROVIDER`, the ledger), `src/app/api/rumi/ask/route.ts`
- `src/features/nudges/{domain,service}.ts`, `card.tsx`, `forms.tsx`; `src/features/notifications/service.ts` (the model call stays outside `locked()`); `src/features/push/{domain,service}.ts`; `src/app/api/notifications/process/route.ts`
- `src/features/noticed/{domain,service}.ts`, `rows.tsx`; `src/features/prep/{domain,service}.ts`, `panel.tsx`; `src/features/undo/service.ts`; `src/features/schedule/editing.ts`; `src/features/{notes,dsa,jobs,review,deletes}/service.ts`
- `src/features/listen/listen.tsx` (speech helpers to extract into `src/lib/speech.ts`); `src/app/settings/page.tsx`; `src/app/today/page.tsx`, `src/features/today/header.tsx`; `src/app/review/page.tsx`
- `prisma/schema.prisma`; `src/server/{export,health}.ts`; `tests/support/fake-openrouter-server.ts`; `docs/architecture/{decisions,rumi-2}.md`; `docs/engineering/{security,notifications-pwa,operations}.md`; `src/app/privacy/page.tsx`; `CLAUDE.md`

## Verification

- **Every slice:** prisma format, generate, lint, typecheck, `test:ci` on a disposable database, build, `test:e2e` and Safari, docs:check, `git diff --check`; browser checks at 1440 and 390 px, light and dark, axe clean.
- **Migration slices (WI-100, WI-101):** a fresh deploy, the drift check, an upgrade test from the previous migration, the seed twice; the verified backup and `db:deploy` on the personal database before the merge.
- **Privacy regression contracts:** the forbidden-field property test over every tool (reads, writes, the line's reads, the research queries); extraction input is only the owner's messages; no personal field in a push or a search; `lineOk` rejects invented numbers and every banned word; no "missed" anywhere Rumi writes; the invite text is never stored.
- **Production:** after each deploy a live check in Chrome and on the iPhone (the Home Screen app for push and voice), Render logs with counts only (`[agent] line made {part, fallback, micros}`, `[agent] memory noted {added, refreshed}`, `[agent] writes {atOnce, cards}`), the ledger cost per line and per message in Settings.
