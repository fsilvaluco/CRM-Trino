import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canEditEventCosts } from "@/lib/project-roles";
import { dbErrorResponse } from "@/lib/api-errors";
import { generateLinkToken } from "@/lib/external-signature";
import { sendEmail, isResendEnabled, buildExternalSignatureInviteEmailHtml } from "@/lib/resend";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// POST /api/eventos/[id]/external-signers/[signerId]/reenviar -- el cliente
// perdió el correo o el link nunca le llegó.
//
// No es un "reenviar" literal: el token en claro NO existe en ninguna parte
// (en la base vive solo su SHA-256), así que no hay nada que volver a
// mandar. Lo que hace es EMITIR UNO NUEVO con los mismos datos y anular el
// anterior -- el link viejo deja de funcionar al instante, que además es lo
// que se quiere si se filtró o se mandó a la casilla equivocada.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; signerId: string }> }
) {
  const { id, signerId } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase
    .from("shows")
    .select("id, name, date, venue, project_id, projects ( name )")
    .eq("id", id)
    .single();

  if (!show) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  if (!show.project_id || !allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const perm = await getProjectPermissions(supabase, user!.id, show.project_id);
  if (!canEditEventCosts(perm)) {
    return NextResponse.json({ error: "Tu rol no puede emitir firmas de este evento" }, { status: 403 });
  }

  const { data: old } = await supabase
    .from("event_external_signers")
    .select("id, role_label, invited_name, invited_email, expires_at, signed_at, revoked_at")
    .eq("id", signerId)
    .eq("show_id", id)
    .single();

  if (!old) return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
  if (old.signed_at) {
    return NextResponse.json({ error: "Ese link ya se firmó -- no hay nada que reenviar" }, { status: 409 });
  }
  if (!old.invited_email) {
    return NextResponse.json(
      { error: "Ese link no tiene un correo cargado. Anúlalo y crea uno nuevo con el correo." },
      { status: 400 }
    );
  }
  if (!isResendEnabled()) {
    return NextResponse.json({ error: "Envío de correos no configurado (falta RESEND_API_KEY)" }, { status: 503 });
  }

  // Mismo plazo que le quedaba al anterior, salvo que ya haya vencido: en
  // ese caso 30 días nuevos, que es el default al crear.
  const remaining = new Date(old.expires_at).getTime() - Date.now();
  const expiresAt = new Date(Date.now() + (remaining > 0 ? remaining : 30 * 24 * 60 * 60 * 1000)).toISOString();

  const { token, tokenHash } = generateLinkToken();

  const { data: created, error: insertError } = await supabase
    .from("event_external_signers")
    .insert({
      show_id: id,
      role_label: old.role_label,
      invited_name: old.invited_name,
      invited_email: old.invited_email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: user!.id,
    })
    .select("id")
    .single();

  if (insertError) return dbErrorResponse("external-signers:reenviar", insertError);

  const { data: me } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).single();

  try {
    await sendEmail({
      to: old.invited_email,
      subject: `Necesitamos tu firma -- ${show.name}`,
      html: buildExternalSignatureInviteEmailHtml({
        invitedName: old.invited_name,
        roleLabel: old.role_label,
        eventName: show.name,
        eventDate: show.date,
        venue: show.venue,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projectName: (show as any).projects?.name ?? null,
        senderName: me?.full_name || me?.email || null,
        signUrl: siteUrl(`/firmar/${token}`),
        expiresAt,
      }),
    });
  } catch (err) {
    // El link nuevo ya existe; se borra para no dejar dos vivos si el
    // correo no salió, y el viejo se queda como estaba.
    console.error("[external-signers:reenviar] fallo enviando", err);
    await supabase.from("event_external_signers").delete().eq("id", created.id);
    return NextResponse.json({ error: "No se pudo enviar el correo. El link anterior sigue vigente." }, { status: 502 });
  }

  // Recién acá se anula el anterior: si algo falla más arriba, el cliente
  // se queda con un link que funciona.
  if (!old.revoked_at) {
    await supabase
      .from("event_external_signers")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", old.id);
  }

  return NextResponse.json({ ok: true, sentTo: old.invited_email });
}
