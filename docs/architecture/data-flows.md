# Data flow diagrams and storage model

## DFD level 0: context and trust boundaries

```mermaid
flowchart LR
  U[Owner: untrusted browser inputs] -->|Credentials, form values, commands| P[CareerOS]
  P -->|Plans, progress, errors, inbox| U
  C[External scheduler] -->|Bearer secret and processing request| P
  P -->|Result or retryable error| C
  P <-->|Persistent domain records| D[(PostgreSQL)]
```

The browser and scheduler cross separate authentication boundaries. PostgreSQL is reachable by the server, not by the browser. Secrets stay in environment configuration. HTTP resource URLs are displayed as outbound links; CareerOS does not fetch those resources or transmit its database credentials to them.

## DFD level 1: processing and stores

```mermaid
flowchart TB
  U[Owner] --> Auth[Authenticate and resolve owner]
  Auth --> Read[Read plan and calculate display]
  Auth --> Edit[Validate and edit routine or dated block]
  Auth --> Execute[Start / stop / manual actual entry]
  Auth --> Review[Save daily review]
  Auth --> Practice[Validate DSA attempt under owner lock]
  Practice -->|Atomic history and summary| DSA[(Problems and attempts)]
  DSA --> Read
  DSA --> N
  Edit <-->|Templates, snapshots, override markers| S[(Schedule records)]
  Execute <-->|Sessions and block status| A[(Execution records)]
  Review --> R[(Check-in and reviewedAt)]
  S --> Read
  A --> Read
  R --> Read
  Read --> U
  C[Authenticated cron] --> N[Evaluate reminder eligibility under owner lock]
  S --> N
  A --> N
  R --> N
  Pref[(Notification preferences)] --> N
  N -->|Unique occurrence key| Inbox[(NotificationLog)]
  Inbox --> Read
```

These are logical stores in the same PostgreSQL database, not separate services/databases. Owner/goal records scope these operations. DSA revision dates and job follow-up/interview dates are additional inputs to reminder processing.

## Core entity relationships

```mermaid
erDiagram
  User ||--o{ Goal : owns
  User ||--o{ RoutineBlock : configures
  User ||--o{ DailyPlan : plans
  DailyPlan ||--o{ TimeBlock : contains
  DailyPlan ||--o| DailyCheckIn : reviews
  TimeBlock o|--o{ ActualSession : records
  Goal o|--o{ TimeBlock : motivates
  User ||--o{ ActualSession : owns
  User ||--o{ NotificationPreference : configures
  User ||--o{ NotificationLog : receives
  User ||--o{ JobApplication : tracks
  DsaTopic ||--o{ DsaProblem : groups
  DsaTopic o|--o{ User : currentFocus
  User ||--o{ DsaProblem : owns
  User ||--o{ DsaAttempt : records
  DsaProblem ||--o{ DsaAttempt : history
  ActualSession o|--o{ DsaAttempt : contextualizes
  User ||--o{ LearningTopic : learns
  User ||--o{ Resource : saves
```

The [Prisma schema](../../prisma/schema.prisma) is authoritative for every field and cardinality. `routineKey` is deliberately not a cascading relation: deleting a routine preserves dated history. Resource rows optionally attach to one problem, learning topic, goal or application; a SQL check allows at most one parent. Learning topics support a parent/child hierarchy. Goals and activity categories are flexible text, while lifecycle states are enums.

## Data classification and lifecycle

| Data                                                        | Durable location                    | Exposure / lifecycle                                                         |
| ----------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| Profile, plans, actual sessions, reviews, jobs, study notes | PostgreSQL                          | Private owner views; retained until explicitly changed/deleted               |
| Resource URLs                                               | PostgreSQL                          | Validated HTTP(S), clickable; external hosts have their own privacy policies |
| Preferences and reminder history                            | PostgreSQL                          | Owner inbox; read status persists; retention cleanup not implemented         |
| Database credentials, app password, cron secret             | Deployment secrets / ignored `.env` | Server only; rotate if disclosed; never commit                               |
| Unsaved form data and feedback                              | Browser memory                      | Lost on navigation/reload; not claimed durable                               |
| Generated Prisma client / build output                      | Generated files                     | Recreated from source; excluded from Git                                     |
| PostgreSQL backups                                          | Operator-controlled backup storage  | Encryption, retention, access and restore testing required before production |

Job applications are independent of job-search blocks; multiple applications may occur during one session. Cancelling a block preserves its actual sessions. SQL delete semantics differ by relation, so consult migrations before adding a destructive feature. There is no complete user-facing export/erasure/retention workflow yet.

