import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getTestimonialsAccess } from "@/lib/testimonials/app-access";

// GET /api/testimonials?projectId=... -- testimonios del proyecto activo
// para la seccion Testimonios (Herramientas). Ver app-access.ts para el
// chequeo de acceso. El correo solo viaja si la persona puede moderar.

const LIST_LIMIT = 500;

interface TestimonialRow {
  id: string;
  name: string;
  email: string;
  rating: number;
  body: string;
  relation: string | null;
  status: string;
  created_at: string;
  verified_at: string | null;
  approved_at: string | null;
}

export async function GET(request: NextRequest) {
  const access = await getTestimonialsAccess(request.nextUrl.searchParams.get("projectId"));
  if (!access.ok) return access.response;

  const { data, error } = await createAdminClient()
    .from("testimonials")
    .select("id, name, email, rating, body, relation, status, created_at, verified_at, approved_at")
    .eq("project_id", access.projectId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("[api/testimonials] list", error.message);
    return NextResponse.json({ error: "No se pudieron cargar los testimonios" }, { status: 500 });
  }

  const items = ((data ?? []) as TestimonialRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    email: access.canModerate ? r.email : null,
    rating: r.rating,
    body: r.body,
    relation: r.relation,
    status: r.status,
    createdAt: r.created_at,
    verifiedAt: r.verified_at,
    approvedAt: r.approved_at,
  }));

  return NextResponse.json({ canModerate: access.canModerate, brandName: access.site.brandName, items });
}
