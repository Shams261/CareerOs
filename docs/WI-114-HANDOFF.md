# WI-114 handoff: the AI limit is the owner's

Date: 2026-11-01. The owner's correction: the US$3 monthly stop was a number in code, not their choice. They decide the limit (US$5, US$10, US$20 or none), and the number must change nothing about how Silsila is built or how Rumi answers. Migration `20261106000000_owner_ai_limit`.

## What changed

- **Schema:** `AiSetting.monthlyLimitMicros` (nullable integer). Null, the default and the value every existing owner gets, means Silsila sets no limit; the OpenRouter key's own limit, which the owner sets at OpenRouter, is then the only ceiling. The database accepts US$0.10 to US$1000 (`AiSetting_monthly_limit_range`).
- **Rules** (`src/features/ai/domain.ts`): `CAP_MICROS` is gone. `withinLimit(spent, reserve, limit)` stops a call only under a set limit; `nearLimit` shows the spend beside Rumi only near a set limit; `underShare` keeps Rumi's lines and memory notes to 90 % of a set limit, and never stops them without one; `budgetLine(spent, limit)` reads "US$0.12 used this month" or "US$0.12 of US$10 used this month"; `limitInput` parses "none" or an amount; `LIMIT_CHOICES` are No limit, US$5, US$10 and US$20.
- **Service** (`src/features/ai/service.ts`): `callModel` reads the owner's limit beside the month's spend under the owner lock; `aiState()` returns `limit`; `setMonthlyLimit` writes it. Every reader passes the limit (Rumi's chat and page, Grill Me, Listen, lines, memory).
- **Settings → AI and Grill Me** (was Grill Me): the month's spend, the reset day, and a Monthly AI limit choice with Save limit (`aiLimitAction`). The row reads "On · US$0.12 used this month", with "of US$10" when a limit is set.
- **Words:** "Your monthly AI limit is reached. Rumi returns on Dec 1, or raise the limit in Settings." replaces "This month's AI budget is used."
- **Docs:** ADR-022 amended; CLAUDE.md, `security.md`, `rumi-2.md` and the Rumi 2 plan's budget row no longer name US$3 as a rule.

## Not changed

The per-feature counts that keep calls few (Grill Me 20 an hour and 60 a day, Ask Rumi's 30 messages an hour and 100 a day, five prep docs and three drafts a day, the lines' daily share) are not about money and stay. The model, the pinned endpoint and the provider check are unchanged.

## Owner steps

1. Before the merge: a verified backup, then `DATABASE_URL="$SUPABASE_URL" pnpm db:deploy` (the usual checklist in `docs/engineering/backup-restore.md`).
2. After the deploy: Settings → AI and Grill Me → pick a limit, or leave No limit. The OpenRouter key's limit is set at openrouter.ai and is the real ceiling when Silsila has none.

## Tests

`tests/ai-domain.test.ts` (a call fits under a set limit and always without one; the budget line with and without a limit; the limit input accepts "none" and US$0.10 to US$1000 only; background calls stop at a share of a set limit and never without one), `tests/rumi-anywhere-domain.test.ts` (near only a set limit), `tests/ai-database.test.ts` (with no limit a large spend still sends; with a limit the call stops and says how to raise it), `tests/agent-database.test.ts` (Rumi shares the owner's limit; the budget line names no fixed number), `tests/owner-ai-limit-migration.test.ts` (an existing setting keeps no limit, the database refuses amounts out of range).

Browser-checked at 1440 and 390 px: setting US$7.50 saves and shows "of US$7.50", No limit saves back, no console errors, axe clean.

## Gate

prettier, lint (only the untracked docs/audit files warn), typecheck, `test:ci` on a fresh database (803), fresh `db:deploy`, the upgrade test, `prisma migrate diff --exit-code` (no difference), seed twice and `verify-seed`, build, `test:e2e` and Safari, docs:check, `git diff --check`.
