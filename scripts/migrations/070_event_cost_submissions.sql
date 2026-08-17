-- ============================================================
-- Migration 070: Envío de gastos por link (para que cualquier integrante
-- del proyecto suba su gasto sin necesitar acceso a editar la Planilla)
-- ============================================================
-- Una fila = un gasto que alguien reportó desde /eventos/[id]/gastos,
-- pendiente de revisión. NO toca event_cost_items directamente -- cuando
-- un admin aprueba, se inserta un event_cost_items nuevo (misma lógica que
-- agregar una fila a mano) y esta fila queda como historial/comprobante de
-- ese envío. Así el "guardado completo" que ya usa PUT
-- /api/eventos/[id]/costs (borra lo que no venga en el payload) nunca
-- puede pisar un envío pendiente por accidente.
--
-- Mismo patrón org-wide de RLS que event_cost_items/event_closing_signatures
-- (migraciones 054/067) -- el filtrado fino por PROYECTO (no solo
-- organización) y el chequeo "solo admins aprueban" los hace la API route.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_cost_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  responsable TEXT,
  responsable_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  comprobante_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  cost_item_id UUID REFERENCES event_cost_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_cost_submissions_show ON event_cost_submissions(show_id);
CREATE INDEX IF NOT EXISTS idx_event_cost_submissions_status ON event_cost_submissions(show_id, status);

ALTER TABLE event_cost_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org access cost submissions select" ON event_cost_submissions
  FOR SELECT USING (
    show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "org access cost submissions insert" ON event_cost_submissions
  FOR INSERT WITH CHECK (
    submitted_by = auth.uid()
    AND show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Solo se actualiza al revisar (aprobar/rechazar) -- la API restringe esto
-- a admins, pero la policy igual limita a la misma organización.
CREATE POLICY "org access cost submissions update" ON event_cost_submissions
  FOR UPDATE USING (
    show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM event_cost_submissions ORDER BY created_at DESC LIMIT 10;
