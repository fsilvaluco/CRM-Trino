import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createProjectFontSchema, type ProjectFont } from "@/types/analytics";

function mapFont(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): ProjectFont {
  const { data } = supabase.storage.from("fonts").getPublicUrl(row.file_path);
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    url: data.publicUrl,
    format: row.format,
    createdAt: row.created_at,
  };
}

// GET /api/project-fonts?projectId=... -- tipografías propias del
// proyecto, para el selector de fuentes del editor de Dossier.
export async function GET(request: NextRequest) {
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId || !allowedProjectIds.includes(projectId)) {
    return NextResponse.json([]);
  }

  const { data, error: dbError } = await supabase
    .from("project_fonts")
    .select("*")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .order("name");

  if (dbError) {
    return NextResponse.json({ error: "No se pudieron listar las tipografías" }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map((r) => mapFont(r, supabase)));
}

// POST /api/project-fonts -- registra una tipografía ya subida al bucket
// 'fonts' (el upload lo hace el cliente directo a Storage).
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createProjectFontSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, name, filePath, format } = parsed.data;

  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("project_fonts")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      name,
      file_path: filePath,
      format,
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (dbError) {
    const message = dbError.code === "23505" ? "Ya existe una tipografía con ese nombre en este proyecto" : "No se pudo guardar la tipografía";
    return NextResponse.json({ error: message, details: dbError.message }, { status: dbError.code === "23505" ? 409 : 500 });
  }

  return NextResponse.json(mapFont(data, supabase), { status: 201 });
}
