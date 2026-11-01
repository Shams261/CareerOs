# WI-108 handoff: the debrief and the mock interview

Date: 2026-11-01. The fourth slice of Rumi 3 (`docs/product/rumi2-plan.md`, E4). No migration.

## What changed

- **Debrief with Rumi** on every completed round of an application (`DebriefPanel`, `src/features/prep/debrief.tsx`, in a side panel): `DEBRIEF_QUESTIONS` asked one at a time (What did they ask?, What went well?, What would you do differently next time?), prefilled with what the round holds, Back and Next, then Save. `debriefAction` → `debriefRound` (`src/features/prep/mock.ts`) checks the round is the owner's and completed, keeps a field the owner left empty and the outcome notes, and writes through `recordRoundResult` with a fresh request id. No model call. These fields stay on ADR-024's never-read list.
- **Mock interview** from a prep doc (a link under the doc's title; `/jobs/[id]/prep/[docId]/mock`, only with AI configured): `mockQuestions` draws up to five questions by code (the doc's `asks`, then each round's tests as "Walk me through this: …", then its topics as "How would you use …"), so no model chooses them. `MockInterview` (`mock-ui.tsx`) shows one question at a time with Listen (the device's voice) and, with voice consent, the microphone; Get feedback calls `mockFeedbackAction` → `mockFeedback`, which takes the question from the doc by index, stores the owner's answer as a USER message in a conversation "Mock · company" (created on the first answer, counted toward `AGENT_RATE`), and asks the model (`AGENT_CHAT`, 400 tokens, `PERSONA` and `MOCK_SYSTEM`, the doc's asks, rounds and topics as data) for one paragraph: what was strong, what to add, one likely follow-up. A reply with a score, rating, grade or percentage is asked once more; then those sentences are dropped (`hasScore`, `cleanFeedback`). The feedback is stored as the assistant message and shown with Listen and Next question; the end links to the conversation, which is deleted like any other.
- The fake OpenRouter answers the mock's feedback call.

## Tests

`tests/prep-mock.test.ts` (the debrief's fields; the mock's questions in order without repeats; scores dropped; the debrief written in the owner's words, empty answers keeping the field, only on a completed round, never another owner's; the mock asking the doc's own question, storing the turn, retrying a scored reply, refusing an unknown index and another owner's doc).

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`.

## Next

WI-109 reminders that learn.
