# WI-115 handoff: the Rumi button is the owner's, and Rumi's art is cached

Date: 2026-11-01. The first fixes of the Rumi audit (`output/Silsila-Rumi-Audit.pdf`, accepted in full by the owner): Rumi showed two or three times on a page, the round button sat on rows' ends with no way to move or hide it, and Rumi's pictures were the slowest part of Today because they were never cached. No migration.

## What changed

- **The owner's button** (`src/features/agent/rumi-button.tsx`, rules in `button-pref.ts`): a small × on the button (on hover or keyboard focus, or after a long press on a phone) hides it, with a toast and Undo; dragging it drops it into the left or right corner; Settings → Rumi button switches it and picks the corner (`RumiButtonSetting`, saves on choice). The choice is a cookie (`silsila-rumi-button`: `right`, `left`, `off-right`, `off-left`), read by the server (`savedRumiButton`) so the button is drawn where it was left and a page never jumps. Hidden, the button is gone but Rumi is not: the sidebar's Ask Rumi, ⌘/ (Ctrl+/), ⌘K and every "Ask Rumi about this" still open the drawer. The drawer follows the corner.
- **One Rumi at a time:** the button folds small into its corner while one of Rumi's poses is on screen or the page scrolls down past its top (`tucked`), and grows back on hover, focus or scrolling up; it grows from its corner so the pointer stays on it. The menu's Rumi icon no longer blinks. The poses the owner asked for on Jobs, Practice and Weekly review (WI-113) stay.
- **Speed:** `/mascot/*.webp` is public like `/notify/` (shared art, nothing personal) and both folders are served with `Cache-Control: public, max-age=31536000, immutable` (`next.config.ts`); a changed picture gets a new `MASCOT_VERSION` in its path. The happy head loads only once the pointer comes near the button (`RumiMark happy`), and the poses at the top of a page load at once (`RumiPose priority`: Today's welcome, the goal card). Lab, Today revisited: 60 KB → 22 KB, Rumi's pictures from the browser's cache.
- **Toasts** take a tone (`info` beside `warning`) and one action such as Undo (`publishToast(message, tone, action)`).

## Tests

`tests/rumi-button.test.ts` (the cookie's four values and the default; the drop corner; when the button folds; the Settings line), `tests/agent-mascot.test.ts` (versioned paths, the happy head only on hover, a priority pose loads eagerly), `tests/proxy.test.ts` (the art's own paths are public and carry no private header; other paths under those folders are not). `e2e/journeys.spec.ts`: the Rumi button journey now hides the button from its ×, opens Rumi with the key while it is hidden, and brings it back with Undo.

Browser-checked at 1440 and 390 px: Today revisited takes 22 KB with both Rumi pictures from cache; the button folds on Roadmap with the goal pose in view and while scrolling down; hiding, the key while hidden, a reload, Settings back on in the left corner and a drag back to the right all hold; axe clean, no console errors, no overflow.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database (807), build, `test:e2e` and Safari (15 each), docs:check, `git diff --check`.

## Next

From the audit: Rumi plans the next seven days (a card for next week prepares the week on the owner's press; ADR-031), then Rumi knows the page it is opened on, prompts by page, new cards and streamed answers.
