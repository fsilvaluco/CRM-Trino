import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  let body: { name?: string; color?: string; isWon?: boolean; isLost?: boolean; order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  const { supabase, orgId, user, error } = await requireAuth();
  if (error) return error;

  // Auto-assign order: last existing + 1
  const { data: existing } = await supabase
    .from("pipeline_stages")
    .select("order")
    .order("order", { ascending: true });
  const maxOrder = existing && existing.length > 0 ? existing[existing.length - 1].order : 0;
  const order = body.order ?? (maxOrder + 1);

  const color = /^#[0-9a-fA-F]{6}$/.test(body.color ?? "") ? body.color! : "#64748b";

  const { data: created, error: dbError } = await supabase
    .from("pipeline_stages")
    .insert({ name, order, color, is_won: body.isWon ?? false, is_lost: body.isLost ?? false, organization_id: orgId })
    .select().single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(created, { status: 201 });
}
