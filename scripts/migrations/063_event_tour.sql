-- ============================================================
-- Migration 063: Gira del evento
-- ============================================================
-- Campo simple de texto para agrupar eventos por gira (ej. "La Amistad
-- Hecha Bolero", "Los Frutos del Invierno") -- filtrable en la lista de
-- Eventos. A proposito NO se mete con el modulo Campañas, que es otra
-- cosa (marketing/prensa, con empresa/contacto asociado).
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS tour text;
CREATE INDEX IF NOT EXISTS idx_shows_tour ON shows(tour) WHERE tour IS NOT NULL;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT tour, count(*) FROM shows GROUP BY tour;
