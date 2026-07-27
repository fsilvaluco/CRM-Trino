import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { runLeadDetectionForConnection } from "@/lib/lead-detector";

export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, user, isAdmin, error } = await requireAuth();
  if (error) return error;

  const { data: connection, error: findErr } = await supabase
    .from("gmail_connections")
    .select("id, connected_by, organization_id")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .single();

  if (findErr || !connection) {
    return NextResponse.json({ error: "Conexion no encontrada" }, { status: 404 });
  }

  if (connection.connected_by !== user!.id && !isAdmin) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let forceLookbackDays: number | undefined;
  try {
    const body = await _request.json();
    if (typeof body?.days === "number" && body.days > 0) {
      forceLookbackDays = Math.min(body.days, 90); // tope de seguridad
    }
  } catch {
    // sin body -- comportamiento normal (incremental)
  }

  const result = await runLeadDetectionForConnection(id, { forceLookbackDays });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}
