import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// PUT /api/qr/[id] -- edita nombre/destino. El slug (y por lo tanto el QR
// ya impreso/pegado) nunca cambia -- si cambiara, cualquier QR físico ya
// distribuido apuntaría a un link roto.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: existing } = await supabase.from("qr_codes").select("project_id").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "QR no encontrado" }, { status: 404 });
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(existing.project_id))) {
    return NextResponse.json({ error: "Sin acceso a este QR" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body?.label === "string") {
    if (!body.label.trim()) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    updates.label = body.label.trim();
  }
  if (typeof body?.destinationUrl === "string") {
    try {
      new URL(body.destinationUrl.trim());
    } catch {
      return NextResponse.json({ error: "El link de destino no es una URL válida" }, { status: 400 });
    }
    updates.destination_url = body.destinationUrl.trim();
  }

  const { error: dbError } = await supabase.from("qr_codes").update(updates).eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/qr/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: existing } = await supabase.from("qr_codes").select("project_id").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "QR no encontrado" }, { status: 404 });
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(existing.project_id))) {
    return NextResponse.json({ error: "Sin acceso a este QR" }, { status: 403 });
  }

  const { error: dbError } = await supabase.from("qr_codes").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
