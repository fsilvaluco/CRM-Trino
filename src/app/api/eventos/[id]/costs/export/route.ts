import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewEventCosts } from "@/lib/project-roles";
import { buildCostSheetCsv, costSheetFilename } from "@/lib/cost-sheet-io";
import { buildCostSheetPdf } from "@/lib/cost-sheet-pdf";
import type { CostItem } from "@/types/shows";

// GET /api/eventos/[id]/costs/export?format=csv|pdf
//
// CSV: la planilla para bajarla y volver a subirla en otro evento (ver
// cost-sheet-io.ts).
// PDF: el documento de egresos para mandar a aprobacion interna.
//
// Lo protege el mismo permiso que ver los costos en pantalla -- un rol que no
// puede ver los montos tampoco puede descargarlos.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json({ error: "Formato no soportado (csv o pdf)" }, { status: 400 });
  }

  const { data: show } = await supabase
    .from("shows")
    .select(
      "name, date, venue, city, project_id, cost_sheet_closed_at, fee, ticket_income, expenses, financials_untracked, projects ( name )"
    )
    .eq("id", id)
    .single();

  if (!show) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });

  const role = await getProjectPermissions(supabase, user!.id, show.project_id ?? null);
  if (!canViewEventCosts(role)) {
    return NextResponse.json({ error: "Sin acceso a los costos de este evento" }, { status: 403 });
  }

  const { data: rows, error: dbError } = await supabase
    .from("event_cost_items")
    .select("*")
    .eq("show_id", id)
    .order("position");

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

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

  const eventName = show.name ?? show.venue ?? "Evento";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectName = ((show as any).projects?.name as string | undefined) ?? null;
  const filename = costSheetFilename({ name: eventName, date: show.date }, format);
  // RFC 5987: el nombre lleva acentos y espacios, asi que ademas del filename
  // "plano" (que algunos navegadores viejos leen) va el filename* en UTF-8.
  const disposition = `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

  if (format === "csv") {
    return new NextResponse(buildCostSheetCsv(items), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": disposition,
      },
    });
  }

  const pdf = await buildCostSheetPdf(
    {
      name: eventName,
      date: show.date,
      venue: show.venue ?? null,
      city: show.city ?? null,
      projectName,
      closedAt: show.cost_sheet_closed_at ?? null,
      fee: show.fee ?? null,
      ticketIncome: show.ticket_income ?? null,
      expenses: show.expenses ?? null,
      financialsUntracked: show.financials_untracked ?? false,
    },
    items,
    { generatedBy: user!.email ?? null }
  );

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
    },
  });
}
