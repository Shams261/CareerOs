# WI-063 handoff — A simpler app

Date: 2026-10-28. Branch `feat/wi-063-simpler` from `main` `9183402` (WI-062).

**Source.** The 2026-10-28 audit proposed six simplifications, each shown as a before/after mockup. The owner said yes to all six.

**The rule.** Nothing is removed. Every action and list is still there; the less-used ones sit one click away, in a menu or a panel.

**Migration:** none.

## What changed

| #   | Choice                     | Where                                                                                                                                              | What                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One "next" list            | `src/app/roadmap/page.tsx`, `src/app/dsa/page.tsx`, `src/components/side-panel.tsx`, `src/features/today/domain.ts`                                | Roadmap and Practice lead with For today. This week and Due for revision open in side panels from one line. The Roadmap overview is one column, and its rows show counts only; the row still opens at the next item. A `SidePanel` opens on arrival when the URL hash is its id, so Today's rows reach the panels at `/dsa#revision-queue` and `/roadmap#revision`.                                                               |
| 2   | Today's header             | `src/features/today/header.tsx`, `utility-menu.tsx`, `src/app/today/page.tsx`, `globals.css`                                                       | The title, date and arrows, then one More menu at every width: date, Activity, Notes, Add, Review day, Edit goal. Close the day stays visible when it is due. The menu closes on Escape, on a click outside, and when an item is chosen. A day with nothing planned or recorded skips the "0 blocks…" line.                                                                                                                       |
| 3   | Roadmap item tabs          | `src/features/roadmap/item-list.tsx`, `src/components/more-menu.tsx`                                                                               | Study and Notes tabs (`role="tab"`, arrow keys). **Study:** Done when, scope, references, links, and the Copy prompt. **Notes:** the note, kept cards, and where the item was asked. The row keeps Done, Mark revised or Record an attempt, plus Start and Reopen. The new `MoreMenu` ("⋯") holds Grill me, Listen, Asked in interview, Edit and Remove. Its items stay inside the item's form, so the submit buttons still post. |
| 4   | Plain words                | `src/features/dsa/words.ts`, the Practice pages, `item-list.tsx`, `pattern-groups.tsx`, `attempt-form.tsx`, review, for-today, attention, settings | `confidenceWord`: Shaky, Okay, Solid. The stored values stay RED/YELLOW/GREEN, and Rumi and the prep docs are unchanged. "Which pattern?" becomes Pattern quiz, "Revisit" becomes Revise, and Settings shows the System row only when something needs attention.                                                                                                                                                                  |
| 5   | Application page           | `src/app/jobs/[id]/page.tsx`, `globals.css`                                                                                                        | The stage is one select at every width; the eleven buttons are gone. The next action keeps Mark done, with Done with a note and Edit next action in its "⋯". Each interview's Add prep, Reschedule, Add to schedule and Edit details sit in a "⋯" beside its details chevron; on a phone that menu opens to the right. Log the result and the reflection stay visible.                                                            |
| 6   | No note box in the sidebar | `src/app/layout.tsx`, `src/components/navigation.tsx`, `src/app/today/page.tsx`                                                                    | `CaptureForm` moved into Today's Notes panel. ⌘K → Add a note still works on every page.                                                                                                                                                                                                                                                                                                                                          |

**Measured on the seeded production build** (controls / words / page height):

| Page              | Before (WI-062 audit) | After              |
| ----------------- | --------------------- | ------------------ |
| Roadmap, 1440     | 23 / 358 / 1509 px    | 12 / 117 / 1045 px |
| Application, 1440 | 38 / 192              | 25 / 179           |
| Today, 1440       | 20 / 215              | 16 / 193           |
| Practice, 1440    | 68 / 463 / 3163 px    | 60 / 342 / 2504 px |

## Tests

| What                                     | Result                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| New `tests/simpler-ui-domain.test.ts`    | The three words, the Practice filter using them, and none of them in `BANNED_WORDS` |
| Updated `tests/for-today-domain.test.ts` | "Shaky last time"                                                                   |
| Updated `tests/attention-domain.test.ts` | "Revise HTTP semantics"                                                             |

## Gate

- `pnpm typecheck` passes.
- ESLint is clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 107 files, 593 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification

**Every screen.** On the production build with seeded data, light theme, 1440 and 375:

- axe is clean;
- there is no horizontal overflow;
- there are no console errors.

**Every new menu and panel.** Checked in Chromium and WebKit at 1440 and 375, with the menu open:

- **Today:** the More menu opens the Notes panel, which has the note field.
- **Roadmap item:**
  - the Notes tab shows the note field;
  - the ⋯ menu's Edit opens the edit panel.
- **Application:** the next action's menu and the interview's menu open.
- **Panel links:** `/dsa#revision-queue` and `/roadmap#revision` open their panels.
- **Every open menu:** axe is clean and there is no overflow.

## Production

Merge and deploy. There is no database step.
