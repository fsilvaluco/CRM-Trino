import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getProjectPermissions, canEditEventCosts } from "@/lib/project-roles";
import { getSignaturesState } from "@/lib/event-signatures";
import { sendClosingActa } from "@/lib/closing-acta";

// POST /api/eventos/[id]/costs/inform -- manda el acta del cierre (resumen +
// PDF con todas las firmas) a todos los que firmaron.
//
// Desde el 16 sep 2026 esto se dispara SOLO cuando termina de firmar todo el
// mundo (ver src/lib/closing-acta.ts). Este endpoint quedó como el envío a
// mano: sirve para reenviarlo, y para cerrar el tema cuando hay un link
// externo pendiente que nunca se va a firmar -- por eso pasa `force`, que se
// salta ese chequeo y el de "ya se envió".
//
// Lo que NO se salta es que hayan firmado los firmantes internos: informar
// un cierre que el propio equipo no aprobó no tiene sentido.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, name, project_id, cost_sheet_closed_at, required_signer_ids")
    .eq("id", id)
    .single();

  if (showErr || !show) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!show.project_id) {
    return NextResponse.json({ error: "El evento no tiene proyecto asignado" }, { status: 400 });
  }

  const role = await getProjectPermissions(supabase, user!.id, show.project_id);
  if (!canEditEventCosts(role)) {
    return NextResponse.json({ error: "Tu rol no puede informar el cierre de este evento" }, { status: 403 });
  }
  if (!show.cost_sheet_closed_at) {
    return NextResponse.json({ error: "La caja todavía no está cerrada" }, { status: 400 });
  }

  const { allSigned } = await getSignaturesState(supabase, id, show.project_id, show.required_signer_ids);
  if (!allSigned) {
    return NextResponse.json({ error: "Todavía faltan firmas del equipo -- no se puede informar el cierre." }, { status: 409 });
  }

  const result = await sendClosingActa({ admin: createAdminClient(), showId: id, force: true });

  if (!result.sent) {
    const mensajes: Record<string, string> = {
      "sin-correo": "Envío de correos no configurado (falta RESEND_API_KEY)",
      "sin-firmas": "No hay ninguna firma registrada todavía",
      "caja-abierta": "La caja todavía no está cerrada",
      "sin-evento": "No se pudo armar el cierre de este evento",
    };
    return NextResponse.json(
      { error: mensajes[result.reason ?? ""] ?? "No se pudo enviar el acta" },
      { status: result.reason === "sin-correo" ? 503 : 409 }
    );
  }

  // `cost_sheet_informed_at` lo estampa sendClosingActa -- acá solo queda
  // registrado quién lo mandó a mano.
  await supabase.from("shows").update({ cost_sheet_informed_by: user!.id }).eq("id", id);

  return NextResponse.json({ ok: true, sentTo: result.recipients });
}
