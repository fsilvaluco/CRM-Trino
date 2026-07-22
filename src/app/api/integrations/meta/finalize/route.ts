import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { finalizeMetaConnection, type MetaAccountCandidate } from "@/lib/meta-connect";

export async function POST(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const pendingId = (body as { pendingId?: string })?.pendingId;
  const igUserId = (body as { igUserId?: string })?.igUserId;

  if (!pendingId || !igUserId) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  const { data: pending, error: fetchError } = await supabase
    .from("meta_pending_connections")
    .select("id, project_id, candidates")
    .eq("id", pendingId)
    .eq("organization_id", orgId!)
    .maybeSingle();

  if (fetchError || !pending) {
    return NextResponse.json({ error: "No encontrado o expirado" }, { status: 404 });
  }

  const candidates = pending.candidates as (MetaAccountCandidate & { tokenExpiresIn: number })[];
  const chosen = candidates.find((c) => c.igUserId === igUserId);

  if (!chosen) {
    return NextResponse.json({ error: "Cuenta no encontrada entre las opciones" }, { status: 400 });
  }

  const result = await finalizeMetaConnection(
    supabase,
    orgId!,
    pending.project_id,
    chosen,
    chosen.tokenExpiresIn ?? 60 * 24 * 60 * 60
  );

  await supabase.from("meta_pending_connections").delete().eq("id", pendingId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, accountName: chosen.igUsername });
}
