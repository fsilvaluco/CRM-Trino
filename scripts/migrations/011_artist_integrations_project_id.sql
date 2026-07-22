-- El cron diario de sync (Fase 1.1 del plan maestro) necesita saber a qué
-- project_id atribuir las métricas de cada integración, sin depender de que
-- un usuario esté logueado pasando el projectId en el body del request.
--
-- Hoy artist_integrations solo guarda organization_id + platform; el
-- project_id se recibe en el callback de OAuth pero nunca se persiste.
-- Esta migración agrega la columna y permite que el callback la guarde.

ALTER TABLE artist_integrations
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

CREATE INDEX IF NOT EXISTS idx_artist_integrations_project_id
  ON artist_integrations(project_id);

-- Nota: no hacemos backfill automático porque no hay forma confiable de
-- inferir a qué proyecto pertenecía cada integración conectada antes de
-- esta migración (project_id nunca se guardó). Las integraciones
-- existentes (ej. lasagradaoficial) deben reconectarse una vez, o se les
-- puede asignar manualmente:
--   UPDATE artist_integrations SET project_id = '<uuid-del-proyecto>'
--   WHERE organization_id = '<uuid-org>' AND platform = 'instagram';
