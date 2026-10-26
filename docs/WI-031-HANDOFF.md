# WI-031: AI foundation and Grill Me

Date: 2026-10-26. Branch `feat/wi-031-grill-me` from `main` `ec66222` (R4). This is Phase 3 of the Version 2 plan (`docs/product/v2-plan.md`, sections 5 and 8), built on ADR-021 and ADR-022. It adds one migration.

## Outcome

### Grill Me

**Where it appears.** An open roadmap item shows **Grill me** in its action row (key `g`). The button appears only when all of these hold:

- The server has `OPENROUTER_API_KEY`.
- The owner left Grill Me on in Settings.
- The provider check is not blocking.
- The roadmap allows Study AI.
- The item is not test-named.

**The panel.**

1. **What will be sent** shows the exact JSON the request will carry, built by `studyInput`:
   - **Fields:** title (120), scope (300) and "done when" (240) are ticked by default. Reference names (5 × 80, without links) are unticked.
   - **Your note** is a locked checkbox: never sent.
   - **Below the payload:** the model, the endpoint and the month's spend, for example "Claude Haiku 5.5 · Google Vertex, zero data retention · under US$0.01 of US$3 used this month".
   - **Title only:** an item with only a title says "Add a scope or 'done when' line for better questions" instead of offering Send.
2. **Send and start** makes one request, and at most one retry when the answer does not match the schema.
3. **Five rungs, one at a time.** Each shows the question and the constraint that changed, plus a "Think first" box that stays on the device.
   - **Reveal** (Space) shows three to five points a strong answer covers.
   - **Had it / Partly / Missed** (1–3) are marks kept in the panel only.
   - **Keep as card** (K) saves the rung as a `RevisionCard` on the item.
   - **Next rung** (N) moves on.
4. **The end** shows the counts, "These marks are not saved", and the item's **Done** or **Mark revised**. Nothing is marked automatically.

Closing the panel clears the scratch text and the marks. Kept cards show under the item as **Kept cards · N**, with **Remove card** and Undo.

**Settings → Data → Grill Me** shows:

- The model and endpoint.
- The month's spend, the US$3 stop and the reset date.
- When the provider was last checked, and a block reason if any.
- A switch for "Offer Grill me on roadmap items" and **Check the provider again**.
- The three rules in plain words.

**Edit roadmap** has the **Study AI** switch.

### The foundation (ADR-022)

**Request.** One model (`anthropic/claude-haiku-5.5`) on one endpoint (`google-vertex/global`), sent with:

- `provider: { order: [endpoint], only: [endpoint], allow_fallbacks: false, zdr: true, data_collection: "deny", require_parameters: true }`.
- A strict JSON schema and `max_tokens: 900`.
- No `models` array and no `temperature`, because the endpoint does not support it and the request would not route.
- A 20 s timeout.

**Ledger and limits** (`AiUsage`, content-free):

