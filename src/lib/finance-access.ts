import { NextResponse } from "next/server";
import { getProjectPermissions, canEditModule, canDeleteModule } from "@/lib/project-roles";

// Aislamiento entre proyectos (24 ago 2026 -- estos 3 endpoints no tenían
// NINGÚN chequeo de proyecto ni de rol, solo `organization_id`; ver
// ROLES.md 0.2.5, mismo nivel de urgencia que el bug del 23 ago). Cada uno
// trae primero el `project_id` real de la transacción y valida contra la
// matriz de ESE proyecto antes de tocar nada.
//
// Compartido entre /api/finances/[id] y /api/finances/[id]/attachments/**:
// agregar o quitar un adjunto cuenta como EDITAR el comprobante, así que
// los adjuntos usan action="editar" (finanzas.puede_editar).
export async function checkTransactionAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
  allowedProjectIds: string[],
  transactionId: string,
  action: "editar" | "eliminar"
): Promise<NextResponse | null> {
  const { data: existing, error: findErr } = await supabase
    .from("transactions")
    .select("id, project_id")
    .eq("id", transactionId)
    .eq("organization_id", orgId)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Transacción no encontrada" }, { status: 404 });
  }
  if (!existing.project_id || !allowedProjectIds.includes(existing.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  const perm = await getProjectPermissions(supabase, userId, existing.project_id);
  const allowed = action === "editar" ? canEditModule(perm, "finanzas") : canDeleteModule(perm, "finanzas");
  if (!allowed) {
    return NextResponse.json(
      { error: `Tu rol no puede ${action} movimientos de Finanzas en este proyecto` },
      { status: 403 }
    );
  }
  return null;
}
