-- ============================================================
-- Migration 048: Dos tipos de meta nuevos, automatizables de verdad
-- Target: Supabase (Postgres).
-- ============================================================
-- Biblioteca de plantillas para "Nueva meta": de las plantillas
-- propuestas, estas dos SI tienen fuente de datos ya conectada en el
-- CRM (spotify_stats_snapshots y press_mentions), asi que se agregan
-- como metric_type nuevos con calculo automatico -- el resto de las
-- plantillas de la biblioteca quedan como metric_type = 'manual' por
-- ahora (no requieren cambio de esquema, solo un titulo sugerido).
-- ============================================================

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_metric_type_check;
ALTER TABLE goals ADD CONSTRAINT goals_metric_type_check CHECK (metric_type IN (
  'ventas_deals', 'cantidad_deals', 'tareas_completadas', 'seguidores',
  'oyentes_spotify', 'menciones_prensa', 'manual'
));

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'goals_metric_type_check';
