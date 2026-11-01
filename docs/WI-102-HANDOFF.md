# WI-102 handoff: Rumi's small writes, at once with Undo

Date: 2026-11-01. The third code slice of the Rumi 2 and 3 plan (`docs/product/rumi2-plan.md`, ADR-030 class A). No migration.

## What changed

- **Three writes** in `TOOLS` (`src/features/agent/domain.ts`), strict arguments in `write-domain.ts`: `add_note({ body })` (500 characters), `add_block({ day, title, kind, start, end })` and `rest_today()`. The prompt lets Rumi use them only when the owner asks for that change, says "Added …" and that Undo is under the answer, and never claims a change without a `done: true` result; moving, deleting and editing stay out (WI-103's cards).
- **Running them** (`src/features/agent/writes.ts`, `runWrite`): one owner lock per write, which first reads the day's count (`writesToday`: every action on the owner's answers since local midnight) and applies `writeRefusal` (no write in the last `WRITE_FREE_ROUNDS` = 2 rounds of `MAX_ROUNDS`, `WRITES_PER_ANSWER` = 2, `WRITES_PER_DAY` = 20). A note goes through `noteInput` to `quickNote`; a rest day through `setRestDayIn` (new, `setRestDay` now wraps it), refused when today is already one; a block only inside `planWindow`, `BLOCK_MAX_MINUTES` = 180, after `generateInTransaction` for that day, checked by `checkBlocks` against `takenOn` (both exported from `plans.ts`, `knownKinds` too), then written by `saveBlockIn` as a manual block, which re-checks overlaps itself. A refusal returns `{ done: false, error }` and writes nothing; a writer's own error message is returned the same way.
- **Actions and Undo.** Each write returns an action (`{ id, tool, label, detail, undo, status }`) stored as `metadata.actions` on the answer; `readActions` reads only well-formed actions whose undo is the one their tool leaves (`UNDO_FOR`: `remove-note` (new kind in `undo/service.ts`), `cancel-block`, `clear-rest-day`). `ActionRows` (`cards.tsx`) shows each under the answer with a link to Today and an Undo that stays as long as the answer; `undoWriteAction` → `undoWrite` loads the owner's own answer by id, runs the stored undo through `restore` and marks the action `undone`. `afterWrites` (`after-writes.ts`, server-only) forgets the snapshots, syncs a new block and revalidates Today and Plan after an answer that changed something.
- **Ids.** Visible blocks (`blockOut`), applications and rounds (`getJobs`) and problems (`getPractice`, the new read `find_problems`: up to eight of the owner's visible problems by title words) carry their ids; busy blocks never do. The loop collects them (`collectIds`) into `seen`, starting from the conversation's earlier answers (`metadata.seen`, `readSeen`), and stores up to `SEEN_MAX`. A write that names a record must name one in `seen` (`unseenId`, `WRITE_ID_ARGS`); the class A writes name none, so this is the guard WI-103's cards use. Rumi's line sends its reads without ids (`withoutIds` in `readText`), so an id's digits never pass `lineOk`'s number check.
- **Streaming.** `askRumi` takes `onWrite`; the route sends `{"write":"add_note"}`; the progress line reads "Rumi is adding a note…" (`WRITE_WORDS`).
- `/privacy` says what Rumi may change. The fake OpenRouter answers "note: …" or "yaad rakh …" with `add_note`.

## Tests

`tests/agent-writes-domain.test.ts` (the tools and their strict arguments, `collectIds`, `withoutIds`, `unseenId`, the limits, stored actions read back and tampered ones dropped), `tests/agent-writes-database.test.ts` (a note and its Undo; a block in free time with a clash, a passed time, a day past Sunday and a fourth hour refused and nothing written; a rest day with Undo and never twice; two an answer, none in the last rounds, twenty a day; the ids a read returned, never a busy block's), `tests/rumi-security.test.ts` (the model gets only the owner's ids; Undo on another owner's answer refused; a tampered action pointing at another owner's note or block changes nothing); `agent-domain` and `agent-database` updated for the new rule and the block id; e2e: Rumi adds a note, it is on Today, and Undo after a reload removes it.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`.

## Next

WI-103 bigger writes as one-press cards (no migration).
