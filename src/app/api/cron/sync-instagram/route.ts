import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { syncInstagram, syncInstagramPosts, syncInstagramDemographics } from "@/lib/meta-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SyncResult {
  organizationId: string;
  projectId: string | null;
  accountName: string | null;
  ok: boolean;
  followers?: number;
  avatarStatus?: string;
  hasProfilePictureUrl?: boolean;
  postsCount?: number;
  demographicsSynced?: number;
  error?: string;
}

/**
 * Cron diario (4:00 AM Santiago) — sincroniza TODAS las integraciones de
 * Instagram activas, sin depender de sesión de usuario. Pensado para ser
 * invocado por un servicio de cron externo (Railway Cron o cron-job.org)
 * vía POST con el header Authorization: Bearer <CRON_SECRET>.
 *
 * No hacer sync on-demand por carga de página ni cada hora: rate limits de
 * Meta y no aporta valor real (decisión tomada — ver plan maestro Fase 1.1).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado en el servidor" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: integrations, error: fetchError } = await supabase
    .from("artist_integrations")
    .select("organization_id, project_id, account_id, account_name, access_token, platform")
    .eq("platform", "instagram");

  if (fetchError) {
    console.error("[cron/sync-instagram] failed to list integrations", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results: SyncResult[] = [];

  for (const integration of integrations ?? []) {
    const { organization_id: organizationId, project_id: projectId, account_id: igUserId, account_name: accountName, access_token: accessToken } = integration;

    if (!projectId) {
      results.push({
        organizationId,
        projectId: null,
        accountName,
        ok: false,
        error: "Sin project_id asignado — reconectar la integración o asignarlo manualmente",
      });
      continue;
    }

    try {
      const result = await syncInstagram(supabase, organizationId, accessToken, igUserId, projectId);

      // Posts/reels y demografía son "nice to have": si fallan, no deben
      // tumbar el resultado principal (seguidores) que ya se guardó bien.
      let postsCount: number | undefined;
      let demographicsSynced: number | undefined;
      try {
        const postsResult = await syncInstagramPosts(supabase, organizationId, accessToken, igUserId, projectId);
        postsCount = postsResult.postsCount;
      } catch (postsErr) {
        console.error("[cron/sync-instagram] posts sync failed (no bloqueante)", { projectId, postsErr });
      }
      try {
        const demoResult = await syncInstagramDemographics(supabase, organizationId, accessToken, igUserId, projectId);
        demographicsSynced = demoResult.breakdownsSynced;
      } catch (demoErr) {
        console.error("[cron/sync-instagram] demographics sync failed (no bloqueante)", { projectId, demoErr });
      }

      results.push({
        organizationId,
        projectId,
        accountName,
        ok: true,
        followers: result.followers,
        avatarStatus: result.avatarStatus,
        hasProfilePictureUrl: result.hasProfilePictureUrl,
        postsCount,
        demographicsSynced,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      console.error("[cron/sync-instagram] sync failed", { organizationId, projectId, accountName, message });
      results.push({ organizationId, projectId, accountName, ok: false, error: message });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  console.log("[cron/sync-instagram] run complete", { total: results.length, succeeded, failed });

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    total: results.length,
    succeeded,
    failed,
    results,
  });
}
