-- ============================================================
-- Migration 098: telemetría de apertura de app en qr_scans
-- ============================================================
-- La página intermedia de /q/[slug] (la que intenta forzar la apertura de
-- Spotify/YouTube desde un navegador embebido) ahora reporta al servidor
-- qué pasó del lado del cliente: qué intentos de lanzamiento se hicieron
-- (intent://, esquema propio, tap del usuario), en qué milisegundo, y si
-- la página llegó a ocultarse (= la app se abrió de verdad) o terminó en
-- el fallback al sitio web.
--
-- Nació para diagnosticar por qué WhatsApp no abría la app (no se podía
-- saber sin datos reales del dispositivo), pero es también la métrica
-- real de la campaña: cuántos clicks terminaron DENTRO de Spotify vs. en
-- la web. Ver POST /api/q/beacon y renderAppOpenHtml en link-redirect.ts.
-- ============================================================

ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS app_open_result JSONB;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT app_open_result->>'outcome' AS outcome, COUNT(*) FROM qr_scans
--   WHERE app_open_result IS NOT NULL GROUP BY 1;
