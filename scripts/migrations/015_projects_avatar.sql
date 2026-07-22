-- Ícono de proyecto: por defecto la foto de perfil de Instagram (cuando
-- hay integración conectada), reemplazable subiendo una imagen propia.
-- avatar_source distingue el origen para que el sync automático de
-- Instagram NUNCA pise una imagen que el usuario subió a mano.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS avatar_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'projects'::regclass
      AND conname = 'projects_avatar_source_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_avatar_source_check
      CHECK (avatar_source IS NULL OR avatar_source IN ('instagram', 'manual'));
  END IF;
END $$;

-- Bucket público para íconos de proyecto (fotos de perfil de Instagram o
-- subidas manuales). Público porque se muestra en el sidebar/selector sin
-- pedir sesión cada vez, igual que el bucket 'avatars' de usuarios.
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-avatars', 'project-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Solo admin o miembros del proyecto pueden subir/reemplazar/borrar el
-- ícono. La ruta esperada es {project_id}/avatar.{ext} — el primer
-- segmento del path se valida contra projects/organization_members.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'project_avatars_insert'
  ) THEN
    CREATE POLICY project_avatars_insert ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'project-avatars'
        AND EXISTS (
          SELECT 1 FROM projects p
          JOIN organization_members om
            ON om.organization_id = p.organization_id AND om.user_id = auth.uid()
          WHERE p.id::text = (storage.foldername(name))[1]
            AND (
              om.role IN ('owner', 'admin')
              OR EXISTS (
                SELECT 1 FROM project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
              )
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'project_avatars_update'
  ) THEN
    CREATE POLICY project_avatars_update ON storage.objects
      FOR UPDATE
      USING (
        bucket_id = 'project-avatars'
        AND EXISTS (
          SELECT 1 FROM projects p
          JOIN organization_members om
            ON om.organization_id = p.organization_id AND om.user_id = auth.uid()
          WHERE p.id::text = (storage.foldername(name))[1]
            AND (
              om.role IN ('owner', 'admin')
              OR EXISTS (
                SELECT 1 FROM project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
              )
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'project_avatars_delete'
  ) THEN
    CREATE POLICY project_avatars_delete ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'project-avatars'
        AND EXISTS (
          SELECT 1 FROM projects p
          JOIN organization_members om
            ON om.organization_id = p.organization_id AND om.user_id = auth.uid()
          WHERE p.id::text = (storage.foldername(name))[1]
            AND (
              om.role IN ('owner', 'admin')
              OR EXISTS (
                SELECT 1 FROM project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
              )
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'project_avatars_public_read'
  ) THEN
    CREATE POLICY project_avatars_public_read ON storage.objects
      FOR SELECT
      USING (bucket_id = 'project-avatars');
  END IF;
END $$;
