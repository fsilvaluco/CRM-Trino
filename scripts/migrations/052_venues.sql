-- ============================================================
-- Migration 052: Venues como entidad propia (como Empresas)
-- ============================================================
-- Los venues se repiten entre eventos (mismo teatro, misma sala) asi que
-- valia la pena sacarlos del campo de texto libre "venue" en `shows` y
-- convertirlos en su propia tabla reutilizable -- igual que companies.
--
-- Direccion y comuna/region/pais quedan pensados para completarse con
-- Google Places (lat/lng incluidos) pero funcionan igual si se llenan a
-- mano; no hay dependencia dura de Maps en el esquema.
-- ============================================================

CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  comuna text,
  region text,
  country text,
  latitude double precision,
  longitude double precision,
  capacity_standing integer,
  capacity_seated integer,
  mood text,
  description text,
  parking_available boolean,
  backline_available boolean,
  website text,
  instagram text,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_venues_org ON venues(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_name ON venues(organization_id, name) WHERE deleted_at IS NULL;

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org access venues" ON venues
  FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- Enlace desde shows: venue_id es la fuente de verdad cuando existe: el
-- texto libre venue/address se sigue llenando (denormalizado) para no
-- romper nada que ya lea show.venue / show.address directamente.
ALTER TABLE shows ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shows_venue_id ON shows(venue_id);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM venues LIMIT 5;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'shows' AND column_name = 'venue_id';
