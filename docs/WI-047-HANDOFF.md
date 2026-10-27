# WI-047 handoff — interview formats

Date: 2026-10-28. Branch `feat/wi-047-interview-formats` from `main` `281214b` (WI-046). This is the first P1 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, section 7). Interviews in 2025–2026 add code review, bug squash, practical and AI-assisted rounds, and AI is allowed in some and banned in others. Silsila could not record either, so nothing pointed the owner at the right practice. The imported curriculum already had the material, but it sat at the bottom of long lists:

- 13 format guides in Technical mastery;
- 11 practical tasks and 6 drills in DSA patterns;
- a behavioural section per company.

## What changed

**Schema** (migration `20261028090000_interview_formats`):

- `InterviewType` gains `AI_ASSISTED`, `CODE_REVIEW`, `DEBUGGING` and `PRACTICAL`.
- A new enum `AiPolicy` (`UNKNOWN`, `ALLOWED`, `NOT_ALLOWED`) backs `InterviewRound.aiPolicy`, which defaults to `UNKNOWN`.
- `JobApplication.formats` is an `InterviewType[]`, empty by default.
- Existing rows read as before. `LATEST_MIGRATION` is bumped.

**Rules** (`src/features/jobs/formats.ts`, pure):

- **`typeLabel`** names every round type. The older types keep the text `label` gave them, because a round's default title is its type.
- **`practiceFormats`** is the eight formats worth practising: Coding, AI-assisted, Code review, Bug squash, Practical, System design, Behavioral and Assessment. Recruiter, Hiring manager, Final and Other are not formats.
- **`FORMAT_PRACTICE`** maps each format to a guide item (a `format-*` slug in Technical mastery) and drill sets, chosen by roadmap title, section, slug prefix, P0 problem items, or the company's own `Company: …` behavioural section (`companyMatches`, matched by whole words).
  - These are the import's stable keys, so no new import is needed.
  - Material the owner does not have simply does not show.
- **`loopFormats`** joins the ticked formats with the types of rounds still to come, in a fixed order. It gives each format its next round date, plus an AI rule only when those rounds agree.
- **`formatPractice`** finds the guide and the first item not done, and counts done and total. Each set stays in roadmap order, and an item is counted once.

**Service:**

- `loopPractice` reads the matching items in one query, owner-scoped and leaving out archived roadmaps.
- `saveFormats` saves the ticks under the owner lock, without duplicates.
- `scheduleRound` and `updateRoundDetails` store `aiPolicy`.

**Application page** (`src/app/jobs/[id]/page.tsx`, open applications only):

- An **Interview formats** card. Each format row reads "Round Nov 4 · AI allowed · 0 of 11 done" and links to **What it tests** and **Next: …**. A problem item opens Practice, anything else opens the roadmap item.
- **Set formats** / **Edit formats** opens a side panel with checkboxes (`FormatsForm`).
- A round line reads "AI-assisted coding · AI allowed · Wed, Nov 4 · 14:00–15:00".
- The add and edit interview forms offer the new types, in the owner's words, and **AI in this round**.

**Elsewhere:**

- **Rumi (`get_jobs`)** adds `formats` and each round's `ai` only when the owner set them, and its description says to practise the formats of the next interviews first.
- **Prep docs:** the searches include the ticked formats as fixed words ("code review interview"), and the writing call gets them plus each round's AI rule. Nothing personal is added.
- **Counts:** Weekly review and the job summary count the new types as technical rounds.
- **Look Back** has words for the new types.
- **Docs:** `security.md` is updated.

## Tests

| File                                            | Covers                                                                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/interview-formats-domain.test.ts` (5)    | labels, `companyMatches`, `formatPractice` per format (P0 problems only, company section first, empty), `loopFormats` (order, cancelled and past rounds out, disagreeing AI rules), the new search words |
| `tests/interview-formats-database.test.ts` (4)  | round type and AI rule kept and edited; formats saved for the owner only and refused for Recruiter; the loop pointed at the owner's own items (another owner gets none); Rumi's `get_jobs`               |
| `tests/interview-formats-migration.test.ts` (1) | upgrade from `20261027180000_rumi_noticed`: existing rows read `{}` and `UNKNOWN`, the new values are accepted, unknown ones refused                                                                     |

A clean `prisma migrate deploy` on a fresh database and the drift check (`migrate diff --exit-code`) pass.

## Browser check (local, `silsila_dev_empty`, migrated)

- **1440 px**, Northwind Labs:
  - Set formats with Code review, Bug squash, System design and Behavioral showed four rows, each with What it tests and Next.
  - Adding an AI-assisted round on Nov 4 with AI allowed added "AI-assisted coding · Round Nov 4 · AI allowed · 0 of 11 done", and the round line reads the same.
- **390 px:** rows stack, links wrap, and nothing overflows.
- No errors from the app. The only console lines were stale HMR socket retries from a restarted dev server.

## Production

The owner applies the migration before the merge, as with earlier migrations:

1. Set the URL:
   `read -rs "DATABASE_URL?Supabase URL: " && export DATABASE_URL DATABASE_SSL=no-verify && echo ok`
2. Apply it: `pnpm db:deploy`
3. Clear the URL: `unset DATABASE_URL DATABASE_SSL && echo cleared`

Then merge. `/api/health` reads `schema: current` once the new image is live.

## Not in this item

- The weekly mix and the "Ready by January" view (next P1).
- A Today row for the next interview's formats.

## Gate

Prisma format, lint, typecheck, build and docs check (85 files) pass on an export of the working tree. `pnpm test:ci`: 90 files, 541 tests. A fresh `migrate deploy`, the drift check, the seed twice and `verify-seed` (28 tables) pass. `git diff --check` is clean.
