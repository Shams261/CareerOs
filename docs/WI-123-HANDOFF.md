# WI-123 handoff: the kernel and module boundaries

Date: 2026-11-02. The first "Next" item of the full audit (`output/Silsila-Full-Audit.pdf`, page 3). No migration and no behaviour change, except one wording: an invalid date in a day calculation now reads "Enter a valid date.".

## Why

**Generic rules lived inside features, so features imported each other in both directions.** There were 14 such pairs. `shiftDay` was in `schedule/domain`, the owner lock in `schedule/service`, `BANNED_WORDS` in `nudges/domain`, `categoryGroup` in `review/domain` and `AGENT_NAME` in `agent/domain`.

**Zod went to every page, `/privacy` included.** Client components that only needed Rumi's name or its words imported `agent/domain.ts`, which builds Rumi's tool schemas at module scope.

## What changed

- **Kernel modules** (no feature imports):
  - `src/lib/day.ts`: `isDay`, `checkDay`, `shiftDay`, `weekDays`, `weekOf`, `isSunday`. No Zod.
  - `src/lib/categories.ts`: `categoryKey`, `categoryLabel`, `categoryGroup`, `isStudyCategory`, `isDsa`, `isTechnical`.
  - `src/lib/copy.ts`: `BANNED_WORDS`, `plural`.
  - `src/server/lock.ts`: `locked`, `ScheduleUser`, `Tx`.
  - `src/lib/time.ts` no longer imports Zod. `isLocalTime` and `isTimeZone` are plain checks, and `lib/validation.ts` builds its schemas on them.
- **Rumi split for the browser:**
  - `agent/constants.ts`: `AGENT_NAME`, `MESSAGE_MAX`.
  - `agent/text.ts`: `renderText`, the read line, `WRITE_TOOLS` and `WRITE_WORDS`, `REQUEST_WORDS`, `PART_WORDS` and `lineHeading`.
  - `agent/card-rules.ts`: `addable`.
  - `agent/page-schema.ts`: `pageInput`.
  - `agent/voice-schema.ts`: `voiceInput`, `voiceSettingsInput`. `VoiceMeta` is now a plain type.
  - `request-domain.ts` checks at compile time that every card kind has its words.
- **Imports.** A codemod moved every import to the new homes: 137 files in `src`, `tests`, `e2e`, `scripts` and `prisma`. Nothing is re-exported from the old places. Type-only imports are written `import type`, so they are never bundled.
- **Dead code removed:**
  - three server actions: `askAction`, `deleteSessionAction`, `readNotification`, plus `weeklyReminderAction`, which was unused once its form went;
  - six components: `StageForm`, `PrepToggle`, `WeeklyReminderForm`, `LiveSummary`, `DisclosureTabs`, two illustrations;
  - `routineOptions`, `executionTone`, `isDeviceActive`, `agentConfigured`;
  - unused constants and types (`FEATURE_RATE`, `BEHAVIOURAL_ROADMAP`, `LINE_PARTS`, `NOTICED_KINDS`, `interviewStatuses`, `CloseDayInput`, `NudgeInput`, `GoalInput`, `FunnelStep`).
- **`tests/boundaries.test.ts`** enforces three rules:
  - the kernel imports no feature;
  - no client component reaches Zod outside a fixed list of eight page forms (shrink it, never grow it);
  - the shell (drawer, Rumi button, navigation, command bar, `ActionForm`, toasts) is free of Zod.

## Measured

|                                      | Before | After        |
| ------------------------------------ | ------ | ------------ |
| Feature pairs that import each other | 14     | 11           |
| Client components that reach Zod     | 42     | 8 page forms |

The rest of the pairs are real composite edges (Rumi ↔ undo, roadmap ↔ jobs). The Zod chunk is about 26 KB gz and is now referenced by seven pages: the roadmap week, Practice, the drill, a problem, an application, a prep doc and the mock. Before, it was referenced by all of them, `/privacy` included.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (148 files, 837 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.
