-- ============================================================
-- Migration 040: Deal Assignees - selector de responsable en Tratos
-- Target: Supabase (Postgres).
-- ============================================================
-- Espejo de task_assignees (005), pero para deals. Mismo patron: tabla
-- de union, multi-usuario, RLS acotada a la organizacion del deal.
-- Usa get_user_org_id()/is_org_staff(), ya definidas en 022, para quedar
-- consistente con las politicas actuales de deals (no las viejas de
-- organization_members "a mano" que usaba task_assignees originalmente).
-- ============================================================

CREATE TABLE IF NOT EXISTS deal_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id),

  UNIQUE(deal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_assignees_deal_id
  ON deal_assignees(deal_id);

CREATE INDEX IF NOT EXISTS idx_deal_assignees_user_id
  ON deal_assignees(user_id);

ALTER TABLE deal_assignees ENABLE ROW LEVEL SECURITY;

-- Staff (owner/admin/member) de la organizacion del deal: acceso total.
CREATE POLICY deal_assignees_staff_all ON deal_assignees FOR ALL
  USING (
    is_org_staff()
    AND EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_assignees.deal_id
        AND d.organization_id = get_user_org_id()
    )
  )
  WITH CHECK (
    is_org_staff()
    AND EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_assignees.deal_id
        AND d.organization_id = get_user_org_id()
    )
  );

-- Artista autogestionado (mismo criterio que deals_artist_selfmanaged_write):
-- puede ver y modificar los responsables de sus propios tratos.
CREATE POLICY deal_assignees_artist_selfmanaged ON deal_assignees FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_assignees.deal_id
        AND d.organization_id = get_user_org_id()
        AND (
          (is_project_member(d.artist_project_id) AND is_self_managed(d.artist_project_id))
          OR (is_project_member(d.project_id) AND is_self_managed(d.project_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_assignees.deal_id
        AND d.organization_id = get_user_org_id()
        AND (
          (is_project_member(d.artist_project_id) AND is_self_managed(d.artist_project_id))
          OR (is_project_member(d.project_id) AND is_self_managed(d.project_id))
        )
    )
  );

-- ============================================================
-- VERIFICATION QUERIES (correr despues de aplicar)
-- ============================================================
-- SELECT COUNT(*) FROM deal_assignees;
-- SELECT * FROM pg_policies WHERE tablename = 'deal_assignees';
