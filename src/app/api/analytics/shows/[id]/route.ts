import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { type Show, type ShowRating } from "@/types/analytics";

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
): number | null {
  if (fee === null && ticketIncome === null && expenses === null) return null;
  return (fee ?? 0) + (ticketIncome ?? 0) - (expenses ?? 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapShow(row: any): Show {
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
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRating(row: any): ShowRating {
  return {
    id: row.id,
    showId: row.show_id,
    musicianName: row.musician_name,
    vibe: row.vibe ?? null,
    audienceSang: row.audience_sang ?? null,
    monitorQuality: row.monitor_quality ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .single();

  if (showErr || !show) {
    return errorResponse("Show no encontrado", 404);
  }

  const { data: ratings, error: ratingsErr } = await supabase
    .from("show_ratings")
    .select("*")
    .eq("show_id", id)
    .order("created_at", { ascending: true });

  if (ratingsErr) {
    return errorResponse("No se pudieron obtener las valoraciones del show", 500, ratingsErr.message);
  }

  const ratingsList = (ratings ?? []).map(mapRating);
  const vibes = ratingsList.filter((r) => r.vibe !== null).map((r) => r.vibe as number);
  const avgVibe = vibes.length > 0 ? vibes.reduce((a, b) => a + b, 0) / vibes.length : undefined;

  return NextResponse.json({
    show: { ...mapShow(show), avgVibe },
    ratings: ratingsList,
  });
}
