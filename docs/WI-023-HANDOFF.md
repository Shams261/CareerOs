# WI-023 — Roadmap: continue and revise

Date: 2026-10-23. Branch `feat/wi-023-roadmap-continue` from `main` `0206e0d` (WI-022). Third of the four work items that make Plan, Jobs, Roadmap and the Weekly review read like Today (ADR-019, ADR-020). The owner's decision for this page: counts stay as records, progress bars, ratios and pace estimates go.

## Outcome

- **Overview (`/roadmap`).** One header line: "Roadmap", "Goals" (or "Edit goal") as a quiet utility, and **Continue · {next item} →** as the page's one primary, pointing at the first live roadmap with something left (RO-3). One record line per active goal ("Offer from a product company · 8 weeks left · 41 of 716 items done · 6h 10m this week"; `goalLine`, no pace estimate, `formatDuration` instead of the local hours helper, RO-6). Then the workspace: on the left "Roadmaps" with "New roadmap" as a link in the heading (primary and open only when none exist; the `N` shortcut and the draft stay) and one row per live roadmap in Today's recipe: route tile, the roadmap's name as the label, the item to continue as the title, "Continue · {section}" as the context, "41 done · 263 left" and "3 due" on the right, a chevron; the row is the link to that item. Roadmaps show whether or not a goal exists (RO-1); the first-goal card still comes first when there is no goal. On the right, **Due for revision**: the same rows Today shows ("Revisit HTTP semantics · Revision overdue by 3 days · Backend engineering"), five in the rail, the rest in a panel. Goal authoring lives in one **Goals** panel (each active goal's form, Add goal with its draft, other goals with named Edit buttons) instead of three stacked disclosures. No progress bars anywhere on the page (RO-5); "Up next" is gone since every row already says where to continue (RO-9).
- **Detail (`/roadmap/[id]`).** "Add items" is secondary; **Done** on the open item is the only primary, and "Copy prompt" is secondary (ENHANCEMENTS §F). The status line reads "123 done · 181 left · 4 asked in interviews · 3 due for revision · Continue: …" without the weeks-at-pace estimate; the section heading reads "{section} · 12 done · 53 left"; the section nav lists "N left" (or "Done") and "N due" without bars. Row pills use Today's phrasing: "Revision due today", "Revision overdue by 2 days", and "Revision due Oct 28" in the meta; every row ends with a chevron that turns when the row is open. "Edit roadmap" and an item's "Edit" open side panels (one per item, rendered only while open) instead of inline forms. `SectionNav`, the filters, the hidden-done hint, keyboard j/k/d/c/Esc, quick Done/Revised and the sticky action bar are unchanged.

## Changes

| Area    | Files                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Changed | `src/app/roadmap/page.tsx` (rewritten), `src/app/roadmap/[id]/page.tsx`, `src/features/roadmap/{domain.ts,item-list.tsx,section-nav.tsx,study-prompt.tsx}`, `src/app/globals.css`, `tests/roadmap-domain.test.ts` (`goalLine`, `continueTarget`), docs |

No migrations, no new dependencies, no route changes. The overview adds one memoised query (`revisionDue`, shared with Today, dropped by every write); the detail page's queries are unchanged. `ProgressBar` (`src/components/progress-bar.tsx`) has no consumer left and can go in a later clean-up.

## Verification

| Check                                           | Result                                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`, `typecheck`, `build`, `docs:check` | Pass on a clean export of the branch                                                                                                                                           |
| `pnpm test:ci` (disposable database)            | All files pass; `tests/roadmap-domain.test.ts` adds two cases                                                                                                                  |
| `/roadmap` at 1440                              | Screenshot 01: Continue as the primary, record lines, five roadmap rows with "done · left · due", Due for revision rail; no console errors, no overflow                        |
| `/roadmap/[id]` at 1440                         | Screenshots 02 and 03: secondary Add items, status line without a pace, section nav without bars, "Revision overdue by N days" pill, Edit roadmap and an item's Edit in panels |
| 390                                             | Screenshot 04: rail first, then the rows without the counts column                                                                                                             |

## Limitations and follow-ups

- The dev database's five seed goals produce a long summary line; with one or two goals it is one line.
- Next: WI-024 (Weekly review), which also removes the `clock` alias.
