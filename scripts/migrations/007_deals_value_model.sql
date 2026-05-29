-- Adds support for net/fixed vs percentage-based deals and tax mode.
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS value_type text NOT NULL DEFAULT 'fixed';

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS percentage_value numeric(5,2);

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS tax_type text NOT NULL DEFAULT 'afecto';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deals_value_type_check'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_value_type_check
      CHECK (value_type IN ('fixed', 'percentage'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deals_tax_type_check'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_tax_type_check
      CHECK (tax_type IN ('afecto', 'exento'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deals_percentage_value_check'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_percentage_value_check
      CHECK (
        percentage_value IS NULL
        OR (percentage_value > 0 AND percentage_value <= 100)
      );
  END IF;
END $$;
