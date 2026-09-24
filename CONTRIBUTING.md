# Contributing to CareerOS

Start with the [engineering handbook](docs/README.md) and [setup](README.md#local-setup). Use Node.js 24 and the pnpm version in `package.json`. Use a disposable PostgreSQL database for automated tests; tests invoke notification processing and must never target production.

## Story-to-release workflow

1. Open a user story with a stable `US-xxx` ID (or bug referencing an existing story). Define outcome, acceptance criteria, exclusions, relevant NFRs and test plan before coding.
2. Create a short branch from current `main`, e.g. `feat/us-023-session-corrections`, `fix/us-013-session-race`, or `docs/architecture-update`.
3. Keep changes cohesive. Use Conventional Commit subjects (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Explain why and migration implications in the body when useful. Never commit secrets, dumps, build output or real personal fixtures.
4. Extend the existing feature boundaries. Resolve owner on the server, validate input, preserve planned/actual separation, and use transaction locks for execution writes. No direct browser-to-database access.
5. Add focused domain/integration tests for changed invariants. New migrations must preserve data, include constraints/indexes, and be tested from a clean database and against upgrade fixtures. Never edit an already shipped migration; add another migration.
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

`pnpm test` can skip database suites when `TEST_DATABASE_URL` is absent. It is useful locally but is not sufficient release evidence by itself. `pnpm test:ci` requires a PostgreSQL test URL and runs the full suite. Browser smoke coverage was performed for WI-002 but is not yet committed as portable automated CI coverage; do not imply that the CI workflow verifies visual or end-to-end behavior.

## Review checklist

Check acceptance criteria, ownership/auth boundaries, validation, concurrency, DST, errors and empty states, migrations, changed performance characteristics, keyboard/mobile behavior, and docs. A green build does not prove data safety or accessibility. Keep product behavior and deployment claims honest.

## Repository settings

The supplied workflow and CODEOWNERS file are repository content. The maintainer should configure a `main` ruleset requiring PRs, the `quality` check from the Quality workflow, a reviewer when another engineer is available, resolved conversations, and blocked force pushes/deletions. These settings are not automatically enabled by committing this document. Apply a solo-maintainer review policy that can actually be followed; revisit it when hiring. No open-source license has been selected by this change.
