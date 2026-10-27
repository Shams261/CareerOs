# WI-053 handoff — study aids grouped

Date: 2026-10-28. Branch `feat/wi-053-study-aids` from `main` `01006c6` (WI-052). This is the first P2 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, section 6: "Four aids is one too many for a first-time user. Put Copy prompt first, group Grill me and Listen under 'Check yourself', and show a one-line hint the first time an item opens"). No migration, no data change.

## What changed

The open roadmap item (`src/features/roadmap/item-list.tsx`) now reads in this order:

1. Done when, scope, references and links, as before.
2. **Study** (`section.study-aids`, named by its eyebrow), with three parts in order:
   - the first-time hint, described below;
   - the Copy prompt with its scenario and the "My doubt or extra link" field;
   - **Check yourself** (`role="group"`), holding Grill me and Listen. It shows only where AI is on and the item allows them, as before.
3. Kept cards, then My note.
4. The action row, now with only the marks: Done (or Revised), Start or Reopen, Asked in interview, Edit and Remove. Problem items show Record an attempt, as in WI-046.

**The first-time hint (`StudyHint`):**

- It reads: "Copy the prompt into Claude or ChatGPT, study there, then come back and mark it."
- **Got it** stores `silsila-study-hint-seen` in localStorage, a per-device convenience. The hint stays away on that device, and every open item hears about it.
- The server renders nothing for it, so a returning owner never sees it flash.
- If storage fails, the hint simply stays.

The `data-grill-open` and `data-listen-open` openers moved with the buttons, so the G shortcut and ⌘K's Grill me still find them.

CSS: `.study-aids`, `.study-hint`, `.check-yourself`.

## Checks

- **Local, 1440 px.** An item on System design shows Study, the hint, Copy prompt, then "Check yourself: Grill me · Listen", then the marks. Got it removed the hint and stored the key, and Grill me opened its panel ("Grill me · Networking Essentials").
- **Local, 375 px.** The buttons wrap and nothing overflows.
- **The e2e suite.** Its roadmap journey opens an item with the hint showing and checks it with axe.

## Gate

Lint, typecheck and docs check (91 files) pass on an export of the working tree; `pnpm build`; `pnpm test:ci`: 97 files, 554 tests; `pnpm test:e2e`: 7 passed; `git diff --check` clean.
