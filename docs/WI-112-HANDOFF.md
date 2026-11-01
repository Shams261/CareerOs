# WI-112 handoff: Rumi on a cream tile, and pictures in pushes

Date: 2026-11-01. The owner's two asks after WI-111: the warm cream of the original renders looked better than the cut-outs on white cards, and the twelve marketing scenes should be used in notifications. No migration, no new data.

## What changed

- **The cream tile** (option D of the owner's comparison): every `RumiPose` now sits on a warm cream tile with rounded corners and a soft floor shadow under its feet, like the renders' own background (`--rumi-tile-top`, `--rumi-tile-bottom`, `--rumi-floor` in `src/app/design-tokens.css`; a warm dark tile in Dark). The tile stays still and the figure inside it moves (`.rumi-pose-figure` carries `data-motion`), so the shadow stays on the floor while Rumi floats or sways. The tile's padding and corners are sized from the pose's own width (`--pose`), never from the card around it (a percentage padding followed the card and squeezed Rumi). The small head icon has no tile. Pose sizes grew a little to make room for the tile.
- **Pictures in pushes** (`PUSH_IMAGE`, `PUSH_IMAGE_PATH`, `pushImage` in `src/features/push/domain.ts`): nine of the marketing scenes, cut to 2:1 at 960×480 JPEG (29–46 KB) in `public/notify/`, one per reminder type:

| Reminder                      | Picture           |
| ----------------------------- | ----------------- |
| Morning line                  | Morning desk      |
| Afternoon line                | Planning the week |
| Evening check-in              | One more chapter  |
| Study block started           | Calm focus        |
| Block starts soon             | Rainy focus       |
| Review your day               | Night recap       |
| Interview coming up           | Interview day     |
| Roadmap and Practice revision | Revision ladder   |
| Weekly review                 | Sunday review     |

Overdue, check-in, job follow-up and the test push send no picture. The payload carries the picture's path only; the service worker shows it only when it matches `/notify/<name>.jpg` (`public/sw.js`). The pictures are shared art, the same for everyone, so `src/proxy.ts` serves `/notify/*.jpg` without sign-in, as it does the icons; Rumi's poses in `public/mascot/` stay behind sign-in. Chrome and Edge on Android and Windows show the picture large; Safari, macOS banners and the iPhone show the text only.

- Docs: `notifications-pwa.md`, `security.md` and `/privacy` name the picture.

## Not used yet

Path to the goal, week done and the hero banner (for the login page and link previews, if the owner wants them later).

## Tests

`tests/push-privacy.test.ts`: every picture a type names exists and matches the allowed path, every file in `public/notify/` is named by a type, every type with a picture is a real type, and the service worker checks the same path shape. `tests/production-unit.test.ts`: an interview push adds only `image`, and a job follow-up keeps exactly the four fields it had. `tests/agent-mascot.test.ts`: the tile is sized from the pose and the figure carries the motion. The two exact-payload checks in `tests/production-database.test.ts` and `tests/push-crypto.test.ts` now expect the revision picture too.

Browser-checked at 1440 and 390 px in Light and Dark: no overflow, no console errors, axe clean, `/notify/*.jpg` public and `/mascot/*.webp` still behind sign-in.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database (800), build, `test:e2e` and Safari (15 each), docs:check, `git diff --check`.

## Next

The owner checks a push with a picture on the Android or Windows device that has push turned on. Two weeks of UAT continue.
