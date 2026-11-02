# WI-135 handoff: the first CSS Module

Date: 2026-11-02. The owner chose CSS Modules for the CSS plan of the full audit (`output/Silsila-Full-Audit.pdf`, page 5), asking for best practice. Tailwind would rewrite every class name; CSS Modules keep the hand-written, token-based styles and scope them. This is the first slice. No migration and no visible change.

## What changed

- **`src/features/roadmap/overview.module.css`** (190 lines) holds the Roadmap overview's goal card (`goal-hero*`, `goal-pose`, `goal-row`) and roadmap bands (`band-section*`).
  - That is 36 rules, in their original order, with the phone `@media` rules kept.
  - Their own classes are local. Every other class in a selector is `:global(...)`, for example `.goal-row > :global(.disclosure)` and `.band-section:global(.is-current)`.
  - A rule that mixed families (`.roadmap-band-counts .is-due, .band-section-count .is-due`) was split.
- **`src/app/roadmap/page.tsx`** and **`src/features/roadmap/bands.tsx`** read `styles['goal-hero']` and the like; the class names kept their spelling.
- **7 dead rules removed:** `goal-line`, `goal-card`, `goal-summary`, `goal-more`, `goal-pace`, `goal-upnext`, `goal-upnext-list`. The dead-CSS test (WI-124) had counted them alive because the code builds `goal-${id}` strings, which match their prefix.
- **`globals.css`** is now 9,671 lines (9,892 before).
- **CLAUDE.md** states the rule: a feature's own styles go in a co-located CSS Module; `globals.css` keeps the reset, the shell and the shared components. Tailwind leaves in its own work item.

## Proof

Computed styles of every element were taken on `/roadmap` at 1440 and 390 px, before and after. Elements were keyed by DOM path, since module class names are hashed. The page was checked in two states: without a goal (the goal form in the card), and with two goals (the hero, "also", the Goals panel's `goal-row`s). Result: **0 style differences** in both states. Today, Settings, Jobs and the review render as before; their classes were not touched.

## How to do the next slice

`scratchpad wi124/to_module.py <module.css> '<family regex>' [--dead …] --header '…'` moves every rule whose selector names a class of the family. It keeps order and `@media`, wraps the other classes in `:global()`, and splits mixed selector lists. Then:

1. Point the TSX at `styles[...]`.
2. Compare old and new builds with `snap.ts` and `diff_path.py` (keyed by path).

Good next families, each used by one component: `daily-*` (Today's band), `listen-*`, `first-*` (first run), `quick-*`. Then the big ones: Rumi, the agenda, Focus.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database, build, `test:e2e` and `test:e2e:safari`, docs:check, `git diff --check`. Results at merge.
