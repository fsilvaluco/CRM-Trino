import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/preescuchas";
import { loadPreescuchaForLinks } from "@/lib/preescucha-links-server";

// PATCH /api/preescuchas/[id]/links/[linkId]  { revoked: boolean }
// Revoca un enlace individual (deja de funcionar de inmediato, sin afectar
// a los demas) o lo vuelve a activar. La actividad registrada se conserva.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params;
  const { supabase, preescucha, error } = await loadPreescuchaForLinks(id);
  if (error || !preescucha) return error!;
  if (!isUuid(linkId)) return NextResponse.json({ error: "Enlace no encontrado" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  if (typeof body?.revoked !== "boolean") {
    return NextResponse.json({ error: "revoked debe ser true o false" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("preescucha_links")
    .update({ revoked_at: body.revoked ? new Date().toISOString() : null })
    .eq("id", linkId)
    .eq("preescucha_id", id)
    .select("id")
    .maybeSingle();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Enlace no encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/preescuchas/[id]/links/[linkId] -- elimina el enlace. Su
// actividad pasada no se borra: queda contada en el enlace general.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params;
  const { supabase, preescucha, error } = await loadPreescuchaForLinks(id);
  if (error || !preescucha) return error!;
  if (!isUuid(linkId)) return NextResponse.json({ error: "Enlace no encontrado" }, { status: 404 });

  const { error: dbError } = await supabase.from("preescucha_links").delete().eq("id", linkId).eq("preescucha_id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
