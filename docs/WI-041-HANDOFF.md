# WI-041: Rumi plans

Date: 2026-10-27. Branch `feat/wi-041-rumi-plans` from `main` `6fadde0` (WI-040 and the study kinds fix). This is the sixth item of the Rumi plan (`docs/product/rumi-plan.md`), under ADR-024: writes only by the owner's confirmation, re-checked under the owner lock, with Undo. No migration.

## Outcome

**A plan as a card.** Asked "kal ka plan bana do" (or anything like it, also from ⌘K → Ask Rumi), Rumi reads the day and the owner's patterns and calls `propose_blocks`.

- The card shows one day, from today to this Sunday.
- Each block has its time, kind and a reason from the records, such as "Technical: 0 min in the last 7 days".
- A block that does not fit says why and is struck through: "Won't be added: Overlaps 18:00–19:00 busy", "That time has passed", "It ends before it starts". It is never written.
- **Add N blocks to plan** writes the rest; **Dismiss** closes the card. Nothing is written until the owner presses.

**Add to plan** (`applyProposal` in `src/features/agent/plans.ts`):

1. Loads the answer by id and owner.
2. Generates that day's routine blocks first, so they count as taken.
3. Re-checks every block against the day as it is now, under the owner lock.
4. Writes them all through `saveBlockIn` (blocks added for the day) or none: "Your day changed since Rumi proposed this … Nothing was added."
5. Clears the snapshot cache and syncs Google Calendar in the background.
6. Offers **Undo** (`cancel-blocks`), which cancels the blocks and shows the card again.

**Limits:** six blocks a proposal, two proposals and one suggestion an answer. Days after Sunday are refused; Rumi points to Prepare next week in Weekly review. Conflicts name other blocks only by time, and outside study and job search as "busy".

**"Rumi knows" suggestions.** When the owner states a lasting preference, Rumi may call `suggest_memory`. The card offers **Keep in Rumi knows** or Dismiss; a line already kept is not added twice; 20 lines at most.

**Patterns.** A new read tool, `get_patterns`, gives the three-hour window with the most recorded study and the recorded share of planned time per kind over 28 days (pure `patterns` in `src/features/agent/plan-domain.ts`; too little data says nothing). Rumi uses it for realistic times and lengths. Weekly review shows the same as one line under the week chart: "Last 4 weeks: Most recorded study 15:00–18:00 · Technical about 85% of planned · …".

**Measure.** Each card is stored in the answer's `metadata` with its status (`shown`, `applied`, `dismissed`, or `kept`), and an applied plan keeps its block ids, so proposals shown versus applied, and Rumi's blocks later recorded, can be counted from the records.

## Differences from the plan

- **Smart rescheduling in Close the Day and the block-start nudge** ("Move to 20:30" from free time and best hours) is not in this item. Rumi's own proposals already avoid taken time and use the patterns; changing Close the Day's Tomorrow slot is a separate, smaller change for later.
- **The quick add in ⌘K** is Ask Rumi: typed words go to Rumi, which answers with the same card.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New     | `src/features/agent/{plan-domain,plans}.ts`, `src/features/agent/cards.tsx`, `tests/agent-plans.test.ts`, `docs/screenshots/wi-041/`                                                                                                                                                                                                                                     |
| Changed | `src/features/agent/{domain,service,actions,tools}.ts`, `src/features/agent/chat.tsx`, `src/app/rumi/page.tsx`, `src/features/undo/service.ts` (`cancel-blocks`), `src/app/review/page.tsx`, `src/app/privacy/page.tsx`, `src/app/globals.css`, `tests/agent-{domain,database}.test.ts`, `tests/support/fake-openrouter-server.ts`, `docs/engineering/security.md`, docs |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tests                                    | **Pure 6:** the plan window ends on Sunday; kinds keep the owner's spelling; proposals with 7 blocks, bad times, extra fields or a word for a date are refused; passed, inverted and overlapping blocks say why; stored cards read safely; patterns find the best window and shares, and say nothing on little data. **Database 6:** a proposal names the not-yet-generated gym routine only as busy and writes nothing; Add to plan writes the clear block once as added for the day, refuses another owner and a second press, and Undo cancels and reopens; a day changed since the proposal adds nothing; days after Sunday are refused with Prepare next week; a suggestion is kept only on Keep; patterns read study sessions only |
| Browser, desktop (fake OpenRouter)       | "kal ka plan bana do" showed a card for Tue, Oct 27 with two blocks and their reasons. Add 2 blocks to plan added both (seen on Plan) and showed "Added 2 blocks to Tue, Oct 27." with Undo. Asking again showed both struck through as overlapping, with only Dismiss. "yaad rakhna, Saturday mera rest day hai" showed a Keep card; Keep marked it kept without a second copy of an existing line. After a reload the three cards kept their states. Weekly review showed the patterns line. axe found two cards sharing a landmark name; the cards are now groups, and axe was clean                                                                                                                                                  |
| Browser, 375                             | The plan card stacks time over title, no horizontal overflow, axe clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Screenshots: `docs/screenshots/wi-041/`.

## Owner steps

1. No migration. After the deploy, ask Rumi to plan tomorrow, check the reasons, and press Add to plan only for a plan you want. Undo is there for 8 seconds; after that, cancel a block from Today.
2. Rate a few plans for the measure: shown versus applied, and whether you recorded Rumi's blocks.
