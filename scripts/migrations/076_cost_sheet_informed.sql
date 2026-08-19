-- ============================================================
-- Migration 076: "Informar cierre" -- mandar por correo el resumen del
-- cierre de caja a todos los que firmaron, una vez que están todos
-- ============================================================
-- Sin FK en cost_sheet_informed_by a propósito, mismo criterio que
-- cost_sheet_closed_by en esta misma tabla (uuid plano).
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS cost_sheet_informed_at TIMESTAMPTZ;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS cost_sheet_informed_by UUID;
