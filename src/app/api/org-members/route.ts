import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/org-members → lista todos los usuarios de la organización
export async function GET() {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const admin = createAdminClient();

  // 1. Obtener miembros
  const { data: membersData, error: membersError } = await supabase
    .from("organization_members")
    .select("user_id, role, joined_at")
    .eq("organization_id", orgId)
    .order("joined_at");

  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  const userIds = (membersData ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return NextResponse.json([]);

  // 2. Obtener perfiles
  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", userIds);

  const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

  // 3. Para usuarios sin perfil, obtener email desde auth.admin
  const missingIds = userIds.filter((id) => !profileMap.has(id));
  const authEmailMap = new Map<string, string>();
  if (missingIds.length > 0) {
    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of authUsers?.users ?? []) {
      if (missingIds.includes(u.id) && u.email) {
        authEmailMap.set(u.id, u.email);
      }
    }
  }

  const result = (membersData ?? []).map((m) => ({
    ...m,
    profiles: profileMap.get(m.user_id) ?? {
      full_name: null,
      email: authEmailMap.get(m.user_id) ?? null,
      avatar_url: null,
    },
  }));

  return NextResponse.json(result);
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

  let userId: string;
  let alreadyExists = false;

  // Intentar invitar. Si el usuario ya existe, buscarlo por email
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_org: orgId },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/`,
  });

  if (inviteError) {
    // Usuario ya registrado → buscar su ID por email
    const { data: listData, error: listError } = await admin.auth.admin.listUsers();
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

    const existing = listData.users.find((u) => u.email === email);
    if (!existing) return NextResponse.json({ error: inviteError.message }, { status: 500 });

    userId = existing.id;
    alreadyExists = true;
  } else {
    userId = inviteData.user.id;
  }

  // Registrar en organization_members
  const { error: memberError } = await admin
    .from("organization_members")
    .upsert(
      { user_id: userId, organization_id: orgId, role },
      { onConflict: "user_id,organization_id" }
    );

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  // Si el usuario ya estaba registrado, enviar email de notificación (no llega el de Supabase)
  if (alreadyExists) {
    const apiKey = process.env.RESEND_API_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const from = process.env.DIGEST_FROM || "CRM Trino <onboarding@resend.dev>";

    if (apiKey) {
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 20px;">
          <h1 style="color: #1e293b; font-size: 22px; margin-bottom: 4px;">Has sido añadido al CRM</h1>
          <p style="color: #64748b; margin-top: 0; font-size: 15px;">
            Un administrador te ha añadido como <strong>${role}</strong> a la organización.
          </p>
          <p style="color: #475569; font-size: 14px;">
            Ya puedes acceder con tu cuenta existente:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${siteUrl}/"
               style="background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">
              Acceder al CRM
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">CRM Trino</p>
        </div>
      `;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ from, to: [email], subject: "Te han añadido al CRM", html }),
      });
    }
    // Si no hay RESEND_API_KEY, se añade igual pero sin email (no es bloqueante)
  }

  return NextResponse.json({ ok: true, userId, notified: alreadyExists });
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
    .from("organization_members")
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
    .from("organization_members")
    .delete()
    .eq("user_id", userId)
    .eq("organization_id", orgId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
