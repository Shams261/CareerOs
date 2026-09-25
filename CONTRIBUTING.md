# Contributing to CareerOS

Start with the [engineering handbook](docs/README.md) and [setup](README.md#local-setup). Use Node.js 24 and the pnpm version in `package.json`. Use a disposable PostgreSQL database for automated tests; tests invoke notification processing and must never target production.

## Story-to-release workflow

1. Open a user story with a stable `US-xxx` ID (or bug referencing an existing story). Define outcome, acceptance criteria, exclusions, relevant NFRs and test plan before coding.
2. Create a short branch from current `main`, e.g. `feat/us-023-session-corrections`, `fix/us-013-session-race`, or `docs/architecture-update`.
3. Keep changes cohesive. Use Conventional Commit subjects (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Explain why and migration implications in the body when useful. Never commit secrets, dumps, build output or real personal fixtures.
4. Extend the existing feature boundaries. Resolve owner on the server, validate input, preserve planned/actual separation, and use transaction locks for execution writes. No direct browser-to-database access.
5. Add focused domain/integration tests for changed invariants. New migrations must preserve data, include constraints/indexes, and be tested from a clean database and against upgrade fixtures. Never edit an already shipped migration; add another migration. Create database clients only through `src/lib/database.ts` (UTC sessions, ADR-009). Store instants as `timestamptz` and calendar labels as `DATE`, and name the zone explicitly in any SQL conversion.
6. Update affected stories, NFR evidence, diagrams, ADRs and changelog in the same PR. Record screenshots from non-sensitive test data when UI behavior changes.
7. Open a PR using the template; request code-owner review. Resolve checks and comments before merge. Prefer squash merging routine feature PRs with a meaningful subject; do not force-push `main`.
8. Deploy only using the [operations runbook](docs/engineering/operations.md) after the applicable readiness gates are satisfied.

## Required checks

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm docs:check
# Set DATABASE_URL and TEST_DATABASE_URL to the same disposable test database.
pnpm db:deploy
pnpm test:ci
pnpm build
```

`pnpm test` can skip database suites when `TEST_DATABASE_URL` is absent. It is useful locally but is not sufficient release evidence by itself. `pnpm test:ci` requires a PostgreSQL test URL and runs the full suite. Browser acceptance (Chromium, Firefox and WebKit through the production build and `pnpm google:fake`) is run per work item and recorded in its handoff; it is not yet committed as portable automated CI coverage, so do not imply that the CI workflow verifies visual or end-to-end behavior. Never point browser tests at a real Google account or a personal database.

## Review checklist

Check acceptance criteria, ownership/auth boundaries, validation, concurrency, DST, errors and empty states, migrations, changed performance characteristics, keyboard/mobile behavior, and docs. A green build does not prove data safety or accessibility. Keep product behavior and deployment claims honest.

## Repository settings

The supplied workflow and CODEOWNERS file are repository content. The maintainer should configure a `main` ruleset requiring PRs, the `quality` check from the Quality workflow, a reviewer when another engineer is available, resolved conversations, and blocked force pushes/deletions. These settings are not automatically enabled by committing this document. Apply a solo-maintainer review policy that can actually be followed; revisit it when hiring. No open-source license has been selected by this change.

## CI reuse and checkpoint tags

The quality workflow generates Prisma once and uses Next's production build for the TypeScript check, covering the repository tsconfig. Dependency/compiler caches reuse work; a cache hit never skips tests or migrations. The two seed executions assert that records are unchanged on rerun. Feature branches run on pull requests, main runs after merge, and superseded runs are cancelled. Keep the required check named `quality`.

Use an annotated pre-change tag for major migrations and a verified milestone tag after successful checks. Tags are source checkpoints, not database backups or a production readiness claim. Keep feature commits cohesive; if preserving individual commits matters, use a reviewed merge commit rather than a squash. Roll back shared history with reviewed revert commits. For schema changes, first verify old-code compatibility or plan a forward fix/isolated backup restoration; never assume reverting Git reverses PostgreSQL.
