-- ============================================================
-- Migration 057: Timing / Cronograma del evento
-- ============================================================
-- Cronograma tipo "Hora | Detalle | Responsable | Notas" -- mismo patron
-- de lista reordenable que setlist/costos. El responsable tambien se
-- puede ligar a un contacto real (mismo criterio que en costos).
-- ============================================================

CREATE TABLE IF NOT EXISTS event_timing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  time_label text,
  activity text NOT NULL,
  responsable text,
  responsable_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timing_show ON event_timing_items(show_id, position);

ALTER TABLE event_timing_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org access timing items" ON event_timing_items
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
-- SELECT * FROM event_timing_items LIMIT 5;
