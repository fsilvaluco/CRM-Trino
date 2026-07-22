import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { syncInstagram } from "@/lib/meta-sync";

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
    return NextResponse.json({ ok: true, followers: result.followers, recordedAt: result.recordedAt });
  } catch (syncError: unknown) {
    const message = syncError instanceof Error ? syncError.message : "Error de sincronización";
    console.error("[meta/sync] failed", { orgId, projectId, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
