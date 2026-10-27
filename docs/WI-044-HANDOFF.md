# WI-044: Security upgrade (P0 from the UAT audit)

Date: 2026-10-27. Branch `fix/wi-044-security-upgrade` from `main` `2ef499d` (WI-043). This is the first P0 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, section 9). No product change, no migration.

## Why

`pnpm audit --prod` found 20 advisories. Two were critical, in Next.js 16.3.6:

- GHSA-2464-fhr4-w9xw: unauthenticated remote code execution in Image Optimization;
- GHSA-673q-mjm6-r5xr: unauthenticated remote code execution in `use cache`.

There were also highs: SSRF in Image Optimization, a Server Action DoS, zod memory exhaustion, sharp and source-map-js. `/_next/image` sits outside the auth proxy and answered anonymously in production.

## What changed

| Package                                          | Before  | After             |
| ------------------------------------------------ | ------- | ----------------- |
| `next`, `eslint-config-next`                     | 16.3.6  | 16.4.3            |
| `zod`                                            | 4.6.5   | 4.6.7             |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg` | 7.10.0  | 7.10.1            |
| `vitest`                                         | 5.0.1   | 5.0.5             |
| `source-map-js` (via next › postcss)             | < 1.2.2 | ≥ 1.2.2, override |
| `fast-uri` (via the Prisma CLI's ajv)            | 3.1.8   | ≥ 3.1.9, override |
| `vite` (via vitest, dev only)                    | 8.3.0   | ≥ 8.3.3, override |

Result: `pnpm audit` reports **no known vulnerabilities**, in production and development dependencies.

**So it does not happen again:**

- CI runs `pnpm audit --prod --audit-level high` right after installing, so a high or critical production advisory fails the build.
- `.github/dependabot.yml` opens weekly npm update pull requests (minor and patch grouped) and monthly GitHub Actions updates. The owner reviews and merges them; nothing merges on its own.

Docs: `docs/engineering/security.md` (Dependencies) and the CHANGELOG.

## Verification

Lint, typecheck, build, docs and diff check pass on an export of the working tree; `pnpm test:ci`: 85 files, 522 tests; `pnpm audit`: no known vulnerabilities. Next.js 16.4 needs no code changes here: the build, typecheck and every test pass unchanged, and the Next 16 upgrade guide in `node_modules/next/dist/docs` lists no breaking change from 16.3 that this app uses.

## Owner steps

1. Merge, then confirm the deploy on Render and `https://usesilsila.me/api/health`.
2. Watch for Dependabot pull requests on Mondays; merge them when CI is green.
