import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import type { ShopifyOrder } from "@/types/analytics";

// Solo lectura, on-demand: se pide con from/to acotado a UN mes cuando el
// usuario expande esa fila en el dashboard -- no tiene sentido cargar todos
// los pedidos de siempre junto con el resto de /api/analytics/shopify.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrder(row: any): ShopifyOrder {
  return {
    id: row.id,
    shopifyOrderId: Number(row.shopify_order_id),
    orderNumber: row.order_number,
    day: row.day,
    totalSales: row.total_sales,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const from = searchParams.get("from"); // YYYY-MM-DD, requerido
  const to = searchParams.get("to"); // YYYY-MM-DD, requerido

  if (!projectId || !from || !to) {
    return NextResponse.json({ error: "Faltan projectId, from o to" }, { status: 400 });
  }

  const { data, error: ordersError } = await supabase
    .from("shopify_orders")
    .select("*")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .gte("day", from)
    .lte("day", to)
    .order("day", { ascending: false });

  if (ordersError) {
    return NextResponse.json(
      { error: "No se pudieron leer los pedidos", details: ordersError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ orders: (data ?? []).map(mapOrder) });
}
