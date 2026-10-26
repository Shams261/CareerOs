# WI-033: Day Print

Date: 2026-10-26. Branch `feat/wi-033-day-print` from `main` `5c7bc12`. This is the first Version 2 Phase 4 hypothesis (`docs/product/v2-plan.md`, section 6): "a generated picture of the day makes closing the day feel rewarding". The owner chose to build Phase 4 now rather than after 14 days of use, so the validation runs from the first closed day. One migration, no AI.

## Outcome

**Where it appears.** A closed day (reviewed, on today or any past day) shows a **Day Print** card on Today, above the agenda.

**The print** is an SVG built from the day's own records (`dayPrint`, `layoutRings` in `src/features/day-print/domain.ts`):

- One ring per recorded session that overlaps the day, clipped to it, in the order the sessions happened.
- Each ring's area follows the minutes, within limits, so short sessions stay visible. The rings touch like links of a chain.
- Colour shows the session's kind through `categoryGroup`: DSA teal, Technical blue-grey, Job search amber, Work green, anything else stone. There is no purple and no second accent.
- The colours are the light tokens as fixed hex values, so a saved print looks like the card.
- Under the rings: the date and "Silsila", as plain text.

**Under the print:**

- A headline: "4h 50m of recorded work.", "Rested." or "A quiet day."
- A fact line: "5 sessions, one ring each, in the order you did them. 1 block let go." Let go is counted from blocks skipped with the reason "Let go" at Close the Day.
- A colour legend.

It is never a score, a streak or a comparison.

**Save the print** draws a 2× PNG from the SVG on the device, with nothing uploaded. It opens the system share sheet where the browser offers one, and downloads `silsila-<date>.png` otherwise.

**The validation question.** Until the owner answers, the card asks "Keep a print like this after each closed day?" with **Keep** and **Remove**. The answer is stored as `User.dayPrint` (null, true or false) and is the hypothesis's result.

- **Remove** hides prints and answers "Day prints are off. Settings can bring them back."
- **Settings → Appearance → Day print** turns prints back on or off.

## Schema

Migration `20261026190000_day_print` adds `User.dayPrint BOOLEAN`, null until the owner chooses. `LATEST_MIGRATION` is bumped, and the export includes it.

## Changes

| Area    | Files                                                                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/features/day-print/{domain,actions}.ts`, `src/features/day-print/{print,save}.tsx`, `prisma/migrations/20261026190000_day_print/`, `tests/day-print.test.ts`, `tests/day-print-migration.test.ts`, `docs/screenshots/wi-033/` |
| Changed | `prisma/schema.prisma`, `src/server/health.ts`, `src/server/export.ts`, `src/app/today/page.tsx`, `src/app/settings/page.tsx`, `src/app/globals.css`, docs                                                                         |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree. `pnpm test:ci`: 65 files, 423 tests; seed run twice                                                                                                                                                                                                                                                                                       |
| Tests                                    | Day Print 3: order, colour, clipping, headlines, rings inside the print and touching. Migration upgrade 1                                                                                                                                                                                                                                                                         |
| Migration                                | Fresh `migrate deploy` and `migrate diff --exit-code` = 0                                                                                                                                                                                                                                                                                                                         |
| Browser, desktop light                   | A past closed day showed its print. Closing 24 October through Close the Day (one block let go, one done) showed "Saturday is closed" with five rings in three colours and "1 block let go.". The SVG-to-PNG conversion produced a 1280 × 600 PNG (about 70 KB). Remove hid the card with its message, and Settings turned prints back on ("Day prints stay."). No console errors |
| Browser, 390                             | The print scaled to 312 px wide, with no overflow                                                                                                                                                                                                                                                                                                                                 |
| Not verified                             | Sharing through the system sheet on a phone, which is part of the later UAT                                                                                                                                                                                                                                                                                                       |

## Owner steps

1. **Before merging**, apply the migration to production from your own terminal (`read -rs` for the Supabase URL, then `pnpm db:deploy`).
2. **After a closed day**, answer Keep or Remove. That answer is the result of the Phase 4 test.
