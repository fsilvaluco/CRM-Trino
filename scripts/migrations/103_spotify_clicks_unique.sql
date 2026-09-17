-- ============================================================
-- Migration 103: scans únicos (dedup IP+UA en ventana de 30 min).
-- Target: Supabase (Postgres).
-- ============================================================
-- Un mismo usuario a veces toca el link 2+ veces (vuelve del preview, retoca).
-- Eso infla los SpotifyClicks y hace ver el costo/SpotifyClick más barato de lo
-- real. "Único" = mismo (ip_address, user_agent) dentro de 30 min cuenta 1.
--
-- Se agrega la columna spotify_clicks_unique a ad_metrics_daily (el bot la
-- calcula y guarda igual que el total), y bot_spotify_clicks() ahora devuelve
-- ambos: clicks (total) y clicks_unique. El costo/SpotifyClick del reporte y el
-- resumen usa el ÚNICO para no quedar inflado.
--
-- Único = gaps-and-islands: por (anuncio, día, ip, ua) ordenado por tiempo, se
-- abre una "sesión" nueva cuando el gap con el toque anterior supera 30 min;
-- se cuentan las sesiones.
-- ============================================================

ALTER TABLE ad_metrics_daily
  ADD COLUMN IF NOT EXISTS spotify_clicks_unique BIGINT NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS bot_spotify_clicks(UUID, TIMESTAMPTZ);

CREATE FUNCTION bot_spotify_clicks(p_qr_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE (ad_name TEXT, day DATE, clicks BIGINT, clicks_unique BIGINT)
LANGUAGE sql STABLE AS $$
  WITH reached AS (
    SELECT
      qs.utm_content AS ad_name,
      (qs.scanned_at AT TIME ZONE 'America/Santiago')::date AS day,
      coalesce(qs.ip_address, '') AS ip,
      coalesce(qs.user_agent, '') AS ua,
      qs.scanned_at
    FROM qr_scans qs
    WHERE qs.qr_id = p_qr_id
      AND qs.scanned_at >= p_since
      AND qs.utm_content IS NOT NULL
      AND qs.app_open_result->>'outcome' IN ('app_opened','user_web','tap_fallback_web')
  ),
  marked AS (
    SELECT ad_name, day,
      CASE WHEN scanned_at - lag(scanned_at) OVER (
             PARTITION BY ad_name, day, ip, ua ORDER BY scanned_at
           ) <= interval '30 minutes' THEN 0 ELSE 1 END AS is_new
    FROM reached
  )
  SELECT ad_name, day, count(*) AS clicks, sum(is_new)::bigint AS clicks_unique
  FROM marked
  GROUP BY ad_name, day
$$;
