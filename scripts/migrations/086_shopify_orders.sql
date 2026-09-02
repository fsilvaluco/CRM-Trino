-- ============================================================
-- Migration 086: Shopify Orders - detalle por pedido individual
-- ============================================================
-- shopify_sales_monthly/daily solo guardan agregados -- no alcanza para
-- responder "qué pedidos hay en Ago 2026". Esta tabla guarda un renglón por
-- pedido, calculado en el mismo sync (mismas órdenes ya traídas, sin
-- llamadas nuevas a Shopify).
--
-- A propósito NO guarda nada del cliente (nombre, email, dirección) -- ver
-- nota en shopify-sync.ts. Solo lo necesario para listar "qué se vendió en
-- este pedido": número, fecha, monto y el desglose de items (como JSONB,
-- no tabla aparte -- el volumen esperado por pedido es bajo, un merch chico
-- no justifica una tabla de line items separada todavía).
--
-- total_sales es la suma de SOLO los items que pertenecen a la colección
-- conectada (mismo criterio que shopify_sales_monthly/daily) -- un pedido
-- puede tener otros productos fuera de la colección que no se cuentan acá.
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  shopify_order_id BIGINT NOT NULL,
  order_number TEXT NOT NULL, -- ej. "#1292" (campo `name` de Shopify)
  day DATE NOT NULL, -- fecha efectiva: processed_at si viene, si no created_at
  total_sales INTEGER NOT NULL DEFAULT 0, -- CLP cents, neto, solo items de la colección
  items JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{title, variant, sku, quantity, total_sales}]
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, project_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_project_day
  ON shopify_orders(organization_id, project_id, day);

ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;

-- Mismo criterio de acceso que shopify_sales_monthly/daily.
CREATE POLICY shopify_orders_project_member
  ON shopify_orders
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
