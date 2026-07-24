import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function DELETE(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const projectId = (body as { projectId?: string })?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Selecciona un proyecto antes de desconectar" }, { status: 400 });
  }

  const { data: collection, error: fetchError } = await supabase
    .from("shopify_collections")
    .select("id")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .maybeSingle();

  if (fetchError || !collection) {
    return NextResponse.json({ error: "Sin colección de Shopify asignada a este proyecto" }, { status: 404 });
  }

  // Solo se borra la asignación de este proyecto — la tienda (shopify_stores)
  // queda conectada, porque puede estar en uso por otros proyectos de la
  // misma organización (ej. la tienda de Katarsis con colecciones de varios
  // artistas). Desconectar la tienda completa sería una acción separada.
  const { error: deleteError } = await supabase
    .from("shopify_collections")
    .delete()
    .eq("organization_id", orgId!)
    .eq("project_id", projectId);

  if (deleteError) {
    console.error("[shopify/disconnect] delete failed", { orgId, deleteError });
    return NextResponse.json({ error: "No se pudo desconectar la colección" }, { status: 500 });
  }

  // shopify_products SÍ se borra: es un snapshot del inventario actual, no
  // histórico — sin conexión activa ya no representa nada real. En cambio
  // shopify_sales_monthly es histórico de ventas y se conserva, mismo
  // criterio que Instagram/Facebook: desconectar detiene el sync, no
  // destruye datos ya registrados.
  await supabase.from("shopify_products").delete().eq("organization_id", orgId!).eq("project_id", projectId);

  return NextResponse.json({ ok: true });
}
