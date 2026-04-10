import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  let body: { name?: string; color?: string; isWon?: boolean; isLost?: boolean; order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("pipeline_stages").select("*").eq("id", id).single();
  if (findErr || !existing) {
    return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
  }

  const name = body.name !== undefined ? body.name.trim() : existing.name;
  if (!name) {
    return NextResponse.json({ error: "El nombre no puede estar vacio" }, { status: 400 });
  }
  const color = body.color !== undefined
    ? /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : existing.color
    : existing.color;

  const { data: updated, error: dbError } = await supabase
    .from("pipeline_stages")
    .update({
      name, color,
      is_won: body.isWon !== undefined ? body.isWon : existing.is_won,
      is_lost: body.isLost !== undefined ? body.isLost : existing.is_lost,
      order: body.order !== undefined ? body.order : existing.order,
    })
    .eq("id", id).select().single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("pipeline_stages").select("id").eq("id", id).single();
  if (findErr || !existing) {
    return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
  }

  const { count } = await supabase
    .from("deals").select("id", { count: "exact", head: true }).eq("stage_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar — hay ${count} deal(s) en esta etapa. Muevelos primero.` },
      { status: 409 }
    );
  }

  const { error: dbError } = await supabase.from("pipeline_stages").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
