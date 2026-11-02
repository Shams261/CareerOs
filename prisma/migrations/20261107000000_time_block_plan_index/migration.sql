-- WI-140: a day's blocks are read by their plan and start time (Today, Plan, Close the Day,
-- reminders). The plan's own index went with "TimeBlock_dailyPlanId_routineKey_key" in WI-002, when
-- generation was keyed by routine and occurrence date; this brings one back. Expand-only.
CREATE INDEX "TimeBlock_dailyPlanId_plannedStart_idx" ON "TimeBlock"("dailyPlanId", "plannedStart");
