-- ============================================================
-- Migration 001: Project as primary workspace scope
-- Target: Supabase (Postgres). NOT for local SQLite/Drizzle.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================


-- ============================================================
-- STEP 1: Add organization_id to pipeline_stages
-- Non-breaking: uses IF NOT EXISTS
-- ============================================================
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);


-- ============================================================
-- STEP 2: Backfill pipeline_stages.organization_id
-- ASSUMPTION: single-org install (the common case).
-- If you have multiple orgs, run per-org manually instead.
-- ============================================================
UPDATE pipeline_stages
SET organization_id = (SELECT id FROM organizations ORDER BY created_at LIMIT 1)
WHERE organization_id IS NULL;


-- ============================================================
-- STEP 3: Ensure UNIQUE constraint on project_members(user_id, project_id)
-- Required for ON CONFLICT to work in Step 10.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'project_members'::regclass
      AND contype = 'u'
      AND conkey = ARRAY(
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'project_members'::regclass
          AND attname = ANY(ARRAY['user_id','project_id'])
        ORDER BY attnum
      )::smallint[]
  ) THEN
    ALTER TABLE project_members
      ADD CONSTRAINT project_members_user_project_unique
      UNIQUE (user_id, project_id);
  END IF;
END;
$$;


-- ============================================================
-- STEP 4: Create indexes on project_id / organization_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contacts_project_id      ON contacts(project_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_id          ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_companies_project_id     ON companies(project_id);
CREATE INDEX IF NOT EXISTS idx_companies_org_id         ON companies(organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_project_id         ON deals(project_id);
CREATE INDEX IF NOT EXISTS idx_deals_org_id             ON deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_project_id    ON activities(project_id);
CREATE INDEX IF NOT EXISTS idx_activities_org_id        ON activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id         ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org_id             ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org_id   ON pipeline_stages(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id  ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_proj_id  ON project_members(project_id);

-- Transactions: only if the table exists (finances module is optional)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transactions'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_org_id ON transactions(organization_id)';
  END IF;
END;
$$;


-- ============================================================
-- STEP 5: Helper functions (SECURITY DEFINER → bypass RLS safely)
-- ============================================================

-- Check if current user is a member of a given project
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  );
$$;

-- Check if current user is owner/admin in a given org
CREATE OR REPLACE FUNCTION is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;


-- ============================================================
-- STEP 6: RLS policies — project-scoped access
--
-- Logic for each operational table:
--   • org admin/owner → sees all rows of their org
--   • project member  → sees rows of their assigned projects
--   • project_id IS NULL → only org admin sees (not public to all)
-- ============================================================

-- ── contacts ────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_project_member" ON contacts;
CREATE POLICY "contacts_project_member" ON contacts
  FOR ALL
  USING (
    is_org_admin(organization_id)
    OR (project_id IS NOT NULL AND is_project_member(project_id))
    OR (project_id IS NULL AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = contacts.organization_id
        AND user_id = auth.uid()
    ))
  );

-- ── companies ───────────────────────────────────────────────
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_project_member" ON companies;
CREATE POLICY "companies_project_member" ON companies
  FOR ALL
  USING (
    is_org_admin(organization_id)
    OR (project_id IS NOT NULL AND is_project_member(project_id))
    OR (project_id IS NULL AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = companies.organization_id
        AND user_id = auth.uid()
    ))
  );

-- ── deals ───────────────────────────────────────────────────
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deals_project_member" ON deals;
CREATE POLICY "deals_project_member" ON deals
  FOR ALL
  USING (
    is_org_admin(organization_id)
    OR (project_id IS NOT NULL AND is_project_member(project_id))
    OR (project_id IS NULL AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = deals.organization_id
        AND user_id = auth.uid()
    ))
  );

-- ── activities ──────────────────────────────────────────────
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_project_member" ON activities;
CREATE POLICY "activities_project_member" ON activities
  FOR ALL
  USING (
    is_org_admin(organization_id)
    OR (project_id IS NOT NULL AND is_project_member(project_id))
    OR (project_id IS NULL AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = activities.organization_id
        AND user_id = auth.uid()
    ))
  );

-- ── tasks ───────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_project_member" ON tasks;
CREATE POLICY "tasks_project_member" ON tasks
  FOR ALL
  USING (
    is_org_admin(organization_id)
    OR (project_id IS NOT NULL AND is_project_member(project_id))
    OR (project_id IS NULL AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = tasks.organization_id
        AND user_id = auth.uid()
    ))
  );

-- ── transactions (optional — only if table exists) ──────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transactions'
  ) THEN
    EXECUTE 'ALTER TABLE transactions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "transactions_project_member" ON transactions';
    EXECUTE $inner$
      CREATE POLICY "transactions_project_member" ON transactions
        FOR ALL
        USING (
          is_org_admin(organization_id)
          OR (project_id IS NOT NULL AND is_project_member(project_id))
          OR (project_id IS NULL AND EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = transactions.organization_id
              AND user_id = auth.uid()
          ))
        )
    $inner$;
  END IF;
END;
$$;


-- ============================================================
-- STEP 7: pipeline_stages RLS (org-scoped, not project-scoped)
-- ============================================================
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_stages_org_member" ON pipeline_stages;
CREATE POLICY "pipeline_stages_org_member" ON pipeline_stages
  FOR ALL
  USING (
    organization_id IS NULL  -- stages sin org: visible a todos (legacy)
    OR EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = pipeline_stages.organization_id
        AND user_id = auth.uid()
    )
  );


-- ============================================================
-- STEP 8: project_members RLS
-- A member can read ONLY their own project memberships.
-- Admins can read/write all memberships in their org.
-- ============================================================
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_members_org_access" ON project_members;

