# WI-119 handoff: Rumi's answer streams in as it is written

Date: 2026-11-01. The last item of the Rumi audit (E5): an answer appeared only once it was whole, so a long reply felt slow. No migration.

## What changed

- **The model call streams** when asked (`callModel(..., onStream)` in `src/features/ai/service.ts`): the body gains `stream: true`, and OpenRouter's server-sent events are read by `streamReader` (`src/features/ai/stream.ts`, pure) into exactly the answer the non-streaming call returns, so the provider check, the cost, the ledger, tool calls and every check after the call are unchanged. Text is handed on only once a chunk names the pinned provider (`Google`); if a round turns to tool calls after some text, a reset is handed on.
- **Ask Rumi streams** (`sendMessage` and `askRumi` take `onStream`; `POST /api/rumi/ask` sends `{ "delta": … }` and `{ "reset": true }` lines before the stored answer). The chat shows the answer as it is written in a draft message with Rumi's busy head, and the stored answer replaces it when it arrives; the reading line shows until the first words. Other AI features (Grill Me, Listen, lines, prep docs, mock feedback) do not stream.
- The fake OpenRouter streams its chat answers when asked, so the browser journeys walk the streaming path.

## Tests

`tests/ai-stream.test.ts`: text only after the pinned provider is named, the answer built the same as a non-streaming one, a reset when tools follow text and their arguments joined, nothing shown from another provider and broken lines skipped; Ask Rumi asks every round to stream, the streamed text equals the stored answer, and the ledger settles each call. Every Rumi browser journey now runs on the streaming route.

Browser-checked in the lab: the first words show after about 1.3 s and the whole answer after 1.6 s with the fake model; no console errors.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database (824), build, `test:e2e` and Safari (16 each), docs:check, `git diff --check`.

## Next

The Rumi audit is done (WI-114 to WI-119). Two weeks of UAT continue.
