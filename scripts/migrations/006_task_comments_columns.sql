-- ============================================================
-- Migration 006: Task Comments - Add missing columns
-- Target: Supabase (Postgres). NOT for local SQLite/Drizzle.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Purpose: Add organization_id and created_by columns to task_comments
-- so that comments can be scoped per organization and tracked by user.
-- ============================================================


-- ============================================================
-- STEP 1: Ensure task_comments table exists (Supabase/Postgres)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Usuario',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- STEP 2: Add organization_id column (if it doesn't exist)
-- ============================================================
ALTER TABLE task_comments
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE task_comments
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;


-- ============================================================
-- STEP 3: Add indexes for query performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
  ON task_comments(task_id);

CREATE INDEX IF NOT EXISTS idx_task_comments_org_id
  ON task_comments(organization_id);

CREATE INDEX IF NOT EXISTS idx_task_comments_created_at
  ON task_comments(created_at ASC);


-- ============================================================
-- STEP 4: Enable RLS (Row Level Security)
-- ============================================================
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- Allow org members to view comments for tasks in their org
CREATE POLICY IF NOT EXISTS "Org members can view task comments"
  ON task_comments FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow org members to insert comments
CREATE POLICY IF NOT EXISTS "Org members can add task comments"
  ON task_comments FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow comment author to delete their own comments
CREATE POLICY IF NOT EXISTS "Authors can delete own task comments"
  ON task_comments FOR DELETE
  USING (created_by = auth.uid());
