-- Allow contacts without company (natural-person leads).
-- Some production databases may still enforce contacts.company_id as NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND column_name = 'company_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE contacts
      ALTER COLUMN company_id DROP NOT NULL;
  END IF;
END $$;
