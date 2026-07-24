import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createPressMentionSchema, type PressMention } from "@/types/press";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMention(row: any): PressMention {
  return {
    id: row.id,
    projectId: row.project_id,
    campaignId: row.campaign_id,
    campaignName: row.subprojects?.name ?? null,
    mentionDate: row.mention_date,
    outlet: row.outlet,
    type: row.type,
    source: row.source,
    title: row.title,
    referenceUrl: row.reference_url,
    socialUrl: row.social_url,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const isAllProjects = searchParams.get("isAllProjects") === "true";

  if (!isAllProjects && !projectId) {
    return NextResponse.json([]);
  }

  let query = supabase
    .from("press_mentions")
    .select("*, subprojects ( name )")
    .eq("organization_id", orgId!)
    .order("mention_date", { ascending: false, nullsFirst: false });

  if (!isAllProjects && projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: "No se pudieron listar las menciones de prensa" }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapMention));
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

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

  const { data, error: dbError } = await supabase
    .from("press_mentions")
    .insert({
      organization_id: orgId,
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
      created_by: user?.id ?? null,
    })
    .select("*, subprojects ( name )")
    .single();

  if (dbError) {
    return NextResponse.json({ error: "No se pudo guardar", details: dbError.message }, { status: 500 });
  }

  return NextResponse.json(mapMention(data), { status: 201 });
}
