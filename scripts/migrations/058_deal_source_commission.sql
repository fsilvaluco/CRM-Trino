-- ============================================================
-- Migration 058: Fuente del trato + comisión Trino
-- ============================================================
-- Fuente determina la base de cálculo de la comisión de Trino:
--   trino / trino_nuevo  -> 30% (o el % que corresponda) del INGRESO NETO
--                            (el campo `value` del propio trato)
--   artista_antiguo / artista_nuevo -> 30% de la UTILIDAD del evento
--                            vinculado (fee + entradas - gastos)
-- El % por defecto vive en el proyecto (distintos artistas pueden pactar
-- distinto), y se puede pisar puntualmente en un trato especifico.
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_commission_rate numeric(5,2) NOT NULL DEFAULT 30;

ALTER TABLE deals ADD COLUMN IF NOT EXISTS source text
  CHECK (source IN ('trino', 'trino_nuevo', 'artista_antiguo', 'artista_nuevo'));
ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT default_commission_rate FROM projects LIMIT 5;
-- SELECT source, commission_rate FROM deals LIMIT 5;
