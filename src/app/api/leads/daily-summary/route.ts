import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { canViewDeals, getProjectPermissions } from "@/lib/project-roles";
import { LEAD_FORMS } from "@/lib/leads/forms";
import { buildSisoyDailySummary, runSisoyDailySummary } from "@/lib/leads/daily-summary";

// GET: vista previa del resumen diario de SiSoy (mismo texto que llega a
// Telegram). POST: lo envia ahora a Telegram. Requiere sesion con acceso a
// los deals del proyecto SiSoy.
const SISOY_PROJECT_ID = LEAD_FORMS["sisoy-podcast"].projectId;

async function authorize() {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;
  if (!allowedProjectIds?.includes(SISOY_PROJECT_ID)) {
    return NextResponse.json({ error: "Sin acceso al proyecto SiSoy" }, { status: 403 });
  }
  const perm = await getProjectPermissions(supabase, user!.id, SISOY_PROJECT_ID);
  if (!canViewDeals(perm)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await authorize();
  if (denied) return denied;
  const text = await buildSisoyDailySummary();
  return new NextResponse(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function POST() {
  const denied = await authorize();
  if (denied) return denied;
  return NextResponse.json(await runSisoyDailySummary());
}
