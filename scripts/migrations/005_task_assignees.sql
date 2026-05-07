-- ============================================================
-- Migration 005: Task Assignees - Multi-user task assignment
-- Target: Supabase (Postgres). NOT for local SQLite/Drizzle.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Purpose: Enable assigning multiple users to tasks for notifications
-- and workload distribution. Required for push notifications feature.
-- Foreign keys reference profiles table (1:1 with auth.users).
-- ============================================================


-- ============================================================
-- STEP 1: Create task_assignees join table
-- Links tasks to users (via profiles table)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id),
  
  -- Prevent duplicate assignments
  UNIQUE(task_id, user_id)
);


-- ============================================================
-- STEP 2: Add indexes for query performance
-- Common queries: "tasks assigned to me", "assignees of this task"
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id 
  ON task_assignees(task_id);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id 
  ON task_assignees(user_id);

CREATE INDEX IF NOT EXISTS idx_task_assignees_assigned_at 
  ON task_assignees(assigned_at DESC);


-- ============================================================
-- STEP 3: Enable RLS (Row Level Security)
-- Users can only see/modify assignments for tasks in their organization
-- (validated via organization_members, even though FK is to profiles)
-- ============================================================
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 4: RLS Policies
-- ============================================================

-- Policy: Users can see task assignments if they're in the same org as the task's project
CREATE POLICY "Users can view task assignments in their organization"
  ON task_assignees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      INNER JOIN projects p ON t.project_id = p.id
      INNER JOIN organization_members om ON p.organization_id = om.organization_id
      WHERE t.id = task_assignees.task_id
        AND om.user_id = auth.uid()
    )
  );

-- Policy: Users can assign tasks to others in their organization
CREATE POLICY "Users can create task assignments in their organization"
  ON task_assignees
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      INNER JOIN projects p ON t.project_id = p.id
      INNER JOIN organization_members om ON p.organization_id = om.organization_id
      WHERE t.id = task_assignees.task_id
        AND om.user_id = auth.uid()
    )
  );

-- Policy: Users can remove task assignments in their organization
CREATE POLICY "Users can delete task assignments in their organization"
  ON task_assignees
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      INNER JOIN projects p ON t.project_id = p.id
      INNER JOIN organization_members om ON p.organization_id = om.organization_id
      WHERE t.id = task_assignees.task_id
        AND om.user_id = auth.uid()
    )
  );


-- ============================================================
-- STEP 5: Add organization_id to tasks table (if missing)
-- Required for proper scoping in multi-org setups
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Backfill from project relationship
UPDATE tasks
SET organization_id = p.organization_id
FROM projects p
WHERE tasks.project_id = p.id
  AND tasks.organization_id IS NULL;


-- ============================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================
-- Uncomment to verify migration:
-- SELECT COUNT(*) FROM task_assignees;
-- SELECT * FROM pg_indexes WHERE tablename = 'task_assignees';
-- SELECT * FROM pg_policies WHERE tablename = 'task_assignees';
