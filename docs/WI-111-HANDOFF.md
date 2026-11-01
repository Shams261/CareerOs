# WI-111 handoff: Rumi's mascot, and Rumi from every page

Date: 2026-11-01. The owner's request after the Rumi 2 and 3 plan: Rumi should have a character of its own, like Muse's, that blinks, and open from anywhere, not only from the sidebar. No migration, no new data.

## How the character was made

- The owner chose the look: a small 3D robot in a teal hoodie with headphones, a dark visor and glowing mint eyes, from a mascot plan drawn as SVG drafts (`output/Silsila-Rumi-Mascot-Plan.pdf`, not committed).
- The owner generated every pose in Gemini from one reference image, with the prompts in `output/Silsila-Rumi-Gemini-Prompts.md` (not committed). The originals are in `output/rumi-gemini/` (not committed).
- Each app pose was cut out on the Mac with Vision's subject lift (`VNGenerateForegroundInstanceMaskRequest`), holes inside the subject filled, cropped, and saved as webp of at most 480 px with alpha in `public/mascot/` (26 poses and two small heads, about 600 KB in all, each under 40 KB; a page loads only its own).

## What changed

- **Poses** (`POSES`, `poseSrc`, `HEAD_SRC`, `blinkDelay` in `src/features/agent/mascot.ts`; `RumiPose` and `Lids` in `pose.tsx`): each pose has its size, a motion (breathe, sway, bob, float, sleep) and, for the sixteen poses whose eyes are open ovals, two eyelids placed over its eyes in percent and painted in the visor's own colour beside each eye. A still picture cannot move, so motion is CSS: the pose breathes, sways, bobs or floats; the eyelids close for a moment every few seconds, each pose on its own beat, and a closed lid shows a thin glowing line, like the generated closed-eyes head; the sleeper's z's drift up. Decoration only: empty `alt`, hidden from assistive technology. Everything stands still under reduced motion.
- **The icon** (`RumiMark`, `src/features/agent/mark.tsx`): the small rendered head with eyelids that blink, a faster blink and a bob while Rumi reads or writes (`busy`), the happy-eyed head when the pointer is on the round button, and a × badge while the drawer is open (`closed`). It sits in the round button, the sidebar's Ask Rumi, the drawer's heading, beside each reply, on the reading line, the Rumi page's title and Today's Rumi line card.
- **The moments**:

| Where                                               | Pose                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| Empty chat (drawer and Rumi page)                   | Hello                                                            |
| Today, first run                                    | Checklist                                                        |
| Today, Rumi's line card                             | Morning coffee, working in the afternoon, writing in the evening |
| Today's launcher, day closed / nothing more planned | Stretch break / meditating (hidden on a phone)                   |
| Weekly review, Sum up the week                      | Calendar                                                         |
| Roadmap goal card                                   | Goal flag                                                        |
| Interview prep doc / mock interview                 | Interview ready / mock interview                                 |

- **Rumi from every page**: the round button shows on a desktop again. WI-093 had hidden it above 700 px because it covered the ends of list rows; the page keeps 104 px under its last row and the button hides while a side panel or modal is open (`html[data-panel-open]`). It stays off the Rumi page, Focus and the signed-out pages.
- **The key**: ⌘/ on a Mac, Ctrl+/ elsewhere (`isRumiKey`, `RUMI_KEY_LABEL` in `src/features/agent/events.ts`) opens or closes the drawer from any page that has it, also while typing; on the Rumi page it focuses the composer. The button's tooltip names the key.

## Not used yet

Poses kept for later moments: idea, reading, thinking, heading out, listening, speaking, cheering, high five, revision cards, sitting, standing, and the generic head. The marketing scenes (B01 to B12) are for the website and social posts, not the app.

## Tests

`tests/agent-mascot.test.ts`: every pose file exists as a cut-out webp of the manifest's size and under 40 KB, the folder holds nothing the manifest does not name, every pair of eyelids sits inside its image, blinks are spread over the cycle, a pose and the icon render as decoration with their eyelids, the × only while open, and the key. `e2e/journeys.spec.ts`: the Rumi button shows on Jobs and Practice with the head, the key opens the drawer with the composer focused, axe clean, and closes it again.

Browser-checked at 1440 and 390 px in Light and Dark on Today, Roadmap, Weekly review and the drawer: no overflow, no console errors, no failed image requests, axe clean; the blink was checked with the eyelids held shut.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database (798), build, `test:e2e` and Safari (15 each), docs:check, `git diff --check`.

## Next

Two weeks of UAT on the Rumi 2 and 3 plan. The unused poses can come in one at a time where a moment asks for them.
