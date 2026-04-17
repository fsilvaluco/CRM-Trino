import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

function isMissingStatusColumn(message: string | undefined): boolean {
  if (!message) return false;
  const msg = message.toLowerCase();
  return msg.includes("status") && (msg.includes("column") || msg.includes("schema cache"));
}

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

  // Obtener orgId: intentar RPC primero, si falla usar query directa
  let orgId: string | null = null;
  const { data: rpcOrgId, error: rpcError } = await supabase.rpc("get_user_org_id");
  if (!rpcError && rpcOrgId) {
    orgId = rpcOrgId as string;
  } else {
    // Fallback: consulta directa a organization_members
    const { data: memberData } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();
    orgId = memberData?.organization_id ?? null;
  }

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
  const withStatus = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .single();

  let memberRow = withStatus.data as { role?: string; status?: "pending" | "active" } | null;
  let memberError = withStatus.error;

  if (memberError && isMissingStatusColumn(memberError.message)) {
    const fallback = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();
    memberRow = fallback.data ? { role: fallback.data.role, status: "active" } : null;
    memberError = fallback.error;
  }

  if (memberError) {
    return {
      supabase,
      user,
      orgId: orgId as string,
      role: null as UserRole | null,
      isAdmin: false,
      allowedProjectIds: null as string[] | null,
      error: NextResponse.json({ error: memberError.message }, { status: 500 }),
    };
  }

  if (memberRow?.status === "pending") {
    return {
      supabase,
      user,
      orgId: orgId as string,
      role: null as UserRole | null,
      isAdmin: false,
      allowedProjectIds: null as string[] | null,
      error: NextResponse.json({ error: "Cuenta pendiente de activación" }, { status: 403 }),
    };
  }

  const role: UserRole = (memberRow?.role as UserRole) ?? "member";
  const isAdmin = role === "owner" || role === "admin";

  // Si es member, obtener solo sus proyectos asignados (admin client para evitar bloqueo por RLS)
  let allowedProjectIds: string[] | null = null;
  if (!isAdmin) {
    const admin = createAdminClient();
    const { data: memberships } = await admin
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id)
      .eq("organization_id", orgId);

    allowedProjectIds = (memberships ?? []).map((m) => m.project_id);
  }

  return { supabase, user, orgId: orgId as string, role, isAdmin, allowedProjectIds, error: null };
}
