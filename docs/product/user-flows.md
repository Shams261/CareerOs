# User flow diagrams (UFD)

These describe implemented WI-001/WI-002 paths. UFD means user flow diagram here; data movement is documented separately in the DFD.

## UFD-01: plan a week and override a day

```mermaid
flowchart TD
  A[Open Calendar] --> B[Choose any week]
  B --> C{Change scope}
  C -->|One day| D[Open dated plan]
  D --> E[Add / edit / reschedule block]
  E --> F{Overlap?}
  F -->|Yes| G[Show conflicting blocks]
  G -->|Edit inputs| E
  G -->|Explicitly allow| H[Save only dated block]
  F -->|No| H
  C -->|Recurring| I[Create or edit routine and weekdays]
  I --> J{Already-generated future plans?}
  J -->|Leave unchanged| K[Save template for ungenerated days]
  J -->|Apply eligible updates| L[Preview affected blocks]
  L --> M{Confirm fresh preview}
  M -->|Data changed| L
  M -->|Yes| N[Apply eligible updates; protect overrides and recorded work]
```

Pause/re-enable changes the template's enabled state. Deletion previews its effect and preserves dated instances by default. New templates can be applied to generated days through their edit form. Generated days remain snapshots. Navigating history alone does not invent historical plans.

## UFD-02: execute and record actual work

```mermaid
flowchart TD
  A[Open Today] --> B[Ensure today's plan; show active/current/next]
  B --> C{How to record work?}
  C -->|Start| D{Another session running?}
  D -->|Yes| E[Stop or complete existing session]
  E --> C
  D -->|No| F[Record server start time]
  F --> G{Next action}
  G -->|Stop| H[Close session; block stays planned]
  H --> C
  G -->|Complete| I[Close linked session and complete block]
  C -->|Forgot timer| J[Enter actual interval]
  J --> K{Valid, nonfuture, nonoverlapping?}
  K -->|No| J
  K -->|Yes| L[Save actual session; complete separately]
  C -->|Skip / cancel| M[Record status; optional skip reason]
```

A running session must stop before skip/cancel/reschedule. Completing without an active session does not invent elapsed time. Reloading does not lose active work. Merely passing the planned end changes the display to overdue/unrecorded, not skipped.

## UFD-03: review and reminders

```mermaid
flowchart LR
  A[Owner opens daily plan] --> B[Short optional reflection and rating]
  B --> C[Save check-in and reviewedAt]
  C --> D[Dismiss obsolete review reminder]
  E[Scheduler checks preferences] --> F{Eligible and unseen occurrence?}
  F -->|Yes| G[Persist inbox reminder]
  F -->|No| H[No duplicate record]
  G --> I[Owner reads inbox and marks read]
```

The cron can populate the inbox while the app is closed. It cannot deliver an OS push alert in the current implementation. Permission UI provides a test alert only. Daily review carry-forward text does not automatically move tasks.
