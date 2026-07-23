import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import type { ShopifyProduct, ShopifySalesMonth } from "@/types/analytics";

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
    imageUrl: row.image_url,
    updatedAt: row.updated_at,
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

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const isAllProjects = searchParams.get("isAllProjects") === "true";

  if (!isAllProjects && !projectId) {
    return NextResponse.json({ products: [], salesByMonth: [] });
  }

  let productsQuery = supabase.from("shopify_products").select("*").eq("organization_id", orgId!);
  let salesQuery = supabase
    .from("shopify_sales_monthly")
    .select("*")
    .eq("organization_id", orgId!)
    .order("month", { ascending: true });

  if (!isAllProjects && projectId) {
    productsQuery = productsQuery.eq("project_id", projectId);
    salesQuery = salesQuery.eq("project_id", projectId);
  }

  const [{ data: products, error: productsError }, { data: sales, error: salesError }] = await Promise.all([
    productsQuery,
    salesQuery,
  ]);

  if (productsError || salesError) {
    return NextResponse.json(
      { error: "No se pudieron leer los datos de Shopify", details: productsError?.message ?? salesError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    products: (products ?? []).map(mapProduct),
    salesByMonth: (sales ?? []).map(mapSalesMonth),
  });
}
