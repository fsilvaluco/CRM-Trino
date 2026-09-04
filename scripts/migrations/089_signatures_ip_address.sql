-- ============================================================
-- Migration 089: IP de quien firma (cierre de caja de eventos y
-- liquidaciones), como respaldo adicional de identidad
-- ============================================================
-- No reemplaza la autenticación (la firma ya exige estar logueado y ser
-- firmante requerido) -- es un dato extra de auditoría, igual que
-- signed_at, para poder mostrar "desde qué IP" además de "cuándo".
-- Capturado en el momento de firmar (ver getClientIp en
-- src/lib/client-ip.ts), nunca editable después.
-- ============================================================

ALTER TABLE event_closing_signatures ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE settlement_signatures ADD COLUMN IF NOT EXISTS ip_address TEXT;
