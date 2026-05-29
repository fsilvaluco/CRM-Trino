-- Allow deals associated only to a company (without a contact).
-- Some production databases still have deals.contact_id as NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'deals'
      AND column_name = 'contact_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE deals
      ALTER COLUMN contact_id DROP NOT NULL;
  END IF;
END $$;
