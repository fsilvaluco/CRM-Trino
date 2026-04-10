import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );
}

export type UserRole = "owner" | "admin" | "member";

/**
 * Obtiene el usuario autenticado, su organization_id, rol y proyectos accesibles.
 * - isAdmin: true si el rol es owner/admin → acceso total
 * - allowedProjectIds: null si isAdmin (ve todo), o array de IDs si es member
 */
export async function requireAuth() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      orgId: null,
      role: null as UserRole | null,
      isAdmin: false,
      allowedProjectIds: null as string[] | null,
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const { data: orgId } = await supabase.rpc("get_user_org_id");

  if (!orgId) {
    return {
      supabase,
      user,
      orgId: null,
      role: null as UserRole | null,
      isAdmin: false,
      allowedProjectIds: null as string[] | null,
      error: NextResponse.json({ error: "Sin organización asignada" }, { status: 403 }),
    };
  }

  // Obtener rol del usuario en la organización
  const { data: memberRow } = await supabase
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .single();

  const role: UserRole = (memberRow?.role as UserRole) ?? "member";
  const isAdmin = role === "owner" || role === "admin";

  // Si es member, obtener solo sus proyectos asignados
  let allowedProjectIds: string[] | null = null;
  if (!isAdmin) {
    const { data: memberships } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id)
      .eq("organization_id", orgId);

    allowedProjectIds = (memberships ?? []).map((m) => m.project_id);
  }

  return { supabase, user, orgId: orgId as string, role, isAdmin, allowedProjectIds, error: null };
}
