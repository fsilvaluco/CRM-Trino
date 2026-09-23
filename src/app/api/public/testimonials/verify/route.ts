import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getTestimonialSite, isAllowedTestimonialOrigin, testimonialSiteForOrigin } from "@/lib/testimonials/config";
import { jsonCors, corsHeaders } from "@/lib/testimonials/http";
import { verifySchema } from "@/lib/testimonials/schema";
import { verifyTestimonial } from "@/lib/testimonials/service";

// POST /api/public/testimonials/verify -- confirma el codigo de 6 digitos.
// Maximo 5 intentos por codigo; si calza, el testimonio queda "verified" y
// se manda a los admins del sitio con los links para aprobar o rechazar.

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

  const parsed = verifySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonCors({ ok: false, error: "Datos invalidos", details: parsed.error.flatten().fieldErrors }, 400, origin);
  }

  try {
    const result = await verifyTestimonial(createAdminClient(), site, parsed.data);
    if (!result.ok) return jsonCors({ ok: false, error: result.error, ...result.extra }, result.status, origin);
    return jsonCors({ ok: true }, 200, origin);
  } catch (err) {
    console.error("[testimonials/verify]", err instanceof Error ? err.message : err);
    return jsonCors({ ok: false, error: "No pudimos verificar el codigo. Intenta de nuevo." }, 500, origin);
  }
}
