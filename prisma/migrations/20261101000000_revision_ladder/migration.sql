-- WI-094: the revision ladder. A problem's revisions are three fixed steps from the day it
-- was solved (3, 7 and 14 days), each revised or missed; the confidence no longer sets dates.
ALTER TABLE "DsaProblem"
  ADD COLUMN "revisionStartedOn" DATE,
  ADD COLUMN "revisionOutcomes" TEXT[] NOT NULL DEFAULT '{}';
-- The confidence-driven schedules of WI-003 are cleared: a problem attempted before this
-- migration shows "Start revision" until its owner starts a ladder.
UPDATE "DsaProblem" SET "nextRevisionAt" = NULL, "revisionStage" = 0, "revisionManual" = false
  WHERE "nextRevisionAt" IS NOT NULL OR "revisionStage" <> 0 OR "revisionManual";
