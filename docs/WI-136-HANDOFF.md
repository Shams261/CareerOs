# WI-136 handoff: three more CSS Modules

Date: 2026-11-02. This is the second CSS Modules slice after WI-135, following the owner's choice of CSS Modules over Tailwind. Three small families, each used by one component, moved out of `globals.css`. No migration and no visible change.

## What changed

- **`src/features/today/daily-line.module.css`** holds Today's band (`daily-band`, `daily-eyebrow`, `daily-clock`, `daily-greeting`, `daily-quote`, `daily-by`, `daily-another`), read by `daily-line-card.tsx`.
  - The part-of-day tints (`[data-part]`) and the phone sizes came along.
  - `:global(.home-head) .daily-band` keeps the first-run spacing.
  - The rule hiding the title row's date while the band shows (`.today-head[data-band='on'] .today-date`) stays in `globals.css`, because it names no band class.
- **`src/features/today/first-run.module.css`** holds Today's empty-account cards (`first-day-*`, `first-steps-*`, `first-step-*`), read by `first-run.tsx`. `li:global(.is-done)` keeps the done step's look.
- **`src/features/schedule/quick-fields.module.css`** holds Add a block's short form (`quick-kinds`, `quick-length`, `quick-when`, `quick-ends`, `quick-note-line`, `quick-note-toggle`), read by `quick-fields.tsx`. `:global(.template-chips)` and `:global(.block-form)` stay global.
- **`globals.css`** is 9,434 lines (9,671 before). 44 rules moved.
- **Keyframes.** A CSS Module renames every animation name it sees, so `animation: rise-in …` pointed at a keyframes that does not exist and the quotation's rise-in stopped. The first build showed `daily-line_rise-in__…` in the CSS.
  - The module now says `animation: global(rise-in) …`. This is the `global()` function Next's CSS Modules loader understands; the built CSS reads `animation:rise-in`.
  - **`tests/css-modules.test.ts`** fails for any module animation that names neither `global(…)` nor its own `@keyframes`. Checked by putting the bug back: it fails, and passes again once fixed.
  - It also fails for a module class that no file importing the module reads as `styles['…']`.
- **CLAUDE.md** states the keyframes rule beside the styles rule.

## Proof

Computed styles of every element were taken before and after, at 1440 and 390 px. Elements are keyed by DOM path, and a body-level portal by its tag and classes, since its index moves between runs. Two runs of the old build compared clean first. Two states:

- **A new account:** `/today` with the first-run cards and the band, `/today` with Plan my first focus open (the quick form in the modal), and `/settings`.
- **A day with one block:** `/today`, Add a block open, its "+ Add a note" and its end "change", `/calendar` and `/roadmap`.

Result: **0 style differences** in both states. Only the clock and "Starts in N min" text changed.

## Left for later

- **Listen** (`listen-*`): its player and lines show only after a generated script, which needs a roadmap item with references and the fake model. It goes with the Rumi slice, which needs the same lab setup.
- **Unstyled class names left in the TSX:** `first-day`, `first-steps`, `quick-start` and `quick-end` have no rules. Harmless; they can go when their component is next touched.
- **The scratchpad tool** `to_module.py` now wraps animation names in `global()` by itself.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database, build, `test:e2e` and `test:e2e:safari`, docs:check, `git diff --check`. Results at merge.
