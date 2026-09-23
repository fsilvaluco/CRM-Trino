import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { LEAD_FORMS, formForOrigin, isAllowedOrigin } from "@/lib/leads/forms";

// GET /api/public/promo/[form] -- cupos reales de la promo que muestra la
// landing (ej. sisoy.pro/podcast). Publico y de solo lectura: devuelve un
// conteo, nunca datos de tratos. remaining = max(0, startRemaining - G), con
// G = tratos del proyecto (no borrados) en una etapa ganada y creados desde
// promo.countSince. Cacheable 60 s en CDN.

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!formForOrigin(origin)) return new NextResponse(null, { status: 403, headers: { Vary: "Origin" } });
  return new NextResponse(null, { status: 204, headers: { ...corsHeaders(origin), Vary: "Origin" } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ form: string }> }) {
  const { form: formKey } = await params;
  const origin = request.headers.get("origin");
  const form = Object.hasOwn(LEAD_FORMS, formKey) ? LEAD_FORMS[formKey] : undefined;
  const promo = form?.promo;
  if (!form || !promo) {
    return NextResponse.json({ error: "Promo no encontrada" }, { status: 404, headers: { Vary: "Origin" } });
  }
  // Sin Origin (curl, SSR) se responde igual pero sin CORS; un Origin ajeno se rechaza.
  if (origin && !isAllowedOrigin(form, origin)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: { Vary: "Origin" } });
  }
  const cors = isAllowedOrigin(form, origin) ? corsHeaders(origin) : {};

  try {
    const db = createAdminClient();
    const { data: project, error: projectErr } = await db
      .from("projects")
      .select("organization_id")
      .eq("id", form.projectId)
      .single();
    if (projectErr || !project) throw new Error(`Proyecto no encontrado: ${projectErr?.message ?? ""}`);

    const { data: wonStages, error: stagesErr } = await db
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", project.organization_id)
      .eq("is_won", true);
    if (stagesErr) throw new Error(stagesErr.message);

    let won = 0;
    const wonIds = (wonStages ?? []).map((s) => s.id as string);
    if (wonIds.length) {
      const { count, error: countErr } = await db
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("project_id", form.projectId)
        .is("deleted_at", null)
        .in("stage_id", wonIds)
        .gte("created_at", new Date(promo.countSince).toISOString());
      if (countErr) throw new Error(countErr.message);
      won = count ?? 0;
    }

    const remaining = Math.max(0, Math.min(promo.total, promo.startRemaining - won));
    return NextResponse.json(
      {
        total: promo.total,
        remaining,
        deadline: promo.deadline,
        discountLabel: promo.discountLabel,
        headline: promo.headline,
      },
      { headers: { ...cors, Vary: "Origin", "Cache-Control": "public, s-maxage=60" } }
    );
  } catch (err) {
    console.error("[public/promo]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "No se pudo calcular la promo" },
      { status: 500, headers: { ...cors, Vary: "Origin", "Cache-Control": "no-store" } }
    );
  }
}
