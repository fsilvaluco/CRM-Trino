import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectRole, canEditEventCosts } from "@/lib/project-roles";

// POST /api/eventos/[id]/costs/attachment -- { filePath, fileName } guarda
// el documento adjunto al cierre de caja (el archivo ya se subió al bucket
// "finances" desde el cliente -- acá solo se guarda la referencia).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase.from("shows").select("project_id").eq("id", id).single();
  const role = await getProjectRole(supabase, user!.id, show?.project_id ?? null);
  if (!canEditEventCosts(role)) {
    return NextResponse.json({ error: "Tu rol no puede editar los costos de este evento" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { filePath, fileName } = body as { filePath?: string; fileName?: string };

  if (!filePath) {
    return NextResponse.json({ error: "Falta filePath" }, { status: 400 });
  }

  const { error: dbError } = await supabase
    .from("shows")
    .update({ cost_sheet_closing_file_path: filePath, cost_sheet_closing_file_name: fileName ?? null })
    .eq("id", id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/eventos/[id]/costs/attachment -- quita la referencia
// (no borra el archivo del bucket, para no complicar permisos de storage
// -- si queda huérfano no genera ningún problema).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase.from("shows").select("project_id").eq("id", id).single();
  const role = await getProjectRole(supabase, user!.id, show?.project_id ?? null);
  if (!canEditEventCosts(role)) {
    return NextResponse.json({ error: "Tu rol no puede editar los costos de este evento" }, { status: 403 });
  }

  const { error: dbError } = await supabase
    .from("shows")
    .update({ cost_sheet_closing_file_path: null, cost_sheet_closing_file_name: null })
    .eq("id", id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
