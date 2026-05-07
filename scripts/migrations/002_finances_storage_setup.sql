-- ============================================================
-- Migration 002: Finances Storage Bucket & RLS Policies
-- Target: Supabase (Postgres + Storage). NOT for local SQLite.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- IMPORTANT: If bucket 'finances' doesn't exist, create it first via Supabase Dashboard:
-- Storage → Create Bucket → Name: "finances" → Public: NO → File size limit: 10MB

-- ============================================================
-- STEP 1: Enable RLS on storage.objects (if not already enabled)
-- ============================================================
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 2: Storage Policies for 'finances' bucket
-- ============================================================

-- Policy 1: Allow authenticated users to upload files to their own folder
-- Pattern: receipts/{user_id}/*
DROP POLICY IF EXISTS "Users can upload to their own folder" ON storage.objects;
CREATE POLICY "Users can upload to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'finances'
  AND (storage.foldername(name))[1] = 'receipts'
  AND (storage.foldername(name))[2] = auth.uid()::text
);


-- Policy 2: Allow users to view files from their organization
-- This assumes organization_id can be inferred from the file path or related data
-- For now, we'll allow organization members to see all files in the bucket
-- (more granular control would require storing metadata)
DROP POLICY IF EXISTS "Organization members can view files" ON storage.objects;
CREATE POLICY "Organization members can view files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'finances'
  AND EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.user_id = auth.uid()
  )
);


-- Policy 3: Allow users to delete their own files
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
CREATE POLICY "Users can delete their own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'finances'
  AND (storage.foldername(name))[1] = 'receipts'
  AND (storage.foldername(name))[2] = auth.uid()::text
);


-- Policy 4: Allow users to update/replace their own files
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
CREATE POLICY "Users can update their own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'finances'
  AND (storage.foldername(name))[1] = 'receipts'
  AND (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'finances'
  AND (storage.foldername(name))[1] = 'receipts'
  AND (storage.foldername(name))[2] = auth.uid()::text
);


-- ============================================================
-- VERIFICATION QUERIES (optional - run to check setup)
-- ============================================================

-- Check if policies exist
-- SELECT * FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%finances%' OR policyname LIKE '%Users can%';

-- Check bucket configuration
-- SELECT * FROM storage.buckets WHERE name = 'finances';
