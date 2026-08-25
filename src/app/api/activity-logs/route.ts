import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  // Antes exigía "isAdmin" (rol de ORGANIZACIÓN). Migrado a
  // `puede_gestionar_equipo` de proyecto -- puede ver el log quien
  // gestiona equipo en al menos un proyecto (ROLES.md, ítem 18 del
  // rediseño de roles). La tabla en sí no distingue por proyecto todavía.
  const { data: managerRow } = await supabase
    .from("project_members")
    .select("id")
    .eq("user_id", user!.id)
    .eq("puede_gestionar_equipo", true)
    .limit(1)
    .maybeSingle();
  if (!managerRow) {
    return NextResponse.json(
      { error: "Solo quien gestiona equipo en algún proyecto puede ver activity logs" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const userId = searchParams.get("userId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);
  const offset = Number(searchParams.get("offset") ?? 0);

  let query = supabase
    .from("activity_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (userId) query = query.eq("user_id", userId);

  const { data, error: queryError, count } = await query;

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  return NextResponse.json({ data, count });
}
