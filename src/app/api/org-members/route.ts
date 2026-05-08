import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

type MemberStatus = "pending" | "active";
type MemberRole = "owner" | "admin" | "member";

const ASSIGNABLE_MEMBER_ROLES = new Set<MemberRole>(["admin", "member"]);

function isMissingStatusColumn(message: string | undefined): boolean {
  if (!message) return false;
  const msg = message.toLowerCase();
  return msg.includes("status") && (msg.includes("column") || msg.includes("schema cache"));
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const normalized = email.toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { user: null, error: error.message };

    const users = data.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (match) return { user: match, error: null as string | null };

    if (users.length < perPage) break;
  }

  return { user: null, error: null as string | null };
}

// GET /api/org-members → lista todos los usuarios de la organización
export async function GET() {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const admin = createAdminClient();

  // 1. Obtener miembros
  const withStatus = await supabase
    .from("organization_members")
    .select("user_id, role, joined_at, status")
    .eq("organization_id", orgId)
    .order("joined_at");

  let membersData = withStatus.data;
  let membersError = withStatus.error;

  if (membersError && isMissingStatusColumn(membersError.message)) {
    const fallback = await supabase
      .from("organization_members")
      .select("user_id, role, joined_at")
      .eq("organization_id", orgId)
      .order("joined_at");
    membersData = fallback.data?.map((row) => ({ ...row, status: "active" })) ?? null;
    membersError = fallback.error;
  }

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
    status: (m.status ?? "active") as MemberStatus,
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
  const normalizedEmail = email?.trim().toLowerCase();
  const allowedRoles = new Set(["admin", "member"]);
  if (!normalizedEmail) return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  if (!allowedRoles.has(role)) return NextResponse.json({ error: "Rol inválido" }, { status: 400 });

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectTo = `${siteUrl}/auth/callback?next=/auth/activate&flow=invite`;

  const { user: existingUser, error: existingLookupError } = await findAuthUserByEmail(admin, normalizedEmail);
  if (existingLookupError) return NextResponse.json({ error: existingLookupError }, { status: 500 });

  if (existingUser) {
    const withStatus = await admin
      .from("organization_members")
      .select("user_id, status")
      .eq("organization_id", orgId)
      .eq("user_id", existingUser.id)
      .maybeSingle();

    let existingMember = withStatus.data as { user_id: string; status?: MemberStatus } | null;
    let existingMemberError = withStatus.error;

    if (existingMemberError && isMissingStatusColumn(existingMemberError.message)) {
      const fallback = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("user_id", existingUser.id)
        .maybeSingle();
      existingMember = fallback.data ? { user_id: fallback.data.user_id, status: "active" } : null;
      existingMemberError = fallback.error;
    }

    if (existingMemberError) {
      return NextResponse.json({ error: existingMemberError.message }, { status: 500 });
    }

    if (existingMember?.status === "active") {
      return NextResponse.json({ ok: true, userId: existingUser.id, state: "already_active" });
    }

    if (existingMember?.status === "pending") {
      await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: { invited_to_org: orgId },
        redirectTo,
      });

      const upsertPending = await admin
        .from("organization_members")
        .upsert(
          { user_id: existingUser.id, organization_id: orgId, role, status: "pending" },
          { onConflict: "user_id,organization_id" }
        );

      if (upsertPending.error && isMissingStatusColumn(upsertPending.error.message)) {
        const fallback = await admin
          .from("organization_members")
          .upsert(
            { user_id: existingUser.id, organization_id: orgId, role },
            { onConflict: "user_id,organization_id" }
          );
        if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      } else if (upsertPending.error) {
        return NextResponse.json({ error: upsertPending.error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, userId: existingUser.id, state: "already_invited" });
    }
  }

  let userId: string;
  let alreadyExists = false;

  // Intentar invitar. Si el usuario ya existe, buscarlo por email
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
    data: { invited_to_org: orgId },
    redirectTo,
  });

  if (inviteError) {
    // Usuario ya registrado → buscar su ID por email
    const { user: existing, error: retryLookupError } = await findAuthUserByEmail(admin, normalizedEmail);
    if (retryLookupError) return NextResponse.json({ error: retryLookupError }, { status: 500 });
    if (!existing) return NextResponse.json({ error: inviteError.message }, { status: 500 });

    userId = existing.id;
    alreadyExists = true;
  } else {
    userId = inviteData.user.id;
  }

  // Registrar en organization_members
  const membershipStatus: MemberStatus = alreadyExists ? "active" : "pending";
  const upsertWithStatus = await admin
    .from("organization_members")
    .upsert(
      { user_id: userId, organization_id: orgId, role, status: membershipStatus },
      { onConflict: "user_id,organization_id" }
    );

  if (upsertWithStatus.error && isMissingStatusColumn(upsertWithStatus.error.message)) {
    const fallback = await admin
      .from("organization_members")
      .upsert(
        { user_id: userId, organization_id: orgId, role },
        { onConflict: "user_id,organization_id" }
      );
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
  } else if (upsertWithStatus.error) {
    return NextResponse.json({ error: upsertWithStatus.error.message }, { status: 500 });
  }

  // Si el usuario ya estaba registrado, enviar email de notificación (no llega el de Supabase)
  if (alreadyExists) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.DIGEST_FROM || "Artist Pro <onboarding@resend.dev>";

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
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">Artist Pro</p>
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

  return NextResponse.json({
    ok: true,
    userId,
    notified: alreadyExists,
    state: alreadyExists ? "already_active" : "invited",
  });
}

// PATCH /api/org-members → { userId, role } → cambiar rol
export async function PATCH(request: NextRequest) {
  const { orgId, role: actorRole, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const admin = createAdminClient();
  const body = await request.json();
  const { userId, role } = body as { userId: string; role: string };
  if (!userId || !role) return NextResponse.json({ error: "userId y role requeridos" }, { status: 400 });
  if (!ASSIGNABLE_MEMBER_ROLES.has(role as MemberRole)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const { data: targetMember, error: targetError } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!targetMember) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  if (targetMember.role === "owner") {
    if (actorRole === "admin") {
      return NextResponse.json({ error: "Un admin no puede cambiar el rol del owner" }, { status: 403 });
    }
    return NextResponse.json({ error: "El owner no se puede editar desde este endpoint" }, { status: 403 });
  }

  if (targetMember.role === role) {
    return NextResponse.json({ ok: true, member: targetMember });
  }

  const { data: updatedMember, error: dbError } = await admin
    .from("organization_members")
    .update({ role })
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .neq("role", "owner")
    .select("user_id, role")
    .maybeSingle();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!updatedMember) {
    return NextResponse.json({ error: "No se puede modificar el owner" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, member: updatedMember });
}

// DELETE /api/org-members → { userId } → eliminar usuario de la org
export async function DELETE(request: NextRequest) {
  const { orgId, role: actorRole, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const admin = createAdminClient();
  const body = await request.json();
  const { userId } = body as { userId: string };
  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

  const { data: targetMember, error: targetError } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!targetMember) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  if (targetMember.role === "owner") {
    if (actorRole === "admin") {
      return NextResponse.json({ error: "Un admin no puede eliminar al owner" }, { status: 403 });
    }
    return NextResponse.json({ error: "El owner no se puede eliminar desde este endpoint" }, { status: 403 });
  }

  const { data: deletedMember, error: dbError } = await admin
    .from("organization_members")
    .delete()
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .neq("role", "owner")
    .select("user_id")
    .maybeSingle();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!deletedMember) {
    return NextResponse.json({ error: "No se puede eliminar el owner" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
