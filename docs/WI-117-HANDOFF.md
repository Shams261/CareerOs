# WI-117 handoff: Rumi knows the page it is opened on

Date: 2026-11-01. From the Rumi audit (E2, E3, E6): Rumi did not know what the owner was looking at, its four suggested questions were the same everywhere, and Sunday evening said nothing about the week ahead. No migration.

## What changed

- **The page** (`pageRef`, `pageInput` in `src/features/agent/page-domain.ts`; `readPage` in `page-context.ts`): the drawer sends the path it is open on (a bare path only, checked), and the server reads the record it names for the owner alone: a Practice problem (title, difficulty, platform, topic, attempts and confidence word, last attempt, next revision), a job application (company, role, stage, formats, next action date, the next three scheduled rounds with their ids), or a roadmap with Study AI on (title and item count). Never notes, job descriptions, compensation, contacts or interview reflections; test-named records and other owners' ids read nothing. The line goes to the model as a second system message marked as data, never instructions, and its ids join the answer's `seen`, so a card can name the record ("move this round", "log an attempt on this problem").
- **Questions by page** (`promptsFor`): four suggested questions for Today, Plan, Roadmap, Practice, Jobs, Weekly review and elsewhere, and a record's own first on its page ("Give me a hint for this problem, without the code", "How should I prepare for this application's next round?"). The fixed `SUGGESTED_PROMPTS` are gone.
- **Sunday evening:** the evening card on a Sunday offers "Plan next week with Rumi", which asks Rumi to plan next week from Monday; with ADR-031 the cards prepare the week on the owner's press.
- The streaming route and `askRumi` carry `page`.

## Tests

`tests/agent-page.test.ts`: paths to records and places, only bare paths accepted, four questions per page with the record's first, Sunday; the owner's problem and application read without any private field, another owner's problem and a Study AI off roadmap read nothing; the page reaches the model as data, its id is kept in `seen`, and a foreign id is never seen. `e2e/journeys.spec.ts`: the drawer opened on Practice shows Practice's questions.

Browser-checked in the lab: on a problem page the drawer leads with the problem's own questions, on Plan with Plan's; axe clean, no console errors.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database (816), build, `test:e2e` and Safari (15 each), docs:check, `git diff --check`.

## Next

From the audit: new cards (a roadmap item done or started, an application, a round, a goal) and answers that stream as they are written.
