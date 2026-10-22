# Concept: Today as the launcher

Illustrates ENHANCEMENTS B.2, F.5 and the first two flows in C. Text wireframe at about 1100 px (two columns) and under 700 px (one column). Not a pixel mock.

## Desktop

```
TODAY                                   ‹  ›  [2026-10-21]   N add · S start · ? keys
Wednesday, October 21
○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ●     (chain: 24 px rings, aria-label "Mon Oct 20 · worked and reviewed")

┌───────────────────────────────────────────────┐  ┌──────────────────────────┐
│ NOW                                           │  │ Daily review             │
│ DSA practice · 11:00–11:45 PM                 │  │ [ Close the day ]        │  ← first card in the aside
│ [ Start ]   Log time                          │  ├──────────────────────────┤
│                                               │  │ Revise today · 1         │
│ NEXT  Reading · 7:30 AM tomorrow              │  │ HTTP semantics →         │
└───────────────────────────────────────────────┘  ├──────────────────────────┤
Planned 0h 45m · Actual 0h 0m · Blocks 0/1 · Applications 1   │ Goals · Up next          │
                                                   │ Browser-to-backend… →    │
Timeline                               [Add a block ▾]       ├──────────────────────────┤
11:00 PM  </> DSA practice · Changed for this day │ Job search · 0 need you  │
          Complete   Skip   Cancel  (secondary)   │ Today's DSA · next: 3Sum │
          Edit this day · Log time                └──────────────────────────┘
```

Rules shown: one primary (Start on the current block, inside the Now card); the timeline's own Start becomes secondary or is hidden for the current block; while a session runs the Now card shows **Stop** (white on teal) and **Complete** only; the review card leads the aside; the Technical prep card is gone.

## Phone (under 700 px)

```
◎ Silsila                         (36 px header, no capture field)
TODAY
Wednesday, October 21
‹  ›  [2026-10-21]
○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ●
┌───────────────────────────────┐
│ NOW  DSA practice 11:00–11:45 │
│ [ Start ]        Log time     │
│ NEXT  Reading · 7:30 AM       │
└───────────────────────────────┘
┌───────────────────────────────┐
│ Daily review   [Close the day]│
└───────────────────────────────┘
Planned 45m · Actual 0m · 0/1
Timeline …
───────────────────────────────
 Today   Plan   Roadmap   Jobs   More     (Jobs in the bar while a search is active; Practice under More, or the reverse)
```

The note-to-self field moves into the More sheet as its first row ("Note to self… Save"). The running session, when one exists, is a one-line strip under the header: "DSA practice · 12:34 [Stop]".
