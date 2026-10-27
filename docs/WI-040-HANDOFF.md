# WI-040: Ask Rumi

Date: 2026-10-27. Branch `feat/wi-040-ask-rumi` from `main` `fd3f817` (R5 and ADR-024). This is the fifth item of the Rumi plan (`docs/product/rumi-plan.md`) and the first with the assistant. It follows ADR-024, which the owner signed off on 2026-10-27. One migration.

## Outcome

**Where:**

- **Ask Rumi** leads the sidebar.
- The phone bar is now Today · **Rumi** · Roadmap · Jobs · More. Practice moved into More.
- In ⌘K, typed words offer **Ask Rumi · “…”**, and Ask Rumi is also a place. The words go to the Rumi page in the tab's sessionStorage, never in the URL.

**The page (`/rumi`):**

- Saved conversations, newest first: a column on desktop, and a Conversations panel on a phone.
- **New conversation**, and **Delete** behind a confirm.
- Four suggested questions while a conversation is empty.
- Enter sends; Shift+Enter adds a new line.
- "Rumi is reading your records…" shows while an answer is on its way.
- The month's AI budget line.
- Replies render as paragraphs, lists and bold only (`renderText`, `RumiText`). Everything is text, so markup in a reply shows as characters.

**What Rumi reads** (`src/features/agent/tools.ts`): six read-only, owner-scoped tools that return compact summaries.

