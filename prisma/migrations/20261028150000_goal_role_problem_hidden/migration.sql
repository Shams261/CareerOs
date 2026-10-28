-- WI-060: a goal's target role, and hiding an imported practice problem.
ALTER TABLE "Goal" ADD COLUMN "targetRole" TEXT;
ALTER TABLE "DsaProblem" ADD COLUMN "hiddenAt" TIMESTAMPTZ(3);
