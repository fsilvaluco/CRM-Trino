-- ============================================================
-- Migration 066: Nota de reparto de utilidad en Costos
-- ============================================================
-- Texto libre que aparece bajo la planilla de costos (pantalla e impresión)
-- explicando cómo se reparte la utilidad del evento. Si queda vacío, la UI
-- muestra un texto por defecto calculado ("Utilidad se reparte en 70%
-- [Proyecto] y 30% Productor") -- este campo es solo para los casos donde
-- el reparto real es distinto (ej. toda la utilidad se va a cubrir un
-- costo puntual) y hay que decirlo explícito en vez de mostrar el default
-- engañoso.
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS profit_split_note text;
