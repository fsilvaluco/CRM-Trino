-- ============================================================
-- Migration 092: Dossier -- PDF de dossier (diseñado en Canva u otra
-- herramienta, sin los números) + campos posicionados a mano que se
-- rellenan con datos en vivo de ArtistPro (Instagram/Facebook/Spotify en
-- vivo o semi-automático, TikTok/YouTube manual vía manual_platform_stats).
-- ============================================================
-- El PDF en sí NO se toca (no se genera un PDF nuevo en v1): la página
-- pública renderiza cada hoja del PDF con pdf.js y superpone los valores
-- en HTML encima, siempre con el dato actual -- ver /d/[id].
-- ============================================================

CREATE TABLE IF NOT EXISTS dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pdf_path TEXT NOT NULL,
  pdf_page_count INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossiers_project ON dossiers(project_id);

-- Un campo posicionado sobre una página del PDF, atado a un dato de
-- ArtistPro. x_pct/y_pct son 0-100 (posición como % del ancho/alto de la
-- página) -- no píxeles, para no depender del zoom/tamaño de pantalla de
-- quien lo ve.
CREATE TABLE IF NOT EXISTS dossier_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  x_pct NUMERIC(6, 3) NOT NULL,
  y_pct NUMERIC(6, 3) NOT NULL,
  data_source TEXT NOT NULL, -- ej. 'instagram.followers' -- ver DOSSIER_DATA_SOURCES
  font_family TEXT NOT NULL DEFAULT 'Inter',
  font_size NUMERIC(6, 2) NOT NULL DEFAULT 24,
  color TEXT NOT NULL DEFAULT '#111111',
  bold BOOLEAN NOT NULL DEFAULT false,
  text_align TEXT NOT NULL DEFAULT 'left' CHECK (text_align IN ('left', 'center', 'right')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossier_fields_dossier ON dossier_fields(dossier_id, page_number);

ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossier_fields ENABLE ROW LEVEL SECURITY;

-- Edición: solo miembros de la organización (el filtrado fino por
-- proyecto/allowedProjectIds lo hace la API route, mismo patrón que
-- settlements/transactions).
CREATE POLICY "org access dossiers select" ON dossiers
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access dossiers insert" ON dossiers
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access dossiers update" ON dossiers
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access dossiers delete" ON dossiers
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access dossier_fields select" ON dossier_fields
  FOR SELECT USING (
    dossier_id IN (
      SELECT id FROM dossiers WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "org access dossier_fields all" ON dossier_fields
  FOR ALL USING (
    dossier_id IN (
      SELECT id FROM dossiers WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  ) WITH CHECK (
    dossier_id IN (
      SELECT id FROM dossiers WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Nota: el LINK PÚBLICO (/d/[id]) lee con el cliente admin server-side
-- (bypasea RLS, mismo patrón que /e/[id] y /eventos/[id]/firmar) -- estas
-- policies son solo para el uso normal logueado dentro de la app.

-- ============================================================
-- Bucket público para los PDF de dossier -- público porque el link
-- /d/[id] es sin login (se comparte con managers/venues/sellos), igual
-- razón que 'project-avatars'.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dossiers', 'dossiers', true, 52428800) -- 50 MB
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'dossiers_insert'
  ) THEN
    CREATE POLICY dossiers_insert ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'dossiers'
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
      AND policyname = 'dossiers_delete'
  ) THEN
    CREATE POLICY dossiers_delete ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'dossiers'
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
      AND policyname = 'dossiers_public_read'
  ) THEN
    CREATE POLICY dossiers_public_read ON storage.objects
      FOR SELECT
      USING (bucket_id = 'dossiers');
  END IF;
END $$;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM dossiers ORDER BY created_at DESC LIMIT 10;
-- SELECT * FROM dossier_fields ORDER BY created_at DESC LIMIT 10;
