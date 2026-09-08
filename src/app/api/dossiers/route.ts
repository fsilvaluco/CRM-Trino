import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createDossierSchema, type Dossier } from "@/types/analytics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDossier(row: any): Dossier {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    pdfPath: row.pdf_path,
    pdfPageCount: row.pdf_page_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fields: [],
  };
}

// GET /api/dossiers?projectId=... -- lista de dossiers del proyecto activo.
export async function GET(request: NextRequest) {
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId || !allowedProjectIds.includes(projectId)) {
    return NextResponse.json([]);
  }

  const { data, error: dbError } = await supabase
    .from("dossiers")
    .select("*")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (dbError) {
    return NextResponse.json({ error: "No se pudieron listar los dossiers" }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapDossier));
}

// POST /api/dossiers -- crea un dossier a partir de un PDF ya subido al
// bucket 'dossiers' (el upload lo hace el cliente directo a Storage, acá
// solo se registra el path + cantidad de páginas).
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createDossierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, name, pdfPath, pdfPageCount } = parsed.data;

  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("dossiers")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      name,
      pdf_path: pdfPath,
      pdf_page_count: pdfPageCount,
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: "No se pudo crear el dossier", details: dbError.message }, { status: 500 });
  }

  return NextResponse.json(mapDossier(data), { status: 201 });
}
