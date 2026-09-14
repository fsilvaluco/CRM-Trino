-- ============================================================
-- Migration 096: UTMs + Meta Conversions API en qr_scans (Links)
-- ============================================================
-- Para poder correr campañas pagadas (Meta Ads) sobre un link de /q/[slug]
-- y medir conversión server-side (Conversions API), cada escaneo/click
-- necesita guardar de dónde vino (UTMs, fbclid) y qué pasó al mandar el
-- evento a Meta -- nunca bloquea el redirect si Meta falla, por eso se
-- guarda la respuesta completa para poder diagnosticar después.
--
-- Todas las columnas nuevas son opcionales: un escaneo normal (sin
-- campaña detrás) simplemente las deja NULL, igual que hoy.
-- ============================================================

ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS placement TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS fbclid TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS fbc TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS fbp TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS country TEXT;

-- Trazabilidad del envío a Meta CAPI -- nunca se usa para decidir si se
-- redirige o no, solo para poder ver en el dashboard/soporte si un click
-- de verdad se reportó a Meta y qué respondió.
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS meta_capi_event_id TEXT;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS meta_capi_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS meta_capi_response JSONB;

CREATE INDEX IF NOT EXISTS idx_qr_scans_utm_content ON qr_scans (qr_id, utm_content) WHERE utm_content IS NOT NULL;

-- ============================================================
-- Vista: clics por día y por utm_content, por proyecto
-- ============================================================
-- Primera vista SQL del proyecto -- mismo criterio que el resto de
-- reportes de analytics (agregado en el server, RLS de las tablas base
-- sigue aplicando porque la vista no es SECURITY DEFINER).
CREATE OR REPLACE VIEW qr_scans_daily_utm AS
SELECT
  qc.project_id,
  qc.id AS qr_id,
  qc.slug,
  qc.label,
  date_trunc('day', qs.scanned_at) AS day,
  qs.utm_source,
  qs.utm_medium,
  qs.utm_campaign,
  qs.utm_content,
  qs.utm_term,
  qs.placement,
  count(*) AS clicks,
  count(*) FILTER (WHERE qs.meta_capi_sent) AS clicks_reported_to_meta
FROM qr_scans qs
JOIN qr_codes qc ON qc.id = qs.qr_id
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM qr_scans_daily_utm WHERE project_id = '<id>' ORDER BY day DESC;
