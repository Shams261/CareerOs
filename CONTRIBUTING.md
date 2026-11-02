# Contributing to Silsila

Silsila has one owner and is built in small work items. Start with [setup](README.md#local-setup) and the [engineering handbook](docs/README.md). Use Node.js 24 and the pnpm version in `package.json`. Tests and browser checks use disposable databases only; never point them at the personal database or a real Google account.

## Work item workflow

1. **Name it.** One work item, `WI-NNN`, one outcome. Read the relevant code, `prisma/schema.prisma`, migrations, tests and ADRs first, and pick the smallest correct change.
2. **Branch** from current `main`: `feat/wi-NNN-short-name`, `fix/…` or `chore/…`.
3. **Build inside the existing boundaries.** Pure rules in a domain file, writes in a service under the owner lock, the owner resolved on the server and never taken from the browser, planned and actual time kept apart. Create database clients only through `src/lib/database.ts` (UTC sessions, ADR-009); store instants as `timestamptz` and calendar labels as `DATE`.
4. **Schema changes** get a new migration (existing ones are immutable), an upgrade test from the previous migration, a drift check, the seed run twice, and a bump of `LATEST_MIGRATION` in `src/server/health.ts`. Keep a migration expand-only: the running code must still work once it is applied, because it is applied to the personal database before the merge (verified backup first, [checklist](docs/engineering/backup-restore.md)).
5. **Tests** cover the changed rules (pure tests) and invariants (database tests). Existing tests are contracts: never delete or weaken one to make new work pass.
6. **Docs in the same change:** a changelog entry under "Unreleased" (what the owner sees and the migration name, three lines at most), the status lines in `CLAUDE.md`, an ADR when a decision changes, and `docs/WI-NNN-HANDOFF.md` with the gate results and any owner steps. When the new handoff lands, the oldest of the last ten leaves `docs/` ([HISTORY](docs/HISTORY.md)).
7. **Push the branch** and wait for its Quality run (lint, tests, build, image, e2e) to be green (WI-138), then **merge** with `git merge --no-ff` into `main` and push. Render deploys `main` only after CI passes on the merge commit. No force-push to `main`; roll back with reviewed revert commits.

Commit subjects follow Conventional Commits (`feat(scope): …`, `fix:`, `docs:`, `chore:`). Never commit secrets, dumps, build output, screenshots of the personal workspace or real personal fixtures; local audits, mocks and PDFs go in `output/` (ignored).

## The gate

```sh
pnpm exec prisma format
pnpm db:generate
pnpm lint
pnpm typecheck
# TEST_DATABASE_URL and DATABASE_URL set to the same fresh, migrated disposable database:
pnpm test:ci
pnpm build
pnpm test:e2e            # UI work; CI runs it on every push, branches included
pnpm test:e2e:safari     # UI work, WebKit; CI runs it weekly (WebKit workflow)
pnpm docs:check
git diff --check
```

`pnpm test` skips database suites without `TEST_DATABASE_URL`; it is not release evidence on its own. UI work is also checked in a browser at about 1440 and 390 px, light and dark: no console errors, no horizontal overflow, axe clean.

## Review checklist

Owner scoping and the session boundary, validation, the lock and transaction, DST and DATE handling, empty and error states, Undo for every write that hides something, one primary per page, keyboard and phone behaviour, what reaches an AI model (ADR-022, ADR-024, ADR-030), log vocabulary ([security](docs/engineering/security.md)), and docs. A green build does not prove data safety or accessibility.
