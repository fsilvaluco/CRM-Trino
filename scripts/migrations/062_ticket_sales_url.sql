-- ============================================================
-- Migration 062: Link de venta de entradas (para sincronizar)
-- ============================================================
-- Guarda el link publico de estadisticas de la ticketera (PortalTickets,
-- etc.) para poder re-leerlo con un boton "Sincronizar" y refrescar los
-- tramos de venta_de_entradas sin tener que subir un pantallazo cada vez.
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS ticket_sales_url text;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT ticket_sales_url FROM shows LIMIT 5;
