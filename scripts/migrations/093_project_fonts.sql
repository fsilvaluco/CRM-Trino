-- ============================================================
-- Migration 093: Tipografías propias por proyecto -- para usar en los
-- campos del Dossier (ej. "New Spirit", una fuente de marca que no está
-- en Google Fonts). Cada proyecto sube las suyas; se listan junto a las
-- de Google Fonts en el selector de tipografía del editor de Dossier.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_fonts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Nombre a mostrar Y font-family usado en el CSS (@font-face) -- debe
  -- ser único por proyecto para no pisar una tipografía de Google Fonts
  -- ni otra ya subida.
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('woff2', 'woff', 'truetype', 'opentype')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_project_fonts_project ON project_fonts(project_id);

ALTER TABLE project_fonts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org access project_fonts select" ON project_fonts
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access project_fonts insert" ON project_fonts
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access project_fonts delete" ON project_fonts
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Bucket público -- las tipografías se cargan también desde la página
-- pública del Dossier (/d/[id], sin login), mismo criterio que el bucket
-- 'dossiers'.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('fonts', 'fonts', true, 10485760) -- 10 MB
ON CONFLICT (id) DO NOTHING;

-- OJO: las columnas se califican como storage.objects.name explícitamente
-- -- `projects` también tiene una columna `name`, y dentro de este EXISTS
-- un `name` sin calificar resuelve en silencio a `projects.name` en vez
-- de al path del archivo subido (bug real ya encontrado y corregido en
-- las policies de 'dossiers', migración 092).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'fonts_insert'
  ) THEN
    CREATE POLICY fonts_insert ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'fonts'
        AND EXISTS (
          SELECT 1 FROM projects p
          JOIN organization_members om
            ON om.organization_id = p.organization_id AND om.user_id = auth.uid()
          WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'fonts_delete'
  ) THEN
    CREATE POLICY fonts_delete ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'fonts'
        AND EXISTS (
          SELECT 1 FROM projects p
          JOIN organization_members om
            ON om.organization_id = p.organization_id AND om.user_id = auth.uid()
          WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'fonts_public_read'
  ) THEN
    CREATE POLICY fonts_public_read ON storage.objects
      FOR SELECT
      USING (bucket_id = 'fonts');
  END IF;
END $$;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM project_fonts ORDER BY created_at DESC LIMIT 10;
