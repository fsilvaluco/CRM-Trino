-- ============================================================
-- Migration 044: Shopify Sales Daily - ventas reales por día y por variante
-- Target: Supabase (Postgres).
-- ============================================================
-- shopify_sales_monthly ya existia pero agregaba TODO en un solo numero por
-- mes, sin distinguir producto/variante ni dia. Esta tabla es el desglose
-- fino, calculado en el mismo sync (mismas ordenes ya traidas, sin llamadas
-- nuevas a Shopify) -- y ya con el monto neto (descuentos restados), no el
-- precio de lista.
--
-- Clave por shopify_variant_id, no por sku: el SKU vive a nivel de
-- variante y puede repetirse/estar vacio; el variant_id es el identificador
-- estable que entrega Shopify.
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_sales_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  shopify_product_id BIGINT NOT NULL,
  shopify_variant_id BIGINT NOT NULL,
  sku TEXT,
  units_sold INTEGER NOT NULL DEFAULT 0,
  total_sales INTEGER NOT NULL DEFAULT 0, -- CLP cents, YA con descuento restado
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, project_id, day, shopify_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_sales_daily_project
  ON shopify_sales_daily(organization_id, project_id, day);
CREATE INDEX IF NOT EXISTS idx_shopify_sales_daily_product
  ON shopify_sales_daily(organization_id, project_id, shopify_product_id);

-- Nota: igual que shopify_sales_monthly, sin RLS -- el acceso pasa por
-- requireAuth() en el server (deuda tecnica ya conocida, no especifica de
-- esta tabla).
