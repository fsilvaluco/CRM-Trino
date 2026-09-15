-- ============================================================
-- Migration 097: device_type en qr_scans
-- ============================================================
-- Clasificación simple (mobile/tablet/desktop) derivada del user_agent en
-- src/lib/link-redirect.ts (detectDeviceType) -- guardada aparte del
-- user_agent crudo para poder filtrar/agrupar rápido en reportes, sin
-- tener que parsear el UA cada vez.
-- ============================================================

ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS device_type TEXT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT device_type, COUNT(*) FROM qr_scans GROUP BY 1;
