# WI-137 handoff: Tailwind for new UI

Date: 2026-11-02. After WI-135 and WI-136, the owner asked why Silsila does not use Tailwind like most of the industry. They first chose to convert the whole app. Then, asked to weigh it, they agreed to the smaller course:

- new UI is written in Tailwind;
- a page moves to Tailwind when it is next worked on;
- there is no separate rewrite.

This work item lays that foundation. No migration and nothing painted changes.

## The problem it fixes

`globals.css` was one unlayered stylesheet after `@import 'tailwindcss'`. Tailwind's utilities live in `@layer utilities`, and any unlayered rule beats any layered one. So a utility silently lost to every hand-written rule that set the same property on the same element.

Two examples:

- **Jobs facts line.** It carried `mb-6`, but `.jobs-facts { margin: 0 }` won, so the page was approved with no gap.
- **Block form's `.actions`.** It carried `mt-3`, but `.actions { margin-top: 13px }` won.

New Tailwind work would have hit this on every element.

## What changed

- **`src/app/app.css`** is the old `globals.css` without its two imports, now 9,398 lines. Git shows it as a new file because `globals.css` stays; for a rule's history before WI-137, run `git log -- src/app/globals.css`.
  - **`src/app/globals.css`** is the new entry: Tailwind, then `design-tokens.css` unlayered (the values everything reads), then `@import './app.css' layer(components)`.
  - Utilities now always win over the hand-written rules.
- **Theme.**
  - `@theme inline` names Silsila's colours as their runtime variables: `canvas`, `surface`, `surface-2`, `subtle`, `elevated`, `ink`, `ink-2`, `meta`, `on-brand`, `border`, `divider`, `border-strong`, `primary` with `-hover`/`-active`/`-soft`, `focus`, and `success`, `warning`, `danger`, `info` with `-soft`/`-text`. So `bg-canvas` is `var(--background)`, and dark mode needs no `dark:` class.
  - `--color-*: initial` removes Tailwind's palette, so `bg-red-500` builds nothing.
  - `@theme reference` adds `font-ui`, `font-display` and `rounded-pill` without emitting values.
  - Tailwind's `rounded-sm`/`-md`/`-lg`/`-xl` and `shadow-sm`/`-md` already read `--radius-*`/`--shadow-*`, which the tokens override.
  - `--ease-silsila` is the motion easing.
- **Variants.**
  - `phone:` is `@media (max-width: 700px)`, `app.css`'s one breakpoint.
  - `dark:` follows `html.dark` (the owner's Settings choice), never the system.
- **Four rules removed so utilities and app classes never share a name:**
  - the duplicate `.sr-only` (Tailwind's is the one; it hides with `clip-path` instead of the old `clip`);
  - `.mr-2` (identical to Tailwind's);
  - `.skeleton-line.w-40`/`.w-60` (the loading lines now use `w-2/5`/`w-3/5`, the same 40 % and 60 %);
  - the dead `.block` rules (no element has that class; the dead-CSS test counted the word "block" anywhere).
- **Two utilities that never applied removed:** `mb-6` on Jobs' facts line and `mt-3` on the block form's `.actions`. The page looks as it did.
- **The first-run cards** (`src/features/today/first-run.tsx`) are the first part written in Tailwind; `first-run.module.css` is gone.
  - It covers token colours, `rounded-md`, a dashed `border-border`, an arbitrary grid template, and `cn()` for the done step instead of an `.is-done` descendant rule.
  - `rounded-[50%]` keeps the icon's computed radius; `rounded-full` would compute differently.
- **`tests/tailwind.test.ts`** compiles the real entry with Tailwind's own `compile()`. It checks:
  - the import order;
  - that no class in `app.css` is also a utility (checked by putting `.mr-2` back: it fails);
  - Silsila colours present and the default palette absent;
  - the `phone:` breakpoint.
    `tests/css-dead.test.ts` now reads `app.css`.
- **CLAUDE.md** has the new styles rule, and **brand-system.md** the class names for each role. The three remaining CSS Modules (Roadmap overview, Today's band, quick fields) stay unlayered; the rule is to move them when touched and not to mix utilities into them.

## Proof

Computed styles of every element, at 1440 and 390 px, before and after. Elements are keyed by DOM path, and body-level portals by tag and classes. Custom properties are left out, since Tailwind adds `--tw-*` and `--font-weight-semibold` variables that never paint. The old build compared clean against itself first.

- **With data (the e2e workspace):** the 18 pages of the app plus Today with Add a block and More open. **0 painted differences**, apart from `clip` on the `sr-only` elements (now `clip-path`) and one visually hidden `sr-only` label on Rumi taking Tailwind's `margin: -1px`.
- **A new account:** Today's first run, Plan my first focus open, and Settings. **0 painted differences.**

Before the two dead utilities and the duplicate rules were removed, the same comparison found exactly those: Jobs' facts line gaining 24 px, and the block form's 1 px.

## For the next person

- **Writing new UI:**
  - Use utilities with the theme names; write `cn()` for conditions.
  - Use `phone:` rather than `max-[700px]:`.
  - Use arbitrary values (`text-[15px]`, `p-[18px]`) where the design's pixel sizes have no scale step.
  - Never a hex colour.
- **Moving a page:**
  - Replace its class names with utilities.
  - Delete the rules from `app.css` (the dead-CSS test catches a forgotten one).
  - Compare snapshots: the scratchpad's `snap2.ts` (with `path>>Button` clicks) and `diff_paint.py`.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database, build, `test:e2e` and `test:e2e:safari`, docs:check, `git diff --check`. Results at merge.
