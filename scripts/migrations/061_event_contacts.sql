-- ============================================================
-- Migration 061: Contactos importantes del evento
-- ============================================================
-- Mismo patron de lista reordenable (setlist/timing/costos/entradas):
-- cargo, nombre (opcionalmente ligado a un contacto real), telefono, y un
-- check "visible_on_share" que controla si aparece en el link publico del
-- evento (por defecto NO, hay que marcarlo a proposito -- nombres y
-- telefonos no deberian filtrarse publicamente sin que alguien lo decida).
-- ============================================================

CREATE TABLE IF NOT EXISTS event_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  role text,
  name text NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  phone text,
  visible_on_share boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_contacts_show ON event_contacts(show_id, position);

ALTER TABLE event_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org access event contacts" ON event_contacts
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
-- SELECT * FROM event_contacts LIMIT 5;
