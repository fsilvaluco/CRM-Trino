import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, getProjectPermissionsForMany, canViewModule, canEditModule } from "@/lib/project-roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubproject(row: any) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    projectId: row.project_id,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    notes: row.notes ?? null,
    companyId: row.company_id ?? null,
    contactId: row.contact_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectName: row.projects?.name ?? null,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");

  // Este endpoint no tenía NINGÚN chequeo de proyecto -- devolvía TODAS
  // las campañas de la organización a cualquiera autenticado. Corregido
  // (ROLES.md, ítem 6 del rediseño de roles).
  if (projectId) {
    if (!allowedProjectIds.includes(projectId)) {
      return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
    }
    const perm = await getProjectPermissions(supabase, user!.id, projectId);
    if (!canViewModule(perm, "campanas")) {
      return NextResponse.json({ error: "Sin acceso a Campañas para tu rol" }, { status: 403 });
    }
  } else if (allowedProjectIds.length === 0) {
    return NextResponse.json([]);
  }

  let query = supabase
    .from("subprojects")
    .select("*, projects ( name )")
    .order("created_at", { ascending: false });

  query = projectId ? query.eq("project_id", projectId) : query.in("project_id", allowedProjectIds);
  if (status) query = query.eq("status", status);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Modo agregado (sin projectId): cada fila puede pertenecer a un
  // proyecto distinto -- la matriz se respeta por proyecto (ROLES.md 0.5).
  const allRows = data ?? [];
  const permsByProject = projectId
    ? null
    : await getProjectPermissionsForMany(supabase, user!.id, allRows.map((r) => r.project_id));
  const rows = projectId
    ? allRows
    : allRows.filter((r) => canViewModule(permsByProject!.get(r.project_id) ?? null, "campanas"));

  return NextResponse.json(rows.map(mapSubproject));
}


export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { name, status, projectId, startDate, endDate, notes } = body as Record<string, string | undefined>;

  if (!name || name.trim() === "") {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: "El proyecto es requerido" }, { status: 400 });
  }
  // Este endpoint no tenía NINGÚN chequeo de proyecto ni de permiso --
  // cualquiera autenticado podía crear una campaña en cualquier proyecto
  // ajeno. Corregido (ROLES.md, ítem 6 del rediseño de roles).
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  const creatorPerm = await getProjectPermissions(supabase, user!.id, projectId);
  if (!canEditModule(creatorPerm, "campanas")) {
    return NextResponse.json({ error: "Tu rol no puede crear campañas en este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("subprojects")
    .insert({
      name: name.trim(),
      status: status || "active",
      project_id: projectId,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      end_date: endDate ? new Date(endDate).toISOString() : null,
      notes: notes || null,
      organization_id: orgId,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear subproyecto: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(mapSubproject(data), { status: 201 });
}
