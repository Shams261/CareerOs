# WI-107 handoff: the week draft

Date: 2026-11-01. The third slice of Rumi 3 (`docs/product/rumi2-plan.md`, E3). No migration.

## What changed

- **Where**: Weekly review → step Next week, under Prepare next week. When the card is about the real next week (`nextWeek(today)`), it shows "Draft next week with Rumi" once all seven days are prepared from the routines (`generatedDays === 7`), else a line asking to prepare first. The draft never generates days: Prepare next week places the routines, so they count as taken time and `applyProposal`'s generation of the day is a no-op.
- **The call** (`draftWeek`, `src/features/agent/draft.ts`): refuses until the seven days are prepared and after `DRAFTS_PER_DAY` (3) drafts in 24 hours; then one `callModel` (`AGENT_CHAT`, 2,500 tokens) with the persona and style, the goal, each day with its weekday and taken time (`takenOn`: study and job titles, the rest "busy"), next week's interviews (company, type, day, time), `WEEKLY_MIX`, the patterns, the study kinds and "Rumi knows", and a single tool, `propose_blocks`, with up to `DRAFT_BLOCKS` (8) blocks. Each call is read with a strict schema; the first call per day of next week becomes a card through `proposeBlocks(user, args, now, { window: next week })`, which checks every block against the day; other days and repeats are dropped. No card means nothing is stored and the owner reads a plain line.
- **The answer**: a new conversation "Next week · Nov 2" with one assistant message: the model's two sentences, how to use the cards, and the cards (`metadata.proposals`, `draft: true`). The owner adds each day with Add to plan; Undo takes a day back (`cancel-blocks`).
- **Every plan card** (`ProposalCard`) now offers Change time on each block and "+ Add a block" (title, kind, start, end; four at most) before Add to plan. `applyProposalAction` reads the changes as JSON fields with strict schemas, and `applyProposal(…, skip, { edits, extra })` applies the changed times and the added blocks to the same all-or-none check under the owner lock.
- The fake OpenRouter answers the draft with two evening DSA blocks.

## Tests

`tests/agent-draft.test.ts` (next week's dates; no call before the week is prepared; one card a day from one call with only the draft tool, the taken time sent, a clash shown as left out, repeats and days outside next week dropped, nothing added; Add to plan with a changed time and an added block; a changed time onto taken time refused); e2e: Prepare next week, Draft next week with Rumi, a day added and undone.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`.

## Next

WI-108 the debrief and the mock interview.
