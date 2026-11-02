# WI-133 handoff: three browser journeys

Date: 2026-11-02. From the full audit's test gaps (`output/Silsila-Full-Audit.pdf`, page 4: "e2e never visits Plan, Close the Day or ⌘K"). Tests only: no product code, no migration.

## What changed

`e2e/journeys.spec.ts` gains three journeys. They run after the existing fifteen, in the same serial workspace, so they use the routine and the done block those journeys made. Each runs axe (WCAG 2.2 AA).

1. **Plan shows the week, its routines and the weeks around it.**
   - `/calendar`: the Plan heading and the week's list holding today's block.
   - The Routines panel lists Morning DSA, and Escape closes it.
   - Next week no longer shows the block; Previous week shows it again.
   - Plan fits a phone.
2. **A past day closes with each block left decided.**
   - Yesterday (the owner's day in America/Toronto) gets a block nobody recorded.
   - Close the day opens with What happened. A note is written, and the block's "Let go" is chosen and applied.
   - The row then reads as let go, and Close the day is gone from the head.
3. **⌘K opens a place and adds a note.**
   - ⌘K / Ctrl K opens the command bar. "plan" offers Go to · Plan, which opens `/calendar`.
   - Typed words become "Add a note · …", the bar answers "Saved to Today.", and the note shows in Today's Notes panel (from the More menu).

The file now has 18 journeys (19 tests with sign-in).

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (149 files, 839 tests), build (product code unchanged since WI-132), `test:e2e` and `test:e2e:safari` (19 each), docs:check, `git diff --check`.
