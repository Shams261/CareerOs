# WI-146 handoff: the ⋯ menu on a phone

Date: 2026-11-03. The owner sent two screenshots from Chrome on Android of an open roadmap item. On a phone, the item's ⋯ button wraps to the start of its row, and its menu opened off the left edge of the screen as an empty, cut-off box. On the desktop view it opened correctly. No migration.

This is the owner's "Roadmap dots" issue from the WI-145 prompt. WI-145 took "dots" to mean the item status markers, found those correct, and reported it as not reproduced. The audit now says so (UI-4).

## Root cause

`src/components/more-menu.tsx` opens its list with `right: 0` (`.more-menu-items` in `app.css`), aligned to the button's right edge.

- That is right when the button sits at the end of its row, as on a desktop.
- On a phone the open item's footer wraps, and the button lands at the left of the screen. The list (at least 220 px wide) then started about 140 px off screen.
- Only the interview round's menu had a phone-specific rule (`.round-side`).
- The sweep could not see it: the list is hidden until the button is pressed.

## Fix

- `MoreMenu` measures, before paint, where its list would open.
- If the button's right edge minus the list's width would fall within 8 px of the screen's left edge, it sets `data-align='start'`. The list then lines up with the button's left edge and opens rightward (`.more-menu-items[data-align='start']`).
- The fix sits in the shared component, so every ⋯ menu in the app (Today's rows, Plan, Practice, Jobs, Roadmap) behaves the same way. The `.round-side` rule stays; it agrees with the new behaviour.

## Test

The roadmap journey (`e2e/journeys.spec.ts`, "a roadmap item is added and marked done") now ends at 375 px:

- it opens the open item's ⋯ menu;
- it checks that the list lies inside the viewport and that Edit is in view.

On the old code the test fails with the list's left edge at −141 px. With the fix it passes.

## Owner step

On the Android phone, open a roadmap item and press ⋯. Edit, Back to not started and Remove should all show in full.

## Gate

prettier, lint, typecheck, knip, `test:ci` on a fresh database, build, `test:e2e`, `test:e2e:safari` and `test:e2e:firefox` (22/22 each), docs:check, `git diff --check`.
