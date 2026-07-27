-- 021_sello_model_structure.sql
-- Modelo "Sello": Trino/Katarsis/SiSoy son proyectos padre de proyectos de artistas.
-- project_id de un deal = quien gestiona y cierra (el sello)
-- artist_project_id     = a quien beneficia (le da visibilidad de solo lectura)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS parent_project_id UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS self_managed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN projects.parent_project_id IS 'Sello/agencia que gestiona este proyecto (ej: Trino gestiona Gamuza)';
COMMENT ON COLUMN projects.self_managed IS 'Si true, el artista puede editar sus propios tratos';

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS artist_project_id UUID REFERENCES projects(id);

COMMENT ON COLUMN deals.artist_project_id IS 'Artista beneficiado por el trato; le da visibilidad en su pipeline';

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS artist_project_id UUID REFERENCES projects(id);

COMMENT ON COLUMN tasks.artist_project_id IS 'Artista relacionado a la tarea; visible y editable por el artista';

CREATE INDEX IF NOT EXISTS idx_deals_artist_project ON deals(artist_project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_artist_project ON tasks(artist_project_id);
CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_project_id);

ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'artist'));

-- Asignacion inicial: los artistas de Trino cuelgan de Trino
-- (ejecutado con los IDs reales del proyecto CRM Trino)
