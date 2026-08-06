-- ============================================================
-- Migration 059: Entradas vendidas por tramo
-- ============================================================
-- Mismo patron de lista reordenable que setlist/costos/timing. Cada fila
-- es un tramo de venta (Preventa 1, General, Cortesia, etc.) con precio
-- unitario y cantidad vendida -- el total del evento se puede calcular
-- sumando precio x cantidad de cada tramo.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_ticket_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  unit_price integer NOT NULL DEFAULT 0,
  quantity_sold integer NOT NULL DEFAULT 0,
  capacity integer,
  status_label text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_show ON event_ticket_tiers(show_id, position);

ALTER TABLE event_ticket_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org access ticket tiers" ON event_ticket_tiers
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
-- SELECT * FROM event_ticket_tiers LIMIT 5;
