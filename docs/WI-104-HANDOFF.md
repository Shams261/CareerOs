# WI-104 handoff: voice, with the R6 spike folded in

Date: 2026-11-01. The fifth code slice of the Rumi 2 and 3 plan (`docs/product/rumi2-plan.md`, ADR-030). No migration: the voice fields on `AgentSetting` came with WI-100.

## Why R6 is inside this item

R6 was planned as a throwaway static page on the owner's devices. On usesilsila.me that page could not have worked: the `Permissions-Policy` header said `microphone=()` and the nonce CSP refuses inline scripts, so any microphone check there would have failed for the header, not for the device. R6 therefore became a permanent tool: Settings → Voice → **Check this device** shows whether this browser has speech to text and reading aloud and tries each on a press, and the microphone button renders only where recognition exists. The owner runs it on the iPhone as a Safari tab and as the Home Screen app; the result decides nothing in code, because the button already hides itself where recognition is missing. The prompt-caching check of R6 waits for the UAT budget decision (it needs the production key).

## What changed

- **Settings → Voice** (`src/features/agent/voice-settings.tsx`, `voiceSettingsAction`, `setVoiceSettings`): the consent in plain words, "I understand; show the microphone button" (`voiceConsentAt`; a second save keeps the first time; turning it off clears it), the language (`VOICE_LANGS`: en-IN default, en-US, hi-IN), "Read Rumi's replies aloud" (`speakReplies`), and Check this device. The row reads "Off" or "On · English (India) · replies read aloud".
- **Speech helpers** (`src/lib/speech.ts`): `speechSupported`, `recognitionSupported`, `useVoices` (moved from Listen), `useSpeaker` (lines one after another, `stop` cancels at once and on unmount) and `useDictation` (`continuous = false`, interim results, a stop after `SILENCE_MS` = 2 s without a new word, `cancel` drops it).
- **The composer** (`voice.tsx`, `chat.tsx`): with consent and recognition, a microphone beside Send (`MicButton`, `aria-pressed`, a soft pulse under `prefers-reduced-motion: no-preference`); the words heard go after what was typed, "Hearing: …" shows interim words in meta ink, Escape drops them and puts the typed text back, and errors read as plain lines (`dictationError`). Nothing is sent until Send. The drawer reads the voice settings once when it opens (`voiceStateAction`); the Rumi page passes them.
- **The voice mark**: a message sent after dictation carries `{ via: 'voice', edited }` (`voiceMeta`), sent by the streaming route through the strict `voiceInput` and stored as the owner message's metadata; no audio and no transcript exist anywhere.
- **Reading aloud**: with `speakReplies`, each reply is read as plain lines (`speakableLines` from `renderText`) with Stop; a new question, the drawer closing or leaving the page stops it. Today's Rumi line card gains Listen (`ListenLine`).
- `Permissions-Policy`: `microphone=(self)`; the rest stays off. `/privacy`, `docs/engineering/security.md` and `docs/engineering/notifications-pwa.md` describe it.

## Tests

`tests/voice-domain.test.ts` (the voice mark, the strict input, error lines, speakable lines, languages and the form, the header), `tests/agent-memory-database.test.ts` (consent time kept and cleared, language and spoken replies; a voice message stores only its mark); e2e with a stubbed `webkitSpeechRecognition`: no microphone before consent, consent in Settings → Voice with Check this device, then the microphone fills the composer.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database, build, `test:e2e` and Safari, docs:check, `git diff --check`.

## Owner step

On the iPhone, in Safari and in the Home Screen app: Settings → Voice → consent → Check this device → Try the microphone and Try the voice. Then the UAT measures messages by voice.

## Next

Rumi 3: WI-105 deep research for an interview invite.
