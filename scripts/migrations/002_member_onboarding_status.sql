-- ============================================================
-- Migration 002: Member onboarding status (pending | active)
-- Target: Supabase (Postgres). NOT for local SQLite/Drizzle.
-- Run in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Keep values constrained to V1 states.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_members_status_check'
  ) THEN
    ALTER TABLE organization_members
      ADD CONSTRAINT organization_members_status_check
      CHECK (status IN ('pending', 'active'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_organization_members_status
  ON organization_members(status);