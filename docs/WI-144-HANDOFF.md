# WI-144 handoff: study with Rumi

Date: 2026-11-02. The owner chose a single way to get study help: "Rumi hi rakhte hain". The choices were:

- Grill Me and Listen move inside Rumi, keeping their engines;
- Copy the study prompt stays.

No migration. ADR-022 is amended.

One rule shaped the design. Grill Me and Listen store nothing (ADR-022, ADR-023); only Keep as card keeps rungs. So the tools open in Rumi's drawer as a card that is not part of the stored conversation, rather than as Rumi messages.

## What changed

- **A roadmap item** (`src/features/roadmap/item-body.tsx`) shows the Copy the study prompt card and, beside it, an **Ask Rumi** card (new UI, written in Tailwind). The card shows where Study AI is on for the roadmap and the AI check holds, as Grill me did before. It has three chips:
  - **Grill me on this**, where Grill me was offered. It keeps `data-grill-open`, so ⌘K's Grill me and the row shortcut still press it.
  - **Read it to me**, where Listen was offered (references on listed sites). It keeps `data-listen-open`.
  - **Explain it**, always. It sends Rumi one question built from the item's title and scope (`explainQuestion`).
  - The two side panels (`grill:<id>`, `listen:<id>`) are gone.
- **The handover** (`src/lib/rumi.ts`): `studyWithRumi(request)` sends the item's study fields (id, title, scope, "done when", references), the budget line and the revision state as a browser event.
  - The drawer (`drawer.tsx`) opens and either shows the card or, for Explain it, hands the question to the chat the way Ask Rumi does.
  - `AGENT_NAME` and `DRAWER_FLAG` moved into this kernel module (`agent/constants.ts` and `agent/events.ts` re-export them). The roadmap can then open Rumi without importing it, which would have made a new two-way pair; `tests/boundaries.test.ts` holds the list at 13.
- **The card** (`src/features/agent/study-card.tsx`, `StudyCard`) sits in the chat after the messages: "Rumi · Grill me · <item>" or "Read it to me · <item>", with a ×.
  - It renders the existing `GrillMe` or `Listen`, loaded on demand with `next/dynamic`, so the drawer on every page stays light.
  - Nothing on it is stored; Keep as card still keeps rungs.
- **Escape.** With the drawer open and the focus on the page behind, Escape closed the drawer and the open roadmap item together. Now:
  - the drawer takes Escape first in the capture phase and stops it from reaching the page;
  - page shortcuts ignore any key pressed inside a dialog;
  - inside the drawer, the composer's Escape still drops what the microphone heard.
- **Tests:** a browser journey, "a roadmap item is studied with Rumi". It turns Study AI on in Edit roadmap, then checks the Ask Rumi card beside Copy the study prompt, the Grill me card in the drawer with "What will be sent", the card closing, Escape closing only the drawer, and Explain it arriving as the owner's question. Axe passes.

## Owner step

A roadmap you make has Study AI off. Turn it on in the roadmap's More → Edit roadmap → "Study AI: allow Grill Me on this roadmap's items". The curriculum roadmaps follow their own setting.

## Gate

prettier, lint, typecheck, knip, `test:ci --coverage` on a fresh database, build, `test:e2e` and `test:e2e:safari`, docs:check, `git diff --check`; screenshots at 1440 and 390 px show no overflow and no console error. The branch is pushed and green before the merge.
