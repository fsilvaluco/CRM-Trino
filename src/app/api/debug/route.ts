import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// Ruta de diagnostico de auth/organizacion -- solo para desarrollo local.
// No debe quedar accesible en produccion: expone el resultado crudo de
// get_user_org_id() y la lista de projects sin filtrar por organization_id
// (a diferencia de todas las demas rutas del API).
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user ?? null;

    if (authError || !user) {
      return NextResponse.json({ ok: false, step: "auth", error: authError?.message ?? "no user" });
    }

    const { data: rpcOrgId, error: rpcError } = await supabase.rpc("get_user_org_id");

    const { data: memberRow, error: memberError } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .single();

    const { data: projects, error: projError } = await supabase
      .from("projects")
      .select("id, name")
      .eq("organization_id", memberRow?.organization_id ?? rpcOrgId ?? "");

    return NextResponse.json({
      ok: true,
      userId: user.id,
      email: user.email,
      rpc: { orgId: rpcOrgId, error: rpcError?.message ?? null },
      memberRow: memberRow ?? null,
      memberError: memberError?.message ?? null,
      projects: projects ?? [],
      projectsError: projError?.message ?? null,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
