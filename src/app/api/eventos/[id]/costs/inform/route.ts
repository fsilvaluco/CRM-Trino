import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectRole, canEditEventCosts } from "@/lib/project-roles";
import { getSignaturesState } from "@/lib/event-signatures";
import { sendEmail, buildCostSheetSummaryEmailHtml, isResendEnabled } from "@/lib/resend";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// POST /api/eventos/[id]/costs/inform -- manda por correo el resumen del
// cierre de caja a todos los que firmaron (requeridos + voluntarios).
// Solo se puede disparar cuando la caja está cerrada Y todos los
// firmantes requeridos ya aprobaron -- se revalida acá, no solo se confía
// en lo que mande el cliente. Se puede volver a mandar más de una vez
// (ej. si alguien perdió el correo) -- no es de un solo uso.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, isAdmin, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select(
      "id, name, date, venue, project_id, cost_sheet_closed_at, fee, ticket_income, expenses, profit_split_note, profit_split_project_pct, profit_split_trino_pct, projects ( name )"
    )
    .eq("id", id)
    .single();

  if (showErr || !show) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!show.project_id) {
    return NextResponse.json({ error: "El evento no tiene proyecto asignado" }, { status: 400 });
  }

  const role = await getProjectRole(supabase, user!.id, show.project_id);
  if (!canEditEventCosts(isAdmin, role)) {
    return NextResponse.json({ error: "Tu rol no puede informar el cierre de este evento" }, { status: 403 });
  }
  if (!show.cost_sheet_closed_at) {
    return NextResponse.json({ error: "La caja todavía no está cerrada" }, { status: 400 });
  }

  const { requiredSigners, signatures, allSigned } = await getSignaturesState(supabase, id, show.project_id);
  if (!allSigned) {
    return NextResponse.json({ error: "Todavía faltan firmas -- no se puede informar el cierre." }, { status: 409 });
  }

  if (!isResendEnabled()) {
    return NextResponse.json(
      { error: "Envío de correos no configurado (falta RESEND_API_KEY)" },
      { status: 503 }
    );
  }

  const [{ data: costRows }, { data: ticketRows }] = await Promise.all([
    supabase.from("event_cost_items").select("label, responsable, amount").eq("show_id", id).order("position"),
    supabase.from("event_ticket_tiers").select("label, unit_price, quantity_sold").eq("show_id", id).order("position"),
  ]);

  // Destinatarios = union de requeridos + quien haya firmado (incluye
  // firmantes "voluntarios"), sin duplicar por email.
  const recipients = new Map<string, string>(); // email -> nombre para mostrar
  for (const r of [...requiredSigners, ...signatures]) {
    if (r.email) recipients.set(r.email, r.fullName || r.email);
  }

  const signersForEmail = signatures.map((s) => ({
    name: s.fullName || s.email || "Alguien",
    signedAt: s.signedAt,
  }));

  const html = buildCostSheetSummaryEmailHtml({
    eventName: show.name,
    eventDate: show.date,
    venue: show.venue,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projectName: (show as any).projects?.name ?? null,
    fee: show.fee,
    ticketIncome: show.ticket_income,
    expenses: show.expenses,
    ticketTiers: (ticketRows ?? []).map((t: { label: string; unit_price: number; quantity_sold: number }) => ({
      label: t.label,
      unitPrice: t.unit_price,
      quantitySold: t.quantity_sold,
    })),
    costItems: (costRows ?? []).map((c: { label: string; responsable: string | null; amount: number }) => ({
      label: c.label,
      responsable: c.responsable,
      amount: c.amount,
    })),
    profitSplitNote: show.profit_split_note,
    profitSplitProjectPct: show.profit_split_project_pct,
    profitSplitTrinoPct: show.profit_split_trino_pct,
    signers: signersForEmail,
    detailUrl: siteUrl(`/eventos/${id}/firmar`),
  });

  const subject = `Cierre de caja aprobado -- ${show.name}`;
  const sentTo: string[] = [];
  for (const email of recipients.keys()) {
    try {
      await sendEmail({ to: email, subject, html });
      sentTo.push(email);
    } catch (err) {
      console.error("[costs/inform] fallo enviando a", email, err);
    }
  }

  const informedAt = new Date().toISOString();
  await supabase.from("shows").update({ cost_sheet_informed_at: informedAt, cost_sheet_informed_by: user!.id }).eq("id", id);

  return NextResponse.json({ ok: true, sentTo, informedAt });
}
