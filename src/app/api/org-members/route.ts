import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/org-members → lista todos los usuarios de la organización
export async function GET() {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { data, error: dbError } = await supabase
    .from("org_members")
    .select("user_id, role, joined_at, profiles ( full_name, email, avatar_url )")
    .eq("organization_id", orgId)
    .order("joined_at");

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/org-members → { email, role } → invitar usuario nuevo
export async function POST(request: NextRequest) {
  const { orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const body = await request.json();
  const { email, role = "member" } = body as { email: string; role?: string };
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 });

  const admin = createAdminClient();

  // Invitar al usuario — Supabase envía el email de invitación
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_org: orgId },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/`,
  });

  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 });

  // Registrar en org_members
  const { error: memberError } = await admin
    .from("org_members")
    .upsert(
      { user_id: inviteData.user.id, organization_id: orgId, role },
      { onConflict: "user_id,organization_id" }
    );

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json({ ok: true, userId: inviteData.user.id });
}

// PATCH /api/org-members → { userId, role } → cambiar rol
export async function PATCH(request: NextRequest) {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const body = await request.json();
  const { userId, role } = body as { userId: string; role: string };
  if (!userId || !role) return NextResponse.json({ error: "userId y role requeridos" }, { status: 400 });

  const { error: dbError } = await supabase
    .from("org_members")
    .update({ role })
    .eq("user_id", userId)
    .eq("organization_id", orgId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/org-members → { userId } → eliminar usuario de la org
export async function DELETE(request: NextRequest) {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const body = await request.json();
  const { userId } = body as { userId: string };
  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

  const { error: dbError } = await supabase
    .from("org_members")
    .delete()
    .eq("user_id", userId)
    .eq("organization_id", orgId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
