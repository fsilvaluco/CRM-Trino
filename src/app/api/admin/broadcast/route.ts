import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { sendPushToUsers } from "@/lib/push";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBroadcast(row: any) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    targetProjectId: row.target_project_id ?? null,
    targetProjectName: row.projects?.name ?? null,
    recipientCount: row.recipient_count,
    sentByName: row.sent_by_profile?.full_name ?? row.sent_by_profile?.email ?? "Alguien",
    createdAt: row.created_at,
  };
}

// GET /api/admin/broadcast -- historial (solo admins, RLS ya lo restringe
// tambien a nivel de base, esto es ademas la barrera de la API).
export async function GET() {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const { data, error: dbError } = await supabase
    .from("admin_broadcasts")
    .select("*, projects ( name ), sent_by_profile:profiles!admin_broadcasts_sent_by_fkey ( full_name, email )")
    .eq("organization_id", orgId!)
    .order("created_at", { ascending: false })
    .limit(30);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapBroadcast));
}

// POST /api/admin/broadcast -- manda un push con mensaje libre, solo
// admins. scope 'org' = todos los miembros de la organizacion, scope
// 'project' = solo los project_members del proyecto indicado.
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Solo administradores pueden mandar notificaciones" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const message = typeof body?.body === "string" ? body.body.trim() : "";
  const scope = body?.scope === "project" ? "project" : "org";
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;

  if (!title) return NextResponse.json({ error: "El título es requerido" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "El mensaje es requerido" }, { status: 400 });
  if (scope === "project" && !projectId) {
    return NextResponse.json({ error: "Elige un proyecto" }, { status: 400 });
  }

  let recipientIds: string[];

  if (scope === "project") {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId!)
      .eq("organization_id", orgId!)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    const { data: members, error: membersErr } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId!);
    if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 });
    recipientIds = (members ?? []).map((m) => m.user_id as string);
  } else {
    const { data: members, error: membersErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId!);
    if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 });
    recipientIds = (members ?? []).map((m) => m.user_id as string);
  }

  recipientIds = [...new Set(recipientIds)];

  if (recipientIds.length > 0) {
    void sendPushToUsers(recipientIds, { title, body: message });
  }

  const { error: logErr } = await supabase.from("admin_broadcasts").insert({
    organization_id: orgId,
    sent_by: user!.id,
    title,
    body: message,
    target_project_id: scope === "project" ? projectId : null,
    recipient_count: recipientIds.length,
  });
  if (logErr) console.error("[admin/broadcast] no se pudo guardar el historial:", logErr.message);

  return NextResponse.json({ notified: recipientIds.length }, { status: 201 });
}
