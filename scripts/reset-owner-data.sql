-- Reset the owner's domain data in place (WI-012). Owner-run, never automatic.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/reset-owner-data.sql
--
-- Deletes every record the owner authored (plans, sessions, practice, learning, jobs, roadmaps,
-- notes, reviews, reminders, sync conflicts) and the shared DSA topic list. Keeps the User row,
-- sessions (you stay signed in), notification preferences, push devices, the Google Calendar
-- connection and watch channel, job runs, maintenance records and the migration history.
--
-- Runs in one transaction and refuses unless the database holds exactly one User. Take and
-- verify a backup first; procedure in docs/engineering/backup-restore.md.

BEGIN;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "User";
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one User row, found %. Refusing to reset.', n;
  END IF;
END $$;

-- References from the kept row to rows that are about to go.
UPDATE "User" SET "currentDsaTopicId" = NULL, "currentSubjectId" = NULL;

-- Leaf tables first; every one of these cascades from User, so the order only matters for the
-- two RESTRICT relations (LearningTopic -> LearningSubject, DsaProblem -> DsaTopic).
DELETE FROM "CalendarSyncConflict";
DELETE FROM "NotificationLog";
DELETE FROM "WeeklyPriority";
DELETE FROM "WeeklyReview";
DELETE FROM "QuickNote";
DELETE FROM "RoadmapItem";
DELETE FROM "Roadmap";
DELETE FROM "InterviewPrepItem";
DELETE FROM "Resource";
DELETE FROM "DsaAttempt";
DELETE FROM "LearningActivity";
DELETE FROM "JobActivity";
DELETE FROM "ActualSession";
DELETE FROM "DailyCheckIn";
DELETE FROM "TimeBlock";
DELETE FROM "DailyPlan";
DELETE FROM "RoutineBlock";
DELETE FROM "InterviewRound";
DELETE FROM "JobApplication";
DELETE FROM "DsaProblem";
DELETE FROM "LearningTopic";
DELETE FROM "LearningSubject";
DELETE FROM "Goal";
DELETE FROM "DsaTopic";

-- Counts to read before the transaction ends; every domain table must be at zero.
SELECT t.name AS "table", t.rows
FROM (
  SELECT 'CalendarSyncConflict' AS name, count(*) AS rows FROM "CalendarSyncConflict" UNION ALL
  SELECT 'NotificationLog', count(*) FROM "NotificationLog" UNION ALL
  SELECT 'WeeklyPriority', count(*) FROM "WeeklyPriority" UNION ALL
  SELECT 'WeeklyReview', count(*) FROM "WeeklyReview" UNION ALL
  SELECT 'QuickNote', count(*) FROM "QuickNote" UNION ALL
  SELECT 'RoadmapItem', count(*) FROM "RoadmapItem" UNION ALL
  SELECT 'Roadmap', count(*) FROM "Roadmap" UNION ALL
  SELECT 'InterviewPrepItem', count(*) FROM "InterviewPrepItem" UNION ALL
  SELECT 'Resource', count(*) FROM "Resource" UNION ALL
  SELECT 'DsaAttempt', count(*) FROM "DsaAttempt" UNION ALL
  SELECT 'LearningActivity', count(*) FROM "LearningActivity" UNION ALL
  SELECT 'JobActivity', count(*) FROM "JobActivity" UNION ALL
  SELECT 'ActualSession', count(*) FROM "ActualSession" UNION ALL
  SELECT 'DailyCheckIn', count(*) FROM "DailyCheckIn" UNION ALL
  SELECT 'TimeBlock', count(*) FROM "TimeBlock" UNION ALL
  SELECT 'DailyPlan', count(*) FROM "DailyPlan" UNION ALL
  SELECT 'RoutineBlock', count(*) FROM "RoutineBlock" UNION ALL
  SELECT 'InterviewRound', count(*) FROM "InterviewRound" UNION ALL
  SELECT 'JobApplication', count(*) FROM "JobApplication" UNION ALL
  SELECT 'DsaProblem', count(*) FROM "DsaProblem" UNION ALL
  SELECT 'LearningTopic', count(*) FROM "LearningTopic" UNION ALL
  SELECT 'LearningSubject', count(*) FROM "LearningSubject" UNION ALL
  SELECT 'Goal', count(*) FROM "Goal" UNION ALL
  SELECT 'DsaTopic', count(*) FROM "DsaTopic" UNION ALL
  SELECT 'User (kept)', count(*) FROM "User" UNION ALL
  SELECT 'Session (kept)', count(*) FROM "Session" UNION ALL
  SELECT 'PushSubscription (kept)', count(*) FROM "PushSubscription" UNION ALL
  SELECT 'NotificationPreference (kept)', count(*) FROM "NotificationPreference" UNION ALL
  SELECT 'CalendarConnection (kept)', count(*) FROM "CalendarConnection"
) AS t;

COMMIT;
