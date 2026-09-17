-- ============================================================
-- Migration 102: bot_kv — estado key-value chico del bot de Meta Ads.
-- Target: Supabase (Postgres).
-- ============================================================
-- Para cosas que no calzan en las tablas de métricas/acciones. Primer uso:
-- la "firma" de la estructura de la campaña (campañas/conjuntos/anuncios +
-- estado), para mandar la confirmación por Telegram SOLO cuando cambia (y no
-- repetir el mismo listado cada corrida de 6h).
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_kv (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