-- Admins: full access to all project_members in their org
CREATE POLICY "project_members_admin_full" ON project_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      INNER JOIN projects p ON p.id = project_members.project_id
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p.organization_id
        AND om.role IN ('owner', 'admin')
    )
  );

-- Members: read only their own rows
DROP POLICY IF EXISTS "project_members_self_read" ON project_members;
CREATE POLICY "project_members_self_read" ON project_members
  FOR SELECT
  USING (user_id = auth.uid());


-- ============================================================
-- STEP 9: Trigger — auto-add project creator as project_member
-- ============================================================
CREATE OR REPLACE FUNCTION auto_add_project_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO project_members (user_id, project_id, organization_id)
    VALUES (NEW.created_by, NEW.id, NEW.organization_id)
    ON CONFLICT (user_id, project_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_add_project_creator ON projects;
CREATE TRIGGER trg_auto_add_project_creator
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_project_creator();


-- ============================================================
-- STEP 10: Backfill project_members
-- Add all org admins/owners to all existing projects.
-- Depends on STEP 3 unique constraint.
-- ============================================================
INSERT INTO project_members (user_id, project_id, organization_id)
SELECT om.user_id, p.id, p.organization_id
FROM organization_members om
INNER JOIN projects p ON p.organization_id = om.organization_id
WHERE om.role IN ('owner', 'admin')
ON CONFLICT (user_id, project_id) DO NOTHING;


-- STEP 3: Add project_id to pipeline_stages (stages are now per-project)
-- Optional: if you want project-scoped stages in the future
-- ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
-- For now, stages remain org-scoped. This migration only fixes the org isolation bug.

-- STEP 4: Create indexes on project_id for all operational tables (if not exist)
CREATE INDEX IF NOT EXISTS idx_contacts_project_id ON contacts(project_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_companies_project_id ON companies(project_id);
CREATE INDEX IF NOT EXISTS idx_companies_org_id ON companies(organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_project_id ON deals(project_id);
CREATE INDEX IF NOT EXISTS idx_deals_org_id ON deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_project_id ON activities(project_id);
CREATE INDEX IF NOT EXISTS idx_activities_org_id ON activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org_id ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_org_id ON transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org_id ON pipeline_stages(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);

-- ============================================================
-- STEP 5: RLS policies — project-scoped access
-- ============================================================

-- Helper function: check if the current user is a member of a given project
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  );
$$;

-- Helper function: check if user is org admin/owner
CREATE OR REPLACE FUNCTION is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

-- ──────────────────────────────────────────────────────────
-- contacts RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_project_member" ON contacts;
CREATE POLICY "contacts_project_member" ON contacts
  FOR ALL
  USING (
    project_id IS NULL
    OR is_org_admin(organization_id)
    OR is_project_member(project_id)
  );

-- ──────────────────────────────────────────────────────────
-- companies RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_project_member" ON companies;
CREATE POLICY "companies_project_member" ON companies
  FOR ALL
  USING (
    project_id IS NULL
    OR is_org_admin(organization_id)
    OR is_project_member(project_id)
  );

-- ──────────────────────────────────────────────────────────
-- deals RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deals_project_member" ON deals;
CREATE POLICY "deals_project_member" ON deals
  FOR ALL
  USING (
    project_id IS NULL
    OR is_org_admin(organization_id)
    OR is_project_member(project_id)
  );

-- ──────────────────────────────────────────────────────────
-- activities RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_project_member" ON activities;
CREATE POLICY "activities_project_member" ON activities
  FOR ALL
  USING (
    project_id IS NULL
    OR is_org_admin(organization_id)
    OR is_project_member(project_id)
  );

-- ──────────────────────────────────────────────────────────
-- tasks RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_project_member" ON tasks;
CREATE POLICY "tasks_project_member" ON tasks
  FOR ALL
  USING (
    project_id IS NULL
    OR is_org_admin(organization_id)
    OR is_project_member(project_id)
  );

-- ──────────────────────────────────────────────────────────
-- transactions RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_project_member" ON transactions;
CREATE POLICY "transactions_project_member" ON transactions
  FOR ALL
  USING (
    project_id IS NULL
    OR is_org_admin(organization_id)
    OR is_project_member(project_id)
  );

-- ──────────────────────────────────────────────────────────
-- pipeline_stages RLS (org-scoped)
-- ──────────────────────────────────────────────────────────
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_stages_org_member" ON pipeline_stages;
CREATE POLICY "pipeline_stages_org_member" ON pipeline_stages
  FOR ALL
  USING (
    organization_id IS NULL
    OR EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = pipeline_stages.organization_id
        AND user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────
-- project_members: readable by org members
-- ──────────────────────────────────────────────────────────
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_members_org_access" ON project_members;
CREATE POLICY "project_members_org_access" ON project_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      INNER JOIN projects p ON p.id = project_members.project_id
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p.organization_id
    )
  );

-- ============================================================
-- STEP 6: Auto-assign creator as project_member on project creation
-- ============================================================
CREATE OR REPLACE FUNCTION auto_add_project_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO project_members (user_id, project_id, organization_id)
  VALUES (NEW.created_by, NEW.id, NEW.organization_id)
  ON CONFLICT (user_id, project_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_add_project_creator ON projects;
CREATE TRIGGER trg_auto_add_project_creator
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_project_creator();

-- ============================================================
-- STEP 7: Backfill project_members for existing projects
-- Add all org admin/owner members to all existing projects
-- ============================================================
INSERT INTO project_members (user_id, project_id, organization_id)
SELECT om.user_id, p.id, p.organization_id
FROM organization_members om
INNER JOIN projects p ON p.organization_id = om.organization_id
WHERE om.role IN ('owner', 'admin')
ON CONFLICT (user_id, project_id) DO NOTHING;
