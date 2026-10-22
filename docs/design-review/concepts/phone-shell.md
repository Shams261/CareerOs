# Concept: the phone shell and the row recipe

Illustrates ENHANCEMENTS B.2 and B.3, and the roadmap flow in C. Text wireframe at 390 px.

## Roadmap page row recipe

Today (verified, `roadmap-page-items-390.jpg`):

```
⊘  HTTP se…   OVERDUE · OCT 20   [✓ Revised]
```

Proposed, closed row:

```
⊘  HTTP semantics
   Overdue · Oct 20 · 25 min
```

Proposed, open row (the panel):

```
○  Browser-to-backend security boundary          ← wraps, never truncates
   Done when: explain why browser fails but curl succeeds.
   Scope: CORS, preflight, same-origin policy, CSRF vs CORS, HTTPS…   Read more
   OWASP Authentication Cheat Sheet ↗ · OWASP CSRF ↗ · MDN CORS ↗
   ─────────────────────────────────────────
   Study prompt   [Start / continue lesson ▾]
   My doubt or extra link ________________
   [ Copy prompt ]                                ← secondary
   ─────────────────────────────────────────
   Note ___________________________________
   [ Done ]   Start   Asked in interview          ← Done is the one primary
   Edit · Remove                                   ← links, 44 px, Remove last with a gap
```

Rules: title and meta are two lines on phones; quick actions (hover) are not rendered on coarse pointers because the open panel has the action; targets are 44 px; the section select shows "Week 1 · Foundations · 3 of 7 · 1 due · continue".

## Practice band and filter bar

```
[Search ________________________]   ← full width
[Any status ▾]                      ← full width (same rule)
───────────────────────────────────
▾ Arrays & Hashing          2 of 17
   Two Sum                 Easy   GREEN · Oct 28
                           ↗ opens LeetCode (24 px target)
   Contains Duplicate      Easy   —
▸ Two Pointers              0 of 28
```

The Pattern column is gone inside a pattern band; "Difficulty" is the header; typing in Search opens the bands that match.

## More sheet

```
┌──────────────────────────────┐
│ Note to self… ______  [Save] │
│ ▸ Practice                   │
│ ▸ Weekly review              │
│ ▸ Settings                   │
│ Sign out                     │
└──────────────────────────────┘
 Today   Plan   Roadmap   Jobs   ✕
```
