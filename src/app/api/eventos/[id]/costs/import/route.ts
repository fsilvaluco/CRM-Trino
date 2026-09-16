import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import {
  getProjectPermissions,
  getProjectPermissionsForMany,
  canViewEventCosts,
  canEditEventCosts,
} from "@/lib/project-roles";
import {
  readCostSheetCsv,
  parseCostSheetRows,
  costItemsToParsedRows,
  type ParsedCostRow,
} from "@/lib/cost-sheet-io";
import type { CostItem } from "@/types/shows";

// ─── Importar costos a la Planilla de un evento ─────────────────────────────
//
// Las dos puntas del mismo flujo "copiar los costos de otro evento":
//   GET  -> eventos de los que se puede copiar (el selector del dialogo)
//   POST -> devuelve los items que se importarian, desde un CSV o desde otro
//           evento
//
// OJO: el POST no escribe NADA. Devuelve la vista previa, el front la agrega a
// la planilla que ya esta en pantalla y recien al apretar "Guardar costos" se
// escribe, por el PUT de siempre. Asi hay una sola ruta de escritura (con su
// chequeo de caja cerrada, sus permisos y su log) y la persona puede revisar
// -- o recargar la pagina y no guardar nada -- antes de comprometerse.

const MAX_FILE_SIZE = 2 * 1024 * 1024; // una planilla de costos en CSV pesa KBs

/** Los dos chequeos que comparten GET y POST: quien pide tiene que poder
 * editar los costos del evento destino, y la caja no puede estar cerrada. */
async function guardTarget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  showId: string
): Promise<{ projectId: string | null } | NextResponse> {
  const { data: show } = await supabase
    .from("shows")
    .select("project_id, cost_sheet_closed_at")
    .eq("id", showId)
    .single();

  if (!show) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });

  const role = await getProjectPermissions(supabase, userId, show.project_id ?? null);
  if (!canEditEventCosts(role)) {
    return NextResponse.json(
      { error: "Tu rol no puede editar los costos de este evento" },
      { status: 403 }
    );
  }
  if (show.cost_sheet_closed_at) {
    return NextResponse.json(
      { error: "La caja de este evento está cerrada. Reábrela primero para importar costos." },
      { status: 409 }
    );
  }

  return { projectId: show.project_id ?? null };
}

// GET -- eventos con costos cargados de los que esta persona puede copiar.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const guard = await guardTarget(supabase, user!.id, id);
  if (guard instanceof NextResponse) return guard;

  let query = supabase
    .from("shows")
    .select("id, name, venue, date, project_id, projects ( name )")
    .eq("organization_id", orgId!)
    .neq("id", id)
    .order("date", { ascending: false })
    .limit(120);

  // Mismo recorte que la lista de Eventos: si la persona tiene proyectos
  // acotados, los demas no se traen de la base para nada.
  if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) return NextResponse.json({ events: [] });
    query = query.in("project_id", allowedProjectIds);
  }

  const { data: shows } = await query;

  if (!shows || shows.length === 0) return NextResponse.json({ events: [] });

  // Un solo SELECT para todos los eventos candidatos: traer los items evento
  // por evento serian 120 consultas para llenar un combo.
  const { data: costRows } = await supabase
    .from("event_cost_items")
    .select("show_id, amount")
    .in(
      "show_id",
      shows.map((s) => s.id)
    );

  const stats = new Map<string, { count: number; total: number }>();
  for (const row of costRows ?? []) {
    const current = stats.get(row.show_id) ?? { count: 0, total: 0 };
    stats.set(row.show_id, { count: current.count + 1, total: current.total + (row.amount ?? 0) });
  }

  const permissions = await getProjectPermissionsForMany(
    supabase,
    user!.id,
    shows.map((s) => s.project_id).filter((p): p is string => Boolean(p))
  );

  const events = shows
    .filter((s) => (stats.get(s.id)?.count ?? 0) > 0)
    // Copiar de un evento es LEER sus montos: se piden los mismos permisos que
    // para verlos en pantalla, si no el selector seria una forma de espiar los
    // costos de proyectos ajenos.
    .filter((s) => canViewEventCosts(permissions.get(s.project_id ?? "") ?? null))
    .slice(0, 40)
    .map((s) => ({
      id: s.id,
      name: s.name ?? s.venue,
      date: s.date,
      venue: s.venue,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectName: ((s as any).projects?.name as string | undefined) ?? null,
      itemCount: stats.get(s.id)!.count,
      total: stats.get(s.id)!.total,
    }));

  return NextResponse.json({ events });
}

// POST -- vista previa de lo que se importaria. Dos formas de llamarlo:
//   multipart/form-data con `file` (un CSV), o JSON { sourceShowId }.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const guard = await guardTarget(supabase, user!.id, id);
  if (guard instanceof NextResponse) return guard;

  const contentType = request.headers.get("content-type") ?? "";

  // ── Desde otro evento ────────────────────────────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    const sourceShowId = typeof body.sourceShowId === "string" ? body.sourceShowId : null;
    if (!sourceShowId) {
      return NextResponse.json({ error: "Falta el evento de origen" }, { status: 400 });
    }
    if (sourceShowId === id) {
      return NextResponse.json(
        { error: "Ese es el mismo evento: elige otro para copiar" },
        { status: 400 }
      );
    }

    const { data: source } = await supabase
      .from("shows")
      .select("id, name, venue, date, project_id")
      .eq("id", sourceShowId)
      .single();

    if (!source) return NextResponse.json({ error: "Evento de origen no encontrado" }, { status: 404 });

    const sourceRole = await getProjectPermissions(supabase, user!.id, source.project_id ?? null);
    if (!canViewEventCosts(sourceRole)) {
      return NextResponse.json(
        { error: "Sin acceso a los costos del evento que quieres copiar" },
        { status: 403 }
      );
    }

    const { data: rows } = await supabase
      .from("event_cost_items")
      .select("*")
      .eq("show_id", sourceShowId)
      .order("position");

    const items: CostItem[] = (rows ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      label: r.label,
      category: r.category ?? null,
      responsable: r.responsable ?? null,
      responsableContactId: r.responsable_contact_id ?? null,
      comprobanteUrl: r.comprobante_url ?? null,
      pagado: r.pagado ?? false,
      comprobantePagoUrl: r.comprobante_pago_url ?? null,
      esBhe: r.es_bhe ?? false,
      liquidoAmount: r.liquido_amount ?? null,
      amount: r.amount ?? 0,
      notes: r.notes ?? null,
      km: r.km ?? null,
      kmRate: r.km_rate ?? null,
    }));

    return NextResponse.json({
      items: costItemsToParsedRows(items),
      skipped: [],
      source: { kind: "event", name: source.name ?? source.venue, date: source.date },
    });
  }

  // ── Desde un CSV ─────────────────────────────────────────────────────────
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "El archivo no puede superar 2 MB" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: "Solo se puede subir un archivo .csv (usa el botón Descargar para obtener el formato)" },
      { status: 400 }
    );
  }

  let parsed: { items: ParsedCostRow[]; skipped: { row: number; reason: string }[] };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = parseCostSheetRows(readCostSheetCsv(buffer));
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 400 });
  }

  if (parsed.items.length === 0) {
    return NextResponse.json(
      {
        error:
          "No se encontró ningún costo en el archivo. Revisa que tenga una columna \"Detalle\" y otra \"Monto\".",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    items: parsed.items,
    skipped: parsed.skipped,
    source: { kind: "csv", name: file.name },
  });
}
