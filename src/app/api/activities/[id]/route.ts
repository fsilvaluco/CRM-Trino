import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("activities")
    .select("id")
    .eq("id", id)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.completedAt !== undefined) {
    if (body.completedAt === null) {
      updates.completed_at = null;
    } else if (body.completedAt === true) {
      updates.completed_at = new Date().toISOString();
    } else if (typeof body.completedAt === "string") {
      const parsed = new Date(body.completedAt);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "completedAt debe ser una fecha valida" }, { status: 400 });
      }
      updates.completed_at = parsed.toISOString();
    }
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string" || !body.description.trim()) {
      return NextResponse.json({ error: "description debe ser un texto no vacio" }, { status: 400 });
    }
    updates.description = body.description;
  }

  if (body.scheduledAt !== undefined) {
    if (body.scheduledAt === null) {
      updates.scheduled_at = null;
    } else if (typeof body.scheduledAt === "string") {
      const parsed = new Date(body.scheduledAt);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "scheduledAt debe ser una fecha valida" }, { status: 400 });
      }
      updates.scheduled_at = parsed.toISOString();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("activities")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al actualizar: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}


export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("activities")
    .select("id")
    .eq("id", id)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
  }

  const { error: dbError } = await supabase.from("activities").delete().eq("id", id);
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
