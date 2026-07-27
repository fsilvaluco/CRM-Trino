-- 025_fix_lead_candidates_unique_index.sql
-- BUG CRITICO: el indice unico original de lead_candidates era parcial
-- (WHERE thread_reference IS NOT NULL). Postgres no puede usar un indice
-- parcial como target de ON CONFLICT sin repetir esa misma condicion en
-- la query -- algo que el metodo .upsert() de supabase-js no soporta.
-- Resultado real: TODOS los inserts del detector de leads fallaban
-- silenciosamente (el codigo no logueaba el error), dejando la bandeja
-- vacia aunque el detector si encontraba leads.
--
-- Fix: indice unico NO parcial. Comportamiento identico para filas con
-- thread_reference no nulo; los NULL siguen sin chocar entre si (regla
-- estandar de Postgres: NULL nunca es igual a NULL en un UNIQUE).

DROP INDEX IF EXISTS idx_lead_candidates_thread_unique;

CREATE UNIQUE INDEX idx_lead_candidates_thread_unique
  ON lead_candidates(organization_id, source, thread_reference);
