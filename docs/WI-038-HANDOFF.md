# WI-038: Readable previews, and Practice hints removed

Date: 2026-10-26. Branch `feat/wi-038-previews-no-hints` from `main` `c6c1b9c`. This is the first work item of the Rumi plan (`docs/product/rumi-plan.md`). No AI change, no migration.

## Outcome

**Readable preview.** Grill Me and Listen used to show "What will be sent" as raw JSON. They now show a labelled list, `SentFields` (`src/features/ai/sent-fields.tsx`, rows from `sentRows` in `src/features/ai/domain.ts`):

- **Title, Scope, Done when, References:** only the fields that will actually be sent, in the order the model sees them.
- **In Grill Me** the list follows the ticks as they change. The existing "Your note · never sent" checkbox stays, so the list has no note row.
- **In Listen** the list ends with "Your note · Never sent", and the sentence under it no longer repeats that.

**Practice hints removed.** At the owner's request, hints will come from the assistant, Rumi (WI-040). A Practice problem page no longer shows Hints, and no longer reads the AI state.

Removed:

- the hints domain block (`problemInput`, `HINTS_FORMAT`, `hintMessages`, `hintsSchema`, `readHints`, `looksLikeCode`);
- `problemHints`, `hintsAction` and `src/features/ai/hints.tsx`;
- the `.hint-list` and `.grill-payload` CSS;
- the fake OpenRouter's hint answers.

`ask()` now serves only Grill Me and Listen.

**Kept:**

- `AiFeature.GRILL_PROBLEM`. Ledger rows exist, and PostgreSQL cannot drop an enum value that rows still use. Its schema comment now says "retired", which needs no migration.
- `tests/problem-hints-migration.test.ts`, the historical upgrade test.
- The revision deck and its Today row. Their tests moved:
  - `tests/revision-deck-row.test.ts`, from the deleted `tests/ai-hints-domain.test.ts`;
  - `tests/ai-deck-database.test.ts`, the old `tests/ai-deck-hints-database.test.ts` without its hint tests.

**Docs:**

- `/privacy` and `security.md` no longer describe hints. The log example now uses a ladder rule code.
- ADR-022 notes the removal.
- `CLAUDE.md` describes the deck and `SentFields`.
- The Rumi plan is in the repo as `docs/product/rumi-plan.md`.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New     | `src/features/ai/sent-fields.tsx`, `tests/revision-deck-row.test.ts`, `docs/product/rumi-plan.md`, `docs/screenshots/wi-038/`                                                                                                                                                                                                                                                                                                        |
| Changed | `src/features/ai/{domain,service,actions}.ts`, `src/features/ai/grill.tsx`, `src/features/listen/{listen.tsx,domain.ts}`, `src/app/dsa/[id]/page.tsx`, `src/app/privacy/page.tsx`, `src/app/globals.css`, `prisma/schema.prisma` (comment), `tests/ai-domain.test.ts`, `tests/ai-deck-database.test.ts` (renamed), `tests/support/fake-openrouter-server.ts`, `docs/engineering/security.md`, `docs/architecture/decisions.md`, docs |
| Removed | `src/features/ai/hints.tsx`, `tests/ai-hints-domain.test.ts`                                                                                                                                                                                                                                                                                                                                                                         |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree. `pnpm test:ci`: 73 files, 452 tests (5 hint tests removed with the feature, 1 preview test added)                                                                                                                                                                |
| Tests                                    | New: `sentRows` lists exactly the sent fields, labelled and in order, and drops unticked ones. The deck row and deck database tests pass from their new files                                                                                                                                            |
| Browser, desktop                         | Grill Me on HTTP semantics showed Title, Scope and Done when as a list. Ticking Reference names added a References row; unticking Title removed its row. Listen showed the list with "Your note · Never sent". Two Sum's page has no Hints button. axe was clean on the Grill panel and the problem page |
| Browser, 375                             | The Grill panel's list at full width, no overflow                                                                                                                                                                                                                                                        |

Screenshots: `docs/screenshots/wi-038/`.

## Owner steps

None. There is no migration. After the deploy, open Grill me or Listen on any item to see the list.
