import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendEmail, buildInviteEmailHtml } from "@/lib/resend";

type MemberStatus = "pending" | "active";
type MemberRole = "owner" | "admin" | "member" | "artist";

const ASSIGNABLE_MEMBER_ROLES = new Set<MemberRole>(["admin", "member", "artist"]);

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

// GET /api/org-members?projectId=X → lista usuarios de la organización.
// Si se pasa projectId, se filtra a owner/admin (gestionan todo) mas los
// usuarios (member/artist) que tengan asignacion en project_members para
// ese proyecto especifico -- asi "Equipo y Acceso" refleja solo a quien
// realmente trabaja en el proyecto activo, no a toda la organizacion.
export async function GET(request: NextRequest) {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

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

  if (!projectId) {
    return NextResponse.json(result);
  }

  // Solo Propietario es global (acceso a todo, sin necesidad de estar en
  // project_members). Cualquier otro rol -- incluido Admin -- se define
  // POR PROYECTO: una misma persona puede ser Admin en un proyecto y
  // Miembro o Artista en otro. Por eso el rol que se muestra aqui viene
  // de project_members.role, NO del rol global de organization_members.
  const { data: assignedRows } = await supabase
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId);

  const roleByUserId = new Map((assignedRows ?? []).map((r) => [r.user_id, r.role]));

  const filtered = result
    .filter((m) => m.role === "owner" || roleByUserId.has(m.user_id))
    .map((m) => ({
      ...m,
      // Para el propietario se mantiene "owner"; para cualquier otro, el
      // rol EFECTIVO en este proyecto puntual.
      role: m.role === "owner" ? "owner" : roleByUserId.get(m.user_id) ?? m.role,
    }));

  return NextResponse.json(filtered);
}

// POST /api/org-members → { email, role, projectId? } → invitar usuario nuevo.
// Si viene projectId, ademas de invitarlo a la organizacion, se le asigna
// ese proyecto con el rol elegido de una -- y el correo menciona quien
// invito y a que proyecto especifico.
export async function POST(request: NextRequest) {
  const { supabase, orgId, isAdmin, user, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const body = await request.json();
  const { email, role = "member", projectId } = body as { email: string; role?: string; projectId?: string };
  const normalizedEmail = email?.trim().toLowerCase();
  const allowedRoles = new Set(["admin", "member", "artist"]);
  if (!normalizedEmail) return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  if (!allowedRoles.has(role)) return NextResponse.json({ error: "Rol inválido" }, { status: 400 });

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectTo = `${siteUrl}/auth/callback?next=/auth/activate&flow=invite`;

  // Nombre real de quien invita (para el correo) y del proyecto (si aplica)
  const { data: inviterProfile } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).single();
  const inviterName = inviterProfile?.full_name || inviterProfile?.email || "Alguien de tu equipo";

  let projectName: string | null = null;
  if (projectId) {
    const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).single();
    projectName = project?.name ?? null;
  }

  async function sendInviteEmail(actionLink: string) {
    try {
      await sendEmail({
        to: normalizedEmail,
        subject: projectName ? `${inviterName} te invitó a ${projectName} en Artist Pro` : "Te invitaron a Artist Pro",
        html: buildInviteEmailHtml({ inviterName, projectName, role, actionLink }),
      });
    } catch (err) {
      // No bloqueante: si Resend falla, Supabase probablemente ya mando su
      // propio correo generico igual (via inviteUserByEmail) -- no se pierde
      // el invite, solo se pierde la version linda.
      console.error("[org-members] fallo el correo personalizado (no bloqueante)", err);
    }
  }

  async function assignProjectIfNeeded(userId: string) {
    if (!projectId) return;
    await supabase
      .from("project_members")
      .upsert(
        { project_id: projectId, user_id: userId, organization_id: orgId, role },
        { onConflict: "project_id,user_id" }
      );
  }

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
      // Aunque ya este activo en la organizacion, si se le esta invitando
      // desde OTRO proyecto hay que: (1) asignarle ese proyecto con el rol
      // elegido, y (2) avisarle por correo -- antes esto no hacia nada,
      // como si Facebook no pudiera invitarte a mas de un grupo.
      await assignProjectIfNeeded(existingUser.id);

      if (projectName) {
        await sendEmail({
          to: normalizedEmail,
          subject: `${inviterName} te agregó a ${projectName} en Artist Pro`,
          html: buildInviteEmailHtml({ inviterName, projectName, role, actionLink: `${siteUrl}/` }),
        }).catch((err) => console.error("[org-members] fallo correo de nuevo proyecto (no bloqueante)", err));
      }

      return NextResponse.json({ ok: true, userId: existingUser.id, state: "already_active", notified: !!projectName });
    }

    if (existingMember?.status === "pending") {
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: { redirectTo },
      });
      if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
      await sendInviteEmail(linkData.properties.action_link);
      await assignProjectIfNeeded(existingUser.id);

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

      return NextResponse.json({
        ok: true,
        userId: existingUser.id,
        state: "already_invited",
        inviteLink: linkData.properties.action_link,
      });
    }
  }

  let userId: string;
  let alreadyExists = false;
  let inviteLink: string | null = null;

  // Intentar invitar. Si el usuario ya existe, buscarlo por email
  const { data: inviteLinkData, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: normalizedEmail,
    options: { redirectTo, data: { invited_to_org: orgId } },
  });

  if (inviteError) {
    // Usuario ya registrado → buscar su ID por email
    const { user: existing, error: retryLookupError } = await findAuthUserByEmail(admin, normalizedEmail);
    if (retryLookupError) return NextResponse.json({ error: retryLookupError }, { status: 500 });
    if (!existing) return NextResponse.json({ error: inviteError.message }, { status: 500 });

    userId = existing.id;
    alreadyExists = true;
  } else {
    userId = inviteLinkData.user.id;
    inviteLink = inviteLinkData.properties.action_link;
    await sendInviteEmail(inviteLink);
  }
  await assignProjectIfNeeded(userId);

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
    await sendEmail({
      to: normalizedEmail,
      subject: projectName ? `${inviterName} te agregó a ${projectName} en Artist Pro` : "Te agregaron a Artist Pro",
      html: buildInviteEmailHtml({ inviterName, projectName, role, actionLink: `${siteUrl}/` }),
    }).catch((err) => console.error("[org-members] fallo correo a usuario existente (no bloqueante)", err));
    // Si no hay RESEND_API_KEY, se añade igual pero sin email (no es bloqueante)
  }

  return NextResponse.json({
    ok: true,
    userId,
    notified: alreadyExists,
    state: alreadyExists ? "already_active" : "invited",
    inviteLink,
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
