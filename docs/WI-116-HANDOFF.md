# WI-116 handoff: Rumi plans the next seven days

Date: 2026-11-01. From the Rumi audit, the owner's use case: on a Sunday, "plan tomorrow" was refused because plan cards stopped at this Sunday, and Rumi asked how long the owner had instead of planning. ADR-031. No migration.

## What changed

- **Seven days** (`planAhead` in `src/features/agent/plan-domain.ts`): a plan card (`propose_blocks`) may cover today and the six days after it. What Rumi changes itself (`add_block`, rest today) and the move card keep `planWindow` (today to this Sunday).
- **A card for next week** (`preparesWeek`, `Proposal.prepares`): when the day is after this Sunday and its week is not planned yet, the card is checked against the routines that week would get (`routinesOn` in `plans.ts`, named only as far as Rumi may see them), says "Next week is not prepared yet: this first adds your routines for the week of …", and its button reads "Prepare the week and add N blocks". The press prepares the whole week from the routines (each day idempotent, as Prepare next week does), re-checks under the same owner lock, then adds the blocks. The model's tool result says so too.
- **Plan first, ask later:** the prompt asks Rumi to read the day and propose a card at once with realistic lengths (45 to 60 minutes) in the free time that fits, and to ask how long the owner has only when no free time is left; it no longer sends the owner to Weekly review for next week.
- **Docs:** ADR-031; CLAUDE.md's generation invariant names the card's press beside Prepare next week.

## Tests

`tests/agent-plans.test.ts`: the seven-day window and when a card prepares a week (pure); a card for next Monday sees that day's routine as busy, plans nothing before the press, and the press prepares all seven days and adds the block; a day more than six ahead is refused. `e2e/journeys.spec.ts`: the plan journey accepts either button, so on a Sunday it walks the prepare path.

Browser-checked in the lab with next week cleared: the card shows the prepare line and button, axe is clean, and the press prepared the seven days.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database (809), build, `test:e2e` and Safari (15 each), docs:check, `git diff --check`.

## Next

From the audit: Rumi knows the page it is opened on, prompts by page, new cards (roadmap item, application, round, goal), streamed answers, and a Sunday-evening "Plan next week with Rumi".
