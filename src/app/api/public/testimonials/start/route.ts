import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getClientIp } from "@/lib/client-ip";
import { getTestimonialSite, isAllowedTestimonialOrigin, testimonialSiteForOrigin } from "@/lib/testimonials/config";
import { jsonCors, corsHeaders } from "@/lib/testimonials/http";
import { startSchema } from "@/lib/testimonials/schema";
import { startTestimonial } from "@/lib/testimonials/service";

// POST /api/public/testimonials/start -- recibe el testimonio desde el
// formulario publico (sisoy.pro/experiencia). Segun site.requireEmailCode:
//  - true: lo guarda como pending_code y manda un codigo de 6 digitos al
//    correo (se confirma en /verify). Responde { ok, id, verified: false }.
//  - false (SiSoy): lo guarda verificado directo y avisa al equipo con los
//    links aprobar/rechazar. Responde { ok, id, verified: true }.
// En ambos casos nada se publica sin moderacion. Lo protegen: Origin
// permitido por sitio, rate limit estricto por IP (middleware.ts), honeypot y
// maximo 3 solicitudes por correo por hora.

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!testimonialSiteForOrigin(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin, "POST, OPTIONS") });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const preflightOk = testimonialSiteForOrigin(origin) ? origin : null;

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return jsonCors({ ok: false, error: "JSON invalido" }, 400, preflightOk);
  }
  if (!raw || typeof raw !== "object") return jsonCors({ ok: false, error: "JSON invalido" }, 400, preflightOk);

  const site = getTestimonialSite(raw.site);
  if (!site) return jsonCors({ ok: false, error: "Sitio desconocido" }, 404, null);
  if (!isAllowedTestimonialOrigin(site, origin)) return jsonCors({ ok: false, error: "Origen no permitido" }, 403, null);

  const parsed = startSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonCors({ ok: false, error: "Datos invalidos", details: parsed.error.flatten().fieldErrors }, 400, origin);
  }
  const input = parsed.data;

  // Honeypot: se responde igual que un envio real para no darle pistas al bot.
  if (input.website) return jsonCors({ ok: true, id: randomUUID(), verified: !site.requireEmailCode }, 200, origin);

  const ip = getClientIp(request);
  try {
    const result = await startTestimonial(createAdminClient(), site, input, {
      ip: ip === "unknown" ? null : ip,
      userAgent: request.headers.get("user-agent"),
    });
    if (!result.ok) return jsonCors({ ok: false, error: result.error }, result.status, origin);
    return jsonCors({ ok: true, id: result.id, verified: result.verified }, 201, origin);
  } catch (err) {
    console.error("[testimonials/start]", err instanceof Error ? err.message : err);
    return jsonCors({ ok: false, error: "No pudimos registrar tu testimonio. Intenta de nuevo." }, 500, origin);
  }
}
