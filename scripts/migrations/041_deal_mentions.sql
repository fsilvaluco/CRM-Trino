-- ============================================================
-- Migration 041: Deal Mentions - soporte de @menciones en comentarios de Tratos
-- Target: Supabase (Postgres).
-- ============================================================
-- La tabla mentions solo soportaba tareas (task_id + comment_id -> task_comments).
-- Esta migracion agrega columnas paralelas para deals, sin tocar las
-- existentes -- un mention siempre tiene o el par task_id/comment_id, o el
-- par deal_id/deal_comment_id, nunca ambos.
-- ============================================================

ALTER TABLE mentions
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS deal_comment_id UUID REFERENCES deal_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mentions_deal_id ON mentions(deal_id);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'mentions';
