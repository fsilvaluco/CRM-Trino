import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { syncInstagram, syncInstagramPosts, syncInstagramDemographics } from "@/lib/meta-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

interface IntegrationRow {
  organization_id: string;
  project_id: string | null;
  account_id: string;
  account_name: string | null;
  access_token: string;
  platform: string;
}

async function syncOneIntegration(
  supabase: ReturnType<typeof createAdminClient>,
  integration: IntegrationRow
): Promise<SyncResult> {
  const { organization_id: organizationId, project_id: projectId, account_id: igUserId, account_name: accountName, access_token: accessToken } = integration;

  if (!projectId) {
    return {
      organizationId,
      projectId: null,
      accountName,
      ok: false,
      error: "Sin project_id asignado — reconectar la integración o asignarlo manualmente",
    };
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

    return {
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
    console.error("[cron/sync-instagram] sync failed", { organizationId, projectId, accountName, message });
    return { organizationId, projectId, accountName, ok: false, error: message };
  }
}

/**
 * Cron diario (4:00 AM Santiago) — sincroniza TODAS las integraciones de
 * Instagram activas, sin depender de sesión de usuario. Pensado para ser
 * invocado por un servicio de cron externo (Railway Cron o cron-job.org)
 * vía POST con el header Authorization: Bearer <CRON_SECRET>.
 *
 * No hacer sync on-demand por carga de página ni cada hora: rate limits de
 * Meta y no aporta valor real (decisión tomada — ver plan maestro Fase 1.1).
 *
 * Las cuentas se sincronizan en PARALELO (antes era secuencial): con 6+
 * cuentas y hasta ~30 llamadas a Meta por cuenta, cualquier lentitud
 * puntual de la API se acumulaba y el cron terminaba superando el limite
 * de 100s de Cloudflare (524) aun cuando cada llamada individual tenia su
 * propio timeout. Corriendo las cuentas en paralelo, el tiempo total queda
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
    .eq("platform", "instagram");

  if (fetchError) {
    console.error("[cron/sync-instagram] failed to list integrations", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results = await Promise.all(
    (integrations ?? []).map((integration): Promise<SyncResult> => syncOneIntegration(supabase, integration))
  );

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
