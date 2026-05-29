import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDeal(row: any) {
  return {
    id: row.id,
    title: row.title,
    value: row.value,
    stageId: row.stage_id,
    contactId: row.contact_id,
    companyId: row.company_id ?? null,
    projectId: row.project_id ?? null,
    expectedClose: row.expected_close ?? null,
    probability: row.probability,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
  }

  return NextResponse.json(mapDeal(data));
}

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
    .from("deals")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.value !== undefined) updates.value = body.value;
  if (body.stageId !== undefined) updates.stage_id = body.stageId;
  if (body.contactId !== undefined) updates.contact_id = body.contactId;
  if (body.companyId !== undefined) updates.company_id = body.companyId || null;
  if (body.projectId !== undefined) updates.project_id = body.projectId || null;
  if (body.expectedClose !== undefined) {
    updates.expected_close = body.expectedClose
      ? new Date(body.expectedClose).toISOString()
      : null;
  }
  if (body.probability !== undefined) {
    updates.probability = Math.max(0, Math.min(100, Number(body.probability)));
  }
  if (body.notes !== undefined) updates.notes = body.notes;

  const { data, error: dbError } = await supabase
    .from("deals")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al actualizar deal: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(mapDeal(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("deals")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
  }

  const { error: dbError } = await supabase
    .from("deals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (dbError) {
    return NextResponse.json(
      { error: `Error al eliminar deal: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
