-- Ledger for guarded operational scripts (see scripts/timestamps.ts). IF NOT EXISTS because the
-- legacy timestamp repair may create this table before pending migrations are deployed.
CREATE TABLE IF NOT EXISTS "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "performedAt" TIMESTAMPTZ(3) NOT NULL,
    "details" JSONB NOT NULL,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);
