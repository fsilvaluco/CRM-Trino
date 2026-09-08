-- ============================================================
-- Migration 094: Marca de ultima actualizacion de venta de entradas
-- ============================================================
-- Cuando alguien sube un pantallazo (lectura con IA), sincroniza el link de
-- la ticketera o edita los tramos a mano, guardamos CUANDO se hizo y POR QUE
-- via. Asi cualquiera que mire el evento sabe que tan al dia estan los
-- numeros de entradas vendidas (antes no habia forma de saberlo: la tabla
-- podia tener datos de hace dos semanas y se veia igual de "actual").
--
-- tickets_updated_source: 'pantallazo' | 'link' | 'manual'
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS tickets_updated_at timestamptz;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS tickets_updated_source text;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT id, tickets_updated_at, tickets_updated_source FROM shows LIMIT 5;
