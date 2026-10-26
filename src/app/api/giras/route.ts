import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewModule, canEditModule } from "@/lib/project-roles";
import type { TourListItem } from "@/types/tours";

// GET /api/giras?projectId=xxx -- giras de los proyectos del usuario (o solo
// del proyecto activo), con un resumen para la lista: venta vs meta,
// auspicios y cantidad de alertas.
export async function GET(request: NextRequest) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (projectId && !allowedProjectIds?.includes(projectId)) {
    return NextResponse.json({ error: "No tienes acceso a este proyecto" }, { status: 403 });
  }
  const projectIds = projectId ? [projectId] : allowedProjectIds ?? [];
  if (projectIds.length === 0) return NextResponse.json([]);

  const { data: tours, error: dbError } = await supabase
    .from("tours")
    .select("id, name, status, start_date, end_date, project_id")
    .in("project_id", projectIds)
    .order("start_date", { ascending: false });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Solo las giras de proyectos donde el usuario ve Eventos.
  const visible = [];
  const permCache = new Map<string, boolean>();
  for (const t of tours ?? []) {
    if (!permCache.has(t.project_id)) {
      const perms = await getProjectPermissions(supabase, user!.id, t.project_id);
      permCache.set(t.project_id, canViewModule(perms, "eventos"));
    }
    if (permCache.get(t.project_id)) visible.push(t);
  }
  const ids = visible.map((t) => t.id);
  if (ids.length === 0) return NextResponse.json([]);

  const [{ data: sales }, { data: sps }, { data: alerts }] = await Promise.all([
    supabase.from("v_tour_show_sales").select("tour_id, capacity, sold, target, show_status").in("tour_id", ids),
    supabase.from("tour_sponsorships").select("tour_id, status").in("tour_id", ids),
    supabase.from("v_tour_alerts").select("tour_id, severity, kind").in("tour_id", ids),
  ]);

  const items: TourListItem[] = visible.map((t) => {
    const s = (sales ?? []).filter((r) => r.tour_id === t.id && r.show_status !== "cancelado");
    const sp = (sps ?? []).filter((r) => r.tour_id === t.id);
    const al = (alerts ?? []).filter((r) => r.tour_id === t.id && r.kind !== "presupuesto_excedido");
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      startDate: t.start_date,
      endDate: t.end_date,
      projectId: t.project_id,
      datesCount: s.length,
      capacity: s.reduce((a, r) => a + Number(r.capacity ?? 0), 0),
      sold: s.reduce((a, r) => a + Number(r.sold ?? 0), 0),
      target: s.reduce((a, r) => a + Number(r.target ?? 0), 0),
      sponsorshipsConfirmed: sp.filter((r) => ["confirmada", "contraprestacion_entregada"].includes(r.status)).length,
      sponsorshipsOpen: sp.filter((r) => !["confirmada", "contraprestacion_entregada", "rechazada", "sin_respuesta"].includes(r.status)).length,
      alertsHigh: al.filter((r) => r.severity === "alta").length,
      alertsTotal: al.length,
    };
  });

  return NextResponse.json(items);
}

// POST /api/giras -- crea una gira vacía en un proyecto.
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const projectId: string | undefined = body.projectId;
  const name: string = (body.name ?? "").trim();
  if (!projectId || !name) return NextResponse.json({ error: "Falta proyecto o nombre" }, { status: 400 });
  if (!allowedProjectIds?.includes(projectId)) {
    return NextResponse.json({ error: "No tienes acceso a este proyecto" }, { status: 403 });
  }
  const perms = await getProjectPermissions(supabase, user!.id, projectId);
  if (!canEditModule(perms, "eventos")) {
    return NextResponse.json({ error: "No tienes permiso para crear giras en este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("tours")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      name,
      start_date: body.startDate || null,
      end_date: body.endDate || null,
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
