-- Bug: solo se permitía UNA integración de Instagram por organización.
-- El unique constraint de la migración 010 era (organization_id, platform),
-- por lo que conectar La Sagrada en el proyecto "Prueba 2" hacía que esa
-- misma conexión apareciera en TODOS los proyectos (Simplemente Yo, Deni Li,
-- etc.) — era literalmente el mismo registro.
--
-- Fix: el constraint pasa a (organization_id, platform, project_id) para que
-- cada proyecto tenga su propia conexión de Instagram.

-- 1. Eliminar el constraint antiguo
ALTER TABLE artist_integrations
  DROP CONSTRAINT IF EXISTS artist_integrations_org_platform_key;

-- 2. Dedupe por (org, platform, project_id) conservando el más reciente
DELETE FROM artist_integrations t
WHERE t.ctid NOT IN (
  SELECT DISTINCT ON (organization_id, platform, project_id) ctid
  FROM artist_integrations
  ORDER BY organization_id, platform, project_id, updated_at DESC NULLS LAST, ctid DESC
);

-- 3. Crear el nuevo constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'artist_integrations'::regclass
      AND contype = 'u'
      AND conname = 'artist_integrations_org_platform_project_key'
  ) THEN
    ALTER TABLE artist_integrations
      ADD CONSTRAINT artist_integrations_org_platform_project_key
      UNIQUE (organization_id, platform, project_id);
  END IF;
END $$;

-- Nota: filas con project_id NULL (integraciones conectadas antes de la
-- migración 011) no participan bien del upsert por proyecto. Limpiarlas:
DELETE FROM artist_integrations WHERE project_id IS NULL;
