import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canEditEventCosts } from "@/lib/project-roles";
import { dbErrorResponse } from "@/lib/api-errors";

// DELETE /api/eventos/[id]/external-signers/[signerId] -- anula un link que
// todavía no se firmó (se mandó al correo equivocado, se filtró, ya no
// corresponde). No borra la fila: marca `revoked_at`, para que quede el
// rastro de que el link existió. Un link ya firmado no se puede tocar --
// la firma es irreversible, igual que las internas.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; signerId: string }> }
) {
  const { id, signerId } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase.from("shows").select("id, project_id").eq("id", id).single();
  if (!show) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  if (!show.project_id || !allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const perm = await getProjectPermissions(supabase, user!.id, show.project_id);
  if (!canEditEventCosts(perm)) {
    return NextResponse.json({ error: "Tu rol no puede anular firmas de este evento" }, { status: 403 });
  }

  const { data: signer } = await supabase
    .from("event_external_signers")
    .select("id, signed_at, revoked_at")
    .eq("id", signerId)
    .eq("show_id", id)
    .single();

  if (!signer) return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
  if (signer.signed_at) {
    return NextResponse.json({ error: "Ese link ya se firmó -- una firma no se puede anular" }, { status: 409 });
  }
  if (signer.revoked_at) return NextResponse.json({ ok: true });

  const { error: updateError } = await supabase
    .from("event_external_signers")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", signerId);

  if (updateError) return dbErrorResponse("external-signers:DELETE", updateError);

  return NextResponse.json({ ok: true });
}
