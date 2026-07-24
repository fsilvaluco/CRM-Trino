-- Módulo de Prensa: registro de cobertura mediática, opcionalmente
-- asociado a una campaña (subprojects — "Un loco amor", "La Amistad Hecha
-- Bolero", "Gira Verano 2026", etc.), que es exactamente lo que Francisco
-- ya usa para lanzamientos/giras. No se crea un catálogo de campañas
-- nuevo — se reusa subprojects tal cual.

CREATE TABLE IF NOT EXISTS press_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES subprojects(id) ON DELETE SET NULL,
  mention_date DATE, -- nullable: algunas menciones históricas no tienen fecha exacta
  outlet TEXT NOT NULL, -- medio
  type TEXT NOT NULL CHECK (type IN ('radio', 'tv', 'digital', 'digital_rrss')),
  source TEXT NOT NULL DEFAULT 'earned' CHECK (source IN ('earned', 'own', 'partner')), -- ganada / propia / partner (ticketeras, etc.)
  title TEXT NOT NULL, -- descripción de la nota/entrevista
  reference_url TEXT,
  social_url TEXT, -- link a RRSS/YouTube si aplica
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_press_mentions_project ON press_mentions(organization_id, project_id, mention_date DESC);
CREATE INDEX IF NOT EXISTS idx_press_mentions_campaign ON press_mentions(campaign_id);

ALTER TABLE press_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "press_mentions_project_member" ON press_mentions;
CREATE POLICY "press_mentions_project_member" ON press_mentions
  FOR ALL
  USING (is_org_admin(organization_id) OR is_project_member(project_id))
  WITH CHECK (is_org_admin(organization_id) OR is_project_member(project_id));
