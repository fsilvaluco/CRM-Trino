import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import type { ShopifyProduct, ShopifySalesMonth, ShopifySalesDay } from "@/types/analytics";

// Solo lectura — a propósito no hay POST/PATCH/DELETE en esta ruta. Los
// datos únicamente entran vía sync con Shopify (lib/shopify-sync.ts), nunca
// desde la UI.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduct(row: any): ShopifyProduct {
  return {
    id: row.id,
    shopifyProductId: Number(row.shopify_product_id),
    title: row.title,
    status: row.status,
    available: row.available,
    inventoryQuantity: row.inventory_quantity,
    price: row.price,
    cost: row.cost ?? null,
    imageUrl: row.image_url,
    updatedAt: row.updated_at,
    variants: (row.shopify_product_variants ?? []).map((v: any) => ({
      id: v.id,
      shopifyVariantId: Number(v.shopify_variant_id),
      title: v.title,
      sku: v.sku,
      price: v.price,
      cost: v.cost ?? null,
      inventoryQuantity: v.inventory_quantity,
      available: v.available,
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSalesMonth(row: any): ShopifySalesMonth {
  return {
    id: row.id,
    month: row.month,
    unitsSold: row.units_sold,
    totalSales: row.total_sales,
    ordersCount: row.orders_count,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSalesDay(row: any): ShopifySalesDay {
  return {
    id: row.id,
    day: row.day,
    shopifyProductId: Number(row.shopify_product_id),
    shopifyVariantId: Number(row.shopify_variant_id),
    sku: row.sku,
    unitsSold: row.units_sold,
    totalSales: row.total_sales,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const isAllProjects = searchParams.get("isAllProjects") === "true";
  const from = searchParams.get("from"); // YYYY-MM-DD, opcional
  const to = searchParams.get("to"); // YYYY-MM-DD, opcional
  const shopifyProductId = searchParams.get("shopifyProductId"); // opcional

  if (!isAllProjects && !projectId) {
    return NextResponse.json({ products: [], salesByMonth: [], salesByDay: [] });
  }

  let productsQuery = supabase
    .from("shopify_products")
    .select("*, shopify_product_variants(*)")
    .eq("organization_id", orgId!);
  let salesQuery = supabase
    .from("shopify_sales_monthly")
    .select("*")
    .eq("organization_id", orgId!)
    .order("month", { ascending: true });
  let dailyQuery = supabase
    .from("shopify_sales_daily")
    .select("*")
    .eq("organization_id", orgId!)
    .order("day", { ascending: true });

  if (!isAllProjects && projectId) {
    productsQuery = productsQuery.eq("project_id", projectId);
    salesQuery = salesQuery.eq("project_id", projectId);
    dailyQuery = dailyQuery.eq("project_id", projectId);
  }
  if (from) dailyQuery = dailyQuery.gte("day", from);
  if (to) dailyQuery = dailyQuery.lte("day", to);
  if (shopifyProductId) dailyQuery = dailyQuery.eq("shopify_product_id", Number(shopifyProductId));

  const [
    { data: products, error: productsError },
    { data: sales, error: salesError },
    { data: dailySales, error: dailyError },
  ] = await Promise.all([productsQuery, salesQuery, dailyQuery]);

  if (productsError || salesError || dailyError) {
    return NextResponse.json(
      {
        error: "No se pudieron leer los datos de Shopify",
        details: productsError?.message ?? salesError?.message ?? dailyError?.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    products: (products ?? []).map(mapProduct),
    salesByMonth: (sales ?? []).map(mapSalesMonth),
    salesByDay: (dailySales ?? []).map(mapSalesDay),
  });
}
