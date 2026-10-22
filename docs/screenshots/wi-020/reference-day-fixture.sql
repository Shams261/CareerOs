-- WI-020 acceptance fixture: the owner's reference image, shifted to the current hour. Dev DB only.
\set owner 'cmvi2juhn0000sq8o3tjf5al8'
\set plan 'cmvi2wzhv0003sq8oqyem1umj'
BEGIN;
SET LOCAL TimeZone = 'America/Toronto';
-- Clear today's existing dev blocks: test blocks go, the routine occurrence is cancelled (regeneration is idempotent).
DELETE FROM "ActualSession" WHERE "taskId" IN (SELECT id FROM "TimeBlock" WHERE "dailyPlanId" = :'plan');
DELETE FROM "TimeBlock" WHERE "dailyPlanId" = :'plan' AND "routineKey" IS NULL;
UPDATE "TimeBlock" SET status = 'CANCELLED', "updatedAt" = now() WHERE "dailyPlanId" = :'plan' AND "routineKey" IS NOT NULL;
DELETE FROM "DailyCheckIn" WHERE "dailyPlanId" = :'plan';
UPDATE "DailyPlan" SET "reviewedAt" = NULL, "updatedAt" = now() WHERE id = :'plan';
-- Example Labs: follow-up due today, a recruiter call running now, system design tomorrow 14:00.
INSERT INTO "JobApplication" (id,"userId",company,role,stage,"nextAction","nextActionDate","actionOwner","appliedAt","updatedAt")
VALUES ('uat-img-app', :'owner', 'Example Labs', 'Backend Engineer', 'TECHNICAL', 'Send follow-up', CURRENT_DATE, 'ME', CURRENT_DATE - 9, now());
INSERT INTO "InterviewRound" (id,"userId","applicationId",title,type,"scheduledStart","scheduledEnd",timezone,status,"updatedAt") VALUES
 ('uat-img-round-recruiter', :'owner', 'uat-img-app', 'Recruiter call', 'RECRUITER', CURRENT_DATE + time '16:15', CURRENT_DATE + time '16:45', 'America/Toronto', 'SCHEDULED', now()),
 ('uat-img-round-sd', :'owner', 'uat-img-app', 'System design', 'SYSTEM_DESIGN', CURRENT_DATE + 1 + time '14:00', CURRENT_DATE + 1 + time '15:00', 'America/Toronto', 'SCHEDULED', now());
-- The day: Reading done, Portfolio update not recorded, Recruiter call in session, DSA practice and Backend learning later.
INSERT INTO "TimeBlock" (id,"dailyPlanId",title,description,category,"plannedStart","plannedEnd",status,"completedAt","interviewRoundId","updatedAt") VALUES
 ('uat-img-block-reading', :'plan', 'Reading', NULL, 'PERSONAL', CURRENT_DATE + time '12:00', CURRENT_DATE + time '12:45', 'COMPLETED', CURRENT_DATE + time '12:45', NULL, now()),
 ('uat-img-block-portfolio', :'plan', 'Portfolio update', NULL, 'PERSONAL', CURRENT_DATE + time '14:00', CURRENT_DATE + time '15:00', 'PLANNED', NULL, NULL, now()),
 ('uat-img-block-recruiter', :'plan', 'Recruiter call', NULL, 'INTERVIEW', CURRENT_DATE + time '16:15', CURRENT_DATE + time '16:45', 'IN_PROGRESS', NULL, 'uat-img-round-recruiter', now()),
 ('uat-img-block-dsa', :'plan', 'DSA practice', 'Two pointers', 'DSA', CURRENT_DATE + time '17:30', CURRENT_DATE + time '18:30', 'PLANNED', NULL, NULL, now()),
 ('uat-img-block-backend', :'plan', 'Backend learning', 'Request lifecycle', 'LEARNING', CURRENT_DATE + time '19:30', CURRENT_DATE + time '20:15', 'PLANNED', NULL, NULL, now());
INSERT INTO "ActualSession" (id,"userId","taskId",category,"startedAt","endedAt") VALUES
 ('uat-img-session-reading', :'owner', 'uat-img-block-reading', 'PERSONAL', CURRENT_DATE + time '12:00', CURRENT_DATE + time '12:45'),
 ('uat-img-session-recruiter', :'owner', 'uat-img-block-recruiter', 'INTERVIEW', now() - interval '14 minutes', NULL);
-- Needs attention: Two Sum and HTTP semantics due today, one unread reminder, two applications waiting on me.
UPDATE "DsaProblem" SET "nextRevisionAt" = CURRENT_DATE WHERE id = 'cmvilublo000gz88o80gbz2na';
UPDATE "RoadmapItem" SET "nextRevisionAt" = CURRENT_DATE WHERE id = 'cmvilubq3006lz88oktloby3r';
INSERT INTO "NotificationLog" (id,"userId",type,title,body,"scheduledFor","sentAt","dedupeKey")
VALUES ('uat-img-reminder', :'owner', 'JOB_FOLLOW_UP', 'Check saved applications', 'Two saved applications have no next step.', CURRENT_DATE + time '09:00', now(), :'owner' || ':JOB_FOLLOW_UP:uat-img-none:' || CURRENT_DATE);
UPDATE "JobApplication" SET "actionOwner" = 'ME', "nextAction" = 'Decide whether to apply', "updatedAt" = now() WHERE company LIKE 'WI-016%';
COMMIT;
