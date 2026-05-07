import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// PUT /api/finances/[id] → editar transacción completa
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  // Campos editables
  if (body.type !== undefined) {
    if (!["income", "expense"].includes(body.type)) {
      return NextResponse.json({ error: "type debe ser 'income' o 'expense'" }, { status: 400 });
    }
    updates.type = body.type;
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount debe ser un número positivo" }, { status: 400 });
    }
    updates.amount = Math.round(amount);
  }
  if (body.description !== undefined) {
    updates.description = body.description ?? null;
  }
  if (body.category !== undefined) {
    updates.category = body.category ?? null;
  }
  if (body.transactionDate !== undefined) {
    updates.transaction_date = body.transactionDate ?? null;
  }
  if (body.responsibleUserId !== undefined) {
    updates.responsible_user_id = body.responsibleUserId ?? null;
  }
  if (body.responsibleName !== undefined) {
    updates.responsible_name = body.responsibleName ?? null;
  }
  if (typeof body.reimbursed === "boolean") {
    updates.reimbursed = body.reimbursed;
    updates.reimbursed_at = body.reimbursed ? new Date().toISOString() : null;
  }
  if (body.currency !== undefined) {
    updates.currency = body.currency ?? "CLP";
  }

  // Archivos: solo si hay cambios (no implementamos edición de archivo por ahora)
  // Si el usuario quiere cambiar el archivo, tendrá que crear una nueva transacción

  const { error: dbError } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/finances/[id] → marcar reembolsado (mantener para compatibilidad)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (typeof body.reimbursed === "boolean") {
    updates.reimbursed = body.reimbursed;
    updates.reimbursed_at = body.reimbursed ? new Date().toISOString() : null;
  }
  if (body.transactionDate !== undefined) {
    updates.transaction_date = body.transactionDate ?? null;
  }

  const { error: dbError } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/finances/[id] → soft delete
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const { error: dbError } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
