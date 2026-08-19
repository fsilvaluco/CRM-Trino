import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// DELETE /api/finances/[id]/attachments/[attachmentId] -- quita un
// comprobante puntual sin tocar los demás ni la transacción.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { id, attachmentId } = await params;

  const { error: dbError } = await supabase
    .from("transaction_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("transaction_id", id)
    .eq("organization_id", orgId!);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
