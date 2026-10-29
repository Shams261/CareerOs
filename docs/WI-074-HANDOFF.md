# WI-074 handoff — a fuller daily line and the owner's name

Date: 2026-10-29. Branch `feat/wi-074-quotes-name` from `main` `971f899` (WI-073 and its fix).

**Source.** After WI-073 the owner asked whether the quotations could come from a free API instead of forty fixed lines, and wanted energetic, motivating ones among them; and on production the greeting read "Good afternoon, shamstabrez026.", the name Google sent.

**Owner's choices (2026-10-29):** a larger set kept in the repository rather than a quotes API (offline, no cost, every line read before it ships, no unreviewed content and no third-party terms); energetic quotations allowed, shaming ones not; a Name field in Settings.

**Migration:** none.

## What changed

| Part    | Where                                                                    | What                                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The set | `src/features/today/daily-line.ts`                                       | `QUOTES` holds forty quotations for each part of the day, 160 in all, from public-domain sources and proverbs with their authors. Mornings and afternoons lean energetic (Franklin, Edison, Roosevelt, Goethe, Confucius, Michelangelo); evenings and nights calm (Seneca, Lao Tzu, Emerson, Shakespeare, Longfellow). |
| Name    | `src/features/settings/name-action.ts`, `src/app/settings/page.tsx`      | Settings → Appearance → Name opens a small modal; `nameAction` trims and saves `User.name` (1–60 characters), drops the owner cache and answers "Saved. Today greets you as Shams.".                                                                                                                                   |
| Docs    | `docs/architecture/decisions.md` (ADR-028 amended), CHANGELOG, CLAUDE.md | The tone rule: energetic by day, calm by night, never shaming; the set lives in the repository; the name comes from Settings.                                                                                                                                                                                          |

## Tests

- `tests/daily-line.test.ts`: at least forty a part; every quotation at most sixteen words, attributed, and free of `BANNED_WORDS` and a shaming list (lazy, excuse, sluggard, wasted, loser, weak). One quotation (Edison's "Opportunity is missed…") was dropped by that test for "missed" and replaced.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 117 files, 632 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build at 1366×700, Playwright)

- **Name:** the Settings row read "Name · owner · What Silsila calls you on Today"; it opened a centred modal; a blank name answered "Name: enter at least one character."; "Shams Tabrez" saved, the modal closed and the row read "Shams Tabrez".
- **Greeting:** Today then read "Good afternoon, Shams." with "Whatever is worth doing at all is worth doing well. — Lord Chesterfield"; axe clean; no console errors.

## Production

Merge and deploy; there is no database step. The owner sets their name in Settings → Appearance → Name.
