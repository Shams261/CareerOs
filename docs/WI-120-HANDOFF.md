# WI-120 handoff: repo cleanup

Date: 2026-11-02. The first "Now" item of the full audit (`output/Silsila-Full-Audit.pdf`, page 7). Docs and configuration only: no code, no migration, no behaviour change.

## What changed

- **Archive tag.** `docs-archive-2026-11-02` (annotated, on `main` at 2b60807) keeps the whole tree before the cleanup. `docs/HISTORY.md` lists what moved there and how to read it.
- **Removed from `main` (287 files):** 162 screenshots and the design review, 114 handoffs (WI-002 to WI-110, WI-005.1, WI-008.1 to .3, R5, V2-R1-R3), the consistency plan, `v2-plan.md`, `rumi-plan.md`, `user-stories.md`, `user-flows.md`, `data-flows.md`, the NFR register, `scripts/r5-spike.ts`, `components.json`, `public/brand/README.md` and `heroku.yml` (the Heroku alternative retired, ADR-014 addendum). `docs/WI-012-HANDOFF.md` stays: the published curriculum links to it.
- **Rewritten:** `README.md` (pitch, setup, commands, data and time; the per-WI model sections are gone), `docs/README.md` (a short index), `docs/architecture/overview.md` (runtime with AI and Calendar, code layers, the owner row lock, time storage, failure boundaries), `CONTRIBUTING.md` (the WI workflow and the gate), `CLAUDE.md` (96.5 KB to about 26 KB: a status block and a code map; invariants, rules and commands kept).
- **New:** `docs/architecture/features.md` holds the feature descriptions that were in CLAUDE.md, fact-checked (23 Rumi tools, `suggest_memory` retired, the roadmap's Continue gone, the reset script replaced) plus WI-104 to WI-119. `docs/HISTORY.md`.
- **Corrected docs:**
  - the backup schedule (Supabase Free keeps no provider backups);
  - `security.md`'s streaming line (WI-119);
  - CLAUDE.md said advisory locks; the code uses a `FOR UPDATE` row lock and a calendar lease;
  - the US$3 stop now carries the WI-114 note in ADR-022, ADR-024, ADR-030 and the Rumi 2 plan;
  - Learn and Ask Rumi in the brand system's navigation line;
  - the roadmap and revision lines in onboarding;
  - operations' "Evidence still needed".
- **Moved in:** `operations.md` gains "Measuring a page's queries". `brand-system.md` gains the design review's five principles and the pending artwork list.
- **Changelog** cut into versions: 3.0.0 (WI-099 to WI-119), 2.0.0 (WI-027 to WI-098), 1.0.0 (WI-003 to WI-026), with 0.1.0 unchanged.
- **Ignores:**
  - `.gitignore` adds `/output/`, `/uat-review/`, `/docs/audit/` and `/.history/`;
  - `.dockerignore` adds those plus `e2e/.auth` and `.claude`;
  - ESLint ignores the audit folders;
  - the two lines in `.git/info/exclude` are gone;
  - the local `docs/audit/` and `uat-review/` folders now live in `output/`.
- **`pnpm brand:icons`** runs `scripts/generate-icons.mjs`.

## Handoff window

From now on `docs/` keeps the last ten handoffs plus WI-012. The next work item's handoff removes `docs/WI-111-HANDOFF.md` in the same commit.

## Owner steps

1. Push the tag with the branch, so the links in `docs/HISTORY.md` resolve: `git push origin docs-archive-2026-11-02`.
2. Done in this session at the owner's request: `output/wipe-production.sql` (a one-time script of 2026-10-28 that deleted the whole workspace) and 13 old plaintext dumps from `backups/` moved to `~/.Trash/silsila-cleanup-2026-11-02/`; the two dumps of 2026-11-01 stay. Empty the Trash when sure; the CI backup keeps encrypted copies.

## Gate

prettier, lint (clean, no warnings now that the audit folders are ignored), typecheck, `test:ci` on a fresh database (146 files, 824 tests), build, docs:check (33 files), `git diff --check`. No browser journeys: nothing the browser renders changed. The `.dockerignore` change is checked by CI's image job.

Before and after: 922 tracked files and 11.71 MB, now 638 files and 5.29 MB. CLAUDE.md: 96.5 KB to about 26 KB.
