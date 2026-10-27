# WI-055 handoff — Rumi read line and live progress

Date: 2026-10-28. Branch `feat/wi-055-rumi-read-line` from `main` `cd1da60` (WI-054). This is the third P2 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, section 11: "Rumi: show 'read: …' under answers; streaming; one budget line"). No migration.

## What changed

**Read line.**

- `READ_WORDS` and `readLine` (`src/features/agent/domain.ts`) turn the tool names stored with an answer (`metadata.tools`, there since WI-040) into "Read: today, roadmaps". Each name appears once, in the order used.
- Cards (`propose_blocks`, `suggest_memory`) and unknown names are not reads. An answer that read nothing shows no line.
- `readTools` (`plan-domain.ts`) reads the names from stored metadata. `readMetadata` keeps its exact shape for the existing cards test.
- The page and the live answer both render `.rumi-read` under the reply.

**Live progress.**

- `sendMessage` takes an optional `onRead(tool)`, called as each read starts. It carries the tool name only, never the result.
- `askRumi` (`service.ts`) is the old `askAction` body, so the server action and the new route share one path. It returns the answer with `tools` and the budget line, or a plain message.
- `POST /api/rumi/ask` (`src/app/api/rumi/ask/route.ts`) streams newline-delimited JSON: `{"read":"get_today"}` for each read, then `{"done":…}` with the same result the action gives.
  - It refuses a request whose `Origin` host differs from `Host` (403), and the session cookie is SameSite=Lax as well.
  - The question travels only in the body.
- In `chat.tsx`, `askStreaming` reads the stream, and the waiting line follows it (`readingLine`): "Rumi is reading today, your schedule…".
- Model tokens are not streamed. The answer arrives whole, once the provider check, the ledger and the store have it. Streaming tokens would mean showing text before those checks.

**One budget line.** The page header no longer repeats the month's spend, so it shows once, under the composer, and updates after each answer.

**Docs.** `security.md` describes the route.

## Tests

- `tests/rumi-read-line.test.ts` (3 tests):
  - the read line's words, order, duplicates, cards, unknowns and the empty case;
  - the waiting line;
  - `readTools` on good and bad metadata.
- `tests/agent-database.test.ts` (+1): `askRumi` with a fake router calls `onRead` with `get_today` then `get_roadmaps`, and returns those tools, empty cards and the budget line.
- The e2e Rumi journey (plan card, Add to plan, Undo) now runs through the streaming route.

## Browser check (local, fake OpenRouter)

- Asking "aaj kya start karun…" showed "Rumi is reading your records…", then "Rumi is reading today…".
- The answer ended with "Read: today", and the line stayed after a reload.
- One budget line remains on the page.

## Gate

Lint, typecheck and docs check (93 files) pass on an export of the working tree; `pnpm build`; `pnpm test:ci`: 99 files, 560 tests; `pnpm test:e2e`: 7 passed; `git diff --check` clean.
