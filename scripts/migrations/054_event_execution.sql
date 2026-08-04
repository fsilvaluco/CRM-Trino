-- ============================================================
-- Migration 054: Planilla de ejecución del evento
-- ============================================================
-- Setlist (lista reordenable de canciones) y costos (lista reordenable de
-- items con monto) van en tablas propias porque son listas de largo
-- variable -- todo lo demas (riders, link del evento) son campos simples
-- directos en `shows`.
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS event_link text;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS rider_local text;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS rider_banda text;

CREATE TABLE IF NOT EXISTS event_setlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_setlist_show ON event_setlist_items(show_id, position);

CREATE TABLE IF NOT EXISTS event_cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cost_items_show ON event_cost_items(show_id, position);

ALTER TABLE event_setlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_cost_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org access setlist items" ON event_setlist_items
  FOR ALL
  USING (show_id IN (
    SELECT id FROM shows WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ))
  WITH CHECK (show_id IN (
    SELECT id FROM shows WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "org access cost items" ON event_cost_items
  FOR ALL
  USING (show_id IN (
    SELECT id FROM shows WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ))
  WITH CHECK (show_id IN (
    SELECT id FROM shows WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name='shows' AND column_name IN ('event_link','rider_local','rider_banda');
-- SELECT * FROM event_setlist_items LIMIT 5;
-- SELECT * FROM event_cost_items LIMIT 5;
