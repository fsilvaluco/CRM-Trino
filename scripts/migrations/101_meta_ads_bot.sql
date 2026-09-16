-- ============================================================
-- Migration 101: Meta Ads Bot - métricas diarias por anuncio + log de acciones
-- Target: Supabase (Postgres).
-- ============================================================
-- Módulo del bot que optimiza la campaña de ads (cuenta act_1734662137756560,
-- "CP_LUR"). Dos tablas:
--
--   ad_metrics_daily  -> una fila por (ad_id, date). El cron cada 6h baja
--                        insights de Meta (level=ad, últimos 3 días, desglose
--                        diario) y hace UPSERT idempotente. `spotify_clicks`
--                        se cruza desde qr_scans por utm_content = ad_name
--                        (ese es el enganche entre Meta y Artist Pro).
--
--   ad_actions_log    -> auditoría de TODA decisión del motor de reglas,
--                        incluidas las que NO se ejecutan (dry_run=true) y las
--                        alertas. before/after guardan el estado alrededor del
--                        cambio para poder revisar/deshacer a mano.
--
-- Sin RLS, igual que el resto de tablas internas de sync (shopify_sales_daily,
-- etc.): el acceso pasa solo por el service role en los crons del servidor,
-- nunca desde el cliente.
--
-- Montos en la MONEDA DE LA CUENTA (CLP), tal como los reporta Meta -- NO en
-- centavos. CLP no usa decimales, pero se guarda NUMERIC(,2) para reflejar
-- exactamente lo que devuelve la Graph API sin redondear.
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- derivado del slug del QR; metadato para scopear
  date DATE NOT NULL,

  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_id TEXT NOT NULL,
  ad_name TEXT,

  -- Métricas crudas de Meta (insights level=ad, time_increment=1)
  spend NUMERIC(14,2) NOT NULL DEFAULT 0,        -- CLP (moneda de la cuenta)
  impressions BIGINT NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  frequency NUMERIC(8,3) NOT NULL DEFAULT 0,
  inline_link_clicks BIGINT NOT NULL DEFAULT 0,
  cpc NUMERIC(12,4) NOT NULL DEFAULT 0,           -- costo por link click (CLP)
  ctr NUMERIC(8,4) NOT NULL DEFAULT 0,            -- %
  video_3s_views BIGINT NOT NULL DEFAULT 0,       -- actions: video_view / 3s
  thruplays BIGINT NOT NULL DEFAULT 0,            -- actions: video_thruplay_watched

  -- Cruce con Artist Pro (qr_scans por utm_content = ad_name)
  spotify_clicks BIGINT NOT NULL DEFAULT 0,

  raw JSONB,                                      -- fila de insight cruda (auditoría/debug)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_project_date
  ON ad_metrics_daily(project_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_date
  ON ad_metrics_daily(date);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_adset_date
  ON ad_metrics_daily(adset_id, date);

-- ============================================================

CREATE TABLE IF NOT EXISTS ad_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,

  -- 'pause'      -> pausar un anuncio
  -- 'budget_up'  -> subir presupuesto de un conjunto (ganador)
  -- 'budget_down'-> bajar presupuesto de un conjunto (perdedor, para financiar al ganador)
  -- 'alert'      -> solo notifica, NO cuenta como acción para el rate-limit de 24h
  action TEXT NOT NULL CHECK (action IN ('pause','budget_up','budget_down','alert')),
  reason TEXT NOT NULL,
  rule_key TEXT,                                  -- clave de la regla que disparó

  before JSONB,
  after JSONB,
  meta_response JSONB,                            -- respuesta de la Graph API cuando se ejecuta

  dry_run BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ad_actions_log_ad_ts
  ON ad_actions_log(ad_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ad_actions_log_adset_ts
  ON ad_actions_log(adset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ad_actions_log_ts
  ON ad_actions_log(ts DESC);

-- ============================================================
-- Estado de reglas que dependen de "N lecturas seguidas". El cron corre cada
-- 6h y ad_metrics_daily se sobrescribe por día (no guarda cada lectura), así
-- que la racha de infracciones se persiste acá. Ej.: la regla "CPC > 2x
-- mediana en 2 lecturas seguidas" incrementa cpc_breach_streak cada corrida
-- que infringe y lo resetea a 0 cuando no. (Las reglas por día -- ganador 3
-- días -- se derivan directo de ad_metrics_daily y no necesitan estado.)
-- ============================================================
CREATE TABLE IF NOT EXISTS ad_rule_state (
  ad_id TEXT PRIMARY KEY,
  cpc_breach_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- spotify_clicks por anuncio y día. Cuenta scans del QR de la campaña que SÍ
-- llegaron a Spotify (outcome en app_opened/user_web/tap_fallback_web),
-- agrupados por utm_content (= nombre del anuncio en Meta) y por día en zona
-- horaria de Santiago -- así el "día" calza con el día que reporta Meta (la
-- cuenta de ads está en America/Santiago). El cron llama a esto vía rpc.
-- ============================================================
CREATE OR REPLACE FUNCTION bot_spotify_clicks(p_qr_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE (ad_name TEXT, day DATE, clicks BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT
    qs.utm_content AS ad_name,
    (qs.scanned_at AT TIME ZONE 'America/Santiago')::date AS day,
    count(*) AS clicks
  FROM qr_scans qs
  WHERE qs.qr_id = p_qr_id
    AND qs.scanned_at >= p_since
    AND qs.utm_content IS NOT NULL
    AND qs.app_open_result->>'outcome' IN ('app_opened','user_web','tap_fallback_web')
  GROUP BY 1, 2
$$;
