import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createPressMentionSchema } from "@/types/press";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createPressMentionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, campaignId, mentionDate, outlet, type, source, title, referenceUrl, socialUrl, notes } =
    parsed.data;

  const { error: updateError } = await supabase
    .from("press_mentions")
    .update({
      project_id: projectId,
      campaign_id: campaignId ?? null,
      mention_date: mentionDate ?? null,
      outlet,
      type,
      source,
      title,
      reference_url: referenceUrl ?? null,
      social_url: socialUrl ?? null,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (updateError) {
    return NextResponse.json({ error: "No se pudo actualizar", details: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const { error: deleteError } = await supabase
    .from("press_mentions")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (deleteError) {
    return NextResponse.json({ error: "No se pudo eliminar", details: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
