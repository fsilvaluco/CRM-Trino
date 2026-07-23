import type { SupabaseClient } from "@supabase/supabase-js";

// Bump esto si Shopify deprecca la versión (calendario de versiones cada 3
// meses, con ~1 año de soporte) — no hay urgencia mientras no salga warning.
const SHOPIFY_API_VERSION = "2024-10";

interface ShopifyVariant {
  id: number;
  price: string; // string decimal, ej "12990.00"
  inventory_quantity: number | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  status: string; // active | draft | archived
  image: { src: string } | null;
  variants: ShopifyVariant[];
}

interface ShopifyLineItem {
  product_id: number | null;
  quantity: number;
  price: string;
}

interface ShopifyOrder {
  created_at: string;
  cancelled_at: string | null;
  financial_status: string | null;
  line_items: ShopifyLineItem[];
}

function shopifyUrl(shopDomain: string, path: string): string {
  return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
}

async function shopifyFetch(shopDomain: string, accessToken: string, path: string): Promise<Response> {
  return fetch(shopifyUrl(shopDomain, path), {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });
}

export interface ShopifyCollectionRef {
  id: number;
  handle: string;
  title: string;
}

/** Confirma que el access token es válido (funciona igual con un token
 * recién intercambiado por OAuth) y devuelve el nombre de la tienda para
 * mostrar en la UI. */
export async function validateShopifyCredentials(
  shopDomain: string,
  accessToken: string
): Promise<{ shopName: string }> {
  const res = await shopifyFetch(shopDomain, accessToken, "/shop.json");
  if (res.status === 401 || res.status === 403) {
    throw new Error("Access token inválido o sin permisos suficientes");
  }
  if (!res.ok) {
    throw new Error(`No se pudo validar la tienda (status ${res.status})`);
  }
  const data = await res.json();
  return { shopName: data?.shop?.name ?? shopDomain };
}

/** Busca la colección por handle (el slug que aparece en la URL de la
 * colección en el admin de Shopify, ej. "merch-gamuza") entre smart y
 * custom collections. */
export async function resolveCollectionByHandle(
  shopDomain: string,
  accessToken: string,
  handle: string
): Promise<ShopifyCollectionRef> {
  for (const kind of ["custom_collections", "smart_collections"] as const) {
    const res = await shopifyFetch(
      shopDomain,
      accessToken,
      `/${kind}.json?handle=${encodeURIComponent(handle)}`
    );
    if (!res.ok) continue;
    const data = await res.json();
    const match = data?.[kind]?.[0];
    if (match) {
      return { id: match.id, handle: match.handle, title: match.title };
    }
  }
  throw new Error(
    `No se encontró ninguna colección con handle "${handle}" — revisa el slug en el admin de Shopify (Productos > Colecciones)`
  );
}

/** Extrae la URL de "next page" del header Link (paginación por cursor, la
 * única soportada en versiones recientes de la Admin API — page_info, no
 * page=N). Devuelve null si no hay más páginas. */
function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const [urlPart, relPart] = part.split(";");
    if (relPart?.includes('rel="next"')) {
      return urlPart.trim().replace(/^<|>$/g, "");
    }
  }
  return null;
}

/** Trae TODOS los productos de una colección (paginado por cursor). */
async function fetchCollectionProducts(
  shopDomain: string,
  accessToken: string,
  collectionId: number
): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let url: string | null = shopifyUrl(
    shopDomain,
    `/products.json?collection_id=${collectionId}&limit=250&fields=id,title,status,image,variants`
  );

  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) {
      throw new Error(`Error listando productos de la colección (status ${res.status})`);
    }
    const data = await res.json();
    products.push(...(data.products ?? []));
    url = nextPageUrl(res.headers.get("link"));
  }

  return products;
}

/** Trae órdenes desde `sinceIso` en adelante (paginado por cursor). Solo
 * pedimos los campos que necesitamos para no traer datos de clientes que no
 * usamos. status=any incluye canceladas — se descartan más abajo. */
async function fetchOrdersSince(
  shopDomain: string,
  accessToken: string,
  sinceIso: string
): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = [];
  let url: string | null = shopifyUrl(
    shopDomain,
    `/orders.json?status=any&created_at_min=${encodeURIComponent(sinceIso)}&limit=250&fields=created_at,cancelled_at,financial_status,line_items`
  );

  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) {
      throw new Error(`Error listando órdenes (status ${res.status})`);
    }
    const data = await res.json();
    orders.push(...(data.orders ?? []));
    url = nextPageUrl(res.headers.get("link"));
  }

  return orders;
}

