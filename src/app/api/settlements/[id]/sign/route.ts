import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewModule } from "@/lib/project-roles";

// POST /api/settlements/[id]/sign -- aprobación simple (mismo espíritu que
// el cierre de caja de eventos, ver event_closing_signatures): cualquiera
// que vea Finanzas en el proyecto de esta liquidación puede firmar.
// Irreversible -- no hay endpoint de "des-firmar".
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: settlement, error: findErr } = await supabase
    .from("settlements")
    .select("id, project_id")
    .eq("id", id)
    .single();

  if (findErr || !settlement) {
    return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 });
  }
  if (!allowedProjectIds.includes(settlement.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const perm = await getProjectPermissions(supabase, user!.id, settlement.project_id);
  if (!canViewModule(perm, "finanzas")) {
    return NextResponse.json({ error: "Tu rol no puede firmar liquidaciones en este proyecto" }, { status: 403 });
  }

  const { error: insertError } = await supabase
    .from("settlement_signatures")
    .insert({ settlement_id: id, user_id: user!.id });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Ya habías firmado esta liquidación" }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
