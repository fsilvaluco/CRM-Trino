import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4000;
const MAX_EVENTS = 40;

interface BeaconEvent {
  m: string;
  t: number;
}

interface BeaconResult {
  events: BeaconEvent[];
  hidden: boolean;
  outcome: string | null;
  elapsed: number | null;
  ua: string | null;
  ref: string | null;
  received_at: string;
}

function clampStr(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.slice(0, max) : null;
}

// Solo se aceptan las claves conocidas, con tamaño acotado -- lo que llega
// es del navegador del visitante (anónimo), nunca se guarda tal cual.
function sanitize(raw: unknown): BeaconResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const events: BeaconEvent[] = [];
  if (Array.isArray(r.events)) {
    for (const e of r.events.slice(0, MAX_EVENTS)) {
      if (!e || typeof e !== "object") continue;
      const m = clampStr((e as Record<string, unknown>).m, 40);
      const t = (e as Record<string, unknown>).t;
      if (m && typeof t === "number" && Number.isFinite(t)) events.push({ m, t: Math.round(t) });
    }
  }
  return {
    events,
    hidden: r.hidden === true,
    outcome: clampStr(r.outcome, 32),
    elapsed: typeof r.elapsed === "number" && Number.isFinite(r.elapsed) ? Math.round(r.elapsed) : null,
    ua: clampStr(r.ua, 200),
    ref: clampStr(r.ref, 200),
    received_at: new Date().toISOString(),
  };
}

// POST /api/q/beacon -- endpoint PÚBLICO (sin login), lo llama la página
// intermedia de /q/[slug] vía navigator.sendBeacon para reportar qué pasó
// al intentar abrir la app nativa (ver renderAppOpenHtml). Llega como
// text/plain (tipo "simple" para CORS, sin preflight) con JSON adentro.
// Solo puede escribir app_open_result de una fila de qr_scans cuyo uuid
// conozca -- ese id se genera por visita y nunca se lista públicamente.
// La página manda el estado completo cada vez, así que el último reporte
// gana (contiene todo lo anterior).
export async function POST(request: NextRequest) {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!text || text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 400 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object") return new NextResponse(null, { status: 400 });

  const { scanId, result } = parsed as { scanId?: unknown; result?: unknown };
  if (typeof scanId !== "string" || !UUID_RE.test(scanId)) return new NextResponse(null, { status: 400 });

  const clean = sanitize(result);
  if (!clean) return new NextResponse(null, { status: 400 });

  const supabase = createAdminClient();

  // Carrera real: la página manda su primer reporte a los pocos ms de
  // cargar, y la fila de qr_scans se inserta en un after() que corre
  // DESPUÉS de mandar la respuesta -- el primer beacon puede llegar antes
  // de que exista la fila. Si el update no matchea nada, se reintenta una
  // vez tras una pausa corta; si la app se abrió al instante, ese primer
  // beacon puede ser el único que llegue.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from("qr_scans")
      .update({ app_open_result: clean })
      .eq("id", scanId)
      .select("id");
    if (error) {
      console.error("[qr/beacon] no se pudo guardar app_open_result:", error.message);
      return new NextResponse(null, { status: 500 });
    }
    if (data && data.length > 0) return new NextResponse(null, { status: 204 });
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }

  // Fila inexistente (id inventado o insert que falló) -- no es un error
  // del cliente que valga la pena distinguir; 204 igual, no hay nada que
  // reintentar del lado del navegador.
  return new NextResponse(null, { status: 204 });
}
