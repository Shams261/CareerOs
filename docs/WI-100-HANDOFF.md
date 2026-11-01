# WI-100 handoff: Rumi 2, persona and memory

Date: 2026-11-01. The first code slice of the Rumi 2 and 3 plan (`docs/product/rumi2-plan.md`, ADR-030). Migration **A**: `20261102000000_rumi_memory_persona`. The owner applies it to the personal database before the merge (`docs/engineering/backup-restore.md`: verified backup, restore check, `db:deploy`); Render's health check fails a deploy on a schema gap.

## What changed

- **Persona.** `PERSONA` (`src/features/agent/domain.ts`) opens every prompt: who Rumi is, first person, the fact then one next step, the owner's name sparingly, never cheers, streaks, scores, comparisons or guilt, and "Rumi knows" used quietly. `systemPrompt` takes `style` (`firm` default, `warm`, `brief`: `STYLE_LINES`), chosen in Settings → Rumi knows and saved on choice (`AiSetting.rumiStyle`, `rumiStyleAction`).
- **Memory model.** `AgentMemory`: `kind` (GOAL, HABIT, PREFERENCE, SITUATION), `source` (OWNER, RUMI), `lastUsedAt`, `expiresAt` (a DATE label), `messageId` (SetNull). Existing lines become the owner's preferences. `AgentSetting` per owner (`memoryEnabled`, `lineLanguage`, and the voice fields WI-104 will use). `AiFeature.AGENT_MEMORY`.
- **Extraction** (`src/features/agent/memory-service.ts`): after an answer, `extractMemories` runs behind `shouldExtract` (40+ characters, not a question, a first-person word), the setting, 90 % of the month's cap and 20 calls a day (`callModel` gains `perFeatureDay`, counted inside the lock). One `ask<T>()` with `MEMORY_FORMAT` reads only the owner's last two messages (`extractionInput`), keeps at most two lines through `keepLineIn` under the owner lock: a duplicate (`sameMemory`: equal normalised text or four fifths of the words) refreshes `lastUsedAt`; at 25 Rumi lines the one not sent for longest, then the oldest, gives way (`stalest`); owner lines are never evicted; 40 lines in all. Situations lapse 30 days after their last send, dated goals a week after their date; `pruneMemories` runs with the daily provider check. Failures are logged by class and swallowed.
- **In the chat.** `noteMemories` runs after `askRumi`: the server action waits for it; the streaming route sends `{"done":…}` first and `{"kept":{messageId, items}}` after, and `askStreaming` keeps reading in the background. `KeptRows` shows "Noted in Rumi knows: “…” · Undo" (`remove-memory`); `readMetadata` reads `kept`. `sendMessage` sends the active lines grouped by kind (`memoryLines`) and stamps them once a day.
- **Settings → Rumi knows** (`memory.tsx`, `memory-controls.tsx`): the style chips, the "Notes from conversations" switch, the lines grouped by kind with "you" or "by Rumi · date", "until …", "not mentioned since …", Remove with Undo (`restore-memory`), Add with a kind, and "Forget everything Rumi noted" behind a confirm. The row reads "12 lines · 7 by Rumi".
- `suggest_memory` left `TOOLS`; `TOOL_ARGS` keeps it so stored cards still read; a kept suggestion goes through `keepLineIn`. The fake OpenRouter answers the `memories` format.

## Tests

`tests/agent-memory-domain.test.ts` (the gate, the input isolation, the strict read, dedupe, expiry, grouping, eviction, the styles against `BANNED_WORDS`), `tests/agent-memory-database.test.ts` (kept from the owner's words only and shown on the answer; a question, a short message and the switch cost no call; duplicates refresh; eviction spares owner lines; grouped lines and the style in the prompt; the daily stamp; pruning; Remove with Undo; Forget; another owner refused), `tests/rumi-memory-migration.test.ts`; `agent-domain`, `agent-database` and `agent-plans` updated for the retired tool and the grouped lines.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database (704 tests), build, `test:e2e` and Safari, docs:check, `git diff --check`; schema: fresh deploy, `migrate diff --exit-code` 0, seed twice and `verify-seed.ts`, the upgrade test.

## Next

WI-101 Rumi's line (migration B).
