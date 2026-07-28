import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { syncInstagram, syncInstagramPosts, syncInstagramDemographics } from "@/lib/meta-sync";

export async function POST(request: NextRequest) {
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
    return NextResponse.json(
      { error: "Selecciona un proyecto antes de sincronizar" },
      { status: 400 }
    );
  }

  const { data: integration, error: dbError } = await supabase
    .from("artist_integrations")
    .select("*")
    .eq("organization_id", orgId!)
    .eq("platform", "instagram")
    .eq("project_id", projectId)
    .maybeSingle();

  if (dbError || !integration) {
    return NextResponse.json(
      { error: "Sin integración de Instagram conectada" },
      { status: 404 }
    );
  }

  try {
    const result = await syncInstagram(
      supabase,
      orgId!,
      integration.access_token,
      integration.account_id,
      projectId
    );

    let postsCount: number | undefined;
    let demographicsSynced: number | undefined;
    try {
      const postsResult = await syncInstagramPosts(
        supabase,
        orgId!,
        integration.access_token,
        integration.account_id,
        projectId
      );
      postsCount = postsResult.postsCount;
    } catch (postsErr) {
      console.error("[meta/sync] posts sync failed (no bloqueante)", { projectId, postsErr });
    }
    try {
      const demoResult = await syncInstagramDemographics(
        supabase,
        orgId!,
        integration.access_token,
        integration.account_id,
        projectId
      );
      demographicsSynced = demoResult.breakdownsSynced;
    } catch (demoErr) {
      console.error("[meta/sync] demographics sync failed (no bloqueante)", { projectId, demoErr });
    }

    return NextResponse.json({
      ok: true,
      followers: result.followers,
      recordedAt: result.recordedAt,
      postsCount,
      demographicsSynced,
    });
  } catch (syncError: unknown) {
    const message = syncError instanceof Error ? syncError.message : "Error de sincronización";
    console.error("[meta/sync] failed", { orgId, projectId, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
