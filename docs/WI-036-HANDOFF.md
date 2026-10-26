# WI-036: ⌘K command bar

Date: 2026-10-26. Branch `feat/wi-036-command-bar` from `main` `b43b763` (WI-035). This is the fourth Version 2 Phase 4 hypothesis (`docs/product/v2-plan.md`, section 6): "faster navigation". The owner chose to build it now. No migration, no AI, and the bar writes only a note the owner adds.

## Outcome

**⌘K** on a Mac or **Ctrl K** elsewhere opens the command bar on any page, even while typing in a field. The **Search** button opens it too: under the logo in the sidebar, and as an icon beside the logo on a phone. This matches the concept `cmdk.jpg`.

**When it opens** it lists today and the places:

- **Today:**
  - **Back to focus · {title}** when a session is running.
  - Otherwise, **Start focus · {block} 18:00–19:00** for each of today's blocks still planned and not over.
  - **Review day**, **Edit review** or **Close the day**, using the same rule as Today (`closeDayOpen` with the stop time).
  - **Add a block**.
- **Go to:** Today, Plan, Roadmap, Practice, Jobs, Weekly review, Settings, Look back, Revision deck and Pattern drill.

**Typing** searches the owner's records and the list together:

- Roadmap items open as **Open · {title}** with their roadmap and section, plus "revision due" or "done".
- Practice problems show their difficulty and topic.
- Applications show the role and stage.
- **Grill me · {item}** appears only when a typed word names it ("grill idem"), so it never crowds the plain Open rows. It also needs AI on, the roadmap allowing Study AI, and the record not test-named.
- **Add a note · "…"** is always last. It saves the typed words as a note to self, shows "Saved to Today." in the bar and clears the input. It is the only thing the bar writes.

**Matching** (`score`, `rankCommands`):

- Every typed word must match, at the start of a word of the command or, from three letters, inside one.
- A match at the start of the title ranks first.
- Groups come in a fixed order (Today, Roadmap, Practice, Jobs, Go to, Note), with at most five rows each.

**Keys:** ↑ ↓ move, ↵ runs, Esc closes and returns focus. ⌘K again also closes. The `?` list now includes ⌘K.

**Running a command** opens a page, a panel or a control. Nothing is marked or started without the owner's next press.

- Begin on Focus is still the start.
- Send and start in Grill Me is still the send.
- A panel or control on another page opens once that page shows it (`afterNavigation`). Side panels close when the address changes, so the bar waits for the new address and the opener first.
- Panel openers now carry `data-panel` for this.
- Grill me opens the item through its hash and presses its Grill button.
- On the same page, a new hash opens the item without a reload.

**Accessibility:**

- The bar is a modal dialog with a combobox and a listbox with labelled groups.
- `aria-activedescendant` follows the arrows.
- Each row is at least 44px.
- The status line announces the note result.
- It closes any open side panel first, so there is one modal at a time.

**Cost and privacy:**

- Opening makes one read, `GET /api/command`: the running session, today's plan with its open blocks, and the stop time.
- Typing makes one search per pause of 150ms, `POST /api/command`: three reads, plus the AI state when a matching roadmap allows Study AI. An older search is aborted.
- The words go in the POST body, never a URL, because they may become a note.
- Nothing is cached or logged.

**Measuring the hypothesis.** The plan's test was weekly use of the shortcuts overlay. Counting uses would need a new store, which ADR-021 avoids, so use is judged by the owner over two weeks.

## Changes

| Area    | Files                                                                                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/features/command/{domain.ts,service.ts,bar.tsx}`, `src/app/api/command/route.ts`, `tests/command.test.ts`, `tests/command-database.test.ts`, `docs/screenshots/wi-036/`                                                  |
| Changed | `src/app/layout.tsx` (the bar and the Search button), `src/components/side-panel.tsx` (`data-panel` on openers), `src/components/shortcuts.tsx` (⌘K in the list), `src/app/globals.css`, `docs/engineering/security.md`, docs |

## Verification

| Check                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree. `pnpm test:ci`: 70 files, 443 tests                                                                                                                                                                                                                                                                                                                                                    |
| Tests                                    | Domain 6: words and search terms, every word needed, Grill me only when named, group order with a title start first and five a group without repeats, the note command and its limit, stage words and the open key. Database 2: today's blocks still to do, then Review day and Add a block, Close the day from the stop time, Back to focus first; search finds only the owner's records, with Grill me when AI is configured |
| Browser, desktop                         | ⌘K on Today listed three Start focus rows, Review day, Add a block and Go to. "grill http", then Enter, opened HTTP semantics on its roadmap with the Grill panel showing what will be sent (nothing sent). "review d", then Enter, from the roadmap opened Review day on Today. "northwind" found the application, and Enter opened it from Practice. A typed note saved ("Saved to Today."). No console errors               |
| Browser, 375                             | The Search icon beside the logo opens the bar at full width with no overflow. Rows are 44px or taller; the footer hints hide on phones                                                                                                                                                                                                                                                                                         |

Screenshots: `docs/screenshots/wi-036/`.

## Owner steps

None to deploy: there is no migration. After the deploy, press ⌘K anywhere. For two weeks, see whether it becomes the way you move around.
