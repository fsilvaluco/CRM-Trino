import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRule(row: any) {
  return {
    id: row.id,
    pattern: row.pattern,
    targetProjectId: row.target_project_id,
    targetProjectName: row.projects?.name ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

export async function GET() {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("email_alias_rules")
    .select("*, projects(name)")
    .eq("organization_id", orgId!)
    .order("created_at", { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapRule));
}

export async function POST(request: NextRequest) {
  const { supabase, orgId, user, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  let body: { pattern?: string; targetProjectId?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const pattern = body.pattern?.trim().toLowerCase();
  const targetProjectId = body.targetProjectId;

  if (!pattern) {
    return NextResponse.json({ error: "El patron es requerido (ej: @sisoy.cl)" }, { status: 400 });
  }
  if (!targetProjectId) {
    return NextResponse.json({ error: "Selecciona el proyecto destino" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("email_alias_rules")
    .insert({
      organization_id: orgId,
      pattern,
      target_project_id: targetProjectId,
      notes: body.notes || null,
      created_by: user!.id,
    })
    .select("*, projects(name)")
    .single();

  if (dbError) {
    if (dbError.message.includes("duplicate") || dbError.message.includes("unique")) {
      return NextResponse.json({ error: "Ya existe una regla con ese patron" }, { status: 409 });
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(mapRule(data), { status: 201 });
}
