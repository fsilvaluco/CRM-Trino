-- ============================================================
-- Migration 065: Infraestructura para notificaciones push nuevas
-- Target: Supabase (Postgres). Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Dos tablas de soporte para las notificaciones automaticas y de admin
-- que se agregan sobre push_subscriptions (migracion 064):
--
-- reminder_log: dedup para los recordatorios automaticos (cron diario).
-- Sin esto, si el cron corre dos veces el mismo dia (o se reintenta tras
-- un error) se manda el mismo aviso repetido. Un tipo+entidad+umbral solo
-- se manda una vez -- el insert falla por la UNIQUE si ya se mando.
--
-- admin_broadcasts: historial de los mensajes que un admin manda a mano
-- (toda la org o un proyecto puntual). No es necesaria para que funcione
-- el envio, pero deja registro de que se mando y a cuantos.
-- ============================================================

CREATE TABLE IF NOT EXISTS reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_type TEXT NOT NULL, -- 'task_due' | 'deal_close' | 'event_tomorrow'
  entity_id UUID NOT NULL,
  threshold_key TEXT NOT NULL, -- '5d' | '2d' | '1d'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reminder_type, entity_id, threshold_key)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_lookup ON reminder_log(reminder_type, entity_id);

-- Tabla de uso exclusivamente server-side (cron con service role) -- RLS
-- activo sin policies bloquea cualquier acceso via cliente normal.
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sent_by UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- NULL = toda la organizacion
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_org ON admin_broadcasts(organization_id, created_at DESC);

ALTER TABLE admin_broadcasts ENABLE ROW LEVEL SECURITY;

-- Solo admins/owners de la organizacion pueden ver el historial (reusa la
-- funcion is_org_admin ya creada en la migracion 001).
CREATE POLICY "Org admins can view their broadcasts"
  ON admin_broadcasts FOR SELECT
  USING (is_org_admin(organization_id));

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM reminder_log ORDER BY sent_at DESC LIMIT 10;
-- SELECT * FROM admin_broadcasts ORDER BY created_at DESC LIMIT 10;
