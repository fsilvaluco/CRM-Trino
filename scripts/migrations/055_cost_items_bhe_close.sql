-- ============================================================
-- Migration 055: Responsable/comprobante/BHE en costos + cierre de caja
-- ============================================================
-- BHE = Boleta de Honorarios Electronica. Cuando un pago se hace asi, lo
-- que se pacta suele ser el monto LIQUIDO (lo que la persona recibe en
-- mano); el monto BRUTO de la boleta es mayor por la retencion (15,25%
-- vigente desde 1-ene-2026, Ley 21.133). liquido_amount guarda lo pactado
-- en liquido; `amount` (columna ya existente) pasa a guardar el bruto
-- real cuando es_bhe=true, porque ese es el costo total real para el
-- negocio (el liquido a la persona + la retencion que se entera al SII).
-- ============================================================

ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS responsable text;
ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS comprobante_url text;
ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS es_bhe boolean DEFAULT false;
ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS liquido_amount integer;

-- Cierre de caja: una vez cerrado, la planilla de costos de ese evento
-- queda de solo lectura (se puede reabrir si hace falta corregir algo).
ALTER TABLE shows ADD COLUMN IF NOT EXISTS cost_sheet_closed_at timestamptz;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS cost_sheet_closed_by uuid;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'event_cost_items';
-- SELECT id, cost_sheet_closed_at FROM shows LIMIT 5;
