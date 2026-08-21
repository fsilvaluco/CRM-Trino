-- ============================================================
-- Migration 080: Categoría "Bencina" con calculadora km × factor
-- ============================================================
-- Pedido de Francisco (20 ago 2026): al reportar un gasto de "Bencina"
-- (tanto en la Planilla de costos como en el link para reportar gastos),
-- poder subir una captura de una app de mapas con los km del trayecto, y
-- que se calcule el monto a partir de un factor $/km editable (ej. $200 o
-- $250), en vez de tener que calcular el monto a mano.
--
-- km: distancia del trayecto (permite decimales, ej. 37.4).
-- km_rate: factor $/km en PESOS (no centavos -- es un número redondo tipo
--   200/250, no hace falta precisión de centavos). El monto final SÍ se
--   guarda en `amount`/`amount` (centavos, como el resto de la Planilla) --
--   estas dos columnas son solo el detalle de cómo se llegó a ese monto,
--   para poder editarlo después sin perder el cálculo.
-- ============================================================

ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS km NUMERIC;
ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS km_rate INTEGER;

ALTER TABLE event_cost_submissions ADD COLUMN IF NOT EXISTS km NUMERIC;
ALTER TABLE event_cost_submissions ADD COLUMN IF NOT EXISTS km_rate INTEGER;

ALTER TABLE event_cost_items DROP CONSTRAINT IF EXISTS event_cost_items_category_check;
ALTER TABLE event_cost_items ADD CONSTRAINT event_cost_items_category_check CHECK (
  category IS NULL OR category IN (
    'Movilización', 'Bencina', 'Alimentación', 'Alojamiento', 'Arriendo de audio',
    'Arriendo de luces', 'Arriendo de espacio', 'Catering',
    'Producción y staff', 'Seguridad',
    'Permisos y derechos de autor', 'Marketing y difusión', 'Otros'
  )
);

ALTER TABLE event_cost_submissions DROP CONSTRAINT IF EXISTS event_cost_submissions_category_check;
ALTER TABLE event_cost_submissions ADD CONSTRAINT event_cost_submissions_category_check CHECK (
  category IS NULL OR category IN (
    'Movilización', 'Bencina', 'Alimentación', 'Alojamiento', 'Arriendo de audio',
    'Arriendo de luces', 'Arriendo de espacio', 'Catering',
    'Producción y staff', 'Seguridad',
    'Permisos y derechos de autor', 'Marketing y difusión', 'Otros'
  )
);
