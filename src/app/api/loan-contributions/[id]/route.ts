import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canDeleteModule } from "@/lib/project-roles";

// DELETE /api/loan-contributions/[id] -- por si se cargó un aporte por error.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: contribution } = await supabase.from("loan_contributions").select("id, project_id").eq("id", id).single();
  if (!contribution) return NextResponse.json({ error: "Aporte no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(contribution.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  // Préstamos/aportes pertenecen al módulo Finanzas (ROLES.md 0.2.5): se
  // exige `finanzas.puede_eliminar`, igual que /api/finances/[id].
  const perm = await getProjectPermissions(supabase, user!.id, contribution.project_id);
  if (!canDeleteModule(perm, "finanzas")) {
    return NextResponse.json({ error: "Tu rol no puede eliminar aportes en este proyecto" }, { status: 403 });
  }

  const { error: dbError } = await supabase.from("loan_contributions").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
