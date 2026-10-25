# WI-030: Which Pattern? and Watch It Run

Date: 2026-10-25. Branch `feat/wi-030-drills` from `main` `43d580a` (WI-029). This is Phase 2 of the Version 2 plan (`docs/product/v2-plan.md`, section 5): practice without AI. No schema change, no writes, no AI.

## Outcome

### Which Pattern?

The drill lives at `/dsa/drill`, reached from **Which pattern?** in the Practice header once there are four problems.

**The deck.** `drillDeck` in `src/features/drills/deck.ts` builds ten cards by code from the owner's own Practice problems:

- Order: practised and still Red, then Yellow, then never attempted, then the oldest seen.
- Ties follow a seed for the day, so a refresh shows the same deck.
- Each card shows the problem title and difficulty.

**The options.** Each card has four:

- The problem's own topic.
- Three distractors, from the same pattern family first (for example Two Pointers against Sliding Window, Stack and Binary Search).
- The families come from the curriculum's pattern list. Distractors are curriculum patterns or topics holding the owner's problems, never an empty look-alike topic.

**Picking.** Keys 1–4 or a click pick. The reveal marks the pattern, says "Yes" or "Not quite", shows the topic's one-line signal (the imported `DsaTopic.description`) and offers **Open the problem**. Focus moves to Next card.

**The end.** It reads "7 of 10" and lists the pairs mixed up, merged in either direction ("Binary Search ↔ Two Pointers"). Drill again or go back to Practice.

**Rules.**

- Nothing is saved, and no attempt is recorded.
- It reuses the memoized Practice snapshot, so it adds no queries.
- With fewer than four problems or topics the page says "Add a few problems to Practice to drill patterns".

### Watch It Run

A problem whose topic is Two Pointers, Sliding Window & Prefix Sum, Binary Search or Stack & Monotonic Stack shows a **Watch it run** card below the attempt form (`traceForTopic`).

**The tracers.** Silsila's own code traces the pattern on a fixed sample, in `src/features/drills/trace.ts`:

| Pattern         | Problem traced                     |
| --------------- | ---------------------------------- |
| Two pointers    | Container With Most Water          |
| Sliding window  | Longest run with no repeat         |
| Binary search   | First position at least the target |
| Monotonic stack | Next greater number                |

**On screen.** Each step marks the cells, the window or range and the stack, shows the facts so far, and narrates from a template. An example: "Width 8 × shorter height 1 = 8, the best so far. Move the shorter side (left) inward: only a taller line can do better."

**Controls.**

- Back and Step, plus the arrow keys while the trace has focus.
- Play advances every 1.4 s and can be paused. Under reduced motion, Play is not offered and the cells do not animate.
- **Your numbers** accepts up to twelve whole numbers from −99 to 99, and binary search sorts them and takes a target. Errors are inline ("Heights cannot be negative."). Back to the sample resets.

## Changes

| Area    | Files                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New     | `src/features/drills/{deck,trace}.ts`, `src/features/drills/{which-pattern,watch-it-run}.tsx`, `src/app/dsa/drill/page.tsx`, `tests/drills-deck.test.ts`, `tests/drills-trace.test.ts`, `docs/screenshots/wi-030/` |
| Changed | `src/app/dsa/page.tsx` (Which pattern? link), `src/app/dsa/[id]/page.tsx` (Watch it run), `src/app/globals.css`, docs                                                                                              |

## Differences from the plan

- **No optional timer.** The plan made it optional; the drill is untimed.
- **Sliding window input.** It traces numbers ("the longest run with no repeat") instead of characters, so the owner's input stays the same ≤12 numbers for every tracer.
- **Reduced motion** removes Play as well as the animation, rather than playing without animation.

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree                                                                                                                                                                                                                              |
| `pnpm test:ci` (disposable database)     | 56 files, 384 tests pass. The deck: 7. The tracers: 7, including each tracer against a brute force on 200 seeded random inputs                                                                                                                                      |
| Browser, drill (desktop, light)          | Ten cards from the dev Practice list. Key 1 picked, and the wrong pick and the pattern were marked with the signal. Focus went to Next card. The result showed the count and merged mix-ups                                                                         |
| Browser, Watch It Run                    | Two pointers stepped to 49, the brute-force answer. Arrow keys stepped one at a time and stopped at the end. Bad input showed the inline message. Own numbers re-traced. Play advanced and paused. The monotonic stack and binary search traces were checked at 390 |
| Browser, 390 light and dark              | No horizontal overflow, controls 44 px. A fresh tab had no console errors (the one error seen came from hot reload after editing an effect)                                                                                                                         |
| Not verified in a browser                | Reduced motion. The pane cannot emulate it. The code hides Play and the animation class when `prefers-reduced-motion: reduce` matches                                                                                                                               |

Screenshots: `docs/screenshots/wi-030/`.

## Owner steps

None: no migration and no settings. Practice shows **Which pattern?** once there are four problems.
