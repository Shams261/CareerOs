-- Fresh start (WI-045, from the UAT audit of 2026-10-27). Owner-run, never automatic.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/fresh-start.sql
--
-- Clears everything the owner did, keeps the curriculum and the set-up. The workspace opens as
-- new, with the imported study material still there at zero progress.
--
--   Deletes: routines, plans, blocks, sessions, check-ins, reviews and priorities, notes to
--   self, reminders in the inbox, sync conflicts, applications with their rounds, prep items,
--   activity and prep docs, practice attempts, learning activity, revision cards, Ask Rumi
--   conversations and "Rumi knows" lines, "Rumi noticed" answers, and every record named as
--   test data (the same rule as `isTestNamed` in src/lib/test-data.ts).
--   Resets: every remaining roadmap item to Not started (no revision, no "asked", no note), every
--   practice problem to unattempted Red, every learning topic to zero mastery, goals kept.
--   Keeps: the User row and sign-in sessions, push devices, notification preferences, Study
--   nudges and AI settings, the AI cost ledger (the monthly stop still counts this month), the
--   Google Calendar connection, job runs, maintenance records and the migration history.
--
-- Google Calendar: events of deleted blocks stay in the Silsila calendar as orphans (sync never
-- deletes events it cannot match). Delete them in Google Calendar, or follow the runbook in
-- docs/engineering/backup-restore.md. Runs in one transaction and refuses unless the database
-- holds exactly one User. Take and verify a backup first.

BEGIN;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "User";
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one User row, found %. Refusing to reset.', n;
  END IF;
END $$;

-- The isTestNamed rule: a capitalised marker, UAT in any case, a bracketed marker, or a name
-- that is only a marker.
CREATE OR REPLACE FUNCTION pg_temp.is_test(name text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT name IS NOT NULL AND (
    name ~ '\m(TEST|DEMO|DUMMY|SAMPLE)\M'
    OR name ~* '\muat\M'
    OR name ~* '[(\[]\s*(test|demo|dummy|sample|uat)\s*[)\]]'
    OR name ~* '^\s*(test|demo|dummy|sample)(\s*\d+)?\s*$'
  )
$f$;

UPDATE "User" SET "currentDsaTopicId" = NULL, "currentSubjectId" = NULL, "dayPrint" = NULL;

-- What the owner did.
DELETE FROM "CalendarSyncConflict";
DELETE FROM "NotificationLog";
DELETE FROM "NoticedAnswer";
DELETE FROM "AgentMessage";
DELETE FROM "AgentConversation";
DELETE FROM "AgentMemory";
DELETE FROM "RevisionCard";
DELETE FROM "InterviewPrepDoc";
DELETE FROM "WeeklyPriority";
DELETE FROM "WeeklyReview";
DELETE FROM "QuickNote";
DELETE FROM "DsaAttempt";
DELETE FROM "LearningActivity";
DELETE FROM "JobActivity";
DELETE FROM "InterviewPrepItem";
DELETE FROM "ActualSession";
DELETE FROM "DailyCheckIn";
DELETE FROM "TimeBlock";
DELETE FROM "DailyPlan";
DELETE FROM "RoutineBlock";
DELETE FROM "InterviewRound";
DELETE FROM "Resource" WHERE "jobApplicationId" IS NOT NULL;
DELETE FROM "JobApplication";

-- Test-named curriculum and goals.
DELETE FROM "RoadmapItem" i USING "Roadmap" r
  WHERE i."roadmapId" = r.id AND (pg_temp.is_test(r.title) OR pg_temp.is_test(i.title) OR pg_temp.is_test(i.section));
DELETE FROM "Roadmap" WHERE pg_temp.is_test(title);
DELETE FROM "DsaProblem" p USING "DsaTopic" t
  WHERE p."topicId" = t.id AND (pg_temp.is_test(p.title) OR pg_temp.is_test(t.name));
DELETE FROM "DsaTopic" t
  WHERE pg_temp.is_test(t.name) AND NOT EXISTS (SELECT 1 FROM "DsaProblem" p WHERE p."topicId" = t.id);
DELETE FROM "LearningTopic" lt USING "LearningSubject" ls
  WHERE lt."subjectId" = ls.id AND (pg_temp.is_test(lt.title) OR pg_temp.is_test(ls.name));
DELETE FROM "LearningSubject" ls
  WHERE pg_temp.is_test(ls.name) AND NOT EXISTS (SELECT 1 FROM "LearningTopic" lt WHERE lt."subjectId" = ls.id);
DELETE FROM "Goal" WHERE pg_temp.is_test(title);

-- The curriculum back at zero.
UPDATE "RoadmapItem" SET
  status = 'NOT_STARTED', "completedAt" = NULL, "nextRevisionAt" = NULL, "revisionStage" = 0,
  "lastRevisedAt" = NULL, "askedInInterview" = false, "askedNote" = NULL, notes = NULL;
UPDATE "DsaProblem" SET
  confidence = 'RED', "lastAttemptedAt" = NULL, "nextRevisionAt" = NULL, "attemptsCount" = 0,
  "revisionStage" = 0, "revisionManual" = false;
UPDATE "LearningTopic" SET
  status = 'NOT_STARTED', understanding = 0, recall = 0, application = 0, interview = 0,
  "lastReviewedAt" = NULL, "nextReviewDate" = NULL, "reviewManual" = false;

-- Read these before the transaction ends.
SELECT t.name AS "what", t.rows
FROM (
  SELECT 'Routines' AS name, count(*) AS rows FROM "RoutineBlock" UNION ALL
  SELECT 'Blocks', count(*) FROM "TimeBlock" UNION ALL
  SELECT 'Sessions', count(*) FROM "ActualSession" UNION ALL
  SELECT 'Applications', count(*) FROM "JobApplication" UNION ALL
  SELECT 'Practice attempts', count(*) FROM "DsaAttempt" UNION ALL
  SELECT 'Rumi conversations', count(*) FROM "AgentConversation" UNION ALL
  SELECT 'Roadmaps kept', count(*) FROM "Roadmap" UNION ALL
  SELECT 'Roadmap items kept', count(*) FROM "RoadmapItem" UNION ALL
  SELECT 'Roadmap items done', count(*) FROM "RoadmapItem" WHERE status <> 'NOT_STARTED' UNION ALL
  SELECT 'Practice problems kept', count(*) FROM "DsaProblem" UNION ALL
  SELECT 'Test-named left', (
    (SELECT count(*) FROM "Roadmap" WHERE pg_temp.is_test(title)) +
    (SELECT count(*) FROM "RoadmapItem" WHERE pg_temp.is_test(title)) +
    (SELECT count(*) FROM "DsaProblem" WHERE pg_temp.is_test(title)) +
    (SELECT count(*) FROM "DsaTopic" WHERE pg_temp.is_test(name)) +
    (SELECT count(*) FROM "Goal" WHERE pg_temp.is_test(title)))
) t;

COMMIT;
