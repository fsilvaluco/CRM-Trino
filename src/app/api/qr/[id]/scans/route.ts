import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// GET /api/qr/[id]/scans -- historial de escaneos de un QR: lista cruda
// (para el log de fecha/hora) + un conteo agrupado por día (para el
// gráfico de actividad). Mismo chequeo de acceso por proyecto que
// PUT/DELETE en /api/qr/[id].
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: qr } = await supabase.from("qr_codes").select("project_id").eq("id", id).single();
  if (!qr) return NextResponse.json({ error: "QR no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(qr.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este QR" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("qr_scans")
    .select("scanned_at")
    .eq("qr_id", id)
    .order("scanned_at", { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const scans = (data ?? []).map((s) => s.scanned_at as string);

  // Agrupado por día (fecha local del navegador la calcula el cliente --
  // acá se manda la fecha ISO cruda y se agrupa en el front, para no
  // asumir una zona horaria del lado del servidor).
  return NextResponse.json({ scans });
}
