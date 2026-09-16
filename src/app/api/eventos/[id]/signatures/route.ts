import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { sendPushToUsers } from "@/lib/push";
import { getRequiredSigners, getSignaturesState, getEligibleSigners } from "@/lib/event-signatures";
import { getProjectPermissions, canEditEventCosts, canViewEventCosts } from "@/lib/project-roles";
import { dbErrorResponse } from "@/lib/api-errors";
import { getClientIp } from "@/lib/client-ip";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  approvalExternalSigners,
  otpMatches,
  buildClosingDocument,
  documentHash,
  maskEmail,
  OTP_MAX_ATTEMPTS,
} from "@/lib/external-signature";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// GET /api/eventos/[id]/signatures -- estado de la firma virtual del cierre
// de caja: quiénes deben firmar (project_members del proyecto del evento
// con ve_ingresos && ve_costos de Eventos en su matriz), quiénes ya
// firmaron y cuándo, y si el usuario actual puede firmar. Acceso
// restringido a project_members de ESE proyecto -- a diferencia de GET
// /api/eventos/[id], que hoy no filtra por proyecto.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
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
  if (!allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const { requiredSigners, eligibleSigners, signatures, allSigned } = await getSignaturesState(
    supabase,
    id,
    show.project_id,
    show.required_signer_ids
  );
  const perm = await getProjectPermissions(supabase, user!.id, show.project_id);

  // Prellenado del formulario de firma: lo que ya guardó en su perfil
  // ("guardar para próximos cierres"). El código igual se pide siempre.
  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, email, phone, rut")
    .eq("id", user!.id)
    .single();

  // Código en vuelo del usuario actual (si pidió uno y todavía no venció).
  const admin = createAdminClient();
  const { data: otpRow } = await admin
    .from("event_signature_otps")
    .select("sent_to, sent_at, expires_at, attempts")
    .eq("show_id", id)
    .eq("user_id", user!.id)
    .maybeSingle();
  const otpPending = otpRow && new Date(otpRow.expires_at).getTime() > Date.now() ? otpRow : null;

  // Firmas externas del mismo cierre (migración 099) -- el recuadro de
  // Aprobación las muestra junto a las internas: es el mismo documento.
  // El documento que se firma va en la MISMA respuesta, para que la
  // pantalla de firma del equipo muestre exactamente lo mismo que la del
  // cliente externo. Solo para quien puede ver costos: esta respuesta
  // también la lee gente (artist/staff) que ve quién falta por firmar pero
  // no los montos -- ROLES.md 0.2.2.
  const puedeVerCostos = canViewEventCosts(perm);
  const doc = puedeVerCostos ? await buildClosingDocument(admin, id) : null;
  const { data: transferRow } = puedeVerCostos
    ? await supabase.from("shows").select("profit_split_transfer_proof_url").eq("id", id).single()
    : { data: null };

  const { data: externalRows } = await supabase
    .from("event_external_signers")
    .select("id, role_label, invited_name, invited_email, signer_name, signer_email, signed_at, revoked_at, invalidated_at, expires_at, created_at, ip_address")
    .eq("show_id", id)
    .order("created_at");

  const signedIds = new Set(signatures.map((s) => s.userId));
  const isRequiredSigner = requiredSigners.some((r) => r.userId === user!.id);
  const alreadySigned = signedIds.has(user!.id);

  return NextResponse.json({
    eventName: show.name,
    costSheetClosed: Boolean(show.cost_sheet_closed_at),
    requiredSigners,
    // Universo entre el que se elige con los checks (migración 101) --
    // todos los que PODRÍAN firmar segun su matriz de permisos.
    eligibleSigners,
    requiredSignerIds: (show.required_signer_ids ?? []) as string[],
    // Elegir quien firma es parte de administrar el cierre, mismo permiso
    // que cerrarlo o reabrirlo.
    canManageSigners: canEditEventCosts(perm),
    signatures,
    // Una fila por PERSONA, no por link emitido -- ver
    // approvalExternalSigners(). Sin esto un cliente al que se le
    // reemplazó el link aparecía dos veces.
    externalSigners: approvalExternalSigners(externalRows ?? []),
    document: doc,
    profitSplitTransferProofUrl: transferRow?.profit_split_transfer_proof_url ?? null,
    // Datos con los que se prellena el formulario de firma del usuario
    // actual. `accountEmail` es a dónde llega el código, siempre.
    me: {
      fullName: me?.full_name ?? null,
      rut: me?.rut ?? null,
      email: me?.email ?? null,
      phone: me?.phone ?? null,
      accountEmailMasked: user!.email ? maskEmail(user!.email) : null,
    },
    otp: otpPending
      ? {
          sentToMasked: maskEmail(otpPending.sent_to),
          sentAt: otpPending.sent_at,
          expiresAt: otpPending.expires_at,
          attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - (otpPending.attempts ?? 0)),
        }
      : null,
    allSigned,
    alreadySigned,
    // Sin bypass de organización (ROLES.md, ítem 3 del rediseño de roles --
    // "nadie tiene bypass, ni siquiera el dueño") -- antes cualquier admin
    // de la organización podía firmar aunque no fuera firmante requerido
    // de ESTE proyecto. Solo firma quien está en `requiredSigners`.
    canSign: Boolean(show.cost_sheet_closed_at) && isRequiredSigner && !alreadySigned,
  });
}

