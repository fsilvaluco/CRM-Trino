-- ============================================================
-- Migration 085: Policy RLS faltante en shopify_sales_daily
-- ============================================================
-- shopify_sales_daily se creó "sin RLS" (ver migración 044), pero algo
-- (probablemente el trigger/función rls_auto_enable() detectado por el
-- linter de seguridad de Supabase) activó RLS en la tabla sin crear
-- ninguna policy. Resultado: RLS ENABLED + 0 policies = deny-all para
-- cualquier rol que no sea service_role.
--
-- Efecto práctico: el cron (/api/cron/sync-shopify) usa createAdminClient()
-- (service_role, bypassa RLS) así que seguía funcionando. El botón manual
-- "Sincronizar ahora" (/api/integrations/shopify/sync) usa la sesión del
-- usuario logueado vía requireAuth() -- el DELETE/INSERT en
-- shopify_sales_daily quedaba bloqueado por RLS y syncShopify() lanzaba
-- "No se pudieron guardar las ventas diarias", devuelto como 502.
--
-- Mismo criterio de acceso que shopify_sales_monthly (shopify_sales_monthly_project_member).
-- ============================================================

CREATE POLICY shopify_sales_daily_project_member
  ON shopify_sales_daily
  FOR ALL
  USING (
    project_id IS NULL
    OR is_org_admin(organization_id)
    OR is_project_member(project_id)
  )
  WITH CHECK (
    project_id IS NULL
    OR is_org_admin(organization_id)
    OR is_project_member(project_id)
  );
