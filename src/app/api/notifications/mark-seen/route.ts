import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  let body: { module?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.module) {
    return NextResponse.json({ error: "Falta 'module'" }, { status: 400 });
  }

  const { error: dbError } = await supabase.from("user_module_views").upsert(
    {
      user_id: user!.id,
      module_key: body.module,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,module_key" }
  );

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
