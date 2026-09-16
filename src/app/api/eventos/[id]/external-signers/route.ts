import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewEventCosts, canEditEventCosts } from "@/lib/project-roles";
import { dbErrorResponse } from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-logs";
import { generateLinkToken, externalSignerStatus } from "@/lib/external-signature";
import { sendEmail, isResendEnabled, buildExternalSignatureInviteEmailHtml } from "@/lib/resend";

const DEFAULT_EXPIRY_DAYS = 30;
const MAX_EXPIRY_DAYS = 180;

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSigner(row: any) {
  return {
    id: row.id,
    roleLabel: row.role_label ?? null,
    invitedName: row.invited_name ?? null,
    invitedEmail: row.invited_email ?? null,
    status: externalSignerStatus(row),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null,
    invalidatedAt: row.invalidated_at ?? null,
    invalidatedReason: row.invalidated_reason ?? null,
    firstViewedAt: row.first_viewed_at ?? null,
    signedAt: row.signed_at ?? null,
    signerName: row.signer_name ?? null,
    signerRut: row.signer_rut ?? null,
    signerEmail: row.signer_email ?? null,
    signerPhone: row.signer_phone ?? null,
    otpVerifiedAt: row.otp_verified_at ?? null,
    ipAddress: row.ip_address ?? null,
    documentHash: row.document_hash ?? null,
  };
}

// Columnas que se devuelven al equipo. Nunca `token_hash` ni `otp_hash`:
// no le sirven a la UI y no tienen por qué salir de la base.
const SELECT_COLUMNS =
  "id, role_label, invited_name, invited_email, created_at, expires_at, revoked_at, invalidated_at, invalidated_reason, first_viewed_at, signed_at, signer_name, signer_rut, signer_email, signer_phone, otp_verified_at, ip_address, document_hash";

async function loadShowAndPermissions(id: string) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return { error };

  const { data: show } = await supabase
    .from("shows")
    .select("id, name, date, venue, project_id, cost_sheet_closed_at, projects ( name )")
    .eq("id", id)
    .single();

  if (!show) {
    return { error: NextResponse.json({ error: "Evento no encontrado" }, { status: 404 }) };
  }
  if (!show.project_id || !allowedProjectIds.includes(show.project_id)) {
    return { error: NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 }) };
  }

  const perm = await getProjectPermissions(supabase, user!.id, show.project_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectName = (show as any).projects?.name ?? null;
  return { supabase, user, show: { ...show, projectName }, perm };
}

// GET /api/eventos/[id]/external-signers -- links de firma externa emitidos
// para este evento, con su estado y (si ya firmaron) los datos declarados
// por el firmante. El token en claro NO se devuelve nunca: solo existe en
// la respuesta del POST que lo crea.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadShowAndPermissions(id);
  if (ctx.error) return ctx.error;

  if (!canViewEventCosts(ctx.perm!)) {
    return NextResponse.json({ error: "Sin acceso a los costos de este evento" }, { status: 403 });
  }

  const { data, error: dbError } = await ctx.supabase!
    .from("event_external_signers")
    .select(SELECT_COLUMNS)
    .eq("show_id", id)
    .order("created_at", { ascending: true });

  if (dbError) return dbErrorResponse("external-signers:GET", dbError);

  return NextResponse.json({
    canCreate: canEditEventCosts(ctx.perm!),
    costSheetClosed: Boolean(ctx.show!.cost_sheet_closed_at),
    signers: (data ?? []).map(mapSigner),
  });
}

// POST /api/eventos/[id]/external-signers -- emite un link de firma para
// alguien de afuera (el cliente del evento, que no tiene ni va a tener
// cuenta). El token en claro se devuelve UNA sola vez, acá: en la base
// queda solo su SHA-256, así que si se pierde hay que emitir otro.
//
// Exige la caja cerrada a propósito: lo que se firma es un documento
// definitivo, y su huella (document_hash) no tendría sentido sobre cifras
// que todavía se están editando.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadShowAndPermissions(id);
  if (ctx.error) return ctx.error;

  if (!canEditEventCosts(ctx.perm!)) {
    return NextResponse.json({ error: "Tu rol no puede emitir firmas de este evento" }, { status: 403 });
  }
  if (!ctx.show!.cost_sheet_closed_at) {
    return NextResponse.json(
      { error: "Cierra la caja antes de mandar el link -- se firma el cierre definitivo, no un borrador." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const roleLabel = typeof body.roleLabel === "string" ? body.roleLabel.trim() : "";
  const invitedName = typeof body.invitedName === "string" ? body.invitedName.trim() : "";
  const invitedEmail = typeof body.invitedEmail === "string" ? body.invitedEmail.trim().toLowerCase() : "";
  const rawDays = Number(body.expiresInDays);
  const expiresInDays =
    Number.isFinite(rawDays) && rawDays >= 1 ? Math.min(Math.floor(rawDays), MAX_EXPIRY_DAYS) : DEFAULT_EXPIRY_DAYS;

  if (invitedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
    return NextResponse.json({ error: "El correo no tiene un formato válido" }, { status: 400 });
  }

  const { token, tokenHash } = generateLinkToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error: insertError } = await ctx.supabase!
    .from("event_external_signers")
    .insert({
      show_id: id,
      role_label: roleLabel || null,
      invited_name: invitedName || null,
      invited_email: invitedEmail || null,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: ctx.user!.id,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (insertError) return dbErrorResponse("external-signers:POST", insertError);

  // Si el equipo dejó fijado el correo, se le manda el link de una --
  // pedido de Francisco (15 sep 2026): antes había que copiarlo y mandarlo
  // a mano por WhatsApp. El correo lleva el link, que ES el secreto, así
  // que va SOLO a esa casilla y a ninguna otra.
  let emailSent = false;
  if (invitedEmail && isResendEnabled()) {
    try {
      const { data: me } = await ctx.supabase!
        .from("profiles")
        .select("full_name, email")
        .eq("id", ctx.user!.id)
        .single();

      await sendEmail({
        to: invitedEmail,
        subject: `Necesitamos tu firma -- ${ctx.show!.name}`,
        html: buildExternalSignatureInviteEmailHtml({
          invitedName: invitedName || null,
          roleLabel: roleLabel || null,
          eventName: ctx.show!.name,
          eventDate: ctx.show!.date,
          venue: ctx.show!.venue,
          projectName: ctx.show!.projectName,
          senderName: me?.full_name || me?.email || null,
          signUrl: siteUrl(`/firmar/${token}`),
          expiresAt,
        }),
      });
      emailSent = true;
    } catch (err) {
      // El link ya existe y se puede copiar a mano -- que falle el correo
      // no tiene por qué botar la creación.
      console.error("[external-signers:POST] fallo enviando la invitación", err);
    }
  }

  void logActivity({
    supabase: ctx.supabase!,
    userId: ctx.user!.id,
    action: "create",
    entityType: "event_external_signer",
    entityId: data.id,
    entityName: `Link de firma externa -- ${ctx.show!.name}`,
  });

  return NextResponse.json(
    { ...mapSigner(data), url: siteUrl(`/firmar/${token}`), emailSent },
    { status: 201 }
  );
}
