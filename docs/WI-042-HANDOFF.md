# WI-042: Interview prep doc

Date: 2026-10-27. Branch `feat/wi-042-prep-doc` from `main` `b217fac` (WI-041). This is the seventh item of the Rumi plan (`docs/product/rumi-plan.md`), under ADR-024's search rules: Exa through the `web` plugin, code-built queries, at most eight searches, a 3,000-token output ceiling, and sources marked Official or Other. One migration.

## Outcome

**Prepare with Rumi** appears on an open application's page, beside Contacts. It is not shown for test-named applications or without the AI key. The side panel first shows what will happen:

- **Searched on the web:** the exact searches (up to six), built only from the company, the role and the upcoming round types, such as "Northwind Backend Engineer system design interview questions". These words are all Exa ever sees.
- **Sent to write the doc:**
  - what the searches found, with their links;
  - the rounds (title, type, date);
  - up to 60 roadmap item titles from roadmaps with Study AI on, and up to 40 problem titles.
  - "Your notes: never sent, nor contacts, compensation or reflections."
- An optional tick: **Also send the job description**. It goes to the writing call only, never to a search.
- The cost, about US$0.06, and "takes about half a minute".

**Research and write** (`writePrepDoc` in `src/features/prep/service.ts`):

1. Runs the searches in parallel. Each is one request on the pinned zero-retention endpoint with the `web` plugin (Exa, three results), reserved in the ledger as `PREP_RESEARCH`. If another provider answers, AI is blocked and nothing is written.
2. Keeps the searches that answered and numbers their cited pages S1, S2… (HTTPS only, deduplicated). It needs at least two answering searches and two sources.
3. Asks for the doc in one strict-format call (`PREP_FORMAT`). The notes carry their source ids, and the owner's items are named R1… and P1….
4. Keeps only what is grounded (`readPrepDoc`):
   - every point, round and topic must cite a real source id;
   - links must name the owner's own items;
   - the plan keeps days 1 to 7, once each.
   - With fewer than three sourced points, the doc is retried once and then refused.
5. Stores the doc with only its cited sources, and opens it.

**The doc** (`/jobs/[id]/prep/[docId]`):

- **Process**, **What each round tests**, and **Topics, and where they are in your study**. Topic links open the roadmap item or the problem.
- **Seven days**, with **Plan this with Rumi**. That hands "Plan my next days from my Northwind prep doc" to Ask Rumi, which reads the doc with the new `get_prep_docs` tool and proposes blocks as in WI-041.
- **Questions to ask**.
- **Sources**, each with its title, site and "found <date>", marked **Official** (the company's own domain, or the job posting's host) or **Other**, with "Other sources are not checked by the company; weigh them as such."
- **Delete this doc**, which returns to the application.

**Limits:** five docs a day. Every search and the writing call sit inside the shared US$3 month. Grill Me's per-call limits no longer count prep calls.

**Privacy:** `/privacy` names Exa as a third party without a zero-retention promise and says what it sees. `security.md` describes the flow. Logs are counts only.

## Differences from the plan

- **Six searches, not eight.** That is enough for the process, the round types, experiences and values, and it keeps a doc near US$0.06.
- **The seven-day plan is text with links, plus Plan this with Rumi,** not blocks with times. Rumi plans only today to Sunday, so it turns the doc's days into proposals one day at a time, checked against the real day.
- **A chat request hands over in words.** Rumi tells the owner to use Prepare with Rumi on the application, since it cannot search the web itself.

## Changes

| Area    | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `prisma/migrations/20261027150000_prep_docs/`, `src/features/prep/{domain,service,actions}.ts`, `src/features/prep/panel.tsx`, `src/features/agent/ask-button.tsx`, `src/app/jobs/[id]/prep/[docId]/page.tsx`, `tests/prep-domain.test.ts`, `tests/prep-database.test.ts`, `tests/prep-docs-migration.test.ts`, `docs/screenshots/wi-042/`                                                                                                                                                   |
| Changed | `prisma/schema.prisma` (`InterviewPrepDoc`, `AiFeature.PREP_RESEARCH`), `src/features/ai/service.ts` (`ask()` takes its words; per-call limits skip `PREP_RESEARCH`; answers carry annotations), `src/features/agent/{domain,tools}.ts` (`get_prep_docs`), `src/app/jobs/[id]/page.tsx`, `src/server/{export,health}.ts`, `src/app/privacy/page.tsx`, `src/app/globals.css`, `tests/agent-database.test.ts`, `tests/support/fake-openrouter-server.ts`, `docs/engineering/security.md`, docs |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree. `pnpm test:ci`: 83 files, 513 tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Migration                                | A fresh `migrate deploy`, and `migrate diff --exit-code` = 0. The upgrade test keeps applications, accepts `PREP_RESEARCH`, refuses a doc without searches, and cascades with its application. Seed run twice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Tests                                    | **Domain 7:** the searches use only the company, the role and round types, at most six, sent alone with Exa on the pinned endpoint. Official covers the company's name as a host label or the posting's host, never a look-alike. Sources are deduplicated and HTTPS only. The doc keeps sourced points and real links only, refuses a thin doc or broken JSON, and sends the job description only when given. **Database 6:** five searches carry no PRIVATE marker; the writing call carries none either but gets the round title and the owner's items; the doc links the owner's problem and item and marks the company's site Official; six ledger rows; the cost is stored. The job description reaches the writing call only when ticked, never a search. Empty searches or an ungrounded doc write nothing. Another provider blocks AI before writing. The preview's counts are right, and the sixth doc of a day is refused. Docs are owner-scoped, readable by Rumi, exported and deletable |
| Browser, desktop (fake OpenRouter)       | The panel listed five searches, "1 round: title, type, date", the study counts, the job description tick and "About US$0.06". Research and write opened the doc: Process, What each round tests, and Topics with source chips and links to the owner's items. The fake's unsourced point and invented link were dropped. Seven days with Plan this with Rumi, which opened Ask Rumi with the question and a plan card. Questions; Sources with Official (northwind.jobs) and Other. Delete returned to the application. A test-named application shows no Prepare card. axe was clean on the panel and the doc                                                                                                                                                                                                                                                                                                                                                                                        |
| Browser, 375                             | The doc at full width, no horizontal overflow, axe clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Screenshots: `docs/screenshots/wi-042/`.

## Owner steps

1. **Before merging,** apply the migration to production from your own terminal, as before (`read -rs` for the Supabase URL, then `pnpm db:deploy`).
2. **After the deploy,** open a real application with an upcoming round and press Prepare with Rumi. Check the searches in the preview first. One doc costs about US$0.06.
3. Read the sources: Official ones are the company's own site; weigh Other ones yourself. Rate the doc for the plan's measure: kept or deleted, and whether you used its seven days.
