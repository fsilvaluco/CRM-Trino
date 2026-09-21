-- ============================================================
-- Migration 106: Tema de color por smartlink + boton destacado
-- ============================================================
-- Hasta ahora todos los smartlinks se veian igual (navy #14162B, botones
-- blancos) y los N botones tenian el mismo peso visual. Dos problemas:
--
-- - Cada lanzamiento tiene su propia estetica (caratula roja, verde,
--   clara...) y el fondo fijo pelea con el arte. 'theme' guarda la clave
--   de un preset del catalogo en src/lib/smartlink-themes.ts (no colores
--   sueltos: asi el contraste queda garantizado y agregar un tema nuevo
--   es solo codigo).
-- - En una campana de deep-link se empuja UNA plataforma (la que mejor
--   abre la app segun qr_scans.app_open_result). 'featured' marca ese
--   boton para destacarlo con anillo + etiqueta "Recomendado". A lo mas
--   uno por smartlink -- lo garantiza el API (los links se reemplazan
--   completos en cada guardado), no un constraint parcial, para no
--   complicar el insert masivo.
-- ============================================================

ALTER TABLE smartlinks ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'navy';

ALTER TABLE smartlink_links ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT theme, COUNT(*) FROM smartlinks GROUP BY 1;
-- SELECT smartlink_id, COUNT(*) FROM smartlink_links WHERE featured GROUP BY 1 HAVING COUNT(*) > 1;
