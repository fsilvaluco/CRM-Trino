import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
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
      .select("id, name");

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
