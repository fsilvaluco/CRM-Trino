-- ============================================================
-- Migration 100: Nombres editables de las dos partes del reparto de
-- utilidad
-- ============================================================
-- Hasta ahora las dos partes del reparto (migracion 081) tenian el nombre
-- quemado en la UI: un lado decia el nombre del proyecto y el otro
-- literalmente "Sello". Eso funciona para un evento de la cartera, pero no
-- para un evento EXTERNO -- produccion que se le hace a un cliente que no
-- es proyecto (ver migracion 099, firma externa). En esos el reparto es
-- entre el cliente y Trino, y la planilla tiene que decir eso.
--
-- NULL = comportamiento de siempre (nombre del proyecto / "Sello"), asi
-- que los eventos que ya existen no cambian en nada. Los porcentajes NO se
-- tocan: esto es solo como se llama cada lado.
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS profit_split_project_label TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS profit_split_trino_label TEXT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT name, profit_split_project_label, profit_split_trino_label
--   FROM shows WHERE profit_split_project_label IS NOT NULL;
