-- artist_integrations upsert uses .upsert(..., { onConflict: 'organization_id,platform' })
-- but the table has no unique/exclusion constraint on (organization_id, platform),
-- causing Postgres error 42P10 on every OAuth callback upsert.

-- Dedupe first: keep only the most recently updated row per (organization_id, platform)
-- so the unique constraint below can be created without violating existing data.
DELETE FROM artist_integrations t
WHERE t.ctid NOT IN (
  SELECT DISTINCT ON (organization_id, platform) ctid
  FROM artist_integrations
  ORDER BY organization_id, platform, updated_at DESC NULLS LAST, ctid DESC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'artist_integrations'::regclass
      AND contype = 'u'
      AND conname = 'artist_integrations_org_platform_key'
  ) THEN
    ALTER TABLE artist_integrations
      ADD CONSTRAINT artist_integrations_org_platform_key
      UNIQUE (organization_id, platform);
  END IF;
END $$;
