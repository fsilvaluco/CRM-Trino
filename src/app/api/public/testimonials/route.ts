import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getTestimonialSite, isAllowedTestimonialOrigin, testimonialSiteForOrigin } from "@/lib/testimonials/config";
import { corsHeaders, jsonCors } from "@/lib/testimonials/http";
import { listApprovedTestimonials } from "@/lib/testimonials/service";

// GET /api/public/testimonials?site=sisoy -- testimonios aprobados para
// mostrar en el sitio (maximo 50, los mas recientes primero). Solo campos
// publicos: nunca correo, IP ni hashes. Cacheable en CDN por 60 s.
// Sin Origin (fetch desde el servidor del sitio) tambien responde; con un
// Origin que no es del sitio se rechaza.

const METHODS = "GET, OPTIONS";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!testimonialSiteForOrigin(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin, METHODS) });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const site = getTestimonialSite(request.nextUrl.searchParams.get("site"));
  if (!site) return jsonCors({ ok: false, error: "Sitio desconocido" }, 404, null, METHODS);
  if (origin && !isAllowedTestimonialOrigin(site, origin)) {
    return jsonCors({ ok: false, error: "Origen no permitido" }, 403, null, METHODS);
  }

  try {
    const testimonials = await listApprovedTestimonials(createAdminClient(), site);
    return jsonCors({ ok: true, testimonials }, 200, origin, METHODS, {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    });
  } catch (err) {
    console.error("[testimonials/list]", err instanceof Error ? err.message : err);
    return jsonCors({ ok: false, error: "No pudimos cargar los testimonios." }, 500, origin, METHODS);
  }
}
