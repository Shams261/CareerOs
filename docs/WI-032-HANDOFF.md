# WI-032: Revision deck and problem hints

Date: 2026-10-26. Branch `feat/wi-032-deck-and-hints` from `main` `65a38cb` (the WI-031 ladder-length fix). This is Phase 3, slice 2 of the Version 2 plan (`docs/product/v2-plan.md`, section 5), and the last planned Version 2 work item before the Phase 4 hypotheses. One migration.

## Outcome

### Revision deck

`/roadmap/deck` shows the cards the owner kept in Grill Me, but only on roadmap items that are due for revision today or overdue.

- **Order.** Cards follow the items' due order, oldest first.
- **What it never shows.** A card on an item not yet due, or anything the owner did not keep (`revisionDeck`).
- **One card at a time.** It shows the question and what changed. Space or **Show the points** reveals the points. **Had it / Partly / Missed** (1–3) marks the card and moves on.
- **The end** reads "That's today's revision." with the counts and "These marks are not saved." Each item whose cards are all marked offers its own **Mark revised** (the existing roadmap action), and nothing is marked automatically. The confirmation, "Revision recorded; the next one is scheduled.", stays visible after the deck empties (a `deck` feedback outlet). **Go through again** restarts.
- **Empty deck** reads "Nothing to revise from your cards today".
- **Today.** Needs attention shows one row, "Revision deck · 2 cards from 1 item due", just above the items' own Revisit rows (`revisionDeckRow`).
- **No extra query.** The count comes from the roadmap revision query Today already makes (`revisionDue` gains `_count.revisionCards`).

### Hints on a Practice problem

A problem page has **Hints** in its header when AI is configured, switched on and not blocked, and the problem is not test-named. The panel shows the exact four fields that will be sent (`problemInput`):

```json
{
  "problem": "Two Sum",
  "difficulty": "Easy",
  "platform": "LeetCode",
  "topic": "Arrays & Hashing"
}
```

The problem's notes, link and attempts are never sent.

**Get hints** makes one request through the same engine as Grill Me, with the same pinned endpoint, ledger, US$3 stop, rate limits, provider check and retry. The ledger records the feature `GRILL_PROBLEM`.

**Five hints** come back, each stronger than the last (reading, pattern, structure, key insight, approach). Space or **Next hint** opens them one at a time.

**Never code.** The schema refuses any hint over 160 characters or one that reads as code (`looksLikeCode`: backticks, `;` endings, `=>`, `==`, braces, `word[...]`, `for (`, `def`, `const` …). Such an answer is retried once, then shown as unavailable.

### Internals

- `grill` and `problemHints` share one `ask()` in `src/features/ai/service.ts`: the reservation under the owner lock, the call, the provider check, settling and the retry. `requestBody` takes an `OutputFormat` (`LADDER_FORMAT` 2,000 tokens, `HINTS_FORMAT` 1,000).
- **Migration** `20261026150000_problem_hints` adds the enum value `AiFeature.GRILL_PROBLEM`. `LATEST_MIGRATION` is bumped.
- **`/privacy`** and the security doc now name the four problem fields hints send.
- The local fake OpenRouter answers a `hints` request with five plain hints.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/app/roadmap/deck/page.tsx`, `src/features/ai/{deck,hints}.tsx`, `prisma/migrations/20261026150000_problem_hints/`, `tests/ai-hints-domain.test.ts`, `tests/ai-deck-hints-database.test.ts`, `tests/problem-hints-migration.test.ts`, `docs/screenshots/wi-032/`                                                                                                                            |
| Changed | `prisma/schema.prisma`, `src/server/health.ts`, `src/features/ai/{domain,service,actions}.ts`, `src/features/attention/domain.ts` (`revisionDeckRow`), `src/features/today/{domain.ts,attention.tsx}`, `src/features/roadmap/service.ts` (`revisionDue` count), `src/app/dsa/[id]/page.tsx`, `src/app/privacy/page.tsx`, `src/app/globals.css`, `tests/support/fake-openrouter-server.ts`, docs |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm test:ci` (disposable database)     | 63 files, 419 tests pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Migration                                | Fresh `migrate deploy` and `migrate diff --exit-code` = 0. The upgrade test keeps an earlier `GRILL_ITEM` row and accepts `GRILL_PROBLEM`                                                                                                                                                                                                                                                                                                                                                               |
| New tests                                | Hints and deck row (domain) 4: four fields only, the code detector on 12 samples, five plain hints, the row's count and order. Database 3: only four fields sent and a `GRILL_PROBLEM` ledger row, code retried then refused, test records refused, the deck holding only kept cards on due items in due order                                                                                                                                                                                          |
| Browser (fake OpenRouter), desktop light | Today's full Needs attention list showed "Revision deck · 2 cards from 1 item due". The deck: card 1 by Space then 1, card 2 by the buttons, the end screen with counts and Mark revised for Introduction. Pressing it moved the next revision to Nov 9 and showed "Revision recorded; the next one is scheduled." above the now-empty deck. Hints: the four-field preview, Get hints, five hints opened by Space and Next hint, then the closing line; a `GRILL_PROBLEM` ledger row; no console errors |
| Browser, 390                             | The hints panel at full width, no overflow                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Screenshots: `docs/screenshots/wi-032/`.

## Owner steps

1. **Before merging**, apply the migration to production from your own terminal, as with WI-031 (`read -rs` for the Supabase URL, then `pnpm db:deploy`).
2. **After the deploy**, keep a card or two in Grill Me. When their item is due for revision, the deck appears on Today. Try **Hints** on a Practice problem.
