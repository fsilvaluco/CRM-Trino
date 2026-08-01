-- ============================================================
-- Migration 046: Link de referencia en Tareas y Deals
-- Target: Supabase (Postgres).
-- ============================================================
-- Campo simple de texto libre para pegar un link externo relevante
-- (ej. el contrato en Drive, el brief del cliente, el hilo de WhatsApp
-- exportado, etc.) -- sin validacion de formato estricta a proposito,
-- porque en la practica la gente pega URLs de Drive, Notion, WhatsApp,
-- lo que sea.
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reference_url TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS reference_url TEXT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name IN ('tasks','deals') AND column_name = 'reference_url';
