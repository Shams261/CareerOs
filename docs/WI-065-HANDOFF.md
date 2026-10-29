# WI-065 handoff — Today's home

Date: 2026-10-28. Branch `feat/wi-065-today` from `main` `977bbd8` (WI-064). ADR-027.

**Source.** The owner's concept `Silsila-Today-Before-After.pdf` (not committed) has two states: an empty account and a day with a plan.

**Owner's choices (2026-10-28):**

- Short motivational lines beside the facts.
- A thin bar for This week, with a quiet animation when something is achieved.
- Needs attention on the rail, under This week.

**Migration:** none.

## What changed

**Empty account.** `FirstRunToday` (`src/features/today/first-run.tsx`) shows when the day has no routine, no block and no running session. It replaces the routine card.

- **Welcome:** the date, "Today", and "Start small. Build your rhythm."
  - **Plan my first focus** (the page's one primary) opens a panel. It lists today's For today picks, each with Start 20 min; only the first is filled. Below them, "Or plan it for later today" is `BlockForm quick`: title, kind and the two times on today.
  - "or try a 20-minute session" starts the first pick.
- **Your first 3 steps:**
  - Choose your goal: a panel with the short goal form and its quick picks.
  - Set your study times: a panel with the routine form and template chips.
  - Pick a learning focus: links to the Roadmap; it counts as done once a roadmap item or a problem has begun.
  - The buttons name their step, e.g. "Set: Choose your goal".
  - "Skip for now" hides the steps for 30 days (`hideFirstStepsAction`, cookie `silsila-first-steps-hidden`).
- **Your day:** an empty timeline with "Nothing scheduled yet", an Add a block disclosure, and "One next step, at your pace."
  - The concept said "No streak to protect". "Streak" is in `BANNED_WORDS`, so that line was not used.

**A day with a plan.**

- **Header (`header.tsx`):**
  - The cheer line comes from `headerLine`: a quiet line seeded by the day, "One block done today. It counts.", "N blocks done today. Keep the rhythm.", or "Today's plan is done. Well kept."
  - **Chips:**
    - Focused today: `LiveMinutes`, growing while a session runs.
    - Today's plan: N of M blocks.
    - Your goal: days left, then the horizon and title. It opens the goal panel, or reads Set a goal.
  - The facts line moved to This week. The goal line is now the chip.
- **Up next card:** the launcher on the primary tint, with "Up next ·" for the next block. Its eyebrow and meta take `--ink-2` for contrast.
- **Today's plan (`agenda.tsx`):**
  - The heading has a count line, e.g. "3 blocks · 2 still ahead".
  - The launcher's block reads **Up next** and other upcoming rows read **Planned** (`statusTone` on `BlockRowShell`). Plan keeps upcoming rows quiet.
- **Rail:**
  - **`WeekCard`** (`week-card.tsx`) comes first: this week's blocks done of planned (cancelled and deleted left out), a 6 px `progressbar`, a line from `weekProgress` and the WI-059 facts.
  - **Celebration:** when the week crosses a milestone (first, half, done) not yet seen on this device (`silsila-week-milestone`), the bar glows once and the line rises. This happens only without reduced motion.
  - **Then:** Needs attention, the six setup steps, and the nudges card.

**Words.** `src/features/today/home.ts` holds every fixed line (`HOME_COPY`), `headerLine`, `weekProgress`, `MILESTONE_ORDER` and `firstSteps`.

**Docs.**

- ADR-027.
- CLAUDE.md: the voice rule now allows Today's cheer line and its one bar.
- CHANGELOG.

## Tests

| What                                                                                                                                                                           | Where                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| The cheer lines, week milestones and lines, the first steps count, and no banned word in any line                                                                              | new `tests/today-home.test.ts`    |
| The first journey: welcome, Plan my first focus, 0 of 3 steps, axe, phone fit, the routine through the steps panel, then Today's plan and the setup steps at 1 of 6, axe again | updated in `e2e/journeys.spec.ts` |

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 111 files, 604 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build; the curriculum published)

1. **Empty account.** It showed the welcome, the steps at 0 of 3 and the empty day. The focus panel listed two picks and the quick block form.
2. **A goal from the step.** "This week" filled the Sunday, and the steps read 1 of 3.
3. **A routine from the step.**
   - Today switched to a day with a plan.
   - The chips read "0 min", "0 of 1 block" and "4 days left · This week · Finish Arrays & Hashing".
   - The card read "Up next · 21:00–21:45", Today's plan read "1 block · 1 still ahead" with the row Up next, and This week read "0 of 5 blocks".
4. **One block done.** This week read "1 of 5 blocks · One session in. That counts." with the bar at 20%. With the stored milestone reset to none, the card celebrated once and then stored "first".
5. **Axe.** It found one problem: the Up next eyebrow at 4.42:1 on the tint. After the fix, axe was clean in light and dark at 1440 and 375, with no overflow and no console errors.

## Production

Merge and deploy; there is no database step. The owner's production Today already has the curriculum. With no routine yet, it opens on the welcome.
