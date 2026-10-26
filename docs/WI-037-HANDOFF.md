# WI-037: Listen

Date: 2026-10-26. Branch `feat/wi-037-listen` from `main` `b21d4d8` (WI-036). This is the last Version 2 Phase 4 hypothesis (`docs/product/v2-plan.md`, section 6): "audio helps revision on walks".

The plan made it conditional on a grounding pipeline that fetches sources explicitly and shows the passages used. This work item builds that pipeline (ADR-023). There is one migration.

The owner chose a grounded AI script, from official and non-official sources, cross-checked so that quality and legitimacy hold.

## Outcome

An open roadmap item shows **Listen** beside Grill me under the same conditions: AI configured, switched on and not blocked; the roadmap allows Study AI; the item is not test-named. It also needs at least one reference on a checked site.

The command bar offers **Listen · {item}** when you type "listen".

**Before anything is fetched**, the panel shows:

- The item fields to send (title, scope and done-when; the note is never sent).
- The sources to fetch, each marked **Official docs** or **Other source**.
- The references that will not be fetched, with the reason: "not a checked source", "not a secure link" or "more than four sources".
- The model, endpoint and the month's budget.

**Fetch sources and write** then runs these steps:

1. **Fetch.** Up to four of the item's reference links, official first, only over HTTPS on the two site lists in `src/features/listen/domain.ts`.
   - Official: documentation and specifications such as PostgreSQL, MDN, OWASP, the RFCs, Redis and Kubernetes.
   - Secondary: Hello Interview, interviewing.io, Design Gurus, GitHub, Martin Fowler and engineering blogs.
   - YouTube, Reddit, Glassdoor, job boards and Medium are never fetched.
   - Redirects are followed by hand, only to listed sites and at most three. 8 seconds and 1.5 MB at most, HTML or plain text only.
2. **Passages.** Each page becomes readable paragraphs (`paragraphsOf`): no navigation, scripts or code blocks, and inline code keeps its words. The paragraphs sharing the most content words with the item are kept (`pickPassages`): three a page, nine in all, 600 characters each.
   - Before any AI call, Listen refuses if there are fewer than two passages, or no official passage and only one site.
3. **One request** through the Grill Me engine (`ask()`): the pinned Haiku 5.5 on Google Vertex with zero data retention, the ledger (`LISTEN_ITEM`), the US$3 stop, rate limits and the provider check. The prompt allows only facts in the passages, and each line must cite its passage ids.
4. **Cross-check** (`crossCheck`, deterministic):
   - A cited passage counts only if it shares at least two, and 40%, of the line's content words.
   - A line stays when official docs support it, or when two different sites do.
   - Single-non-official-source lines, unsupported lines and anything reading as code or a link are dropped. The panel says, for example, "2 lines dropped: 1 had no supporting passage, 1 had only one non-official source."
   - Fewer than four checked lines means nothing is shown.

**The script** is read by the device's own voice (Web Speech), line by line:

- Play, Pause or Resume, and Stop, with a voice and a speed.
- The line being read is highlighted. Each line has chips (P1, P2) linking to its passages.
- **Passages used** lists each passage with its tier, link, site and fetch time.
- Closing the panel stops the voice.
- Without speech synthesis, the script is there to read.

**Nothing is stored.** The ledger row holds no content. Logs carry counts only: `[listen] sources {fetched, failed, passages}` and `[listen] checked {kept, unsupported, one-source, code}`.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/features/listen/{domain,service,actions}.ts`, `src/features/listen/listen.tsx`, `prisma/migrations/20261026210000_listen/`, `tests/listen.test.ts`, `tests/listen-database.test.ts`, `tests/listen-migration.test.ts`, `docs/screenshots/wi-037/`                                                                                                                                                                 |
| Changed | `prisma/schema.prisma` (`AiFeature.LISTEN_ITEM`), `src/server/health.ts`, `src/features/ai/service.ts` (`ask`, `ready` and `UNAVAILABLE` exported, a failure message per feature), `src/features/roadmap/item-list.tsx`, `src/app/roadmap/[id]/page.tsx`, `src/features/command/service.ts`, `src/app/privacy/page.tsx`, `src/app/globals.css`, `tests/support/fake-openrouter-server.ts`, ADR-023, security doc, docs |

## Verification

| Check                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check  | Pass, on an export of the working tree. `pnpm test:ci`: 73 files, 455 tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Migration                                 | Fresh `migrate deploy` and `migrate diff --exit-code` = 0. The upgrade test keeps earlier `GRILL_ITEM` and `GRILL_PROBLEM` rows and accepts `LISTEN_ITEM`. Seed run twice                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Tests                                     | Domain 8: source lists, HTTPS, order, dedupe and the four-source cap; paragraph extraction (navigation, scripts and code blocks out, inline code kept, entities, plain text); prose versus code; passage picking and caps; the payload; `supports`; the cross-check with every drop reason; the draft shape. Database 3: only listed sources fetched with an off-list redirect not followed, notes and "asked at" never sent, the pinned request, official lines kept and the rest dropped, a `LISTEN_ITEM` ledger row; refusals before any fetch or AI call; nothing shown when too little survives |
| Browser, desktop (real fetch, fake model) | HTTP semantics: the preview listed RFC 9110 and MDN as official and the YouTube playlist as not fetched. Fetch sources and write produced 6 checked lines from RFC 9110 and MDN, each with its chip, and dropped the fake model's invented line. Play read the script with the line highlighted; closing the panel stopped the voice. The ledger got a `LISTEN_ITEM` row. No console errors from the app                                                                                                                                                                                             |
| Browser, 375                              | Browser-to-backend security boundary (OWASP and MDN): 8 checked lines, the panel at full width, no overflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Screenshots: `docs/screenshots/wi-037/`. The model was the local fake, so script quality is checked live.

## Owner steps

1. **Before merging**, apply the migration to production from your own terminal, as with WI-031 and WI-032 (`read -rs` for the Supabase URL, then `pnpm db:deploy`).
2. **After the deploy**, open a roadmap item with documentation references, press Listen, then Fetch sources and write, and play it. The plan's test is to rate five scripts useful before relying on Listen.
