-- ============================================================
-- Migration 091: Estadísticas manuales de TikTok/YouTube
-- ============================================================
-- Instagram/Facebook ya llegan en vivo (Meta Graph API, artist_integrations)
-- y Spotify ya tiene su propia tabla (spotify_stats_snapshots, leída de
-- pantallazo con IA o a mano). TikTok y YouTube no tienen integración
-- todavía (TikTok exige aprobación de su Business API; YouTube sí tiene
-- API oficial pero no está construida aún) -- mientras tanto, esta tabla
-- guarda snapshots tecleados a mano, con las métricas como JSONB en vez de
-- columnas fijas: TikTok y YouTube tienen métricas bien distintas entre sí
-- (ver DOSSIER_METRIC_KEYS en src/lib/dossier-data-sources.ts para el set
-- de claves soportadas por plataforma) y así se evita una tabla nueva por
-- cada plataforma sin integración real todavía.
-- ============================================================

CREATE TABLE IF NOT EXISTS manual_platform_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_platform_stats_project
  ON manual_platform_stats(organization_id, project_id, platform, period_end DESC);

ALTER TABLE manual_platform_stats ENABLE ROW LEVEL SECURITY;

-- Mismo patrón org-wide que el resto de Métricas (spotify_stats_snapshots,
-- social_metrics): el filtrado fino por proyecto lo hace la API route.
CREATE POLICY "org access manual_platform_stats select" ON manual_platform_stats
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access manual_platform_stats insert" ON manual_platform_stats
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access manual_platform_stats delete" ON manual_platform_stats
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM manual_platform_stats ORDER BY created_at DESC LIMIT 10;
