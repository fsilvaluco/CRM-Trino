-- Estadísticas de Spotify más allá de seguidores: oyentes, reproducciones,
-- guardados, etc. — capturadas desde un pantallazo de Spotify for Artists
-- (leído con IA) o tecleadas a mano. Siempre revisadas/confirmadas por el
-- usuario antes de guardar (nunca se auto-guarda una lectura de IA sin
-- pasar por esa confirmación).
--
-- No reemplaza social_metrics: los seguidores de cada snapshot también se
-- espejan ahí (platform='spotify') para aparecer en el mismo gráfico
-- compartido con Instagram/TikTok/YouTube/Facebook. Esta tabla es la que
-- guarda el resto de las métricas, que no tienen dónde vivir en el modelo
-- genérico de "seguidores por día".

CREATE TABLE IF NOT EXISTS spotify_stats_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  listeners INTEGER,               -- "Oyentes" del período
  monthly_active_listeners INTEGER,-- "Oyentes activos mensuales"
  streams INTEGER,                 -- "Reproducciones" del período
  streams_per_listener NUMERIC,    -- "Reproducciones por oyente"
  saves INTEGER,                   -- "Veces que se guardó"
  playlist_adds INTEGER,           -- "Veces que se agregó a una playlist"
  followers INTEGER,               -- "Seguidores" (también espejado a social_metrics)
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'screenshot'
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spotify_stats_snapshots_project
  ON spotify_stats_snapshots(organization_id, project_id, period_end DESC);

ALTER TABLE spotify_stats_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spotify_stats_snapshots_project_member" ON spotify_stats_snapshots;
CREATE POLICY "spotify_stats_snapshots_project_member" ON spotify_stats_snapshots
  FOR ALL
  USING (is_org_admin(organization_id) OR is_project_member(project_id))
  WITH CHECK (is_org_admin(organization_id) OR is_project_member(project_id));
