import { NextRequest, NextResponse } from "next/server";
import { dbErrorResponse } from "@/lib/api-errors";
import { loadSettlementForTeam } from "@/lib/settlement-access";

// DELETE /api/settlements/[id]/external-signers/[signerId] -- anula un link
// que todavía no se firmó. Marca `revoked_at` (no borra la fila) para que
// quede el rastro de que existió. Una firma ya hecha no se anula.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; signerId: string }> }
) {
  const { id, signerId } = await params;
  const ctx = await loadSettlementForTeam(id, "editar");
  if (ctx.error) return ctx.error;

  const { data: signer } = await ctx.supabase
    .from("event_external_signers")
    .select("id, signed_at, revoked_at")
    .eq("id", signerId)
    .eq("settlement_id", id)
    .maybeSingle();

  if (!signer) return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
  if (signer.signed_at) {
    return NextResponse.json({ error: "Ese link ya se firmó -- una firma no se puede anular" }, { status: 409 });
  }
  if (signer.revoked_at) return NextResponse.json({ ok: true });

  const { error: updateError } = await ctx.supabase
    .from("event_external_signers")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", signerId);

  if (updateError) return dbErrorResponse("settlement-external-signers:DELETE", updateError);
  return NextResponse.json({ ok: true });
}
