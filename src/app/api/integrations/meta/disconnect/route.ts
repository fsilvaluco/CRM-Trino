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
    return NextResponse.json(
      { error: "Selecciona un proyecto antes de desconectar" },
      { status: 400 }
    );
  }

  const { data: integration, error: fetchError } = await supabase
    .from("artist_integrations")
    .select("account_id")
    .eq("organization_id", orgId!)
    .eq("platform", "instagram")
    .eq("project_id", projectId)
    .maybeSingle();

  if (fetchError || !integration) {
    return NextResponse.json(
      { error: "Sin integración de Instagram conectada en este proyecto" },
      { status: 404 }
    );
  }

  const { error: deleteIntegrationError } = await supabase
    .from("artist_integrations")
    .delete()
    .eq("organization_id", orgId!)
    .eq("platform", "instagram")
    .eq("project_id", projectId);

  if (deleteIntegrationError) {
    console.error("[meta/disconnect] artist_integrations delete failed", {
      orgId,
      deleteIntegrationError,
    });
    return NextResponse.json(
      { error: "No se pudo desconectar la integración" },
      { status: 500 }
    );
  }

  let deletedMetrics = 0;
  if (projectId) {
    const { data: deletedRows, error: deleteMetricsError } = await supabase
      .from("social_metrics")
      .delete()
      .eq("organization_id", orgId!)
      .eq("project_id", projectId)
      .eq("platform", "instagram")
      .select("id");

    if (deleteMetricsError) {
      console.error("[meta/disconnect] social_metrics delete failed", {
        orgId,
        projectId,
        deleteMetricsError,
      });
    } else {
      deletedMetrics = deletedRows?.length ?? 0;
    }
  }

  return NextResponse.json({ ok: true, deletedMetrics });
}
