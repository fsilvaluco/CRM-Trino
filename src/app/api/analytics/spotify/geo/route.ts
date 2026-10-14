import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import type { SpotifyGeoSnapshot } from "@/types/analytics";

// Solo lectura: los cortes los carga la revisión semanal (migración 109).
//
// Dos modos, para no chocar con el límite de 1.000 filas de Supabase a medida
// que se acumulan cortes semanales:
// - ?projectId=…[&periodEnd=AAAA-MM-DD] → lista de cortes + filas del corte
//   pedido (o el último) y del corte anterior.
// - ?projectId=…&countries=Chile,México → serie de oyentes de esos países en
//   todos los cortes (para el gráfico de evolución).

const SELECT = "period_start, period_end, scope, country, city, region, rank, listeners, active_listeners";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): SpotifyGeoSnapshot {
  return {
    periodStart: row.period_start,
    periodEnd: row.period_end,
    scope: row.scope,
    country: row.country,
    city: row.city ?? "",
    region: row.region,
    rank: row.rank,
    listeners: row.listeners,
    activeListeners: row.active_listeners,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });

  const countriesParam = searchParams.get("countries");
  if (countriesParam != null) {
    const countries = countriesParam.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 8);
    if (countries.length === 0) return NextResponse.json({ series: [] });
    const { data, error: dbError } = await supabase
      .from("spotify_geo_snapshots")
      .select(SELECT)
      .eq("organization_id", orgId!)
      .eq("project_id", projectId)
      .eq("scope", "country")
      .in("country", countries)
      .order("period_end", { ascending: true })
      .range(0, 999);
    if (dbError) return NextResponse.json({ error: "No se pudo leer la evolución por país" }, { status: 500 });
    return NextResponse.json({ series: (data ?? []).map(mapRow) });
  }

  // Un corte = un period_end. Se toman de las filas de país (≤ ~200 por corte).
  const { data: cutRows, error: cutsError } = await supabase
    .from("spotify_geo_snapshots")
    .select("period_end")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .eq("scope", "country")
    .eq("country", "Chile")
    .order("period_end", { ascending: false })
    .range(0, 999);
  if (cutsError) return NextResponse.json({ error: "No se pudieron listar los cortes" }, { status: 500 });

  let cuts = [...new Set((cutRows ?? []).map((r) => r.period_end as string))];
  if (cuts.length === 0) {
    // Artistas sin oyentes en Chile: fallback a cualquier país.
    const { data: anyRows } = await supabase
      .from("spotify_geo_snapshots")
      .select("period_end")
      .eq("organization_id", orgId!)
      .eq("project_id", projectId)
      .eq("scope", "country")
      .eq("rank", 1)
      .order("period_end", { ascending: false })
      .range(0, 999);
    cuts = [...new Set((anyRows ?? []).map((r) => r.period_end as string))];
  }
  if (cuts.length === 0) return NextResponse.json({ cuts: [], current: [], previous: [] });

  const requested = searchParams.get("periodEnd");
  const idx = requested && cuts.includes(requested) ? cuts.indexOf(requested) : 0;
  const currentEnd = cuts[idx];
  const previousEnd = cuts[idx + 1] ?? null;

  const ends = previousEnd ? [currentEnd, previousEnd] : [currentEnd];
  const { data, error: dbError } = await supabase
    .from("spotify_geo_snapshots")
    .select(SELECT)
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .in("period_end", ends)
    .range(0, 1999);
  if (dbError) return NextResponse.json({ error: "No se pudieron leer los países y ciudades" }, { status: 500 });

  const rows = (data ?? []).map(mapRow);
  return NextResponse.json({
    cuts,
    current: rows.filter((r) => r.periodEnd === currentEnd),
    previous: rows.filter((r) => r.periodEnd === previousEnd),
  });
}
