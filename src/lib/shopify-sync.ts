import type { SupabaseClient } from "@supabase/supabase-js";

// Bump esto si Shopify deprecca la versión (calendario de versiones cada 3
// meses, con ~1 año de soporte) — no hay urgencia mientras no salga warning.
const SHOPIFY_API_VERSION = "2024-10";

interface ShopifyVariant {
  id: number;
  title: string; // ej. "Small / Negro"
  sku: string | null;
  price: string; // string decimal, ej "12990.00"
  inventory_quantity: number | null;
  inventory_item_id: number | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  status: string; // active | draft | archived
  image: { src: string } | null;
  variants: ShopifyVariant[];
}

interface ShopifyDiscountAllocation {
  amount: string; // string decimal, ej "6400.00" -- parte de este line item cubierta por un descuento
}

interface ShopifyLineItem {
  product_id: number | null;
  variant_id: number | null;
  sku: string | null;
  quantity: number;
  price: string; // precio de LISTA por unidad, sin descuento -- no usar directo para totales
  discount_allocations?: ShopifyDiscountAllocation[];
}

interface ShopifyOrder {
  created_at: string;
  // Fecha editable desde el admin de Shopify ("Editar fecha del pedido") --
  // es la que se ve en la lista de Pedidos y la que el usuario espera que
  // mande al reagrupar por mes/día. `created_at` es inmutable (timestamp
  // real de creación del registro) y no refleja ese cambio manual.
  processed_at: string | null;
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

/** Trae el costo unitario de cada variante via su inventory_item_id.
 * Shopify no entrega esto en /products.json -- hay que pedirlo aparte a
 * /inventory_items.json, en lotes de 100 ids (limite de la API). */
async function fetchInventoryCosts(
  shopDomain: string,
  accessToken: string,
  inventoryItemIds: number[]
): Promise<Map<number, number>> {
  const costByItemId = new Map<number, number>();
  const uniqueIds = Array.from(new Set(inventoryItemIds));

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    const res = await fetch(
      shopifyUrl(shopDomain, `/inventory_items.json?ids=${batch.join(",")}&limit=100`),
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );
    if (!res.ok) continue; // el costo es "nice to have" -- no bloquea el resto del sync
    const data = await res.json();
    for (const item of data.inventory_items ?? []) {
      if (item.cost != null) costByItemId.set(item.id, Number(item.cost));
    }
  }

  return costByItemId;
}

/** Trae órdenes desde `sinceIso` en adelante (paginado por cursor). Solo
 * pedimos los campos que necesitamos para no traer datos de clientes que no
 * usamos. status=any incluye canceladas — se descartan más abajo.
 *
 * El parámetro `fields` de Shopify solo filtra a nivel de campo raíz: al
 * pedir "line_items" igual vienen completos sus sub-campos nativos
 * (variant_id, sku, discount_allocations), sin tener que listarlos aparte. */