function monthKey(dateIso: string): string {
  // Primer día del mes, en la fecha calendario tal cual la entrega Shopify
  // (incluye timezone de la tienda) — evitamos convertir a UTC para no
  // correr un pedido de fin de mes al mes siguiente.
  return `${dateIso.slice(0, 7)}-01`;
}

/** Sincroniza productos/inventario y ventas por mes para UNA integración de
 * Shopify. Se usa tanto desde el sync manual como desde el cron diario. */
export async function syncShopify(
  supabase: SupabaseClient,
  organizationId: string,
  projectId: string,
  shopDomain: string,
  accessToken: string,
  collectionId: number,
  monthsBack = 12
): Promise<{ productsCount: number; monthsUpdated: number }> {
  const products = await fetchCollectionProducts(shopDomain, accessToken, collectionId);
  const productIds = new Set(products.map((p) => p.id));

  // ── Productos + inventario ────────────────────────────────────────────
  const productRows = products.map((p) => {
    const inventoryQuantity = p.variants.reduce(
      (sum, v) => sum + (v.inventory_quantity ?? 0),
      0
    );
    const cheapestVariant = p.variants.reduce<ShopifyVariant | null>((min, v) => {
      const price = Number(v.price);
      if (!min || price < Number(min.price)) return v;
      return min;
    }, null);

    return {
      organization_id: organizationId,
      project_id: projectId,
      shopify_product_id: p.id,
      title: p.title,
      status: p.status,
      available: p.status === "active" && inventoryQuantity > 0,
      inventory_quantity: inventoryQuantity,
      price: cheapestVariant ? Math.round(Number(cheapestVariant.price) * 100) : null,
      image_url: p.image?.src ?? null,
      updated_at: new Date().toISOString(),
    };
  });

  if (productRows.length > 0) {
    const { error: productsError } = await supabase
      .from("shopify_products")
      .upsert(productRows, { onConflict: "organization_id,project_id,shopify_product_id" });
    if (productsError) {
      throw new Error(`No se pudieron guardar los productos: ${productsError.message}`);
    }
  }

  // Productos que ya no están en la colección (se sacaron, se archivaron y
  // dejaron de calzar el fetch, etc.) — los borramos para que el dashboard
  // no muestre catálogo fantasma.
  const currentIds = productRows.map((r) => r.shopify_product_id);
  await supabase
    .from("shopify_products")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .not("shopify_product_id", "in", `(${currentIds.length > 0 ? currentIds.join(",") : "0"})`);

  // ── Ventas por mes ─────────────────────────────────────────────────────
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  since.setDate(1);

  const orders = await fetchOrdersSince(shopDomain, accessToken, since.toISOString());

  const monthly = new Map<string, { units: number; total: number; orderIds: Set<number> }>();

  orders.forEach((order, orderIdx) => {
    // Ventas "reales": excluimos canceladas; contamos pagadas y
    // parcialmente reembolsadas (la parte no devuelta sigue siendo venta).
    if (order.cancelled_at) return;
    if (order.financial_status && !["paid", "partially_refunded", "partially_paid"].includes(order.financial_status)) {
      return;
    }

    let orderHasMatchingItem = false;
    for (const item of order.line_items) {
      if (item.product_id == null || !productIds.has(item.product_id)) continue;
      orderHasMatchingItem = true;
      const key = monthKey(order.created_at);
      const bucket = monthly.get(key) ?? { units: 0, total: 0, orderIds: new Set<number>() };
      bucket.units += item.quantity;
      bucket.total += Math.round(Number(item.price) * item.quantity * 100);
      bucket.orderIds.add(orderIdx); // índice local basta, solo se usa para contar
      monthly.set(key, bucket);
    }
    void orderHasMatchingItem;
  });

  const monthlyRows = Array.from(monthly.entries()).map(([month, agg]) => ({
    organization_id: organizationId,
    project_id: projectId,
    month,
    units_sold: agg.units,
    total_sales: agg.total,
    orders_count: agg.orderIds.size,
    updated_at: new Date().toISOString(),
  }));

  if (monthlyRows.length > 0) {
    const { error: salesError } = await supabase
      .from("shopify_sales_monthly")
      .upsert(monthlyRows, { onConflict: "organization_id,project_id,month" });
    if (salesError) {
      throw new Error(`No se pudieron guardar las ventas mensuales: ${salesError.message}`);
    }
  }

  return { productsCount: productRows.length, monthsUpdated: monthlyRows.length };
}
