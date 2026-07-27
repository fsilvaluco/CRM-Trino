import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, user, isAdmin, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("gmail_connections")
    .select("id, connected_by, refresh_token, organization_id")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Conexion no encontrada" }, { status: 404 });
  }

  // Solo quien la conecto, o un admin, puede desconectarla.
  if (existing.connected_by !== user!.id && !isAdmin) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  // Revocar en Google -- best effort, no bloquea el borrado si falla.
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${existing.refresh_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // ignorar: si Google no responde, igual quitamos la conexion local
  }

  const { error: dbError } = await supabase.from("gmail_connections").delete().eq("id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
