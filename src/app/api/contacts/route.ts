import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { z } from "zod";

const createContactSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  email: z.union([z.string().trim().email("Email invalido"), z.literal(""), z.null(), z.undefined()]).transform((value) => {
    if (typeof value !== "string") return null;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
  }),
  phone: z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (typeof value !== "string") return null;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
  }),
  companyId: z
    .union([z.string().uuid("La empresa debe ser un UUID valido"), z.literal(""), z.null(), z.undefined()])
    .transform((value) => {
      if (typeof value !== "string") return null;
      const trimmedValue = value.trim();
      return trimmedValue === "" ? null : trimmedValue;
    }),
  source: z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (typeof value !== "string") return "otro";
    const trimmedValue = value.trim();
    return trimmedValue === "" ? "otro" : trimmedValue;
  }),
  temperature: z.union([z.enum(["cold", "warm", "hot"]), z.null(), z.undefined()]).transform((value) => value ?? "cold"),
  score: z.coerce.number().int().min(0).max(100).optional().default(0),
  notes: z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (typeof value !== "string") return null;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
  }),
  projectId: z.string().uuid("El proyecto debe ser un UUID valido"),
});

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
  const { supabase, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const temperature = searchParams.get("temperature");
  const source = searchParams.get("source");
  const projectIdParam = searchParams.get("projectId");

  // Validate projectId belongs to current org (prevent cross-org leakage)
  if (projectIdParam) {
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectIdParam)
      .eq("organization_id", orgId!)
      .single();
    if (!proj) {
      return errorResponse("Proyecto no encontrado", 404);
    }
    if (!isAdmin && allowedProjectIds && !allowedProjectIds.includes(projectIdParam)) {
      return errorResponse("Sin acceso al proyecto", 403);
    }
  }

  let query = supabase
    .from("contacts")
    .select("*, companies(name)")
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (projectIdParam) query = query.eq("project_id", projectIdParam);
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

  const parsedBody = createContactSchema.safeParse(body);
  if (!parsedBody.success) {
    return errorResponse("Payload invalido", 400, parsedBody.error.flatten());
  }

  const { name, email, phone, companyId, source, temperature, score, notes, projectId } =
    parsedBody.data;

  if (!isAdmin && allowedProjectIds && !allowedProjectIds.includes(String(projectId))) {
    return errorResponse("No tienes acceso al proyecto seleccionado", 403);
  }

  if (companyId) {
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
  }

  const numericScore = Number.isFinite(Number(score)) ? Number(score) : 0;
  const sanitizedScore = Math.max(0, Math.min(100, numericScore));

  const insertPayload = {
    name: String(name).trim(),
    email: email || null,
    phone: phone || null,
    company_id: companyId || null,
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
    return errorResponse("No se pudo crear el contacto", 500, dbError.message);
  }

  return NextResponse.json(mapContact(data), { status: 201 });
}
