-- ============================================================
-- Migration 064: Push subscriptions (Web Push)
-- Target: Supabase (Postgres). NOT for local SQLite/Drizzle.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Guarda las suscripciones de Web Push por usuario (un usuario puede tener
-- varias -- ej. notebook + celular). Cada fila es lo que devuelve
-- PushManager.subscribe() en el navegador: endpoint unico + 2 claves
-- (p256dh/auth) para cifrar el payload. La clave privada VAPID que firma el
-- envio vive solo en variable de entorno (VAPID_PRIVATE_KEY), nunca en la
-- base de datos.
--
-- channel: pensado para poder sumar mas adelante 'fcm'/'apns' cuando el CRM
-- se empaquete como app nativa (Capacitor) sin tener que rediseñar la tabla
-- -- por ahora todo es 'web_push'.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'web_push',
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve y borra solo sus propias suscripciones.
CREATE POLICY "Users can view their own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (user_id = auth.uid());

-- El envio real (leer suscripciones de OTROS usuarios -- ej. el asignado de
-- una tarea, no quien la crea) lo hace el server con el service role key,
-- que bypassea RLS. No hace falta una policy de SELECT mas permisiva.

-- ============================================================
-- VERIFICATION QUERIES (correr despues de la migracion)
-- ============================================================
-- SELECT COUNT(*) FROM push_subscriptions;
-- SELECT * FROM pg_policies WHERE tablename = 'push_subscriptions';
