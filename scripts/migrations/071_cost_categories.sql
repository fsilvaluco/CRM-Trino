-- ============================================================
-- Migration 071: Categorías de gasto (para informes futuros de "en qué
-- se gasta")
-- ============================================================
-- Lista cerrada a propósito (no un catálogo libre como cost_item_types) --
-- debe calzar exactamente con COST_CATEGORIES en src/lib/cost-categories.ts.
-- NULL permitido: los ítems de costo que ya existían quedan sin categoría
-- ("Sin categoría" en los informes) en vez de forzar una migración de datos.
-- ============================================================

ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE event_cost_submissions ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE event_cost_items DROP CONSTRAINT IF EXISTS event_cost_items_category_check;
ALTER TABLE event_cost_items ADD CONSTRAINT event_cost_items_category_check CHECK (
  category IS NULL OR category IN (
    'Movilización', 'Alimentación', 'Alojamiento', 'Arriendo de audio',
    'Arriendo de luces', 'Arriendo de espacio', 'Honorarios', 'Catering',
    'Transporte de equipos', 'Producción y staff', 'Seguridad',
    'Permisos y derechos de autor', 'Marketing y difusión', 'Otros'
  )
);

ALTER TABLE event_cost_submissions DROP CONSTRAINT IF EXISTS event_cost_submissions_category_check;
ALTER TABLE event_cost_submissions ADD CONSTRAINT event_cost_submissions_category_check CHECK (
  category IS NULL OR category IN (
    'Movilización', 'Alimentación', 'Alojamiento', 'Arriendo de audio',
    'Arriendo de luces', 'Arriendo de espacio', 'Honorarios', 'Catering',
    'Transporte de equipos', 'Producción y staff', 'Seguridad',
    'Permisos y derechos de autor', 'Marketing y difusión', 'Otros'
  )
);

CREATE INDEX IF NOT EXISTS idx_event_cost_items_category ON event_cost_items(category);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT category, COUNT(*) FROM event_cost_items GROUP BY category ORDER BY 2 DESC;