async function fetchOrdersSince(
  shopDomain: string,
  accessToken: string,
  sinceIso: string
): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = [];
  let url: string | null = shopifyUrl(
    shopDomain,
    `/orders.json?status=any&created_at_min=${encodeURIComponent(sinceIso)}&limit=250&fields=created_at,processed_at,cancelled_at,financial_status,line_items`
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
  // 36 meses: con el scope read_orders normal, Shopify solo devuelve los
  // últimos 60 días sin importar lo que pidamos aquí — pedir más no rompe
  // nada. Cuando Shopify apruebe read_all_orders, este rango es el que
  // determina cuánto histórico se rellena en el primer sync.
  monthsBack = 36
): Promise<{ productsCount: number; monthsUpdated: number }> {
  const products = await fetchCollectionProducts(shopDomain, accessToken, collectionId);
  const productIds = new Set(products.map((p) => p.id));

  const allInventoryItemIds = products.flatMap((p) =>
    p.variants.map((v) => v.inventory_item_id).filter((id): id is number => id != null)
  );
  const costByInventoryItemId = await fetchInventoryCosts(shopDomain, accessToken, allInventoryItemIds);

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
    const cheapestVariantCost =
      cheapestVariant?.inventory_item_id != null
        ? costByInventoryItemId.get(cheapestVariant.inventory_item_id)
        : undefined;

    return {
      organization_id: organizationId,
      project_id: projectId,
      shopify_product_id: p.id,
      title: p.title,
      status: p.status,
      available: p.status === "active" && inventoryQuantity > 0,
      inventory_quantity: inventoryQuantity,
      price: cheapestVariant ? Math.round(Number(cheapestVariant.price) * 100) : null,
      cost: cheapestVariantCost != null ? Math.round(cheapestVariantCost * 100) : null,
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

  // ── Variantes (talla, color, diseño) ────────────────────────────────────
  // Necesitamos el id real (UUID) de cada producto ya guardado para poder
  // enlazar sus variantes por FK.
  const { data: savedProducts } = await supabase
    .from("shopify_products")
    .select("id, shopify_product_id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .in("shopify_product_id", currentIds.length > 0 ? currentIds : [0]);

  const productDbIdByShopifyId = new Map(
    (savedProducts ?? []).map((p) => [p.shopify_product_id, p.id])
  );

  const variantRows = products.flatMap((p) => {
    const productDbId = productDbIdByShopifyId.get(p.id);
    if (!productDbId) return [];
    return p.variants.map((v) => {
      const rawCost = v.inventory_item_id != null ? costByInventoryItemId.get(v.inventory_item_id) : undefined;
      return {
        organization_id: organizationId,
        project_id: projectId,
        product_id: productDbId,
        shopify_variant_id: v.id,
        title: v.title,
        sku: v.sku ?? null,
        price: v.price ? Math.round(Number(v.price) * 100) : null,
        cost: rawCost != null ? Math.round(rawCost * 100) : null,
        inventory_quantity: v.inventory_quantity ?? 0,
        available: (v.inventory_quantity ?? 0) > 0 && p.status === "active",
        updated_at: new Date().toISOString(),
      };
    });
  });

  if (variantRows.length > 0) {
    const { error: variantsError } = await supabase
      .from("shopify_product_variants")
      .upsert(variantRows, { onConflict: "organization_id,project_id,shopify_variant_id" });
    if (variantsError) {
      throw new Error(`No se pudieron guardar las variantes: ${variantsError.message}`);
    }
  }

  // Limpieza de variantes que ya no existen (producto eliminado, variante
  // eliminada, etc.) -- mismo criterio que para productos.
  const currentVariantIds = variantRows.map((r) => r.shopify_variant_id);
  await supabase
    .from("shopify_product_variants")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .not("shopify_variant_id", "in", `(${currentVariantIds.length > 0 ? currentVariantIds.join(",") : "0"})`);

  // ── Ventas por mes (agregado existente) y por día/variante (nuevo) ─────
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  since.setDate(1);

  const orders = await fetchOrdersSince(shopDomain, accessToken, since.toISOString());

  const monthly = new Map<string, { units: number; total: number; orderIds: Set<number> }>();
  const daily = new Map<
    string,
    { day: string; productId: number; variantId: number; sku: string | null; units: number; total: number }
  >();

  orders.forEach((order, orderIdx) => {
    // Ventas "reales": excluimos canceladas; contamos pagadas y
    // parcialmente reembolsadas (la parte no devuelta sigue siendo venta).
    if (order.cancelled_at) return;
    if (order.financial_status && !["paid", "partially_refunded", "partially_paid"].includes(order.financial_status)) {
      return;
    }

    // Fecha "efectiva" del pedido: processed_at es la que se ve y se puede
    // editar en el admin de Shopify ("Editar fecha del pedido"); created_at
    // es inmutable y no refleja ese cambio -- si processed_at no viene por
    // algún motivo, created_at es el único fallback razonable.
    const effectiveDate = order.processed_at ?? order.created_at;

    for (const item of order.line_items) {
      if (item.product_id == null || !productIds.has(item.product_id)) continue;

      // Monto REAL transaccionado: precio de lista * cantidad, menos la
      // parte de descuento que Shopify asignó a este line item puntual.
      // Antes esto usaba item.price a secas -- por eso se veía el precio de
      // lista (ej. $13.000) en vez de lo efectivamente pagado ($6.600).
      const listAmount = Number(item.price) * item.quantity;
      const discountAmount = (item.discount_allocations ?? []).reduce(
        (sum, d) => sum + Number(d.amount),
        0
      );
      const netAmount = Math.round((listAmount - discountAmount) * 100); // CLP cents

      const monthBucketKey = monthKey(effectiveDate);
      const monthBucket = monthly.get(monthBucketKey) ?? { units: 0, total: 0, orderIds: new Set<number>() };
      monthBucket.units += item.quantity;
      monthBucket.total += netAmount;
      monthBucket.orderIds.add(orderIdx); // índice local basta, solo se usa para contar
      monthly.set(monthBucketKey, monthBucket);

      if (item.variant_id != null) {
        const day = effectiveDate.slice(0, 10); // YYYY-MM-DD, mismo criterio de timezone que monthKey
        const dayKey = `${day}|${item.variant_id}`;
        const dayBucket = daily.get(dayKey) ?? {
          day,
          productId: item.product_id,
          variantId: item.variant_id,
          sku: item.sku ?? null,
          units: 0,
          total: 0,
        };
        dayBucket.units += item.quantity;
        dayBucket.total += netAmount;
        daily.set(dayKey, dayBucket);
      }
    }
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

  // Delete-then-insert acotado a la ventana recalculada (since -> hoy),
  // igual que shopify_sales_daily más abajo: un upsert solo no alcanza
  // porque un pedido puede migrar de mes entre syncs (ej. al usar
  // processed_at en vez de created_at, o si se edita la fecha en Shopify) --
  // sin este delete, el mes viejo queda con el total duplicado.
  await supabase
    .from("shopify_sales_monthly")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .gte("month", monthKey(since.toISOString()));

  if (monthlyRows.length > 0) {
    const { error: salesError } = await supabase
      .from("shopify_sales_monthly")
      .upsert(monthlyRows, { onConflict: "organization_id,project_id,month" });
    if (salesError) {
      throw new Error(`No se pudieron guardar las ventas mensuales: ${salesError.message}`);
    }
  }

  const dailyRows = Array.from(daily.values()).map((agg) => ({
    organization_id: organizationId,
    project_id: projectId,
    day: agg.day,
    shopify_product_id: agg.productId,
    shopify_variant_id: agg.variantId,
    sku: agg.sku,
    units_sold: agg.units,
    total_sales: agg.total,
    updated_at: new Date().toISOString(),
  }));

  // Delete-then-insert acotado a la ventana que se acaba de recalcular
  // (since -> hoy): a diferencia del upsert de mensual, esto evita que un
  // día quede con un total viejo si una orden se cancela despues de haber
  // sido contada (upsert solo pisa filas que vuelven a aparecer; un dia que
  // pasa de "con ventas" a "sin ventas" no generaria fila nueva que lo pise).
  await supabase
    .from("shopify_sales_daily")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .gte("day", since.toISOString().slice(0, 10));

  if (dailyRows.length > 0) {
    const { error: dailyError } = await supabase.from("shopify_sales_daily").insert(dailyRows);
    if (dailyError) {
      throw new Error(`No se pudieron guardar las ventas diarias: ${dailyError.message}`);
    }
  }

  return { productsCount: productRows.length, monthsUpdated: monthlyRows.length };
}
