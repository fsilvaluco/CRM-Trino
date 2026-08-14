-- ============================================================
-- Migration 067: Firma virtual del cierre de caja
-- ============================================================
-- Una fila = una persona aprobó el cierre de caja de un evento. Los
-- firmantes requeridos NO se guardan acá -- se calculan en caliente como
-- "los project_members del proyecto del evento" (si alguien entra o sale
-- del proyecto después, la lista de requeridos cambia sola, a propósito).
--
-- Sin UPDATE/DELETE policy: una firma es un hecho irreversible, no se
-- edita ni se borra desde la app (si hay que rehacer el cierre, se reabre
-- la caja -- eso sí borra las firmas explícitamente vía backend, ver
-- reopen/route.ts).
-- ============================================================

CREATE TABLE IF NOT EXISTS event_closing_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (show_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_closing_signatures_show ON event_closing_signatures(show_id);

ALTER TABLE event_closing_signatures ENABLE ROW LEVEL SECURITY;

-- Mismo patron org-wide que event_cost_items/event_contacts (migraciones
-- 054/061) -- el filtrado fino por PROYECTO (no solo organizacion) lo hace
-- la API route (/api/eventos/[id]/signatures), igual que ya hace para
-- otras cosas via allowedProjectIds.
CREATE POLICY "org access closing signatures select" ON event_closing_signatures
  FOR SELECT USING (
    show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "org access closing signatures insert" ON event_closing_signatures
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM event_closing_signatures ORDER BY signed_at DESC LIMIT 10;