## WI-004 — Technical learning assessment DFD

```mermaid
flowchart LR
  Owner[Owner: partial mastery + activity] --> Action[Learning Server Action]
  Action --> Validate[Allowlist input and resolve owner]
  Validate --> Lock[User row lock]
  Lock --> Ownership[Topic / subject / session ownership]
  Ownership --> Retry{Request ID exists?}
  Retry -->|Same payload| Prior[Return original activity]
  Retry -->|New| Domain[Merge supplied scores; derive readiness/date]
  Domain --> Transaction[Append activity + update topic summary]
  Transaction --> DB[(PostgreSQL transaction)]
  DB --> Views[Learning + Today revalidation]
  Cron[Authenticated cron] --> Due[Active subject/topic due query]
  Due --> Inbox[One preference-aware reminder per owner date]
```

```mermaid
erDiagram
  User ||--o{ LearningSubject : owns
  User o|--o| LearningSubject : current_focus
  Goal o|--o{ LearningSubject : supports
  LearningSubject ||--o{ LearningTopic : contains
  LearningTopic o|--o{ LearningTopic : parent
  LearningTopic ||--o{ LearningActivity : history
  ActualSession o|--o{ LearningActivity : contextualizes
  LearningTopic ||--o{ Resource : references
```

Technical review dates use existing owner-local day labels and SQL DATE. Activity/session times remain UTC instants. Subject/topic/resource writes validate ownership under the same owner lock. Topic history has no edit/delete mutation. Retry payload mismatches are rejected rather than overwriting the prior activity.

## WI-005 — Job pipeline DFD

```mermaid
flowchart LR
  Owner[Owner: application / stage / round / prep / follow-up] --> Action[Jobs Server Action]
  Action --> Validate[Zod allowlist; HTTP(S) URLs; owner resolved server-side]
  Validate --> Lock[User row lock]
  Lock --> Ownership[Application / round / linked learning+DSA ownership]
  Ownership --> Retry{Request ID seen?}
  Retry -->|Yes| Prior[Return prior result]
  Retry -->|No| Write[Summary change + JobActivity in one transaction]
  Write --> DB[(PostgreSQL)]
  DB --> Views[Jobs, Today, Learn, DSA revalidation]
  Cron[Authenticated cron] --> Eligible[Open apps: follow-up dates; scheduled rounds within 24h]
  Eligible --> Inbox[Deduplicated inbox reminders]
```

```mermaid
erDiagram
  User ||--o{ JobApplication : owns
  JobApplication ||--o{ JobActivity : timeline
  JobApplication ||--o{ InterviewRound : rounds
  InterviewRound o|--o{ JobActivity : referenced_by
  InterviewRound ||--o{ InterviewPrepItem : prep
  LearningTopic o|--o{ InterviewPrepItem : referenced_by
  DsaProblem o|--o{ InterviewPrepItem : referenced_by
  DsaTopic o|--o{ InterviewPrepItem : referenced_by
  JobApplication ||--o{ Resource : references
```

Applied/next-action dates are SQL DATEs in the owner's calendar; interview and activity times are UTC instants, with the interview's entry zone stored for display. Recruiter/hiring contacts, compensation notes and job-description snapshots are personal data in the same owner-scoped tables and are never sent to external services. No page scraping, email or calendar calls exist.

## WI-006 — Google Calendar sync DFD

```mermaid
flowchart LR
  Owner[Owner browser] -->|Basic auth| App[CareerOS server]
  App -->|state+PKCE redirect| GAuth[Google OAuth]
  GAuth -->|code| App
  App -->|encrypted refresh token| DB[(PostgreSQL)]
  Key[[CALENDAR_TOKEN_ENCRYPTION_KEY env]] --> App
  Cron[Scheduler: Bearer CRON_SECRET] --> Sync[Sync engine + lease]
  Hook[Google push: channel headers] -->|validated signal| Sync
  App -->|after response| Sync
  Sync -->|If-Match writes: title, start, end, private props| GCal[Dedicated CareerOS calendar]
  GCal -->|syncToken pages| Sync
  Sync -->|dated overrides, fingerprints, conflicts| DB
```

Trust boundaries: the browser never receives tokens. Google receives only titles, instants, the category label and private property IDs. The webhook is unauthenticated at HTTP level but validated by stored channel ID, resource ID, token hash and expiry, and returns no data. Logs carry IDs, codes and counts only.