// POST /api/eventos/[id]/signatures -- registra la aprobación del usuario
// actual. Desde la migración 102 exige el código de 6 dígitos que se pidió
// en ../codigo: los datos declarados (nombre, RUT, correo, teléfono) son
// los que quedaron guardados con ese código, así que lo que se firma es
// siempre la identidad que recibió el correo.
//
// Irreversible (sin endpoint de "des-firmar") -- la única forma de sacar
// una firma es reabrir la caja, que las borra todas (ver
// costs/reopen/route.ts).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, name, project_id, cost_sheet_closed_at, required_signer_ids")
    .eq("id", id)
    .single();

  if (showErr || !show) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!show.cost_sheet_closed_at) {
    return NextResponse.json({ error: "La caja todavía no está cerrada -- no hay nada que firmar" }, { status: 400 });
  }
  if (!show.project_id) {
    return NextResponse.json({ error: "El evento no tiene proyecto asignado" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const requiredSigners = await getRequiredSigners(supabase, show.project_id, show.required_signer_ids);
  const isRequiredSigner = requiredSigners.some((r) => r.userId === user!.id);
  // Sin bypass de organización -- solo firma quien es firmante requerido
  // de ESTE proyecto (ROLES.md, ítem 3 del rediseño de roles).
  if (!isRequiredSigner) {
    return NextResponse.json(
      { error: "No estás en la lista de firmantes de este cierre" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";

  const admin = createAdminClient();
  const { data: otp } = await admin
    .from("event_signature_otps")
    .select("otp_hash, expires_at, attempts, sent_to, signer_name, signer_rut, signer_email, signer_phone, save_to_profile")
    .eq("show_id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!otp) {
    return NextResponse.json({ error: "Primero pide el código de verificación" }, { status: 400 });
  }
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "El código venció. Pide uno nuevo." }, { status: 410 });
  }
  const attempts = otp.attempts ?? 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Demasiados intentos con ese código. Pide uno nuevo." }, { status: 429 });
  }
  if (!otpMatches(`${id}:${user!.id}`, code, otp.otp_hash)) {
    await admin
      .from("event_signature_otps")
      .update({ attempts: attempts + 1 })
      .eq("show_id", id)
      .eq("user_id", user!.id);
    const left = OTP_MAX_ATTEMPTS - (attempts + 1);
    return NextResponse.json(
      {
        error:
          left > 0
            ? `Código incorrecto. Te quedan ${left} ${left === 1 ? "intento" : "intentos"}.`
            : "Código incorrecto. Pide uno nuevo.",
        attemptsLeft: Math.max(0, left),
      },
      { status: 400 }
    );
  }

  // La huella se calcula sobre el cierre tal como está EN ESTE MOMENTO, y
  // el documento completo queda guardado junto a ella -- mismo respaldo que
  // la firma del cliente externo (migración 099).
  const doc = await buildClosingDocument(admin, id);
  const signedAt = new Date().toISOString();

  const { error: insertError } = await supabase.from("event_closing_signatures").insert({
    show_id: id,
    user_id: user!.id,
    ip_address: getClientIp(request),
    user_agent: request.headers.get("user-agent"),
    signed_at: signedAt,
    otp_verified_at: signedAt,
    signer_name: otp.signer_name,
    signer_rut: otp.signer_rut,
    signer_email: otp.signer_email,
    signer_phone: otp.signer_phone,
    document_hash: doc ? documentHash(doc) : null,
    document_snapshot: doc,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Ya habías firmado este cierre" }, { status: 409 });
    }
    return dbErrorResponse("event-signatures:POST", insertError);
  }

  // El código se quema al usarlo.
  await admin.from("event_signature_otps").delete().eq("show_id", id).eq("user_id", user!.id);

  // "Guardar para próximos cierres" -- prellenado, no atajo: el código se
  // sigue pidiendo igual la próxima vez.
  if (otp.save_to_profile) {
    await supabase
      .from("profiles")
      .update({ rut: otp.signer_rut, phone: otp.signer_phone })
      .eq("id", user!.id);
  }

  // Fire-and-forget: avisar al resto del proyecto. Si esta firma completó
  // a todos los requeridos, un mensaje distinto (más de cierre).
  const { data: sigRows } = await supabase
    .from("event_closing_signatures")
    .select("user_id")
    .eq("show_id", id);
  const signedIds = new Set((sigRows ?? []).map((s: { user_id: string }) => s.user_id));
  const allSigned = requiredSigners.every((r) => signedIds.has(r.userId));
  const othersToNotify = requiredSigners.map((r) => r.userId).filter((uid) => uid !== user!.id);

  if (othersToNotify.length > 0) {
    void sendPushToUsers(othersToNotify, {
      title: allSigned ? "Cierre de caja aprobado por todos" : "Firmó el cierre de caja",
      body: allSigned
        ? `Ya todos aprobaron el cierre de ${show.name}`
        : `Falta que confirmes el cierre de ${show.name}`,
      url: siteUrl(`/eventos/${id}/firmar`),
    });
  }

  return NextResponse.json({ ok: true, allSigned }, { status: 201 });
}

// PUT /api/eventos/[id]/signatures -- elige a mano quiénes tienen que
// firmar el cierre (migración 101). Lista vacía = vuelve al comportamiento
// de siempre: firman todos los que ven ingresos y costos de Eventos.
//
// La selección se acota a los que califican por permisos: no se puede
// obligar a aprobar números a alguien que su matriz no deja ver (ROLES.md,
// ítem 20). Se puede cambiar con la caja cerrada -- sumar un firmante
// después de cerrar es justamente el caso de "se me olvidó fulano"; las
// firmas que ya existen no se tocan.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, project_id")
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
    return NextResponse.json({ error: "Tu rol no puede elegir los firmantes de este evento" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: unknown = body.requiredSignerIds;
  if (!Array.isArray(ids) || ids.some((v) => typeof v !== "string")) {
    return NextResponse.json({ error: "requiredSignerIds tiene que ser una lista de ids" }, { status: 400 });
  }

  const eligible = await getEligibleSigners(supabase, show.project_id);
  const eligibleIds = new Set(eligible.map((e) => e.userId));
  const unique = Array.from(new Set(ids as string[]));
  const invalid = unique.filter((uid) => !eligibleIds.has(uid));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "Solo puedes elegir entre quienes ven ingresos y costos de Eventos en este proyecto" },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("shows")
    .update({ required_signer_ids: unique })
    .eq("id", id);

  if (updateError) return dbErrorResponse("event-signatures:PUT", updateError);

  return NextResponse.json({ ok: true, requiredSignerIds: unique });
}
