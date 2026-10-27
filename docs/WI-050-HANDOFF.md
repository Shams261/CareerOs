# WI-050 handoff — Make Silsila yours

Date: 2026-10-28. Branch `feat/wi-050-setup-checklist` from `main` `b3650c3` (WI-049). This is the next P1 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, section 10, "Setup — from empty to a real day in ten minutes").

After the fresh start (WI-045) the workspace is empty. Silsila had only a four-line Getting started list buried in Settings, and nothing on Today said what makes the app the owner's own. No migration.

## What changed

**Steps** (`src/features/setup/domain.ts`, pure). `setupSteps(facts)` returns six steps. Each is ticked only by a fact from the owner's records, never by hand:

| Step                                   | Done when                             | Goes to                      |
| -------------------------------------- | ------------------------------------- | ---------------------------- |
| Set the date you are aiming for        | an active goal has a target date      | Roadmap, Goals panel         |
| Add the times you really study         | an enabled routine exists             | Plan, Routines panel         |
| Choose your study kinds                | the Study nudges setting was saved    | Settings, Study nudges panel |
| Connect (or Reconnect) Google Calendar | the connection is `CONNECTED`         | Settings → Calendar          |
| Turn on notifications on your phone    | a device that is not revoked          | Settings → Reminders         |
| Add a real application                 | an application that is not test-named | Jobs                         |

- `setupLine` gives "4 of 6 done", and `setupComplete` reports when every step is done.
- No step's words use a banned word.

**Facts** (`src/features/setup/service.ts`). `setupState(user)` makes six small owner-scoped reads and is memoized as `setup`. Every write drops the cache, so a step ticks as soon as it is done.

**Today** (`src/features/setup/rail.tsx`, `card.tsx`). The card sits at the top of the rail, behind its own Suspense:

- On a phone it comes right after the launcher.
- An open step's button pushes its page and opens its panel through `openPanelAfterNavigation`, as Rumi noticed does.
- **Hide for now** (`hideSetupAction`) sets the httpOnly cookie `silsila-setup-hidden` for a week.
- The card leaves once every step is done.

**Settings.** Getting started becomes the same list, titled Make Silsila yours with its count. The old "Prepare next week" step is dropped from it, because that is a weekly move, not setup; Weekly review still offers it. Settings no longer counts routines or next-week plans itself.

**Docs.** `docs/product/onboarding.md` is updated.

## Tests

- `tests/setup-domain.test.ts` (2 tests):
  - the six steps, ticked by the facts: none, three, all six, with the counts;
  - Reconnect against Connect, each step's place and panel, and the banned words.
- `tests/setup-database.test.ts` (1 test) checks that these do not count:
  - a goal without a date;
  - a disabled routine;
  - a test-named application;
  - a revoked device.

  Then it checks that the real rows tick all six, and that another owner's rows count for nothing.

## Browser check (local, `silsila_dev_empty`)

- **1440 px:**
  - Today's rail opened with "Make Silsila yours · 3 of 6 done".
  - Set date opened Roadmap with the Goals panel. Saving a target date turned the card to 4 of 6.
  - Hide for now removed the card on a real click, and Settings showed the same six lines.
- **375 px:** the card follows the launcher, the buttons fit, and nothing overflows.
- No app errors.

## Production

Nothing to run: merge and deploy. On usesilsila.me the card should read 3 of 6: the goal has its date, Google Calendar is connected and push is on two devices; routines, study kinds and a real application are left.

## Gate

Lint, typecheck, build and docs check (88 files) pass on an export of the working tree; `pnpm test:ci`: 95 files, 551 tests; `git diff --check` clean.

## Fixed after the merge (2026-10-28, with WI-051)

The live check found the card missing on an empty production Today. With no routine and no block, Today shows only the first-run Start here card, and the rail with the steps never renders, which is exactly when the steps matter most. The steps now also sit under the Start here card, at its reading width. The card's heading id became `make-yours-heading`, because the Start here card already uses `setup-heading`.
