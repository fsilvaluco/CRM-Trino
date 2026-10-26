import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";
import {
  mapTour,
  mapLeg,
  mapDate,
  mapSponsorship,
  mapBudgetCategory,
  mapBudgetLine,
  mapCostItem,
  mapAlert,
  mapTask,
  sortAlerts,
} from "@/lib/tours/map";
import type { TourAlert, TourDetail, TourLeg } from "@/types/tours";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/giras/[id]?projectId= -- todo lo que necesita la pantalla de la
// gira en una sola llamada. Plata (venta en $, valor de canjes, presupuesto)
// solo para quien ve costos de eventos en el proyecto.
export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { access, error } = await requireTourAccess(id, "view", request.nextUrl.searchParams.get("projectId"));
  if (error) return error;
  const { supabase, tour, canEdit, canViewCosts } = access;

  const [legsRes, datesRes, spRes, alertsRes, tasksRes] = await Promise.all([
    supabase.from("tour_legs").select("*").eq("tour_id", id).order("position"),
    supabase.from("v_tour_show_sales").select("*").eq("tour_id", id).order("date"),
    supabase.from("tour_sponsorships").select("*").eq("tour_id", id).order("brand"),
    supabase.from("v_tour_alerts").select("*").eq("tour_id", id),
    tour.subproject_id
      ? supabase
          .from("tasks")
          .select("id, title, status, priority, due_date")
          .eq("subproject_id", tour.subproject_id)
          .is("deleted_at", null)
          .order("due_date", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowsOf = (res: any): any[] => (res?.data ?? []) as any[];
  const legs: TourLeg[] = rowsOf(legsRes).map(mapLeg);
  const legName = new Map<string, string>(legs.map((l) => [l.id, l.name]));

  let budget: TourDetail["budget"] = null;
  if (canViewCosts) {
    const [cats, lines, costs] = await Promise.all([
      supabase.from("v_tour_budget").select("*").eq("tour_id", id),
      supabase.from("tour_budget_lines").select("*").eq("tour_id", id).order("position"),
      supabase.from("tour_cost_items").select("*").eq("tour_id", id).order("spent_on", { ascending: false }),
    ]);
    budget = {
      categories: (cats.data ?? []).map(mapBudgetCategory),
      lines: (lines.data ?? []).map(mapBudgetLine),
      costItems: (costs.data ?? []).map(mapCostItem),
    };
  }

  const alerts = sortAlerts(
    rowsOf(alertsRes).map(mapAlert).filter((a: TourAlert) => canViewCosts || a.kind !== "presupuesto_excedido")
  );

  const payload: TourDetail = {
    tour: mapTour(tour),
    legs,
    dates: rowsOf(datesRes).map((r) => mapDate(r, r.tour_leg_id ? legName.get(r.tour_leg_id) ?? null : null, canViewCosts)),
    sponsorships: rowsOf(spRes).map((r) => mapSponsorship(r, true)),
    budget,
    alerts,
    tasks: rowsOf(tasksRes).map(mapTask),
    canEdit,
    canViewCosts,
  };
  return NextResponse.json(payload);
}

const EDITABLE: Record<string, string> = {
  name: "name",
  status: "status",
  fundingSource: "funding_source",
  folio: "folio",
  startDate: "start_date",
  endDate: "end_date",
  targetOccupancyPct: "target_occupancy_pct",
  breakevenPct: "breakeven_pct",
  sponsorshipDeadline: "sponsorship_deadline",
  driveFolderUrl: "drive_folder_url",
  canvaFolderUrl: "canva_folder_url",
  notes: "notes",
};

// PATCH /api/giras/[id] -- datos generales de la gira.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { access, error } = await requireTourAccess(id, "edit");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(EDITABLE)) {
    if (k in body) update[col] = body[k] === "" ? null : body[k];
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  const { error: dbError } = await access.supabase.from("tours").update(update).eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
