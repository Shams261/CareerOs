# WI-142 handoff: Talk with Rumi

Date: 2026-11-02. The owner said that talking to Rumi still meant typing. The microphone of WI-104 only dictated into the composer, and the owner had to press Send. The owner chose:

- a hands-free Talk where a pause sends after two seconds;
- Copy prompt stays on roadmap items;
- Grill Me and Listen move inside Rumi as a separate work item (WI-143).

No migration. ADR-030 is amended.

## What changed

- **The Talk button** (`TalkButton`, the audio-lines icon) sits beside the microphone in Rumi's composer, on the page and in the drawer. It shows where the owner has consented to voice (Settings → Voice) and the browser can both listen and speak. While Talk is on, the plain microphone steps aside.
- **One turn** (`useTalk` in `src/features/agent/voice.tsx`, the rules in `talkNext` in `voice-domain.ts`):
  1. It listens until a two-second pause (`SILENCE_MS`).
  2. What was heard stays in the composer for `TALK_SEND_MS` (two seconds). The bar under the composer reads "Talk · Sending what you said…" with **Edit** (stop here and change it, then send by hand), **Send now** and **Stop**.
  3. It is sent as a voice message (`{ via: 'voice', edited }`).
  4. The answer is read aloud whatever the "read replies" setting says, with Stop.
  5. It listens again.
- **Talk ends** on Stop, Edit, a failed answer, or a turn where nothing was heard ("Nothing was heard, so Talk stopped."). It also ends when the chat closes or unmounts.
- **The first answer on `/rumi`.** The page moves to `/rumi?c=…` and mounts the chat anew. The answer waits in the tab under `TALK_RESUME_KEY`, and the new chat picks Talk up: it reads the answer, then listens. A `resume` event in `talkNext` covers this.
- **`src/lib/speech.ts`:**
  - `useDictation` takes `onEnd(heard)`, called when listening ends by itself or by `stop`, never after `cancel`. A cancelled recognition's own end no longer clears the next one.
  - `useSpeaker.speak(lines, onDone)` says when the lines end, never after Stop.
  - `prime()` speaks nothing inside the tap, so a reply read later is allowed on iOS.
- **Without consent**, where the browser can listen, the composer reads "Speak instead of typing: turn on Voice", linking to Settings → Rumi and AI.
- **The rule that changed.** WI-104 said nothing is sent until the owner presses Send. That is still true of the microphone; Talk is the exception the owner chose. The amendment is recorded in ADR-030, `/privacy`, the consent text in Settings → Voice and the doc comment of `voice-domain.ts`. Nothing else changes: no wake word, no open microphone between turns, no audio or transcript kept.
- **Tests:**
  - `tests/voice-domain.test.ts` (Talk's turn, its endings, events out of place, `resume`, the delay's bounds).
  - A browser journey, "Talk sends what was heard, reads the answer and listens again". Recognition and the voice are stubbed: it hears one question, Talk sends it by itself, the answer is read on the conversation's page, and the next turn hears nothing and stops Talk.
  - The new UI (the bar and its buttons) is written in Tailwind.

## Owner steps

1. Turn voice on: Settings → Rumi and AI → Voice, the consent box, Save. Optionally choose Hindi or English (US).
2. Try Talk in Chrome on the laptop. On the iPhone, run Settings → Voice → Check this device in the Safari tab and in the Home Screen app first. iOS may not allow recognition in the Home Screen app. Where a device cannot listen, the button does not show.

## Gate

prettier, lint, typecheck, knip, `test:ci --coverage` on a fresh database, build, `test:e2e` and `test:e2e:safari`, docs:check, `git diff --check`. The branch is pushed and green before the merge.
