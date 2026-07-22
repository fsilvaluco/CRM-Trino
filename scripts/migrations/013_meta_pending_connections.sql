-- Cuando el usuario tiene varias páginas de Facebook con Instagram Business
-- vinculado (algo cada vez más común porque Facebook acumula el acceso
-- otorgado entre reconexiones de distintos proyectos), el callback de OAuth
-- ya no puede seguir adivinando "la primera cuenta que encuentre" — eso fue
-- justo el bug que mezcló las cuentas entre proyectos.
--
-- Esta tabla guarda temporalmente las cuentas candidatas para que el
-- usuario elija explícitamente cuál conectar a cuál proyecto. Fila de vida
-- corta: se borra al finalizar la selección o al expirar (10 minutos).

CREATE TABLE IF NOT EXISTS meta_pending_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  candidates JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_pending_connections_org
  ON meta_pending_connections(organization_id);

-- RLS: solo miembros de la organización pueden leer/escribir sus propias
-- filas pendientes.
ALTER TABLE meta_pending_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meta_pending_connections'
      AND policyname = 'meta_pending_connections_org_access'
  ) THEN
    CREATE POLICY meta_pending_connections_org_access
      ON meta_pending_connections
      FOR ALL
      USING (
        organization_id IN (
          SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
