# WI-045: Fresh start

Date: 2026-10-27. Branch `feat/wi-045-fresh-start` from `main` `fdc7c46` (WI-044). This is the second P0 of the UAT audit (`output/Silsila-UAT-Audit.pdf`): production holds only test and acceptance data, so Today, Rumi and the nudges had nothing true to work with. The owner confirmed on 2026-10-27 that the data is all mock, and chose to keep the imported curriculum and the connections. No app change, no migration.

## Outcome

`scripts/fresh-start.sql` is an owner-run reset in one transaction.

**Deletes:**

- what the owner did: routines, daily plans and blocks, sessions, check-ins, weekly reviews and priorities, notes to self, inbox reminders, calendar sync conflicts;
- applications with their rounds, prep items, activity, job resources and prep docs;
- practice attempts, learning activity, revision cards;
- Ask Rumi conversations and messages, "Rumi knows" lines, "Rumi noticed" answers;
- every roadmap, roadmap item, practice problem, DSA topic, learning subject or topic and goal named as test data.

**Resets** what remains of the curriculum to zero:

- roadmap items: Not started, no revision, no "asked", no note;
- practice problems: unattempted and Red;
- learning topics: zero mastery and no review date;
- the current topic and the Day Print answer.

Imported scope, "done when", references, slugs and problem notes from the import stay, so a later `roadmap:import` still matches.

**Keeps:** the user and sign-in sessions, push devices, notification preferences, Study nudges and AI settings, the AI cost ledger (the US$3 month keeps counting), the Google Calendar connection and watch channel, job runs, maintenance records, the migration history and non-test goals.

**Safety:**

- It refuses unless the database holds exactly one user, and running it twice is harmless.
- It prints counts to read before the commit.
- Test names use the same rule as `isTestNamed`, written as a PostgreSQL function; a test checks thirteen names against the TypeScript rule.

## Verification

`tests/fresh-start-script.test.ts` (3 tests) runs the script on a fresh migrated schema with every table populated, including test-named records. It checks:

- that the deleted tables are empty and the kept ones remain;
- the exact reset values of the item, problem, topic, goal and user rows;
- that a second run is harmless;
- parity with `isTestNamed`;
- the refusal with two users.

Gate: lint, typecheck, build, docs and diff check pass on an export of the working tree; `pnpm test:ci`: 86 files, 525 tests.

## Owner steps (production)

Runbook: `docs/engineering/backup-restore.md` → "Fresh start, keeping the curriculum".

1. Back up and verify the restore.
2. In the app, turn the test routine off (Plan → Routines), confirm the preview, then Settings → Sync now.
3. Run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/fresh-start.sql` and read the counts.
4. `pnpm data:check` reports nothing; `/today` opens empty.
5. Set up for real: routines, study kinds and nudges, Study AI on the roadmaps, real applications, two or three "Rumi knows" lines.

## Production run (2026-10-27)

- Backup `backups/careeros-2026-10-27T15-09-18-884Z.dump` (271.8 KiB), restore verified on Docker PostgreSQL 17 with the libpq `pg_restore` 18.
- The test routine was turned off in the app (blocks of 28–30 October cancelled) and synced: healthy, 0 pending.
- The script ran and committed: 716 roadmap items and 219 problems reset; `pnpm data:check` reports "Clean: no test-named records."
- Today, Jobs and Practice open on their first-run cards; the five roadmaps read "0 done"; Google Calendar stays connected.
- Left for the owner: past test events (26–27 October and earlier, three manual blocks on 28 October) remain in the Silsila Google calendar as orphans; delete them there.
- The restore verify first ran with Homebrew's `pg_restore` 16, so the runbook now says to use the libpq `PATH` for it too. The script ran before that verify; the backup verified afterwards.
