# WI-143 handoff: Rumi as a conversation, and prompt caching

Date: 2026-11-02. The owner asked why Rumi does not talk like Claude or ChatGPT. Of the options laid out (A open the prompt, B a history summary, C a larger model, D a faster Talk, E realtime voice), they chose **A and D**, and asked whether caching could save cost and time. B and C stay for after UAT; E was set aside because the services that offer it keep data.

The owner also asked about caching answers locally, so that the same question twice is not sent again. That was not done:

- an answer is read from the owner's live records, which change through the day;
- an answer also depends on the conversation;
- a message costs about US$0.0015.

Prompt caching saves on the repeated part instead, and the answer stays fresh.

No migration. ADR-022 and ADR-030 are amended.

## What changed

- **A, the chat prompt** (`systemPrompt` in `src/features/agent/domain.ts`; the shared `PERSONA`, which Rumi's lines and memory also use, is unchanged):
  - A study-partner line: for learning and thinking things through (concepts, interview questions, system design, code, decisions), Rumi answers fully, with examples, discussion and a question back, and the length matches the question. The coach's steadiness stays for the owner's plans and progress.
  - "For anything else, say where in Silsila" became "for a change in Silsila you cannot make".
  - A message that came by voice is marked "spoken". Rumi then answers as it would speak: a few short sentences, no lists, unless asked for detail.
  - The reply ceiling `CHAT_MAX_TOKENS` is 3,000 (was 1,500). The reservation follows it.
- **Prompt caching** (ADR-022 amendment):
  - `withClock(messages, time, spoken)` puts `[14:05]` (or `[14:05, spoken]`) before the latest question as sent; stored messages never change. The clock left the system prompt, so the prompt is the same all day.
  - `withCacheMarks` in `chatBody` sends the first system message and the latest question as content blocks with `cache_control: { type: 'ephemeral' }`. Within one answer, rounds 2 to 6 read tools, system and history back at 0.1× the input price; the next message within five minutes reads tools and system.
  - Haiku 5.5 caches from 512 tokens. Writes cost 1.25×, and OpenRouter's reported `cost` already carries both, so the ledger is unchanged.
  - No request parameter was added: a test checks that `cache_control` is never a top-level key. `require_parameters`, the pinned endpoint, `zdr: true` and the provider check are unchanged. OpenRouter's ZDR page treats in-memory prompt caching as no retention and allows it under ZDR routing.
  - `costMicros` returns `cached` (from `prompt_tokens_details.cached_tokens`), and `[agent] chat made {…, cached}` logs the count. `security.md` lists it.
- **D, Talk:**
  - A turn ends after `TALK_SILENCE_MS` = 1.5 s of silence. `useDictation.start(pause)` takes the pause; the microphone keeps 2 s.
  - `pickVoice` (`src/lib/speech.ts`) reads with a local voice before a network one, so the reply never leaves the device for speech. Then the exact language (an Indian voice for en-IN), then a Premium, Enhanced, Natural or Neural one. Any good voice the owner has downloaded is used by itself; on a Mac, the Enhanced voices are in System Settings → Accessibility → Spoken Content.
- **Tests:**
  - `tests/agent-domain.test.ts`: no clock in the prompt; the study partner and the spoken rule; `withClock` only on the latest question; the cache marks on the system prompt and the latest question only, and never as a parameter.
  - `tests/ai-domain.test.ts`: `cached` from the usage.
  - `tests/speech.test.ts`: `pickVoice`.
  - The database tests and the fake OpenRouter read content blocks as text.

## Measure it live

After the deploy, ask Rumi two questions a minute apart. The Render log's `[agent] chat made` line should show `cached` above zero from the second round, or the second message, onward. If it stays at 0, the provider did not take the marks; nothing breaks, it only costs what it did before.

## Gate

prettier, lint, typecheck, knip, `test:ci --coverage` on a fresh database, build, `test:e2e` and `test:e2e:safari`, docs:check, `git diff --check`. The branch is pushed and green before the merge.
