import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

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
