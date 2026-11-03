# Roadmap

What could come next, ranked by the owner's real use and the audit of 2026-11-02 (WI-145). Nothing here is built until the owner says so, one work item at a time. The product's rule stands: no new feature unless two weeks of use show a need; no streaks, scores or pressure.

## Now: use it, and measure

| Item                                            | User problem                                                                                     | Value                                  | Priority | Complexity | Dependencies                                | Risks                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- | -------- | ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Two weeks of UAT with the Rumi 2 and 3 measures | It is not yet known which of Rumi's lines, writes, cards and voice the owner keeps using         | Decisions from data instead of guesses | P1       | None (use) | —                                           | Feature work restarting before the two weeks end, as happened after the last audit |
| Owner device checks                             | iPhone push, Safari, the Home Screen app and voice were never run on the device                  | Confidence in the phone path           | P1       | S (owner)  | A real iPhone                               | —                                                                                  |
| Confirm the privacy contact                     | `/privacy` shows the address from `PRIVACY_CONTACT_EMAIL`, or the owner's email if that is unset | Says what the owner intends publicly   | P2       | XS (owner) | Render environment                          | —                                                                                  |
| Time a restore (the monthly drill)              | The recovery time has never been measured                                                        | A known RTO                            | P2       | S (owner)  | `scripts/restore-drill.sh`, the owner's key | —                                                                                  |

## Next: small engineering items from the audit

| Item                                                                                                        | User problem                                                                  | Value                               | Priority | Complexity | Dependencies                                                   | Risks                                             |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- | -------- | ---------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Indexes on `ActualSession.taskId`, `DsaAttempt.actualSessionId`, `LearningActivity.actualSessionId` (BE-12) | Deleting a block or a session scans these tables as they grow                 | Bounded deletes and undos           | P3       | S          | A migration, applied to the personal database before the merge | None beyond the usual migration care              |
| Claim push and line rows before sending (BE-4)                                                              | Two overlapping scheduler calls could, rarely, send one push twice            | No duplicate push                   | P3       | S          | —                                                              | Must keep the inbox row on push failure           |
| Undo idempotency and atomicity (BE-10, BE-11)                                                               | A double-pressed Undo or a failure halfway could leave a half-restored record | Undo always all-or-nothing          | P3       | M          | Undo kinds                                                     | Many kinds to cover                               |
| One reminder read per owner, not per preference (BE-15)                                                     | Redundant reads every minute                                                  | Less database work on the free tier | P3       | S          | —                                                              | —                                                 |
| Error capture with a reference (privacy-scrubbed)                                                           | Server errors are found only by reading Render's log                          | Faster detection                    | P3       | S–M        | A provider choice (owner)                                      | Personal data in error payloads; must scrub       |
| Database TLS with certificate verification                                                                  | `DATABASE_SSL=no-verify` encrypts but does not verify                         | Closes a man-in-the-middle gap      | P3       | S          | The Supabase CA in the environment                             | A wrong CA stops the app; test on a branch deploy |

## Later: maintainability

| Item                                                  | User problem                                | Value              | Priority | Complexity            | Dependencies                                   | Risks                                             |
| ----------------------------------------------------- | ------------------------------------------- | ------------------ | -------- | --------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Shrink the 13 two-way feature pairs (CQ-6, CQ-7)      | Changes in one feature ripple into another  | Cheaper work items | P3       | M, over several items | The boundaries test (the list may only shrink) | Churn without user value if done all at once      |
| Pages move to Tailwind when they are next redrawn     | Two styling systems side by side            | One system         | P3       | Per page              | WI-137's rule: never a separate rewrite        | Visual regressions; compute-style checks per page |
| Retire code kept alive only by tests (CQ-14)          | Dead code read and maintained               | Smaller codebase   | P3       | S                     | Agreement on removing the tests that cover it  | —                                                 |
| One place for counts and dates in copy (CQ-10, CQ-11) | 46 inline plurals and duplicated formatters | Consistent words   | P3       | S                     | `plural`, `shortDate`, `hhmm`                  | —                                                 |

## Hosting decision (after UAT)

| Option                                    | What it fixes                                                      | Cost                | Notes                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------ |
| Stay on free tiers                        | —                                                                  | US$0                | Sleeping instance, cross-region round trips, a day of possible data loss |
| Render Starter + Supabase Pro, one region | Cold starts, latency, provider backups with point-in-time recovery | About US$32 a month | ADR-014's addendum when chosen                                           |

## Not planned

- Bringing Learn back into the navigation (removed on purpose).
- Streaks, scores, badges or any comparison.
- Multi-user accounts.
- A fixed AI spending cap in code (the owner sets the monthly limit in Settings).
