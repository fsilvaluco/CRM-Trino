import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createShowSchema, type Show } from "@/types/analytics";

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
    .order("date", { ascending: false });

  if (!isAllProjects && projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return errorResponse("No se pudieron listar los shows", 500, dbError.message);
  }

  return NextResponse.json((data ?? []).map(mapShow));
}

export async function POST(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = createShowSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Payload invalido", 400, parsed.error.flatten());
  }

  const { projectId, date, venue, city, fee, ticketIncome, expenses, notes } = parsed.data;

  const { data, error: dbError } = await supabase
    .from("shows")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      date,
      venue,
      city: city ?? null,
      fee: fee ?? 0,
      ticket_income: ticketIncome ?? 0,
      expenses: expenses ?? 0,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return errorResponse("No se pudo crear el show", 500, {
      code: dbError.code,
      message: dbError.message,
      details: dbError.details,
      hint: dbError.hint,
    });
  }

  if (!data) {
    return errorResponse("No se pudo crear el show", 500, { message: "No se recibió respuesta de la base de datos" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json(mapShow(data as any), { status: 201 });
}
