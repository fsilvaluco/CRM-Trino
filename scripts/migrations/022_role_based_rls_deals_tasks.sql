-- 022_role_based_rls_deals_tasks.sql
-- IMPORTANTE: antes de esta migracion, la politica "org completa" (FOR ALL) en deals
-- y tasks anulaba cualquier restriccion por proyecto, porque las politicas RLS
-- permisivas se suman con OR. Es decir: cualquier miembro de la organizacion
-- tenia acceso total. Aqui se separa lectura de escritura por rol.

CREATE OR REPLACE FUNCTION get_user_org_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM organization_members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_org_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(get_user_org_role() IN ('owner', 'admin', 'member'), false);
$$;

CREATE OR REPLACE FUNCTION is_self_managed(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT self_managed FROM projects WHERE id = p_project_id), false);
$$;

-- ===================== DEALS =====================
DROP POLICY IF EXISTS "deals: org completa" ON deals;
DROP POLICY IF EXISTS deals_project_member ON deals;

CREATE POLICY deals_staff_all ON deals FOR ALL
  USING (organization_id = get_user_org_id() AND is_org_staff() AND deleted_at IS NULL)
  WITH CHECK (organization_id = get_user_org_id() AND is_org_staff());

CREATE POLICY deals_artist_read ON deals FOR SELECT
  USING (
    organization_id = get_user_org_id()
    AND deleted_at IS NULL
    AND (is_project_member(project_id) OR is_project_member(artist_project_id))
  );

CREATE POLICY deals_artist_selfmanaged_write ON deals FOR ALL
  USING (
    organization_id = get_user_org_id()
    AND deleted_at IS NULL
    AND (
      (is_project_member(artist_project_id) AND is_self_managed(artist_project_id))
      OR (is_project_member(project_id) AND is_self_managed(project_id))
    )
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND (
      (is_project_member(artist_project_id) AND is_self_managed(artist_project_id))
      OR (is_project_member(project_id) AND is_self_managed(project_id))
    )
  );

-- ===================== TASKS =====================
-- Las tareas son libres: el artista tambien puede crear y mover las suyas.
DROP POLICY IF EXISTS "tasks: org completa" ON tasks;
DROP POLICY IF EXISTS tasks_project_member ON tasks;

CREATE POLICY tasks_staff_all ON tasks FOR ALL
  USING (organization_id = get_user_org_id() AND is_org_staff() AND deleted_at IS NULL)
  WITH CHECK (organization_id = get_user_org_id() AND is_org_staff());

CREATE POLICY tasks_artist_all ON tasks FOR ALL
  USING (
    organization_id = get_user_org_id()
    AND deleted_at IS NULL
    AND (is_project_member(project_id) OR is_project_member(artist_project_id))
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND (is_project_member(project_id) OR is_project_member(artist_project_id))
  );
