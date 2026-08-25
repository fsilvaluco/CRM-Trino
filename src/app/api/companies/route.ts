import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, getProjectPermissionsForMany, canViewModule, canEditModule } from "@/lib/project-roles";

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
    contactCount: Array.isArray(row.contacts) ? (row.contacts[0]?.count ?? 0) : 0,
    dealCount: Array.isArray(row.deals) ? (row.deals[0]?.count ?? 0) : 0,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const projectIdParam = searchParams.get("projectId");

  // Validate projectId belongs to current org (prevent cross-org leakage)
  if (projectIdParam) {
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectIdParam)
      .eq("organization_id", orgId!)
      .single();
    if (!proj) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (!allowedProjectIds.includes(projectIdParam)) {
      return NextResponse.json({ error: "Sin acceso al proyecto" }, { status: 403 });
    }
    const perm = await getProjectPermissions(supabase, user!.id, projectIdParam);
    if (!canViewModule(perm, "empresas")) {
      return NextResponse.json({ error: "Sin acceso a Empresas para tu rol" }, { status: 403 });
    }
  }

  let query = supabase
    .from("companies")
    .select("*, contacts(count), deals(count)")
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (projectIdParam) {
    const { data: children } = await supabase
      .from("projects")
      .select("id")
      .eq("parent_project_id", projectIdParam);

    const visibleIds = [projectIdParam, ...(children ?? []).map((c) => c.id)];

    query = query.or(
      `project_id.in.(${visibleIds.join(",")}),artist_project_id.in.(${visibleIds.join(",")})`
    );
  } else {
    // Sin projectId (listado general de empresas): mismo hueco que en
    // Eventos/Deals/Contactos (23 ago 2026). allowedProjectIds ya incluye
    // los hijos de cualquier proyecto madre asignado.
    if (allowedProjectIds.length === 0) {
      return NextResponse.json([]);
    }
    query = query.or(
      `project_id.in.(${allowedProjectIds.join(",")}),artist_project_id.in.(${allowedProjectIds.join(",")})`
    );
  }
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const allRows = data ?? [];

  // Modo agregado (sin projectId puntual): cada fila puede pertenecer a un
  // proyecto distinto -- la matriz se respeta por proyecto (ROLES.md 0.5).
  if (!projectIdParam) {
    const permsByProject = await getProjectPermissionsForMany(
      supabase,
      user!.id,
      allRows.map((r) => r.project_id ?? r.artist_project_id).filter(Boolean)
    );
    const visible = allRows.filter((r) => {
      const pid = r.project_id ?? r.artist_project_id;
      return canViewModule(permsByProject.get(pid) ?? null, "empresas");
    });
    return NextResponse.json(visible.map(mapCompany));
  }

  return NextResponse.json(allRows.map(mapCompany));
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { name, industry, website, email, phone, address, notes, projectId, artistProjectId } = body;

  if (!name || name.trim() === "") {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }
  // Hallazgo 9.3 de ROLES.md: este endpoint no chequeaba proyecto en
  // absoluto y aceptaba projectId=null en silencio -- corregido igual que
  // se corrigió el mismo bug en CompanyForm del lado del cliente.
  const targetProjectId = projectId || artistProjectId || null;
  if (!targetProjectId) {
    return NextResponse.json({ error: "El proyecto es requerido" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(targetProjectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  const creatorPerm = await getProjectPermissions(supabase, user!.id, targetProjectId);
  if (!canEditModule(creatorPerm, "empresas")) {
    return NextResponse.json({ error: "Tu rol no puede crear empresas en este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("companies")
    .insert({
      name: name.trim(),
      industry: industry || null,
      website: website || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      organization_id: orgId,
      created_by: user!.id,
      project_id: projectId || null,
      artist_project_id: artistProjectId || null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al crear empresa: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(mapCompany(data), { status: 201 });
}
