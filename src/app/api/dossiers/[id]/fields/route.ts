import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { updateDossierFieldsSchema } from "@/types/analytics";
import { DOSSIER_DATA_SOURCE_MAP } from "@/lib/dossier-data-sources";

// PUT /api/dossiers/[id]/fields -- guardado completo de los campos
// posicionados (mismo patrón "reemplazo total" que event_ticket_tiers /
// event_cost_items / event_timing_items: se borran los que ya no vienen y
// se upsertan el resto).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: dossier } = await supabase.from("dossiers").select("project_id").eq("id", id).eq("organization_id", orgId!).single();
  if (!dossier) return NextResponse.json({ error: "Dossier no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(dossier.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este dossier" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateDossierFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  for (const f of parsed.data.fields) {
    if (!DOSSIER_DATA_SOURCE_MAP.has(f.dataSource)) {
      return NextResponse.json({ error: `Dato desconocido: ${f.dataSource}` }, { status: 400 });
    }
  }

  const { data: existing } = await supabase.from("dossier_fields").select("id").eq("dossier_id", id);
  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keptIds = new Set(parsed.data.fields.filter((f) => f.id).map((f) => f.id as string));
  const toDelete = [...existingIds].filter((eid) => !keptIds.has(eid));

  if (toDelete.length > 0) {
    await supabase.from("dossier_fields").delete().in("id", toDelete);
  }

  const rows = parsed.data.fields.map((f) => ({
    ...(f.id ? { id: f.id } : { id: crypto.randomUUID() }),
    dossier_id: id,
    page_number: f.pageNumber,
    x_pct: f.xPct,
    y_pct: f.yPct,
    data_source: f.dataSource,
    font_family: f.fontFamily,
    font_size: f.fontSize,
    color: f.color,
    bold: f.bold,
    text_align: f.textAlign,
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("dossier_fields").upsert(rows);
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  await supabase.from("dossiers").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ ok: true });
}
