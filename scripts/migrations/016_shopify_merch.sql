-- Fase 1.5 del plan maestro: integración real de Merch, empezando por Shopify.
--
-- Decisión de conexión (revisada): OAuth público, no Custom App — Francisco
-- va a abrir esto a otros artistas con sus propias tiendas, así que necesita
-- el mismo flujo de instalación que cualquier app de Shopify (Custom
-- Distribution, sin pasar por revisión de App Store, pero con OAuth real).
--
-- Modelo de datos (igual que Instagram, pero con un nivel extra): la TIENDA
-- se conecta a nivel de organización (una tienda puede alojar productos de
-- varios artistas — caso real: la tienda es de Katarsis, pero la colección
-- de merch de Gamuza vive ahí adentro). Cada PROYECTO elige a cuál colección
-- de esa tienda le corresponde, sin necesidad de re-autenticar.

-- Tienda conectada vía OAuth, una fila por tienda por organización.
CREATE TABLE IF NOT EXISTS shopify_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL, -- ej. katarsis-store.myshopify.com
  shop_name TEXT,
  access_token TEXT NOT NULL,
  scope TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, shop_domain)
);

CREATE INDEX IF NOT EXISTS idx_shopify_stores_org
  ON shopify_stores(organization_id);

-- Nonce de corta vida para verificar el `state` del callback OAuth (evita
-- CSRF) — mismo espíritu que meta_pending_connections, pero para el paso
-- previo a tener token, no para elegir entre candidatos.
CREATE TABLE IF NOT EXISTS shopify_oauth_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Qué colección de qué tienda le corresponde a cada proyecto. Un proyecto =
-- una colección de merch por ahora (unique por project_id); si a futuro un
-- artista vende en más de una colección, se relaja este constraint.
CREATE TABLE IF NOT EXISTS shopify_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  shopify_collection_id BIGINT NOT NULL,
  collection_handle TEXT,
  collection_title TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_collections_project
  ON shopify_collections(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_shopify_collections_store
  ON shopify_collections(store_id);

-- Snapshot de productos de la colección conectada de cada proyecto. Se
-- reemplaza completo en cada sync (upsert por shopify_product_id) — no es
-- histórico, es el estado actual de inventario/catálogo. Solo lectura desde
-- la UI: esta tabla nunca se escribe desde un formulario, solo desde el sync.
CREATE TABLE IF NOT EXISTS shopify_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  shopify_product_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  status TEXT, -- 'active' | 'draft' | 'archived' (tal cual lo devuelve Shopify)
  available BOOLEAN NOT NULL DEFAULT false, -- status='active' AND inventory_quantity > 0
  inventory_quantity INTEGER NOT NULL DEFAULT 0, -- suma de variantes
  price INTEGER, -- CLP cents, precio de la variante más barata
  image_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, project_id, shopify_product_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_products_project
  ON shopify_products(organization_id, project_id);

-- Agregado mensual de ventas, recalculado en cada sync a partir de las
-- órdenes de Shopify filtradas a los productos de la colección conectada.
CREATE TABLE IF NOT EXISTS shopify_sales_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- siempre día 1 del mes, ej. 2026-07-01
  units_sold INTEGER NOT NULL DEFAULT 0,
  total_sales INTEGER NOT NULL DEFAULT 0, -- CLP cents
  orders_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, project_id, month)
);

CREATE INDEX IF NOT EXISTS idx_shopify_sales_monthly_project
  ON shopify_sales_monthly(organization_id, project_id);

-- Nota de seguridad: al igual que artist_integrations, estas tablas no
-- tienen RLS habilitado hoy (se apoyan en que todo el acceso pasa por
-- requireAuth() en el server, que ya filtra por organization_id). Es
-- consistente con el resto del esquema, pero sigue siendo deuda técnica
-- pendiente a nivel de toda la app, no específica de Merch.

-- Nota: la tabla `merch_snapshots` (registro manual) NO se elimina — queda
-- como historial de lo que se registraba a mano antes de esta integración.
-- El dashboard nuevo deja de leerla, pero los datos no se pierden.
