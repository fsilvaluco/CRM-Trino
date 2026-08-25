import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { DEFAULT_GOAL_TITLES, type GoalMetricType } from "@/lib/goals";
import { seedTemplateMatrix, type ProjectRole } from "@/lib/project-roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProject(row: any, myRole: ProjectRole | "admin" | null) {
  return {
    id: row.id,
    name: row.name,
    type: row.type ?? null,
    status: row.status,
    description: row.description ?? null,
    companyId: row.company_id ?? null,
    notes: row.notes ?? null,
    parentProjectId: row.parent_project_id ?? null,
    selfManaged: row.self_managed ?? false,
    driveUrl: row.drive_url ?? null,
    defaultCommissionRate: row.default_commission_rate ?? 30,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyName: row.project_company?.name ?? row.companies?.name ?? null,
    // Rol del usuario actual en ESTE proyecto (admin de la org = "admin"
    // siempre, sin importar si tiene fila en project_members) -- lo usa el
    // front para ocultar Deals/Costos a artist/staff sin tener que
    // consultarlo aparte en cada página. Ver src/lib/project-roles.ts.
    myRole,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const status = searchParams.get("status");
  const parentId = searchParams.get("parentId");

  let query = supabase
    .from("projects")
    .select("*, project_company:companies!projects_company_id_fkey(name)")
    .order("created_at", { ascending: false });

  if (companyId) query = query.eq("company_id", companyId);
  if (status) query = query.eq("status", status);
  if (parentId) query = query.eq("parent_project_id", parentId);
  // Filtrar por proyectos accesibles si el usuario es member
  if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) return NextResponse.json([]);
    query = query.in("id", allowedProjectIds);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Rol real por proyecto -- sin bypass de organización (antes un admin de
  // organización veía "admin" en todos, aunque no tuviera fila en
  // project_members de ESE proyecto puntual; ROLES.md, ítem 3 del
  // rediseño de roles).
  let roleByProjectId = new Map<string, ProjectRole>();
  if (data && data.length > 0) {
    const { data: memberRows } = await supabase
      .from("project_members")
      .select("project_id, role")
      .eq("user_id", user!.id)
      .in("project_id", data.map((p) => p.id));
    roleByProjectId = new Map(
      (memberRows ?? []).map((m: { project_id: string; role: string }) => [m.project_id, m.role as ProjectRole])
    );
  }

  return NextResponse.json(
    (data ?? []).map((p) => mapProject(p, roleByProjectId.get(p.id) ?? null))
  );
}


export async function POST(request: NextRequest) {
  const { supabase, user, orgId, role, error } = await requireAuth();
  if (error) return error;
  // Rediseño 24 ago 2026 (ROLES.md 0.3): crear un proyecto nuevo queda
  // reservado a `owner` -- ni siquiera un admin de organización puede.
  if (role !== "owner") {
    return NextResponse.json({ error: "Solo el dueño de la cuenta puede crear proyectos" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { name, type, status, description, companyId, notes, parentProjectId, selfManaged, driveUrl, defaultCommissionRate } =
    body as Record<string, string | boolean | number | undefined>;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("projects")
    .insert({
      name: name.trim(),
      type: type || null,
      status: status || "active",
      description: description || null,
      company_id: companyId || null,
      notes: notes || null,
      parent_project_id: parentProjectId || null,
      self_managed: Boolean(selfManaged),
      drive_url: driveUrl || null,
      default_commission_rate: typeof defaultCommissionRate === "number" ? defaultCommissionRate : 30,
      organization_id: orgId,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear proyecto: ${dbError.message}` }, { status: 500 });
  }

  // Agregar a quien crea el proyecto como project_member admin con
  // puede_gestionar_equipo = true -- sin esto, el owner que acaba de crear
  // el proyecto quedaría sin fila en `project_members` y por lo tanto sin
  // acceso a su propio proyecto (0.4: owner no tiene bypass, se rige 100%
  // por project_members igual que todos) ni forma de agregar a nadie más
  // (ROLES.md, ítem 13 del rediseño de roles -- gestión de gente).
  const { data: creatorMembership, error: memberSeedError } = await supabase
    .from("project_members")
    .insert({
      project_id: data.id,
      user_id: user!.id,
      organization_id: orgId,
      role: "admin",
      puede_gestionar_equipo: true,
    })
    .select("id")
    .single();
  if (memberSeedError) {
    // No fatal para la respuesta (el proyecto ya existe), pero se deja
    // registrado -- sin esta fila, quien creó el proyecto no puede
    // gestionarlo hasta que se corrija a mano.
    console.error("[projects POST] fallo al agregar al creador como project_member:", memberSeedError);
  } else {
    await seedTemplateMatrix(supabase, creatorMembership.id, "admin");
  }

  // Sembrar las 5 metas por defecto -- mismo criterio que el backfill de
  // la migracion 047, para que un proyecto nuevo arranque igual que los
  // que ya existian. target_value en 0 hasta que alguien lo edite; si no
  // les sirve alguna, la borran desde el dashboard.
  const defaultMetricTypes: GoalMetricType[] = [
    "ventas_deals",
    "cantidad_deals",
    "tareas_completadas",
    "seguidores",
    "manual",
  ];
  const defaultTargets: Partial<Record<GoalMetricType, number>> = {
    ventas_deals: 0,
    cantidad_deals: 0,
    tareas_completadas: 80,
    seguidores: 0,
    manual: 0,
  };
  const { error: goalsSeedError } = await supabase.from("goals").insert(
    defaultMetricTypes.map((metricType) => ({
      organization_id: orgId,
      project_id: data.id,
      metric_type: metricType,
      title: DEFAULT_GOAL_TITLES[metricType],
      target_value: defaultTargets[metricType] ?? 0,
      period_type: "monthly",
    }))
  );
  if (goalsSeedError) {
    // No fatal: el proyecto ya se creo bien, solo faltan sus metas
    // default -- se pueden agregar a mano despues.
    console.error("[projects POST] fallo al sembrar metas default:", goalsSeedError);
  }

  return NextResponse.json(mapProject(data, "admin"), { status: 201 });
}
