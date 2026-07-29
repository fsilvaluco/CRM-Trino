-- ============================================================
-- Migration 043: Lead Sync Runs - log de corridas del detector de leads
-- Target: Supabase (Postgres).
-- ============================================================
-- gmail_connections.last_sync_at ya existia, pero se pisa en cada corrida
-- (cron O manual) sin distinguir cual fue, ni cuantos leads encontro esa
-- vez puntual. Esta tabla guarda una fila por corrida real -- nunca se
-- actualiza, solo se inserta -- para poder comparar el comportamiento del
-- cron automatico vs "Probar ahora" (sospecha de Francisco: el cron no
-- encuentra lo mismo que la sincronizacion manual).
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES gmail_connections(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron', 'manual')),
  messages_scanned INTEGER NOT NULL DEFAULT 0,
  leads_created INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_sync_runs_connection_id ON lead_sync_runs(connection_id);
CREATE INDEX IF NOT EXISTS idx_lead_sync_runs_ran_at ON lead_sync_runs(ran_at DESC);

ALTER TABLE lead_sync_runs ENABLE ROW LEVEL SECURITY;

-- Las escrituras las hace el server con el cliente admin (bypassa RLS), asi
-- que solo hace falta una politica de lectura para el staff de la org.
CREATE POLICY lead_sync_runs_org_staff_select ON lead_sync_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM gmail_connections gc
      WHERE gc.id = lead_sync_runs.connection_id
        AND gc.organization_id = get_user_org_id()
    )
  );

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM pg_policies WHERE tablename = 'lead_sync_runs';
