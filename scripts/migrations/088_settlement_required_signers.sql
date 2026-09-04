-- ============================================================
-- Migration 088: Firmantes requeridos elegidos a mano en liquidaciones
-- ============================================================
-- A diferencia de event_closing_signatures (donde los firmantes
-- requeridos se calculan en caliente segun la matriz de permisos del
-- proyecto), acá quien crea la liquidación ELIGE a mano quién tiene que
-- firmar (ej. una persona de Gamuza y una de Trino) -- no todos los que
-- ven Finanzas del proyecto son necesariamente parte de este pago
-- puntual. Ver /api/settlements (POST) y /api/settlements/[id]/sign.
-- ============================================================

ALTER TABLE settlements ADD COLUMN IF NOT EXISTS required_signer_ids UUID[] NOT NULL DEFAULT '{}';
