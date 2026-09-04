import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { sendPushToUsers } from "@/lib/push";
import { getRequiredSigners, getSignaturesState } from "@/lib/event-signatures";
import { getClientIp } from "@/lib/client-ip";

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
    .select("id, name, project_id, cost_sheet_closed_at")
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

  const { requiredSigners, signatures, allSigned } = await getSignaturesState(supabase, id, show.project_id);

  const signedIds = new Set(signatures.map((s) => s.userId));
  const isRequiredSigner = requiredSigners.some((r) => r.userId === user!.id);
  const alreadySigned = signedIds.has(user!.id);

  return NextResponse.json({
    eventName: show.name,
    costSheetClosed: Boolean(show.cost_sheet_closed_at),
    requiredSigners,
    signatures,
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
// actual. Irreversible (sin endpoint de "des-firmar") -- la única forma de
// sacar una firma es reabrir la caja, que las borra todas (ver
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
    .select("id, name, project_id, cost_sheet_closed_at")
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

  const requiredSigners = await getRequiredSigners(supabase, show.project_id);
  const isRequiredSigner = requiredSigners.some((r) => r.userId === user!.id);
  // Sin bypass de organización -- solo firma quien es firmante requerido
  // de ESTE proyecto (ROLES.md, ítem 3 del rediseño de roles).
  if (!isRequiredSigner) {
    return NextResponse.json(
      { error: "Solo quien ve ingresos y costos de Eventos en este proyecto puede firmar el cierre" },
      { status: 403 }
    );
  }

  const { error: insertError } = await supabase
    .from("event_closing_signatures")
    .insert({ show_id: id, user_id: user!.id, ip_address: getClientIp(request) });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Ya habías firmado este cierre" }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
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
