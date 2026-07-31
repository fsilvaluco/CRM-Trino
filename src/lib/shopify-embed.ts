import { createAdminClient } from "@/lib/supabase-admin";

// ─── Catálogo público para el embed de productos ────────────────────────────
// A diferencia de todo lo demás en /api/analytics/shopify, esto NO pasa por
// requireAuth() -- está pensado para cargarse desde un <iframe> en un sitio
// externo (gamuza.cl) sin sesión de ningún tipo. Por eso usa el cliente admin
// directo y expone deliberadamente solo lo que es seguro mostrar en público:
// título, precio, imagen, disponibilidad. Nunca organization_id, cost, ni
// nada del resto del catálogo interno.

export interface EmbedVariant {
  id: number;
  title: string;
  sku: string | null;
  price: number | null; // CLP cents
  available: boolean;
}

export interface EmbedProduct {
  id: number;
  title: string;
  imageUrl: string | null;
  price: number | null; // CLP cents, variante más barata
  available: boolean;
  variants: EmbedVariant[];
}

export interface EmbedCatalog {
  shopDomain: string;
  themeColor: string;
  products: EmbedProduct[];
}

/** Resuelve el catálogo embebible de un proyecto. Devuelve null si el
 * proyecto no existe o no tiene una colección de Shopify conectada -- la
 * página del embed debe mostrar un estado vacío en ese caso, no un error. */
export async function getEmbedCatalog(projectId: string): Promise<EmbedCatalog | null> {
  const supabase = createAdminClient();

  const { data: collection } = await supabase
    .from("shopify_collections")
    .select("store_id, shopify_stores(shop_domain)")
    .eq("project_id", projectId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopDomain = (collection as any)?.shopify_stores?.shop_domain as string | undefined;
  if (!collection || !shopDomain) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("theme_color")
    .eq("id", projectId)
    .maybeSingle();

  const { data: products } = await supabase
    .from("shopify_products")
    .select("id, shopify_product_id, title, image_url, price, available, shopify_product_variants(shopify_variant_id, title, sku, price, available)")
    .eq("project_id", projectId)
    .eq("available", true)
    .order("title", { ascending: true });

  return {
    shopDomain,
    themeColor: project?.theme_color ?? "azul",
    products: (products ?? []).map((p) => ({
      id: Number(p.shopify_product_id),
      title: p.title,
      imageUrl: p.image_url,
      price: p.price,
      available: p.available,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      variants: ((p as any).shopify_product_variants ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((v: any) => v.available)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((v: any) => ({
          id: Number(v.shopify_variant_id),
          title: v.title,
          sku: v.sku,
          price: v.price,
          available: v.available,
        })),
    })),
  };
}
