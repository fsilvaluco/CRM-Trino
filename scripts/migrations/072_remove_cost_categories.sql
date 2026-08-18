-- ============================================================
-- Migration 072: Sacar "Honorarios" y "Transporte de equipos" de las
-- categorías de gasto (a pedido de Francisco, 18 ago 2026)
-- ============================================================
-- Verificado antes de aplicar: ninguna fila en event_cost_items ni en
-- event_cost_submissions usaba todavía estas dos categorías, así que no
-- hace falta migrar datos -- solo actualizar el CHECK constraint para que
-- calce con la lista reducida en src/lib/cost-categories.ts.
-- ============================================================

ALTER TABLE event_cost_items DROP CONSTRAINT IF EXISTS event_cost_items_category_check;
ALTER TABLE event_cost_items ADD CONSTRAINT event_cost_items_category_check CHECK (
  category IS NULL OR category IN (
    'Movilización', 'Alimentación', 'Alojamiento', 'Arriendo de audio',
    'Arriendo de luces', 'Arriendo de espacio', 'Catering',
    'Producción y staff', 'Seguridad',
    'Permisos y derechos de autor', 'Marketing y difusión', 'Otros'
  )
);

ALTER TABLE event_cost_submissions DROP CONSTRAINT IF EXISTS event_cost_submissions_category_check;
ALTER TABLE event_cost_submissions ADD CONSTRAINT event_cost_submissions_category_check CHECK (
  category IS NULL OR category IN (
    'Movilización', 'Alimentación', 'Alojamiento', 'Arriendo de audio',
    'Arriendo de luces', 'Arriendo de espacio', 'Catering',
    'Producción y staff', 'Seguridad',
    'Permisos y derechos de autor', 'Marketing y difusión', 'Otros'
  )
);