| Tool           | Returns                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_today`    | Local time, each block (time, kind, title, state, recorded minutes), the running session, rest day and closed                                                                     |
| `get_schedule` | Blocks per day, 14 days at a time, from 28 days back to 14 ahead                                                                                                                  |
| `get_activity` | Up to 28 days: every study kind with its total (0 when none) and last recorded day, minutes per kind per day, study block titles with their state, roadmap items done per roadmap |
| `get_roadmaps` | Roadmaps with Study AI on: done, left, in progress, next item, due for revision and the first five due. It also counts the hidden ones                                            |
| `get_practice` | Problems by confidence, due for revision, the last 10 attempts (problem, difficulty, topic, confidence, solved alone, minutes)                                                    |
| `get_jobs`     | Active applications (company, role, stage, applied, next action date and owner) and upcoming rounds with their prep item titles and done                                          |

**Privacy (ADR-024):**

- Each tool selects only the fields it sends. The never-read fields are never loaded:
  - notes, check-in notes and carry-forward, blockers;
  - interview reflections, interviewers, meeting links and locations;
  - compensation, recruiter and hiring contacts, job description and next-action text;
  - block descriptions, skip reasons, problem links, attempt notes and mistakes.
- Blocks keep their titles only for the owner's **study categories** (Settings → Study nudges → Study categories) plus DSA, Technical and job search. Everything else is "busy 07:00–08:00".
- Roadmaps with Study AI off and test-named records are left out.
- Rumi has no write tool, and the prompt says it can read but not change anything.

**A message** (`sendMessage` in `src/features/agent/service.ts`):

1. The owner's message is counted and stored under the owner lock. The limits are 30 an hour and 100 a day.
2. The request sends the system prompt, the conversation's last 12 messages and the "Rumi knows" lines:
   - The system prompt has the date and time, the rules and the banned words.
   - "Rumi knows" is a list in Settings → Data, at most 20 lines of 200 characters. The owner writes every line.
3. Up to six model calls follow. Each goes through `callModel`, so each is reserved in the ledger as `AGENT_CHAT`, checked against the shared US$3 month and refused if another provider answers. The sixth call has `tool_choice: "none"`.
4. Only the answer is stored, with the names of the tools used and the cost in `metadata`. Tool results are never stored.

**Shared AI changes:**

- `callModel` (`src/features/ai/service.ts`) is now the one path that reserves, posts and checks a call, for `ask()` (Grill Me, Listen) and Rumi.
- Grill Me's per-call limits of 20 an hour and 60 a day no longer count Rumi's calls.
- `PINNED_PROVIDER` is the shared routing.
- The provider check now also requires `tools` and `tool_choice` on the pinned endpoint. OpenRouter's list showed both on 2026-10-27.
- Rumi does not follow the Grill Me switch, because it runs only on the owner's own message. A provider block stops both.

## Differences from the plan

- **Pattern lines** (best focus hours, planned-to-recorded ratio) move to WI-041, where Rumi's proposals use them. Rumi can already read the minutes per kind and day from `get_activity`.
- **Rumi suggesting "Rumi knows" lines** moves to WI-041's confirmation cards. In WI-040 only the owner adds lines.
- **Delete has a confirm, not Undo.** Restoring a whole conversation needs more than the undo kinds hold.
- **A failed answer keeps the question.** If the provider fails after the question is saved, the question stays in the conversation without a reply, and the owner can ask again.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `prisma/migrations/20261027120000_ask_rumi/`, `src/features/agent/{domain,tools,service,actions,events}.ts`, `src/features/agent/{chat,memory}.tsx`, `src/app/rumi/page.tsx`, `tests/agent-domain.test.ts`, `tests/agent-database.test.ts`, `tests/ask-rumi-migration.test.ts`, `docs/screenshots/wi-040/`                                                                                                                                                                                              |
| Changed | `prisma/schema.prisma` (`AgentConversation`, `AgentMessage`, `AgentMemory`, `AgentRole`, `AiFeature.AGENT_CHAT`), `src/features/ai/{domain,service}.ts`, `src/features/command/{domain.ts,bar.tsx}`, `src/components/navigation.tsx`, `src/app/settings/page.tsx`, `src/app/privacy/page.tsx`, `src/server/{export,health}.ts`, `src/app/globals.css`, `tests/support/fake-openrouter-server.ts`, the provider fixtures in three AI tests (they now list `tools`), `docs/engineering/security.md`, docs |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree. `pnpm test:ci`: 79 files, 487 tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Migration                                | A fresh `migrate deploy` and `migrate diff --exit-code` = 0. The upgrade test keeps existing ledger rows, accepts `AGENT_CHAT`, refuses a 201-character line and an empty message, and cascades deletes. Seed run twice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tests                                    | **Domain 15:** the chat body keeps the pinning, sends tools and no strict format or `temperature`, and uses `tool_choice: "none"` on the last round; the provider check fails closed without `tools` or `tool_choice`; tool arguments are validated and unknown tools refused; results are cut to a budget; the history window is 12; titles are masked by category; the system prompt carries the date, rules, banned words and lines; the renderer keeps markup as text; ⌘K offers Ask Rumi. **Database 9:** a PRIVATE marker in every never-read field, and another owner's records, never appear in any tool's output or in any request; Backend titles show only once Backend is a study category; a tool round then an answer stores only the question and answer with tool names and cost; 12 messages and the lines are sent, and only to the owner's conversation; six calls at most; a bad tool call is refused to the model; the hourly limit counts messages, and Rumi's calls leave Grill Me its limits; the shared cap and a provider mismatch stop Rumi; delete and export |
| Browser, desktop (fake OpenRouter)       | A suggested question ran `get_activity` and showed the answer with bold and a list. The conversation was saved, listed, and the URL updated. A follow-up typed with Enter ran `get_roadmaps`. ⌘K on Today with "aaj kya start karun" opened Rumi and ran `get_today`. Delete asked first, then returned to an empty Rumi. axe found one contrast issue (meta text on the teal tint, 4.42:1), now fixed; axe was then clean in light and dark                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Browser, 375                             | The phone bar reads Today · Rumi · Roadmap · Jobs · More. Conversations opens as a panel, and a link in it opens that conversation and closes the panel. Settings → Rumi knows added a line ("1 line"). No horizontal overflow; axe clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Screenshots: `docs/screenshots/wi-040/`.

## Owner steps

1. **Before merging,** apply the migration to production from your own terminal, as before (`read -rs` for the Supabase URL, then `pnpm db:deploy`).
2. **After the deploy,** open Ask Rumi and ask a few real questions. Each call costs about US$0.0001–0.0003, so a message with two tool rounds is well under a cent.
3. Turn Study AI on for the roadmaps Rumi should see (each roadmap's settings). Rumi tells you how many it cannot see.
4. Optional: tick your own study kinds (such as Backend) under Settings → Study nudges → Study categories, so their block titles are shared. Add a few lines under Settings → Data → Rumi knows.
5. Rate about ten answers for the plan's measure.

## Live check (2026-10-27)

In the owner's Chrome, "What did I study least in the last 7 days?" answered from real records (DSA 30 minutes on Oct 21), and a Hinglish follow-up answered in Hinglish from `get_today`, with a work block sent only as "busy 07:30–09:00". The month stayed under US$0.01, and the console had no errors. One gap was found and fixed on `fix/rumi-study-kinds`: Rumi could not name kinds with no minutes, so `get_activity` now lists every study kind at 0 and the last day each was recorded.
