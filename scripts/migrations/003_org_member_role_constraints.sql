-- ============================================================
-- Migration 003: Organization member role hardening
-- Target: Supabase (Postgres). NOT for local SQLite/Drizzle.
-- Run in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- Normalize role column to strict text values.
ALTER TABLE organization_members
  ALTER COLUMN role TYPE TEXT USING lower(role::text);

ALTER TABLE organization_members
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE organization_members
  ALTER COLUMN role SET DEFAULT 'member';

-- Replace any previous role constraint with an explicit whitelist.
ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));

-- Fail fast if the table already has multiple owners in the same organization.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM organization_members
    WHERE role = 'owner'
    GROUP BY organization_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce single owner constraint: organizations with multiple owners exist';
  END IF;
END;
$$;

-- Enforce at most one owner per organization.
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_single_owner_idx
  ON organization_members(organization_id)
  WHERE role = 'owner';

CREATE INDEX IF NOT EXISTS idx_organization_members_org_role
  ON organization_members(organization_id, role);
