import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canManageTeam } from "@/lib/project-roles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  if (allowedProjectIds !== null && !allowedProjectIds.includes(id)) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const [{ data: subs }, { data: tasks }] = await Promise.all([
    supabase.from("subprojects").select("*").eq("project_id", id),
    supabase.from("tasks").select("*").eq("project_id", id),
  ]);

  return NextResponse.json({
    id: project.id,
    name: project.name,
    type: project.type ?? null,
    status: project.status,
    description: project.description ?? null,
    companyId: project.company_id ?? null,
    notes: project.notes ?? null,
    parentProjectId: project.parent_project_id ?? null,
    selfManaged: project.self_managed ?? false,
    driveUrl: project.drive_url ?? null,
    defaultCommissionRate: project.default_commission_rate ?? 30,
    socialLinks: project.social_links ?? {},
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    subprojects: subs ?? [],
    tasks: tasks ?? [],
  });
}


export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;
  // Editar la configuración de un proyecto exige poder gestionar SU
  // equipo (0.2.1) -- antes era "isAdmin" de organización, sin chequear
  // acceso a este proyecto en absoluto (ROLES.md, ítem 3 del rediseño).
  if (!allowedProjectIds.includes(id)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  const editPerm = await getProjectPermissions(supabase, user!.id, id);
  if (!canManageTeam(editPerm)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("projects").select("*").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const { name, type, status, description, companyId, notes, parentProjectId, selfManaged, driveUrl, socialLinks, defaultCommissionRate } =
    body as Record<string, string | boolean | number | Record<string, string> | undefined>;

  if (parentProjectId && parentProjectId === id) {
    return NextResponse.json(
      { error: "Un proyecto no puede ser sello de si mismo" },
      { status: 400 }
    );
  }

  const { data, error: dbError } = await supabase
    .from("projects")
    .update({
      name: name ?? existing.name,
      type: type !== undefined ? type || null : existing.type,
      status: status ?? existing.status,
      description: description !== undefined ? description || null : existing.description,
      company_id: companyId !== undefined ? companyId || null : existing.company_id,
      notes: notes !== undefined ? notes || null : existing.notes,
      parent_project_id: parentProjectId !== undefined ? parentProjectId || null : existing.parent_project_id,
      self_managed: selfManaged !== undefined ? Boolean(selfManaged) : existing.self_managed,
      drive_url: driveUrl !== undefined ? driveUrl || null : existing.drive_url,
      default_commission_rate:
        typeof defaultCommissionRate === "number" ? defaultCommissionRate : existing.default_commission_rate,
      social_links:
        socialLinks !== undefined
          ? { ...((existing.social_links as Record<string, string>) ?? {}), ...(socialLinks as Record<string, string>) }
          : existing.social_links,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id).select().single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar proyecto: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id, name: data.name, type: data.type ?? null,
    status: data.status, description: data.description ?? null,
    companyId: data.company_id ?? null, notes: data.notes ?? null,
    createdAt: data.created_at, updatedAt: data.updated_at,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PUT(request, context);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, role, error } = await requireAuth();
  if (error) return error;
  // Eliminar un proyecto es igual de destructivo que crearlo -- mismo
  // criterio que POST /api/projects (0.3): solo `owner` (ROLES.md, ítem 3
  // del rediseño de roles).
  if (role !== "owner") {
    return NextResponse.json({ error: "Solo el dueño de la cuenta puede eliminar proyectos" }, { status: 403 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("projects").select("id").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const { error: dbError } = await supabase.from("projects").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
