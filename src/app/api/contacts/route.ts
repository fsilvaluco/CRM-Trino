import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: {
        message,
        details: details ?? null,
      },
    },
    { status }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContact(row: any) {
  const joinedCompanyName = Array.isArray(row.companies)
    ? row.companies[0]?.name ?? null
    : row.companies?.name ?? null;

  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    company: joinedCompanyName,
    companyId: row.company_id ?? null,
    source: row.source,
    temperature: row.temperature,
    score: row.score,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const temperature = searchParams.get("temperature");
  const source = searchParams.get("source");
  const projectId = searchParams.get("projectId");

  let query = supabase
    .from("contacts")
    .select("*, companies(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);
  if (temperature) query = query.eq("temperature", temperature);
  if (source) query = query.eq("source", source);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    );
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return errorResponse("No se pudieron listar los contactos", 500, dbError.message);
  }

  return NextResponse.json((data ?? []).map(mapContact));
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { name, email, phone, companyId, source, temperature, score, notes, projectId } =
    body;

  if (!name || String(name).trim() === "") {
    return errorResponse("El nombre es requerido", 400);
  }

  if (!projectId || String(projectId).trim() === "") {
    return errorResponse("El proyecto es requerido", 400);
  }

  if (!isAdmin && allowedProjectIds && !allowedProjectIds.includes(String(projectId))) {
    return errorResponse("No tienes acceso al proyecto seleccionado", 403);
  }

  if (!companyId || String(companyId).trim() === "") {
    return errorResponse("La empresa es requerida", 400);
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, project_id")
    .eq("id", String(companyId))
    .eq("organization_id", orgId)
    .single();

  if (companyError || !company) {
    return errorResponse("La empresa seleccionada no existe", 400, companyError?.message ?? null);
  }

  if (company.project_id !== String(projectId)) {
    return errorResponse("La empresa no pertenece al proyecto seleccionado", 400);
  }

  const numericScore = Number.isFinite(Number(score)) ? Number(score) : 0;
  const sanitizedScore = Math.max(0, Math.min(100, numericScore));

  const insertPayload = {
    name: String(name).trim(),
    email: email || null,
    phone: phone || null,
    company_id: String(companyId),
    source: source || "otro",
    temperature: temperature || "cold",
    score: sanitizedScore,
    notes: notes || null,
    organization_id: orgId,
    created_by: user!.id,
    project_id: String(projectId),
  };

  const { data, error: dbError } = await supabase
    .from("contacts")
    .insert(insertPayload)
    .select()
    .single();

  if (dbError) {
    console.error(dbError, insertPayload);
    return errorResponse("No se pudo crear el contacto", 500, dbError.message);
  }

  return NextResponse.json(mapContact(data), { status: 201 });
}
