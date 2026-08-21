import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { sendPushToUsers } from "@/lib/push";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// PUT /api/eventos/[id]/cost-submissions/[subId] -- aprobar o rechazar un
// gasto reportado. Solo admins.
// - Aprobar: inserta un event_cost_items nuevo (aparece en la Planilla
//   como cualquier fila agregada a mano, editable después) y deja el
//   envío marcado "approved" con el link al item creado, como historial.
// - Rechazar: BORRA el envío por completo (a pedido explícito de
//   Francisco) -- no queda un registro "rechazado" dando vueltas, y la
//   persona puede volver a reportar el mismo gasto corregido sin fricción.
//   El motivo (si lo escribió el admin) solo viaja en el push, no se
//   guarda en ningún lado.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const { id, subId } = await params;
  const { supabase, user, isAdmin, error } = await requireAuth();
  if (error) return error;

  if (!isAdmin) {
    return NextResponse.json({ error: "Solo administradores pueden revisar gastos reportados" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { decision, reviewNote } = body as { decision?: "approve" | "reject"; reviewNote?: string | null };
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "Decisión inválida" }, { status: 400 });
  }

  const { data: submission, error: subErr } = await supabase
    .from("event_cost_submissions")
    .select("*")
    .eq("id", subId)
    .eq("show_id", id)
    .single();
  if (subErr || !submission) {
    return NextResponse.json({ error: "Gasto reportado no encontrado" }, { status: 404 });
  }
  if (submission.status !== "pending") {
    return NextResponse.json({ error: "Este gasto ya fue revisado" }, { status: 409 });
  }

  if (decision === "reject") {
    const { error: deleteError } = await supabase.from("event_cost_submissions").delete().eq("id", subId);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    void sendPushToUsers([submission.submitted_by], {
      title: "Tu gasto fue rechazado",
      body: `"${submission.label}"${reviewNote ? `: ${reviewNote}` : ""} -- puedes volver a reportarlo corregido`,
      url: siteUrl(`/eventos/${id}/gastos`),
    });

    return NextResponse.json({ ok: true, deleted: true });
  }

  const { data: show } = await supabase.from("shows").select("cost_sheet_closed_at").eq("id", id).single();
  if (show?.cost_sheet_closed_at) {
    return NextResponse.json(
      { error: "La caja de este evento está cerrada -- reábrela primero para aprobar gastos nuevos." },
      { status: 409 }
    );
  }

  const { count } = await supabase
    .from("event_cost_items")
    .select("id", { count: "exact", head: true })
    .eq("show_id", id);

  const { data: costItem, error: costItemError } = await supabase
    .from("event_cost_items")
    .insert({
      show_id: id,
      position: count ?? 0,
      label: submission.label,
      category: submission.category,
      amount: submission.amount,
      notes: submission.notes,
      responsable: submission.responsable,
      responsable_contact_id: submission.responsable_contact_id,
      comprobante_url: submission.comprobante_url,
      km: submission.km ?? null,
      km_rate: submission.km_rate ?? null,
    })
    .select("id")
    .single();

  if (costItemError) return NextResponse.json({ error: costItemError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from("event_cost_submissions")
    .update({
      status: "approved",
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null,
      cost_item_id: costItem.id,
    })
    .eq("id", subId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  void sendPushToUsers([submission.submitted_by], {
    title: "Tu gasto fue aprobado",
    body: `"${submission.label}" ya quedó en la Planilla de costos`,
    url: siteUrl(`/eventos/${id}/gastos`),
  });

  return NextResponse.json({ ok: true, costItemId: costItem.id });
}
