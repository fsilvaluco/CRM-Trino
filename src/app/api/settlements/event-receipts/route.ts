import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissionsForMany, canViewEventCosts } from "@/lib/project-roles";

// GET /api/settlements/event-receipts?projectId=xxx -- "carpeta" con los
// comprobantes que YA existen por evento (cierre de caja + comprobante de
// transferencia del reparto de ganancias), para verlos junto a las
// liquidaciones nuevas en un solo lugar (pantalla Comprobantes). No crea
// datos nuevos: solo lee `shows` y arma URLs firmadas para lo que ya se
// subió desde el módulo Eventos.
export async function GET(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (projectId && !allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  if (!projectId && allowedProjectIds.length === 0) {
    return NextResponse.json([]);
  }

  let query = supabase
    .from("shows")
    .select(
      "id, name, venue, date, project_id, cost_sheet_closing_file_path, cost_sheet_closing_file_name, cost_sheet_closed_at, profit_split_transfer_proof_url, profit_split_transferred_at, profit_split_project_pct, profit_split_trino_pct"
    )
    .eq("organization_id", orgId!)
    .or("cost_sheet_closing_file_path.not.is.null,profit_split_transfer_proof_url.not.is.null")
    .order("date", { ascending: false });

  query = projectId ? query.eq("project_id", projectId) : query.in("project_id", allowedProjectIds);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const allRows = data ?? [];
  const permsByProject = await getProjectPermissionsForMany(supabase, user!.id, allRows.map((r) => r.project_id));
  const rows = allRows.filter((r) => canViewEventCosts(permsByProject.get(r.project_id) ?? null));

  // Paths/URLs crudos del bucket "finances" -- el cliente los resuelve con
  // SignedFileLink (mismo patrón que el resto de Finanzas), nunca se firma
  // acá del lado del servidor.
  const mapped = rows.map((row) => ({
    showId: row.id,
    name: row.name ?? row.venue,
    date: row.date,
    projectId: row.project_id,
    closingFilePath: row.cost_sheet_closing_file_path ?? null,
    closingFileName: row.cost_sheet_closing_file_name ?? null,
    closingFiledAt: row.cost_sheet_closed_at ?? null,
    transferProofPath: row.profit_split_transfer_proof_url ?? null,
    transferredAt: row.profit_split_transferred_at ?? null,
    projectPct: row.profit_split_project_pct ?? null,
    trinoPct: row.profit_split_trino_pct ?? null,
  }));

  return NextResponse.json(mapped);
}
