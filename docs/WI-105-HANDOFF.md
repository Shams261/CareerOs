# WI-105 handoff: deep research for an interview invite

Date: 2026-11-01. The first slice of Rumi 3 (`docs/product/rumi2-plan.md`, E1). No migration.

## What changed

- **"I have the invite"** in Prepare with Rumi (`src/features/prep/panel.tsx`): a textarea and the tick "Send the invite text"; without the tick nothing is sent (`inviteAction`). `parseInvite` (`src/features/prep/service.ts`) checks the application is the owner's, then one `ask<Invite>()` (`PREP_RESEARCH`, `INVITE_FORMAT`, 500 tokens) sends only the invite as data with today's date (`inviteMessages`). `readInvite` keeps up to six rounds (an interview type, a date only when it is today or later and the start only with it, a length, the AI rule) and up to four topics, each from the fixed `INVITE_TOPICS` list, so a name, an email, a phone number or a link in the invite can never become a search. The invite is never stored and never logged.
- **Rounds and formats on a press**: each round with a date and a start shows Add interview (`addInviteRound` → `scheduleRound`, the end from `roundEnd`); "Tick these formats on the application" adds the rounds' practice formats beside the ticked ones (`tickInviteFormats`).
- **The research**: Research and write passes the invite's rounds and topics (`prepAction`, validated again on the server). `searchQueries` puts the topics (`<company> <topic> interview`), the company's system design and careers pages first, up to `INVITE_SEARCHES` = 8 (ADR-024's limit); without an invite it keeps six. `prepMessages` sends `inviteTopics`; `PREP_FORMAT` asks for `asks` (what the round asks) and `order` (what to study, first to last, with the owner's items), sourced and checked like the rest by `readPrepDoc`; older docs read them as empty. The doc stores `invite: { topics, rounds: [{ type, date }] }`, never the text.
- **The doc page**: What this round asks, What to study in order (with Plan until the date), From your own material (every linked item once, in study order), and a line naming the invite's rounds and topics.
- **Plan until the date** (`planFromDoc`, `src/features/prep/plan.ts`, apart from the prep service because Rumi's tools read the prep docs): the study order over the days from today to the day before the next scheduled round, within this week (`planWindow`), two free hours a day from the owner's best hours (`getPatterns`) or 18:00, never over a taken block or before the next half hour (`studySlots`), each day one plan card through `proposeBlocks` in a new conversation with Rumi; the owner adds the days with Add to plan.
- Rumi's prompt points the owner to Jobs → Prepare with Rumi → "I have the invite" when they say an invite came. The fake OpenRouter answers the `invite` format and the doc's new sections. `/privacy` says what the invite call sends and keeps.

## Tests

`tests/prep-invite.test.ts` (the invite call's messages; listed topics only, past dates dropped; searches with the topics, at most eight, none of the invite's personal words; round ends; study slots; the new doc sections; parsing stores nothing, a round only on the press, the doc keeps topics and not the text, the plan cards avoid a taken hour and add nothing; refusals for a short invite and another owner's application).

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`.

## Next

WI-106 the pattern coach.
