-- ============================================================
-- Migration 081: Reparto de utilidad estructurado (% editables +
-- comprobante de transferencia)
-- ============================================================
-- Antes "Reparto de utilidad" era solo una nota de texto libre (con un
-- placeholder tipo "70% Proyecto y 30% Productor" que ni siquiera se
-- guardaba si no se tocaba). Pedido de Francisco (20 ago 2026): que los
-- dos porcentajes sean campos editables de verdad (default 70/30), que se
-- calcule el monto de cada parte a partir de la utilidad del evento, y
-- que se pueda dejar adjunto el comprobante de la transferencia de ese
-- reparto -- pensado como "el cierre final" del evento, después de que
-- todos firmaron.
--
-- profit_split_note se mantiene -- ahora es una nota EXTRA opcional
-- (para casos especiales, ej. "la utilidad se va a cubrir un costo
-- puntual"), ya no reemplaza el cálculo.
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS profit_split_project_pct NUMERIC;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS profit_split_trino_pct NUMERIC;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS profit_split_transfer_proof_url TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS profit_split_transferred_at TIMESTAMPTZ;
