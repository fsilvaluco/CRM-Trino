import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewEvent } from "@/lib/project-roles";
import { sendPushToUsers } from "@/lib/push";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// POST /api/eventos/[id]/notify -- boton manual "Notificar cambios" en la
// pagina de detalle del evento. A diferencia del recordatorio automatico
// del dia anterior (cron), este lo dispara una persona a proposito cuando
// modifico algo (timing, venue, etc.) y quiere avisarle al resto del
// proyecto ahora mismo. Notifica a todos los project_members salvo a quien
// aprieta el boton.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  const { data: event, error: eventErr } = await supabase
    .from("shows")
    .select("id, name, venue, project_id")
    .eq("id", id)
    .single();

  if (eventErr || !event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!event.project_id) {
    return NextResponse.json({ error: "El evento no tiene proyecto asignado" }, { status: 400 });
  }

  // Avisar es una accion sobre el proyecto (le llega un push a todos sus
  // integrantes), asi que pide acceso al evento. Sin esto cualquiera de la
  // organizacion podia notificar sobre eventos de proyectos ajenos
  // (auditoria del 17 sep 2026, ver ROLES.md §11).
  if (allowedProjectIds !== null && !allowedProjectIds.includes(event.project_id as string)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }
  const role = await getProjectPermissions(supabase, user!.id, event.project_id as string);
  if (!canViewEvent(role)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const { data: members, error: membersErr } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", event.project_id as string);

  if (membersErr) {
    return NextResponse.json({ error: membersErr.message }, { status: 500 });
  }

  const recipientIds = (members ?? [])
    .map((m) => m.user_id as string)
    .filter((uid) => uid !== user!.id);

  if (recipientIds.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  const eventName = (event.name as string) || (event.venue as string) || "el evento";
  void sendPushToUsers(recipientIds, {
    title: `Cambios en ${eventName}`,
    body: message || "Revisa los detalles actualizados del evento.",
    url: siteUrl(`/eventos/${id}`),
  });

  return NextResponse.json({ notified: recipientIds.length });
}
