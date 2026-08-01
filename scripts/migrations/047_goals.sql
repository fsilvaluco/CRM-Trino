-- ============================================================
-- Migration 047: Metas (KPIs) por proyecto
-- Target: Supabase (Postgres).
-- ============================================================
-- Cada proyecto (sello o artista) puede tener sus propias metas. El
-- valor objetivo (target_value) SIEMPRE se ingresa a mano -- no hay
-- fuente automatica para eso. Lo que SI puede ser automatico es el
-- progreso actual (current_value): para la mayoria de los tipos se
-- calcula en vivo desde datos que ya existen en el CRM (deals, tasks,
-- social_metrics); solo el tipo 'manual' guarda su propio numero, que
-- el equipo actualiza a mano.
--
-- period_type define como se calcula la ventana de tiempo del progreso:
-- 'monthly'/'annual' son recurrentes -- SIEMPRE se evaluan contra el
-- mes/año calendario ACTUAL en el momento de mirar el dashboard (no
-- quedan "vencidas", simplemente se resetean solas al cambiar de mes/
-- año). 'custom' usa un rango de fechas fijo guardado en la fila.
-- ============================================================

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'ventas_deals', 'cantidad_deals', 'tareas_completadas', 'seguidores', 'manual'
  )),
  title TEXT NOT NULL,
  target_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC, -- solo se usa (y se edita a mano) para metric_type = 'manual'
  period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly', 'annual', 'custom')),
  period_start DATE, -- solo aplica (y es requerido en la practica) para period_type = 'custom'
  period_end DATE,   -- idem
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_project ON goals(project_id);
CREATE INDEX IF NOT EXISTS idx_goals_org ON goals(organization_id);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- Mismo criterio de acceso que el resto de las tablas por-proyecto:
-- cualquier miembro de la organizacion puede ver/editar (el filtrado
-- fino por proyecto ya lo hace la app vía requireAuth/allowedProjectIds,
-- igual que en tasks/deals).
CREATE POLICY goals_org_access ON goals FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- BACKFILL: sembrar las 5 metas por defecto en cada proyecto que ya
-- existe, con target_value = 0 (el equipo las edita despues) y
-- period_type = 'monthly'. El que no le sirva alguna, la borra.
-- ============================================================

INSERT INTO goals (organization_id, project_id, metric_type, title, target_value, period_type)
SELECT p.organization_id, p.id, m.metric_type, m.title, 0, 'monthly'
FROM projects p
CROSS JOIN (
  VALUES
    ('ventas_deals', 'Ventas ganadas'),
    ('cantidad_deals', 'Deals ganados'),
    ('tareas_completadas', 'Tareas completadas'),
    ('seguidores', 'Crecimiento de seguidores'),
    ('manual', 'Meta manual')
) AS m(metric_type, title);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT metric_type, count(*) FROM goals GROUP BY metric_type;
