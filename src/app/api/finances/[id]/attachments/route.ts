import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// POST /api/finances/[id]/attachments -- agrega un comprobante a una
// transacción SIN reemplazar los que ya tenía (una línea de presupuesto
// se puede pagar en 2+ cuotas, cada una con su propio comprobante).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { filePath, fileName } = body as { filePath?: string; fileName?: string | null };

  if (!filePath) return NextResponse.json({ error: "Falta filePath" }, { status: 400 });

  // Confirma que la transacción existe y pertenece a la organización.
  const { data: tx } = await supabase
    .from("transactions")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .single();
  if (!tx) return NextResponse.json({ error: "Transacción no encontrada" }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from("transaction_attachments")
    .insert({
      transaction_id: id,
      organization_id: orgId,
      file_path: filePath,
      file_name: fileName ?? null,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ id: data.id, filePath: data.file_path, fileName: data.file_name, createdAt: data.created_at }, { status: 201 });
}
