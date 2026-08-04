import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { type Show } from "@/types/analytics";

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: { message, details: details ?? null } },
    { status }
  );
}

function computeUtility(
  fee: number | null,
  ticketIncome: number | null,
  expenses: number | null
): number {
  return (fee ?? 0) + (ticketIncome ?? 0) - (expenses ?? 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapShow(row: any): Show {
  const avgVibeRaw = row.show_ratings?.length
    ? row.show_ratings.reduce((sum: number, r: { vibe: number | null }) => sum + (r.vibe ?? 0), 0) /
      row.show_ratings.filter((r: { vibe: number | null }) => r.vibe !== null).length
    : undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    date: row.date,
    venue: row.venue,
    city: row.city ?? null,
    fee: row.fee ?? null,
    ticketIncome: row.ticket_income ?? null,
    expenses: row.expenses ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    utility: computeUtility(row.fee ?? null, row.ticket_income ?? null, row.expenses ?? null),
    avgVibe: Number.isFinite(avgVibeRaw) ? avgVibeRaw : undefined,
  };
}

// GET /api/analytics/eventos -- dashboard financiero de SOLO LECTURA para
// Métricas. Crear/editar eventos (logística + plata) se hace desde
// /api/eventos -- este endpoint no tiene POST a propósito, para que no
// se puedan seguir creando eventos "livianos" sin estado/dirección desde
// Métricas como pasaba antes.
//
// Filtra a status="realizado": un evento cotizando o cancelado no debe
// contarse en la utilidad real -- antes se contaban todos, sin filtrar.
export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const isAllProjects = searchParams.get("isAllProjects") === "true";

  let query = supabase
    .from("shows")
    .select("*, show_ratings(vibe)")
    .eq("organization_id", orgId!)
    .eq("status", "realizado")
    .order("date", { ascending: false });

  if (!isAllProjects && projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return errorResponse("No se pudieron listar los eventos", 500, dbError.message);
  }

  return NextResponse.json((data ?? []).map(mapShow));
}
