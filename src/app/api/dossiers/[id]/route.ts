import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import type { Dossier, DossierField } from "@/types/analytics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapField(row: any): DossierField {
  return {
    id: row.id,
    pageNumber: row.page_number,
    xPct: Number(row.x_pct),
    yPct: Number(row.y_pct),
    dataSource: row.data_source,
    fontFamily: row.font_family,
    fontSize: Number(row.font_size),
    color: row.color,
    bold: row.bold,
    textAlign: row.text_align,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDossier(row: any, fields: any[]): Dossier {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    pdfPath: row.pdf_path,
    pdfPageCount: row.pdf_page_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fields: fields.map(mapField),
  };
}

async function loadDossier(supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"], orgId: string, id: string) {
  const { data: dossier, error: dossierError } = await supabase
    .from("dossiers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (dossierError || !dossier) return null;

  const { data: fields } = await supabase
    .from("dossier_fields")
    .select("*")
    .eq("dossier_id", id)
    .order("page_number");

  return mapDossier(dossier, fields ?? []);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const dossier = await loadDossier(supabase, orgId!, id);
  if (!dossier) return NextResponse.json({ error: "Dossier no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(dossier.projectId)) {
    return NextResponse.json({ error: "Sin acceso a este dossier" }, { status: 403 });
  }

  return NextResponse.json(dossier);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: existing } = await supabase.from("dossiers").select("project_id").eq("id", id).eq("organization_id", orgId!).single();
  if (!existing) return NextResponse.json({ error: "Dossier no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(existing.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este dossier" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : null;
  if (!name) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });

  const { error: dbError } = await supabase
    .from("dossiers")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (dbError) return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: existing } = await supabase.from("dossiers").select("project_id, pdf_path").eq("id", id).eq("organization_id", orgId!).single();
  if (!existing) return NextResponse.json({ error: "Dossier no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(existing.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este dossier" }, { status: 403 });
  }

  const { error: dbError } = await supabase.from("dossiers").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: "No se pudo eliminar" }, { status: 500 });

  // Best-effort: borrar el PDF del bucket también (no bloquea si falla).
  if (existing.pdf_path) {
    await supabase.storage.from("dossiers").remove([existing.pdf_path]);
  }

  return NextResponse.json({ ok: true });
}