- Each call is reserved under the owner lock before it is sent: its input estimate plus the full output ceiling.
- The call is refused when the month (in the owner's timezone) would pass **US$3**.
- It is also refused past 20 calls an hour or 60 a day.
- After the call, the row settles to OpenRouter's reported cost, or the tokens at the pinned prices.
- The OpenRouter key's own hard limit is US$5.

**The provider check** (`evaluateProvider`) reads OpenRouter's public endpoint and ZDR lists, without the key. The pinned endpoint must:

- be ZDR-listed,
- offer strict structured outputs and every parameter Silsila sends,
- cost no more than pinned.

The check runs before the first use and whenever the last one is more than 36 hours old. It also runs once a day from the notifications cron (`JobRun` `ai-provider-check`). A failure blocks Grill Me. Only the owner's **Check the provider again** lifts a block, and only when it passes.

**Answer from another provider.** The call is counted and Grill Me is blocked the same way.

**Logs.** Only these lines appear:

- `[study] grill made {model, provider, tokens, ms}`
- `[study] grill failed <ErrorClass>`
- `[study] provider check failed <ErrorClass>`

### Schema (one migration, `20261026090000_grill_me`)

- `Roadmap.studyAi`, default false. The backfill turns it on for imported roadmaps except "Behavioural and resume". Owner-made roadmaps stay off.
- `AiSetting`: the owner's switch, last check and block.
- `AiUsage`: the ledger, with CHECK constraints that amounts are never negative.
- `RevisionCard`: one per item and question, three to five points, removed with its item.
- Enums `AiFeature` and `AiOutcome`.
- `LATEST_MIGRATION` is bumped.
- The export includes `revisionCards` and `ai.setting`/`ai.usage`.
- New imports set Study AI on except for the behavioural roadmap, and never overwrite an existing roadmap's choice.

### Also changed

- **Escape on the roadmap** closed the side panel _and_ the open item. The page shortcuts now ignore a key a side panel already handled (`event.defaultPrevented`). This was an existing bug, found while testing Grill Me.
- **`/privacy`** now says what Grill Me sends, to whom, and that no prompt or answer is stored.
- **`pnpm openrouter:fake`** (`tests/support/fake-openrouter-server.ts`, port 4466) is a loopback stand-in for local browser checks. To use it locally, set `OPENROUTER_API_KEY` to any `sk-or-…` placeholder and `OPENROUTER_API_URL=http://127.0.0.1:4466/api/v1` in `.env`.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/features/ai/{domain,service,actions}.ts`, `src/features/ai/{grill,settings}.tsx`, `prisma/migrations/20261026090000_grill_me/`, `tests/ai-domain.test.ts`, `tests/ai-database.test.ts`, `tests/ai-config.test.ts`, `tests/grill-me-migration.test.ts`, `tests/support/fake-openrouter-server.ts`, `docs/screenshots/wi-031/`                                                                                                                                                                              |
| Changed | `prisma/schema.prisma`, `src/lib/env.ts` (`aiConfig`), `src/server/health.ts`, `src/server/export.ts`, `src/features/roadmap/{item-list.tsx,forms.tsx,domain.ts,service.ts,actions.ts}`, `src/app/roadmap/[id]/page.tsx`, `src/app/settings/page.tsx`, `src/app/api/notifications/process/route.ts`, `src/features/undo/service.ts` (`restore-card`), `src/components/shortcuts.tsx`, `src/app/privacy/page.tsx`, `scripts/lib/roadmap-import.ts`, `src/app/globals.css`, `package.json`, `.env.example`, docs |

## Verification

| Check                                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prisma format, lint, typecheck, build, docs, diff check | Pass, on an export of the working tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm test:ci` (disposable database)                    | 60 files, 410 tests pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| New tests                                               | Domain 14: allowlist property test over 300 seeded items, request shape, ladder schema, budget and DST, provider check. Database 8. Config 3. Migration upgrade 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Migration                                               | Fresh deploy clean, `migrate diff --exit-code` = 0, seed run twice. The upgrade test showed Study AI on for an imported roadmap and off for the behavioural and owner-made ones, the CHECK constraints refusing bad values, and cards removed with their item                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Browser (fake OpenRouter), desktop light                | The panel showed the exact payload. Unticking Scope removed it from the preview. Send gave five rungs. Space, 2 and K revealed, marked Partly and kept a card, which appeared under the item. The end screen offered Done. The cap message read "This month's AI budget is used. Grill Me returns on Nov 1." with **no** request sent (the fake logged one chat in total). Check again passed. The Behavioural roadmap had no Grill me. Without a key there was no Grill me, Settings said "Not configured on this server", and kept cards stayed. Remove card then Undo restored it. The ledger row held model, endpoint, tokens, cost and time only, and the server log held one `[study] grill made` line with counts |
| Browser, 390 and dark                                   | The panel was full width with no overflow. Dark mode read well                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Not verified                                            | A real OpenRouter call. It needs the owner's key on Render (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Owner steps

1. **Before merging**, apply the migration to production from your own terminal, the same way as WI-028 (`read -rs` for the Supabase URL, then `pnpm db:deploy`).
2. **After the deploy**, in Render → `silsila` → Environment, add `OPENROUTER_API_KEY` yourself. Use the key with the US$5 monthly limit, and never paste it anywhere else. Render redeploys.
3. **On usesilsila.me**, open Settings → Data → Grill Me and press **Check the provider again**. Then try Grill me on one System design or DSA item. If the roadmap material was never imported in production, no roadmap has Study AI yet: turn it on under Edit roadmap.
4. **Rate ten ladders on ten items** (plan section 1). If they feel generic, Sonnet 5.5 on the same Vertex endpoint family is the step up, recorded in ADR-022 first.
