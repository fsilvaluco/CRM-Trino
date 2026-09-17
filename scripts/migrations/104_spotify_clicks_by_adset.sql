-- ============================================================
-- Migration 104: atribución de SpotifyClicks por CONJUNTO + anuncio.
-- Target: Supabase (Postgres).
-- ============================================================
-- Los creativos se repiten en 2 conjuntos con el MISMO nombre (V01/V03/V06 en
-- INT y BROAD). Cruzar solo por utm_content (= nombre del anuncio) mezcla los
-- conjuntos y cuenta doble. La clave correcta es utm_term (= {{adset.name}})
-- + utm_content (= {{ad.name}}). bot_spotify_clicks() ahora agrupa y devuelve
-- también adset_name.
-- ============================================================

DROP FUNCTION IF EXISTS bot_spotify_clicks(UUID, TIMESTAMPTZ);

CREATE FUNCTION bot_spotify_clicks(p_qr_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE (ad_name TEXT, adset_name TEXT, day DATE, clicks BIGINT, clicks_unique BIGINT)
LANGUAGE sql STABLE AS $$
  WITH reached AS (
    SELECT
      qs.utm_content AS ad_name,
      qs.utm_term AS adset_name,
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
    SELECT ad_name, adset_name, day,
      CASE WHEN scanned_at - lag(scanned_at) OVER (
             PARTITION BY ad_name, adset_name, day, ip, ua ORDER BY scanned_at
           ) <= interval '30 minutes' THEN 0 ELSE 1 END AS is_new
    FROM reached
  )
  SELECT ad_name, adset_name, day, count(*) AS clicks, sum(is_new)::bigint AS clicks_unique
  FROM marked
  GROUP BY ad_name, adset_name, day
$$;
