import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canEditEventCosts } from "@/lib/project-roles";
import { getSignaturesState } from "@/lib/event-signatures";
import { sendEmail, isResendEnabled, buildEventSignatureRequestEmailHtml } from "@/lib/resend";
import { sendPushToUsers } from "@/lib/push";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// POST /api/eventos/[id]/signatures/notify -- le pide por correo a los
// firmantes que aprueben el cierre. Sin body, va a todos los requeridos que
// todavía no firman ("Enviar a todos"); con { userId }, solo a esa persona
// (el botón de su fila, para cuando no la pillan por WhatsApp).
//
// Se puede mandar las veces que haga falta -- es un recordatorio, no un
// token de un solo uso: quien firma entra con su cuenta, el correo solo
// lleva el link a la pantalla de firma.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, name, date, venue, project_id, cost_sheet_closed_at, required_signer_ids, projects ( name )")
    .eq("id", id)
    .single();

  if (showErr || !show) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!show.project_id) {
    return NextResponse.json({ error: "El evento no tiene proyecto asignado" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const perm = await getProjectPermissions(supabase, user!.id, show.project_id);
  if (!canEditEventCosts(perm)) {
    return NextResponse.json({ error: "Tu rol no puede pedir firmas de este evento" }, { status: 403 });
  }
  if (!show.cost_sheet_closed_at) {
    return NextResponse.json(
      { error: "Cierra la caja antes de pedir las firmas -- todavía no hay nada que aprobar." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const onlyUserId = typeof body.userId === "string" ? body.userId : null;

  const { requiredSigners, signatures } = await getSignaturesState(
    supabase,
    id,
    show.project_id,
    show.required_signer_ids
  );

  const signedIds = new Set(signatures.map((s) => s.userId));
  let targets = requiredSigners.filter((r) => !signedIds.has(r.userId));
  if (onlyUserId) {
    targets = targets.filter((r) => r.userId === onlyUserId);
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "Esa persona no está pendiente de firmar este cierre" },
        { status: 400 }
      );
    }
  }

  if (targets.length === 0) {
    return NextResponse.json({ error: "No queda nadie pendiente de firmar" }, { status: 409 });
  }

  const signUrl = siteUrl(`/eventos/${id}/firmar`);

  // El push llega igual aunque Resend no esté configurado -- son dos
  // canales independientes, no vale la pena perder el aviso por eso.
  void sendPushToUsers(
    targets.map((t) => t.userId),
    {
      title: "Te toca firmar un cierre de caja",
      body: `${show.name} está esperando tu aprobación`,
      url: signUrl,
    }
  );

  if (!isResendEnabled()) {
    return NextResponse.json(
      { error: "Envío de correos no configurado (falta RESEND_API_KEY). Igual se mandó la notificación push." },
      { status: 503 }
    );
  }

  const { data: me } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).single();
  const requestedBy = me?.full_name || me?.email || null;

  const sentTo: string[] = [];
  const failed: string[] = [];
  for (const target of targets) {
    if (!target.email) {
      failed.push(target.fullName ?? target.userId);
      continue;
    }
    try {
      await sendEmail({
        to: target.email,
        subject: `Pendiente de tu firma -- ${show.name}`,
        html: buildEventSignatureRequestEmailHtml({
          signerName: target.fullName,
          eventName: show.name,
          eventDate: show.date,
          venue: show.venue,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          projectName: (show as any).projects?.name ?? null,
          requestedBy,
          signUrl,
        }),
      });
      sentTo.push(target.email);
    } catch (err) {
      console.error("[signatures/notify] fallo enviando a", target.email, err);
      failed.push(target.email);
    }
  }

  return NextResponse.json({ ok: true, sentTo, failed });
}
