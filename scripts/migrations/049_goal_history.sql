-- ============================================================
-- Migration 049: Historial de Metas (para reportes de fin de año)
-- Target: Supabase (Postgres).
-- ============================================================
-- Las metas mensuales/anuales se calculan siempre EN VIVO contra el
-- periodo actual (ver 047_goals.sql) -- al cambiar de mes, el resultado
-- del mes anterior se pierde para siempre. Esta tabla guarda una "foto"
-- de cada meta justo cuando su periodo termina, para poder mirar atras
-- (ej. "¿se cumplio la meta todos los meses de este año?") sin depender
-- de recalcular datos viejos.
--
-- Es una fila auto-contenida (no solo un FK a goals) a proposito: si la
-- meta se edita o se borra despues, el historial ya capturado no debe
-- cambiar de significado retroactivamente.
-- ============================================================

CREATE TABLE IF NOT EXISTS goal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL, -- solo trazabilidad; puede quedar null si la meta se borra
  metric_type TEXT NOT NULL,
  title TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'annual')), -- 'custom' no aplica, no tiene un "periodo que termina" recurrente
  period_label TEXT NOT NULL, -- 'YYYY-MM' para mensual, 'YYYY' para anual
  target_value NUMERIC NOT NULL,
  achieved_value NUMERIC NOT NULL,
  pct_achieved NUMERIC, -- null si la meta no tenia target (target_value = 0)
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(goal_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_goal_history_project ON goal_history(project_id);
CREATE INDEX IF NOT EXISTS idx_goal_history_period ON goal_history(period_label);

ALTER TABLE goal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_history_org_access ON goal_history FOR ALL
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
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT period_label, count(*) FROM goal_history GROUP BY period_label ORDER BY period_label;
