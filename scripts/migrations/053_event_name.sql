-- ============================================================
-- Migration 053: Nombre propio del evento (independiente del venue)
-- ============================================================
-- Un evento puede llamarse "PAMN" y haberse hecho en la Biblioteca de
-- Quinta Normal -- el nombre del evento no tiene por que coincidir con
-- el venue. Se agrega `name`, y se rellenan los eventos existentes con
-- el venue como nombre (mejor eso que dejarlos en blanco); de aca en
-- adelante el formulario pide el nombre explicitamente.
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS name text;
UPDATE shows SET name = venue WHERE name IS NULL;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT name, venue FROM shows LIMIT 10;
