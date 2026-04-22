import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { z } from "zod";

const importContactSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  email: z
    .union([z.string().trim().email(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)),
  phone: z
    .union([z.string().trim(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)),
  company: z
    .union([z.string().trim(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)),
  source: z
    .union([z.string().trim(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : "import")),
  temperature: z
    .union([z.string().trim(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : "cold")),
  score: z.coerce.number().int().min(0).max(100).optional().default(0),
  notes: z
    .union([z.string().trim(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)),
});

const importRequestSchema = z.object({
  projectId: z.string().uuid("projectId debe ser un UUID valido"),
  contacts: z.array(z.unknown()).min(1, "Se requiere un array de contactos"),
});

type SupabaseServerClient = Awaited<ReturnType<typeof requireAuth>>["supabase"];

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function getOrCreateCompanyId(params: {
  supabase: SupabaseServerClient;
  organizationId: string;
  createdBy: string;
  projectId: string;
  companyName: string | null;
}): Promise<string | null> {
  if (!params.companyName) {
    return null;
  }

  const normalizedCompanyName = params.companyName.trim();
  if (!normalizedCompanyName) {
    return null;
  }

  const escapedCompanyName = escapeIlikePattern(normalizedCompanyName);

  const { data: existingCompanies, error: findError } = await params.supabase
    .from("companies")
    .select("id")
    .eq("organization_id", params.organizationId)
    .ilike("name", escapedCompanyName)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (findError) {
    throw new Error(`Error buscando empresa '${normalizedCompanyName}': ${findError.message}`);
  }

  const existingId = existingCompanies?.[0]?.id;
  if (typeof existingId === "string" && z.string().uuid().safeParse(existingId).success) {
    return existingId;
  }

  const { data: insertedCompany, error: insertError } = await params.supabase
    .from("companies")
    .insert({
      name: normalizedCompanyName,
      organization_id: params.organizationId,
      created_by: params.createdBy,
      project_id: params.projectId,
    })
    .select("id")
    .single();

  if (!insertError && insertedCompany?.id && z.string().uuid().safeParse(insertedCompany.id).success) {
    return insertedCompany.id;
  }

  const { data: retriedCompanies, error: retryError } = await params.supabase
    .from("companies")
    .select("id")
    .eq("organization_id", params.organizationId)
    .ilike("name", escapedCompanyName)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  const retriedId = retriedCompanies?.[0]?.id;
  if (!retryError && typeof retriedId === "string" && z.string().uuid().safeParse(retriedId).success) {
    return retriedId;
  }

  throw new Error(
    `No se pudo resolver company_id para '${normalizedCompanyName}': ${insertError?.message ?? retryError?.message ?? "desconocido"}`
  );
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

  const parsedRequest = importRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "Payload invalido", details: parsedRequest.error.flatten() },
      { status: 400 }
    );
  }

  const { contacts: contactList, projectId } = parsedRequest.data;

  // Verify the project exists in the org
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .single();

  if (projectErr || !project) {
    return NextResponse.json(
      { error: "Proyecto no encontrado o sin acceso" },
      { status: 403 }
    );
  }

  // Members can only import into projects they explicitly belong to
  if (!isAdmin && !allowedProjectIds?.includes(projectId)) {
    return NextResponse.json(
      { error: "Sin acceso al proyecto especificado" },
      { status: 403 }
    );
  }

  const results = { imported: 0, failed: 0, errors: [] as string[] };

  for (const rawContact of contactList) {
    const parsedContact = importContactSchema.safeParse(rawContact);
    if (!parsedContact.success) {
      results.failed++;
      results.errors.push(`Contacto invalido: ${parsedContact.error.issues.map((issue) => issue.message).join(", ")}`);
      continue;
    }

    const contact = parsedContact.data;

    let companyId: string | null = null;
    try {
      companyId = await getOrCreateCompanyId({
        supabase,
        organizationId: orgId,
        createdBy: user!.id,
        projectId,
        companyName: contact.company,
      });
    } catch (companyError) {
      results.failed++;
      results.errors.push(
        `Error resolviendo empresa para ${contact.name}: ${
          companyError instanceof Error ? companyError.message : "desconocido"
        }`
      );
      continue;
    }

    const { error: dbError } = await supabase.from("contacts").insert({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      company_id: companyId,
      source: contact.source,
      temperature: contact.temperature,
      score: contact.score,
      notes: contact.notes,
      organization_id: orgId,
      project_id: projectId,
      created_by: user!.id,
    });
    if (dbError) {
      results.failed++;
      results.errors.push(`Error importando ${contact.name}: ${dbError.message}`);
    } else {
      results.imported++;
    }
  }

  return NextResponse.json(results, { status: results.imported > 0 ? 201 : 400 });
}
