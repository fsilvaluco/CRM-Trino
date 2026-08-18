-- ============================================================
-- Migration 073: Comprobante de pago (transferencia) separado del
-- comprobante de gasto (boleta/factura), con checkbox "Pagado"
-- ============================================================
-- El `comprobante_url` que ya existía es la boleta/factura del gasto en sí
-- (cuánto se gastó). Este es distinto: el comprobante de que YA SE LE
-- PAGÓ a esa persona/proveedor (ej. captura de la transferencia) -- se
-- puede tener uno sin el otro, y llegan en momentos distintos (la boleta
-- llega cuando se genera el gasto, la transferencia cuando efectivamente
-- se paga).
-- ============================================================

ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS pagado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS comprobante_pago_url TEXT;
