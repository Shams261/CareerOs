-- WI-114: the monthly AI limit is the owner's own setting; null means Silsila sets none.
ALTER TABLE "AiSetting" ADD COLUMN "monthlyLimitMicros" INTEGER;

ALTER TABLE "AiSetting" ADD CONSTRAINT "AiSetting_monthly_limit_range" CHECK (
  "monthlyLimitMicros" IS NULL
  OR ("monthlyLimitMicros" >= 100000 AND "monthlyLimitMicros" <= 1000000000)
);
