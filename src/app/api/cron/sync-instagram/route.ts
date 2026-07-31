import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { syncInstagram, syncInstagramPosts, syncInstagramDemographics } from "@/lib/meta-sync";
import { syncFacebookPage } from "@/lib/facebook-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface SyncResult {
  platform: "instagram" | "facebook";
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

interface IntegrationRow {
  organization_id: string;
  project_id: string | null;
  account_id: string;
  account_name: string | null;
  access_token: string;
  platform: "instagram" | "facebook";
}

async function syncOneIntegration(
  supabase: ReturnType<typeof createAdminClient>,
  integration: IntegrationRow
): Promise<SyncResult> {
  const { organization_id: organizationId, project_id: projectId, account_id: accountId, account_name: accountName, access_token: accessToken, platform } = integration;

  if (!projectId) {
    return {
      platform,
      organizationId,
      projectId: null,
      accountName,
      ok: false,
      error: "Sin project_id asignado — reconectar la integración o asignarlo manualmente",
    };
  }

  // ── Facebook: mas simple, solo seguidores por ahora (mismo Page Access
  // Token que Instagram, no requiere conexion aparte). ──────────────────
  if (platform === "facebook") {
    try {
      const result = await syncFacebookPage(supabase, organizationId, accessToken, accountId, projectId);
      return { platform, organizationId, projectId, accountName, ok: true, followers: result.followers };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      console.error("[cron/sync-social] facebook sync failed", { organizationId, projectId, accountName, message });
      return { platform, organizationId, projectId, accountName, ok: false, error: message };
    }
  }

  // ── Instagram: seguidores + avatar + posts + demografia ──────────────
  try {
    const result = await syncInstagram(supabase, organizationId, accessToken, accountId, projectId);

    // Posts/reels y demografía son "nice to have": si fallan, no deben
    // tumbar el resultado principal (seguidores) que ya se guardó bien.
    let postsCount: number | undefined;
    let demographicsSynced: number | undefined;
    try {
      const postsResult = await syncInstagramPosts(supabase, organizationId, accessToken, accountId, projectId);
      postsCount = postsResult.postsCount;
    } catch (postsErr) {
      console.error("[cron/sync-social] posts sync failed (no bloqueante)", { projectId, postsErr });
    }
    try {
      const demoResult = await syncInstagramDemographics(supabase, organizationId, accessToken, accountId, projectId);
      demographicsSynced = demoResult.breakdownsSynced;
    } catch (demoErr) {
      console.error("[cron/sync-social] demographics sync failed (no bloqueante)", { projectId, demoErr });
    }

    return {
      platform,
      organizationId,
      projectId,
      accountName,
      ok: true,
      followers: result.followers,
      avatarStatus: result.avatarStatus,
      hasProfilePictureUrl: result.hasProfilePictureUrl,
      postsCount,
      demographicsSynced,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[cron/sync-social] instagram sync failed", { organizationId, projectId, accountName, message });
    return { platform, organizationId, projectId, accountName, ok: false, error: message };
  }
}

/**
 * Cron diario (4:00 AM Santiago) — el cron de RRSS: sincroniza TODAS las
 * integraciones de Instagram Y Facebook activas, sin depender de sesión de
 * usuario. Antes eran dos endpoints separados (/sync-instagram y el
 * /sync-facebook sin usar); se fusionaron en uno solo para no necesitar un
 * segundo cron job en Railway -- misma URL y el mismo CRON_SECRET de
 * siempre, ahora cubre ambas plataformas. Pensado para crecer (TikTok,
 * YouTube) agregando un branch mas al dispatch de syncOneIntegration.
 *
 * Invocado por Railway Cron vía POST con
 * Authorization: Bearer <CRON_SECRET>.
 *
 * No hacer sync on-demand por carga de página ni cada hora: rate limits de
 * Meta y no aporta valor real (decisión tomada — ver plan maestro Fase 1.1).
 *
 * Las cuentas se sincronizan en PARALELO (antes era secuencial): con hasta
 * ~30 llamadas a Meta por cuenta de Instagram, cualquier lentitud puntual
 * de la API se acumulaba y el cron terminaba superando el limite de 100s
 * de Cloudflare (524) aun cuando cada llamada individual tenia su propio
 * timeout. Corriendo las cuentas en paralelo, el tiempo total queda
 * acotado por la cuenta mas lenta, no por la suma de todas.
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
    .in("platform", ["instagram", "facebook"]);

  if (fetchError) {
    console.error("[cron/sync-social] failed to list integrations", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results = await Promise.all(
    ((integrations ?? []) as IntegrationRow[]).map((integration) => syncOneIntegration(supabase, integration))
  );

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  const byPlatform = {
    instagram: results.filter((r) => r.platform === "instagram").length,
    facebook: results.filter((r) => r.platform === "facebook").length,
  };

  console.log("[cron/sync-social] run complete", { total: results.length, succeeded, failed, byPlatform });

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    total: results.length,
    succeeded,
    failed,
    byPlatform,
    results,
  });
}
