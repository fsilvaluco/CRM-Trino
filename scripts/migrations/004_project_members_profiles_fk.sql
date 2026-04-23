-- Ensure PostgREST can resolve project_members -> profiles via user_id.
-- This migration is idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_members_user_id_fkey'
      AND conrelid = 'public.project_members'::regclass
  ) THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_members_user_id
  ON public.project_members(user_id);
