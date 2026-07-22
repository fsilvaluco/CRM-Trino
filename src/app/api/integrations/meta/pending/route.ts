import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  const { data, error: fetchError } = await supabase
    .from("meta_pending_connections")
    .select("id, candidates, created_at")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .maybeSingle();

  if (fetchError || !data) {
    return NextResponse.json({ error: "No encontrado o expirado" }, { status: 404 });
  }

  // Vencido a los 10 minutos: evita que un link viejo reviva tokens stale.
  const ageMs = Date.now() - new Date(data.created_at).getTime();
  if (ageMs > 10 * 60 * 1000) {
    await supabase.from("meta_pending_connections").delete().eq("id", id);
    return NextResponse.json({ error: "El enlace expiró, vuelve a conectar" }, { status: 410 });
  }

  interface Candidate {
    pageId: string;
    pageName: string;
    igUserId: string;
    igUsername: string;
  }

  // No devolvemos los access_token al cliente — solo lo necesario para
  // que el usuario elija visualmente.
  const candidates = (data.candidates as (Candidate & Record<string, unknown>)[]).map((c) => ({
    pageId: c.pageId,
    pageName: c.pageName,
    igUserId: c.igUserId,
    igUsername: c.igUsername,
  }));

  return NextResponse.json({ id: data.id, candidates });
}
