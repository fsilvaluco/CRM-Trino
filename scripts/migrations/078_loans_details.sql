-- ============================================================
-- Migration 078: Préstamos -- responsable (qué artista consiguió ese
-- préstamo) + datos bancarios del prestamista (para hacerle la
-- transferencia de vuelta sin tener que buscarlos en otro lado).
-- ============================================================

ALTER TABLE loans ADD COLUMN IF NOT EXISTS responsible_name TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS holder_rut TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS account_type TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS contact_email TEXT;
