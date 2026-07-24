import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { syncFacebookPage } from "@/lib/facebook-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SyncResult {
  organizationId: string;
  projectId: string | null;
  accountName: string | null;
  ok: boolean;
  followers?: number;
  error?: string;
}

/**
 * Cron diario — sincroniza todas las Páginas de Facebook conectadas (vía
 * el mismo login de Meta que Instagram). Mismo patrón que
 * /api/cron/sync-instagram: invocado por Railway Cron con
 * Authorization: Bearer <CRON_SECRET>.
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

  const { data: integrations, error: fetchError } = await supabase
    .from("artist_integrations")
    .select("organization_id, project_id, account_id, account_name, access_token")
    .eq("platform", "facebook");

  if (fetchError) {
    console.error("[cron/sync-facebook] failed to list integrations", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results: SyncResult[] = [];

  for (const integration of integrations ?? []) {
    const {
      organization_id: organizationId,
      project_id: projectId,
      account_id: pageId,
      account_name: accountName,
      access_token: accessToken,
    } = integration;

    if (!projectId) {
      results.push({ organizationId, projectId: null, accountName, ok: false, error: "Sin project_id asignado" });
      continue;
    }

    try {
      const result = await syncFacebookPage(supabase, organizationId, accessToken, pageId, projectId);
      results.push({ organizationId, projectId, accountName, ok: true, followers: result.followers });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      console.error("[cron/sync-facebook] sync failed", { organizationId, projectId, accountName, message });
      results.push({ organizationId, projectId, accountName, ok: false, error: message });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  console.log("[cron/sync-facebook] run complete", { total: results.length, succeeded, failed });

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    total: results.length,
    succeeded,
    failed,
    results,
  });
}
