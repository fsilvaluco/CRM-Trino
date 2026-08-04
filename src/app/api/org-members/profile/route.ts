import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

// PATCH /api/org-members/profile → { userId, firstName, lastName, phone?, email? }
// Edita los datos de contacto de un usuario de la organización desde
// "Gestionar Acceso" -- separado del PATCH de /api/org-members (que solo
// cambia el rol) porque tocan cosas distintas: uno es permisos, este es
// identidad/contacto.
export async function PATCH(request: NextRequest) {
  const { orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const admin = createAdminClient();
  const body = await request.json();
  const { userId, firstName, lastName, phone, email } = body as {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    email?: string;
  };

  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

  // Confirmar que el usuario pertenece a esta organización -- un admin no
  // debería poder editar el perfil de alguien de otra org solo por tener
  // el userId a mano.
  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  if (!membership) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  const normalizedFirstName = firstName?.trim() ?? "";
  const normalizedLastName = lastName?.trim() ?? "";
  const fullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ").trim() || null;
  const normalizedPhone = phone?.trim() || null;
  const normalizedEmail = email?.trim().toLowerCase();

  // El email vive en auth.users, no en profiles -- si cambió, hay que
  // actualizarlo ahí primero via admin API (esto lo cambia de inmediato,
  // sin pedirle confirmación de vuelta a la persona, porque lo está
  // haciendo un admin desde el panel, no la persona misma desde su cuenta).
  if (normalizedEmail) {
    const { data: currentUser, error: getUserError } = await admin.auth.admin.getUserById(userId);
    if (getUserError) return NextResponse.json({ error: getUserError.message }, { status: 500 });

    if ((currentUser.user?.email ?? "").toLowerCase() !== normalizedEmail) {
      const { error: updateEmailError } = await admin.auth.admin.updateUserById(userId, {
        email: normalizedEmail,
        email_confirm: true,
      });
      if (updateEmailError) {
        return NextResponse.json({ error: `No se pudo actualizar el email: ${updateEmailError.message}` }, { status: 500 });
      }
    }
  }

  const profilePayload: Record<string, unknown> = {
    id: userId,
    full_name: fullName,
    phone: normalizedPhone,
  };
  if (normalizedEmail) profilePayload.email = normalizedEmail;

  const { error: profileError } = await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
