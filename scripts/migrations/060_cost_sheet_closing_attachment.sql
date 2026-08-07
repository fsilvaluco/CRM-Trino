-- ============================================================
-- Migration 060: Documento adjunto al cierre de caja
-- ============================================================
-- Reusa el mismo bucket "finances" (publico) que ya usa el modulo de
-- Finanzas para comprobantes -- mismo patron, carpeta separada
-- (event-closings/) para no mezclarlos.
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS cost_sheet_closing_file_path text;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS cost_sheet_closing_file_name text;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT cost_sheet_closing_file_path, cost_sheet_closing_file_name FROM shows LIMIT 5;
