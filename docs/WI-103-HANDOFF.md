# WI-103 handoff: Rumi's bigger changes as one-press cards

Date: 2026-11-01. The fourth code slice of the Rumi 2 and 3 plan (`docs/product/rumi2-plan.md`, ADR-030 class B). No migration.

## What changed

- **Five card tools** (`TOOLS` in `src/features/agent/domain.ts`, strict arguments in `request-domain.ts`): `move_block({ blockId, day, start, end })`, `delete_block({ blockId })`, `change_stage({ applicationId, stage })`, `log_attempt({ problemId, confidence, solved, minutes? })` with confidence as shaky / okay / solid and solved as yes / partial / no, and `write_review({ day, notes, blocker?, carryForward?, rating? })`. `fn` takes the required fields, so `minutes` and the review's extras are optional. The prompt says each makes a card that only the owner's press applies ("here is a card", never that it is done), at most `REQUESTS_PER_ANSWER` = 2 an answer, and records named only by ids from the conversation's reads.
- **Making a card** (`prepareRequest`, `src/features/agent/requests.ts`): the loop refuses an id the conversation never read (`unseenId` over `REQUEST_ID_ARGS`), then reads the target for the owner. A move needs a visible (study or job), planned block with no recorded time and no interview round, a day from today to Sunday and a free slot (`checkBlocks` against `takenOn`, the block's own slot left out); a delete a visible block without a running session; a stage a different stage; an attempt an outcome Practice accepts (`attemptFits`) on a visible problem; a review a day up to today with no review yet. A refusal goes back to the model and no card is made. A card keeps `{ id, kind, args, summary, snapshot, status }` in `metadata.requests`; the snapshot is the block's `updatedAt` and slot, the application's stage, and a request id per press for a stage or an attempt.
- **Applying it** (`applyRequestAction` → `applyRequest`): one owner lock loads the owner's answer, refuses a card already applied or dismissed, checks the target against the snapshot ("Your records changed since Rumi made this card. Nothing was changed"), and applies through the pages' writers inside the same transaction: `saveBlockIn` with the version (the day generated first), the new `deleteBlockIn` (`deletes/service.ts`), `changeStageIn` (`jobs/service.ts`) and `recordAttemptIn` (`dsa/service.ts`), and `recordReview` with the owner's edited fields (`reviewFields`), never the draft unseen. The card is marked applied with its undo in the same transaction, so a double press applies once.
- **Undo** (`undo-request` → `undoRequest`): runs the undo stored on the owner's answer, only the kind its card leaves (`REQUEST_UNDO`: `restore-block-slot` (new: back to the old slot when the block has not changed since), `restore-block`, `restore-stage`, `unreview-day` (new: removes the review the card saved and the day's reviewed mark)); an attempt has none. The card then reads as open again, with its snapshot refreshed to the records after the Undo.
- **The page** (`RequestCard` in `cards.tsx`): the card's lines, Apply (`Move block`, `Delete block`, `Change stage`, `Record attempt`, `Save review`) and Dismiss; the review card holds its fields prefilled with the draft; after a press the answer shows the result with Undo, and after a reload the card keeps an Undo. `cardViews` gives the page each card without its stored undo.
- The fake OpenRouter answers "move …" with `get_today` and then a `move_block` card for the block the question names. `/privacy` says what the cards change.

## Tests

`tests/agent-cards.test.ts` (Practice's attempt rule, stored cards read only with their own undo and never shown with it; a move applied once and undone, then applied again; an unread id, a clash and a busy block refused, nothing applied after a change, Dismiss; a delete with its recorded time and Undo; a stage once, refused after Jobs moved it, undone; an attempt once with no Undo and a mismatched outcome refused; a review from the owner's fields, undone, and never over a review written meanwhile), `tests/rumi-security.test.ts` (a press or an Undo on another owner's answer; a card on the owner's answer pointing at another owner's block), `agent-plans` and `agent-database` updated for the new tools and fields; e2e: a move card applied and undone.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`.

## Next

R6, the voice spike (no product code), then WI-104 voice.
