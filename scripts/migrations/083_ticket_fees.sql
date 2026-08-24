-- ============================================================
-- Migration 083: Descuentos sobre venta de entradas (IVA, SCD,
-- comisión de venta) + % de reparto con el venue/productora
-- ============================================================
-- Pedido de Francisco (23 ago 2026): antes de que la venta bruta de
-- entradas (suma de tramos) se use como "Ingreso por entradas" del
-- evento, poder descontarle IVA / derechos SCD / comisión de venta con
-- tarjeta (todos como % configurable, siempre manual por evento -- no hay
-- default por proyecto), y después repartir ese neto en un % con el venue
-- o productora (ej. "Chocolate 30% / Gamuza 70%"). El % que le
-- corresponde al proyecto es el que efectivamente reemplaza el ingreso
-- por entradas de la Utilidad del evento -- el resto (lo que se queda el
-- venue) nunca entra a las finanzas del evento.
--
-- Todos nullable -- si no se configuran, el botón "Usar como Entradas
-- del evento" se comporta exactamente igual que antes (usa el bruto de
-- los tramos, sin descuentos).
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS ticket_iva_pct NUMERIC;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS ticket_comision_pct NUMERIC;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS ticket_scd_pct NUMERIC;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS ticket_split_project_pct NUMERIC;
