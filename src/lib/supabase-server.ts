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

/**
 * Obtiene el usuario autenticado y su organization_id.
 * Si no hay sesión, devuelve un error 401 listo para retornar.
 */
export async function requireAuth() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      orgId: null,
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const { data: orgId } = await supabase.rpc("get_user_org_id");

  if (!orgId) {
    return {
      supabase,
      user,
      orgId: null,
      error: NextResponse.json({ error: "Sin organización asignada" }, { status: 403 }),
    };
  }

  return { supabase, user, orgId: orgId as string, error: null };
}
