import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewModule, canEditModule, canDeleteModule } from "@/lib/project-roles";
import { logActivity } from "@/lib/activity-logs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCompany(row: any) {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry ?? null,
    website: row.website ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    notes: row.notes ?? null,
    artistProjectId: row.artist_project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContact(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    company: row.company ?? null,
    companyId: row.company_id ?? null,
    source: row.source,
    temperature: row.temperature,
    score: row.score,
    notes: row.notes ?? null,
    artistProjectId: row.artist_project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDeal(row: any) {
  return {
    id: row.id,
    title: row.title,
    value: row.value,
    stageId: row.stage_id,
    contactId: row.contact_id,
    companyId: row.company_id ?? null,
    probability: row.probability,
    notes: row.notes ?? null,
    artistProjectId: row.artist_project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Empresas sin proyecto asignado (`project_id`/`artist_project_id` ambos
// null) no exigen chequeo de matriz -- caso legacy raro, mismo criterio
// permisivo que se usó para Tareas sin proyecto (0.2.4).
async function requireCompanyAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  allowedProjectIds: string[],
  companyProjectId: string | null,
  check: (perm: Awaited<ReturnType<typeof getProjectPermissions>>) => boolean
): Promise<NextResponse | null> {
  if (!companyProjectId) return null;
  if (!allowedProjectIds.includes(companyProjectId)) {
    return NextResponse.json({ error: "Sin acceso a esta empresa" }, { status: 403 });
  }
  const perm = await getProjectPermissions(supabase, userId, companyProjectId);
  if (!check(perm)) {
    return NextResponse.json({ error: "Sin acceso a Empresas para tu rol" }, { status: 403 });
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: company, error: compErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (compErr || !company) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  // 25 ago 2026 (ROLES.md, hallazgo 9.1 / ítem 26 del rediseño de roles):
  // este endpoint de detalle no tenía NINGÚN chequeo de proyecto -- se podía
  // pedir cualquier empresa por ID directo aunque perteneciera a un
  // proyecto ajeno.
  const companyProjectId = company.project_id ?? company.artist_project_id ?? null;
  const accessError = await requireCompanyAccess(
    supabase,
    user!.id,
    allowedProjectIds,
    companyProjectId,
    (perm) => canViewModule(perm, "empresas")
  );
  if (accessError) return accessError;

  const [{ data: contacts }, { data: deals }, { data: projects }, { data: tasks }] =
    await Promise.all([
      supabase.from("contacts").select("*").eq("company_id", id).is("deleted_at", null),
      supabase.from("deals").select("*").eq("company_id", id).is("deleted_at", null),
      supabase.from("projects").select("*").eq("company_id", id),
      supabase.from("tasks").select("*").eq("company_id", id),
    ]);

  return NextResponse.json({
    ...mapCompany(company),
    contacts: (contacts ?? []).map(mapContact),
    deals: (deals ?? []).map(mapDeal),
    projects: projects ?? [],
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("companies")
    .select("id, name, project_id, artist_project_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const existingProjectId = existing.project_id ?? existing.artist_project_id ?? null;
  const accessError = await requireCompanyAccess(
    supabase,
    user!.id,
    allowedProjectIds,
    existingProjectId,
    (perm) => canEditModule(perm, "empresas")
  );
  if (accessError) return accessError;

  const { name, industry, website, email, phone, address, notes, artistProjectId } = body;

  const { data, error: dbError } = await supabase
    .from("companies")
    .update({
      ...(name !== undefined && { name }),
      ...(industry !== undefined && { industry: industry || null }),
      ...(website !== undefined && { website: website || null }),
      ...(email !== undefined && { email: email || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(address !== undefined && { address: address || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(artistProjectId !== undefined && { artist_project_id: artistProjectId || null }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al actualizar empresa: ${dbError.message}` },
      { status: 500 }
    );
  }

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    entityType: "company",
    entityId: id,
    entityName: data.name,
    projectId: existingProjectId,
  });

  return NextResponse.json(mapCompany(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("companies")
    .select("id, name, project_id, artist_project_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const existingProjectId = existing.project_id ?? existing.artist_project_id ?? null;
  const accessError = await requireCompanyAccess(
    supabase,
    user!.id,
    allowedProjectIds,
    existingProjectId,
    (perm) => canDeleteModule(perm, "empresas")
  );
  if (accessError) return accessError;

  // Soft delete
  const { error: dbError } = await supabase
    .from("companies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (dbError) {
    return NextResponse.json(
      { error: `Error al eliminar empresa: ${dbError.message}` },
      { status: 500 }
    );
  }

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    entityType: "company",
    entityId: id,
    entityName: existing.name,
    projectId: existingProjectId,
  });

  return NextResponse.json({ success: true });
}
