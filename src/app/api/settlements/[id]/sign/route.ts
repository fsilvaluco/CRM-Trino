import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewModule } from "@/lib/project-roles";
import { getClientIp } from "@/lib/client-ip";

// POST /api/settlements/[id]/sign -- aprobación simple (mismo espíritu que
// el cierre de caja de eventos, ver event_closing_signatures). Si la
// liquidación tiene firmantes elegidos a mano (required_signer_ids, ver
// migración 088), SOLO ellos pueden firmar -- si no eligieron a nadie
// (liquidaciones viejas, o quien la creó no marcó firmantes), cae al
// criterio general: cualquiera que vea Finanzas en el proyecto.
// Irreversible -- no hay endpoint de "des-firmar".
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: settlement, error: findErr } = await supabase
    .from("settlements")
    .select("id, project_id, required_signer_ids")
    .eq("id", id)
    .single();

  if (findErr || !settlement) {
    return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 });
  }
  if (!allowedProjectIds.includes(settlement.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const requiredSignerIds: string[] = settlement.required_signer_ids ?? [];
  if (requiredSignerIds.length > 0) {
    if (!requiredSignerIds.includes(user!.id)) {
      return NextResponse.json({ error: "No estás en la lista de firmantes de esta liquidación" }, { status: 403 });
    }
  } else {
    const perm = await getProjectPermissions(supabase, user!.id, settlement.project_id);
    if (!canViewModule(perm, "finanzas")) {
      return NextResponse.json({ error: "Tu rol no puede firmar liquidaciones en este proyecto" }, { status: 403 });
    }
  }

  const { error: insertError } = await supabase
    .from("settlement_signatures")
    .insert({ settlement_id: id, user_id: user!.id, ip_address: getClientIp(request) });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Ya habías firmado esta liquidación" }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
