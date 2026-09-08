import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: existing } = await supabase
    .from("project_fonts")
    .select("project_id, file_path")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .single();

  if (!existing) return NextResponse.json({ error: "Tipografía no encontrada" }, { status: 404 });
  if (!allowedProjectIds.includes(existing.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { error: dbError } = await supabase.from("project_fonts").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: "No se pudo eliminar" }, { status: 500 });

  if (existing.file_path) {
    await supabase.storage.from("fonts").remove([existing.file_path]);
  }

  return NextResponse.json({ ok: true });
}
