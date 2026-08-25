import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewEvent, canEditEvent } from "@/lib/project-roles";
import { logActivity } from "@/lib/activity-logs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any) {
  return {
    id: r.id,
    position: r.position,
    role: r.role ?? null,
    name: r.name,
    contactId: r.contact_id ?? null,
    phone: r.phone ?? null,
    visibleOnShare: r.visible_on_share ?? false,
  };
}

// GET /api/eventos/[id]/contacts -- lista ordenada por posicion.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  // 25 ago 2026 (ROLES.md, ítem 18 del rediseño de roles): este endpoint no
  // tenía NINGÚN chequeo de proyecto ni permiso -- cualquiera autenticado en
  // la organización podía leer/reemplazar los contactos de cualquier evento
  // ajeno. Corregido con el mismo patrón que `eventos/[id]`.
  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, project_id")
    .eq("id", id)
    .single();
  if (showErr || !show) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  if (!show.project_id || !allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }
  const perm = await getProjectPermissions(supabase, user!.id, show.project_id);
  if (!canViewEvent(perm)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("event_contacts")
    .select("*")
    .eq("show_id", id)
    .order("position");

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapRow));
}

// PUT /api/eventos/[id]/contacts -- guardado completo de la lista (mismo
// patron que setlist/timing/costos/entradas).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, name, project_id")
    .eq("id", id)
    .single();
  if (showErr || !show) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  if (!show.project_id || !allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }
  const perm = await getProjectPermissions(supabase, user!.id, show.project_id);
  if (!canEditEvent(perm)) {
    return NextResponse.json({ error: "Tu rol no puede editar este evento" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];

  const { data: existing } = await supabase
    .from("event_contacts")
    .select("id")
    .eq("show_id", id);

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keptIds = new Set(
    items.filter((it: { id?: string }) => it.id).map((it: { id: string }) => it.id)
  );
  const toDelete = [...existingIds].filter((eid) => !keptIds.has(eid));

  if (toDelete.length > 0) {
    await supabase.from("event_contacts").delete().in("id", toDelete);
  }

  const rows = items.map(
    (
      it: {
        id?: string;
        role?: string | null;
        name: string;
        contactId?: string | null;
        phone?: string | null;
        visibleOnShare?: boolean;
      },
      index: number
    ) => ({
      ...(it.id ? { id: it.id } : { id: crypto.randomUUID() }),
      show_id: id,
      position: index,
      role: it.role || null,
      name: (it.name ?? "").trim() || "Sin nombre",
      contact_id: it.contactId || null,
      phone: it.phone || null,
      visible_on_share: it.visibleOnShare ?? false,
    })
  );

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("event_contacts").upsert(rows);
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    entityType: "event_contacts",
    entityId: id,
    entityName: show.name,
    projectId: show.project_id,
  });

  return NextResponse.json({ ok: true });
}
