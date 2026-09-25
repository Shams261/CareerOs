# User flow diagrams (UFD)

These describe implemented WI-001/WI-002/WI-003 paths. UFD means user flow diagram here; data movement is documented separately in the DFD.

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

## UFD-04: DSA practice and revision (WI-003)

```mermaid
flowchart TD
  A[Choose current topic] --> B[Add problem with stored URL]
  B --> C[Open external problem in a new tab]
  C --> D[Record independence and confidence]
  D --> E{Consistent input?}
  E -->|No| D
  E -->|Yes| F[Save immutable attempt and revision summary atomically]
  F --> G[Red 1 day / Yellow 3 / Green 7 then 14 then 30]
  G --> H[Automatic overdue and due-today queue]
  H --> C
  H --> I[Optional manual revision date]
  I --> H
  J[Today has a DSA block] --> H
```

Logging an attempt takes two required selections; duration, mistake and notes are optional. A current active DSA session is associated automatically. Scheduling, timer completion and learning confidence are separate decisions.

## UFD-005 — Technical learning, recall and review (WI-004)

```mermaid
flowchart TD
  Learn[Open Learning] --> Focus[Choose active subject / primary focus]
  Focus --> Subject[Topics in learning order]
  Subject --> Topic[Topic detail: mastery, notes, resources, history]
  Topic --> Log[Record Learn / Review / Practice / Recall / Mock]
  Log --> Scores[Supply only assessed dimensions]
  Scores --> Save[Atomic activity + readiness + review date]
  Save --> Queue[Overdue / today / upcoming reviews]
  Topic --> Note[Append note without moving review date]
  Topic --> Manual[Manually schedule review]
  Topic --> Edit[Edit notes, parent, order; pause or complete]
  Queue --> Today[Technical/System Design or linked-goal Today block]
  Today --> Topic
```

A successful form displays confirmation; validation failures preserve input and explain the issue. A new record-activity request ID is issued after revalidation. Pause/archive keeps history but removes active recommendations. Resources use validated HTTP(S) links with safe new-tab attributes. Editing a subject can clear/change primary focus; multiple subjects can remain active.

## UFD-006 — Job pipeline, interviews and follow-ups (WI-005)

```mermaid
flowchart TD
  Jobs[Open Jobs] --> Attention[Needs attention / upcoming interviews]
  Jobs --> Quick[Quick add: company, role, URL, source, date, stage]
  Quick --> Dup{Exact duplicate?}
  Dup -->|Yes| Confirm[Confirm or cancel]
  Dup -->|No| App[Application detail]
  Confirm --> App
  Attention --> App
  App --> Stage[Change stage + note → timeline]
  App --> Next[Set next action, date, who acts next]
  Next --> Done[Mark done → set following step]
  App --> Round[Add interview round: type, local time, zone, link]
  Round --> Prep[Prep checklist / link learning or DSA]
  Round --> Resched[Reschedule → previous time kept]
  Round --> Result[Log result + reflection, optional stage move]
  Result --> Gap[Add weak area → learning/DSA mention]
  Today[Today] --> Interview[Today's interview: open application / prep / meeting]
  Today --> Summary[Job search summary]
  Summary --> App
```

Saves show confirmation or keep input with the error. Forms that record events carry a fresh request ID after each save. Closed applications stay reachable through the Rejected/Withdrawn/All views. Grouped lists replace drag-and-drop so the pipeline works by keyboard and on mobile.

## UFD-007 — Google Calendar connection and sync (WI-006)

```mermaid
flowchart TD
  Cal[Calendar page] --> Connect[Connect Google Calendar]
  Connect --> Google[Google consent: CareerOS-created calendars + email]
  Google --> Callback[Callback: verify state/PKCE, store encrypted token]
  Callback --> Dedicated[Create or reuse the CareerOS calendar]
  Dedicated --> Full[Background full sync]
  Edit[Edit a block in CareerOS] --> Pending[Block pending] --> Push[Sync: push with If-Match]
  GEdit[Move/rename/delete in Google] --> Pull[Sync: incremental list]
  Pull --> Override[Dated override / cancel / detach]
  Push --> Both{Both sides changed?}
  Pull --> Both
  Both -->|Yes| Conflict[Conflict card: Keep CareerOS or Use Google]
  Cal --> SyncNow[Sync now]
  Cal --> Disconnect[Disconnect: keep data; optional confirmed calendar removal]
  Revoked[Revoked/rotated credentials] --> Reauth[Reconnect required + Today notice] --> Connect
```

Results that replace the form (connected, conflict resolved, disconnected) are confirmed with a notice at the top of the panel. Sync errors show sanitized messages only.

## UFD-008 — Weekly review and preparation (WI-007)

```mermaid
flowchart TD
  Sunday[Sunday: Today prompt / inbox reminder] --> Review[Review page: this week]
  Review --> Facts[Execution · Progress · Carry forward (live)]
  Facts --> Reflect[Reflection: save draft or complete]
  Reflect --> Priorities[Choose up to 5 priorities for next week]
  Priorities --> Context[Next week: routine preview, interviews, dues]
  Context --> Routines{Change routines?}
  Routines -->|Yes| Calendar[Edit routines on Calendar] --> Context
  Routines -->|No| Prepare[Prepare next week: generate 7 days once]
  Prepare --> Sync[Calendar sync publishes after the response]
  Review --> History[Previous weeks: stored text, live facts]
```

## UFD-009 — Sign-in, device notifications and data (WI-008)

```mermaid
flowchart TD
  Visit[Open any CareerOS page] --> Signed{Valid session?}
  Signed -->|No| Login["/login: Sign in with Google"]
  Login --> Google[Google account chooser]
  Google --> Owner{Verified email = OWNER_EMAIL?}
  Owner -->|No| Refused[Private workspace message]
  Owner -->|Yes| Back[Return to the requested page]
  Signed -->|Yes| Back
  Back --> Settings[Settings]
  Settings --> Enable[Enable notifications on this device]
  Enable --> Permission{Browser permission}
  Permission -->|Allowed| Test[Send test notification]
  Permission -->|Blocked| Help[Explain how to allow it]
  Settings --> IOS{iPhone in Safari tab?}
  IOS -->|Yes| Install[Add to Home Screen first]
  Settings --> Export[Download data export]
  Settings --> SignOut[Sign out: session revoked]
  Push[Closed app: reminder push] --> Click[Tap] --> Page[Opens the reminder's page]
```

Sign-in errors return to the login card with a plain message. The checklist on Settings links to each onboarding step.
