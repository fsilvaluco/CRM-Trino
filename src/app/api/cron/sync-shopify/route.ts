import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { syncShopify } from "@/lib/shopify-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SyncResult {
  organizationId: string;
  projectId: string;
  storeName: string | null;
  ok: boolean;
  productsCount?: number;
  monthsUpdated?: number;
  error?: string;
}

/**
 * Cron diario — sincroniza TODAS las colecciones de Shopify asignadas a
 * algún proyecto, sin depender de sesión de usuario. Mismo patrón que
 * /api/cron/sync-instagram: invocado por un servicio Railway Cron vía POST
 * con Authorization: Bearer <CRON_SECRET>.
 *
 * Nota de eficiencia: si dos proyectos comparten la misma tienda (ej. dos
 * artistas con colecciones distintas en la tienda de Katarsis), hoy se
 * traen las órdenes de esa tienda dos veces, una por proyecto — no es
 * incorrecto, pero es una optimización pendiente (cachear órdenes por
 * tienda dentro de una misma corrida de cron) si el volumen de órdenes
 * llega a justificarlo.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado en el servidor" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: collections, error: fetchError } = await supabase
    .from("shopify_collections")
    .select("organization_id, project_id, shopify_collection_id, shopify_stores(shop_domain, access_token, shop_name)");

  if (fetchError) {
    console.error("[cron/sync-shopify] failed to list collections", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results: SyncResult[] = [];

  for (const row of collections ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (row as any).shopify_stores;
    const organizationId = row.organization_id;
    const projectId = row.project_id;

    if (!store) {
      results.push({ organizationId, projectId, storeName: null, ok: false, error: "Tienda no encontrada" });
      continue;
    }

    try {
      const result = await syncShopify(
        supabase,
        organizationId,
        projectId,
        store.shop_domain,
        store.access_token,
        row.shopify_collection_id
      );

      await supabase
        .from("shopify_collections")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("project_id", projectId);

      results.push({ organizationId, projectId, storeName: store.shop_name, ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      console.error("[cron/sync-shopify] sync failed", { organizationId, projectId, message });
      results.push({ organizationId, projectId, storeName: store.shop_name, ok: false, error: message });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  console.log("[cron/sync-shopify] run complete", { total: results.length, succeeded, failed });

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    total: results.length,
    succeeded,
    failed,
    results,
  });
}
