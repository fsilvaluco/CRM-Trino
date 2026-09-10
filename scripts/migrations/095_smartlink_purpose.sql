-- ============================================================
-- Migration 095: Smartlink purpose (RRSS vs Ventas)
-- ============================================================
-- Un mismo proyecto suele necesitar DOS smartlinks con contenido distinto:
--
-- - 'rrss': para bio de Instagram/campaña de lanzamiento -- pocos botones,
--   solo lo que se quiere empujar ahora (último video, Spotify, canal de
--   YouTube, merch si hay).
-- - 'ventas': para pegar en el correo de cierre de un trato -- todos los
--   links de interés (Instagram, TikTok, Spotify, YouTube, merch, etc.),
--   como reemplazo rápido de "mandame los links de nuevo" cuando ya
--   estaban en el dossier.
--
-- No cambia el modelo (sigue siendo N smartlinks por proyecto, cada uno con
-- su propia lista de links) -- 'purpose' solo clasifica para qué se usa
-- cada uno, así el formulario puede preseleccionar plataformas distintas y
-- la lista puede mostrar un badge.
-- ============================================================

ALTER TABLE smartlinks ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'ventas';

ALTER TABLE smartlinks DROP CONSTRAINT IF EXISTS smartlinks_purpose_check;
ALTER TABLE smartlinks ADD CONSTRAINT smartlinks_purpose_check CHECK (purpose IN ('rrss', 'ventas'));

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT purpose, COUNT(*) FROM smartlinks GROUP BY 1;
