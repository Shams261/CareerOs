# WI-124 handoff: dead CSS removed

Date: 2026-11-02. Step 1 of the CSS plan in the full audit (`output/Silsila-Full-Audit.pdf`, page 5). No migration, no visible change.

## What changed

- **`src/app/globals.css`: 10,352 → 9,892 lines.**
  - 97 rules went (451 lines), along with 5 comments that described them.
  - Each removed rule named only classes that appear nowhere in `src/` or `public/`. Classes built as `prefix-${…}` or `'prefix-' +` count as used.
  - The 48 class names were leftovers of removed screens: For today picks, the stage stepper, the roadmap outline and workspace, the old progress bar, `check-yourself`, the setup checklist, the first-run picks, `today-cheer`, `today-chip`, `today-goal` and others.
  - The shipped stylesheet is 155.7 KB (it was 163.5 KB).
- **`tests/css-dead.test.ts`** fails when a selector names a class the code no longer uses, so a removed screen must take its styles with it. It failed on the old stylesheet and passes on the new one.

## Proof that nothing moved

A lab script read `getComputedStyle` for every element, with `::before`/`::after` content, on 36 page views. That is 18 pages at 1440 and 390 px, light theme, reduced motion: Today, Plan, Roadmap and a week, Practice, a problem and the drill, Jobs and an application, all four Weekly review steps, Look Back, Settings, Rumi, `/privacy` and `/learn`.

Two runs of the old build differed only in the document head (script order, the route announcer, meta tags), and those were excluded. The old and new builds then showed **0 differences** across about 7,000 elements.

Modals and panels were not opened; their classes are in code and so were never candidates.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (149 files, 838 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.

## Next in the CSS plan

1. Regroup `globals.css` by component (selectors unchanged), guarded by the same computed-style comparison, which also has to cover the order rules win in.
2. Then CSS Modules feature by feature: the audit's recommendation, and the owner's choice between that and Tailwind.
