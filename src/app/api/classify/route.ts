import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { classifyLead, isAIEnabled } from "@/lib/claude";
import { calculateLeadScore, suggestTemperature } from "@/lib/scoring";
import { z } from "zod";

const classifyRequestSchema = z.object({
  contactId: z.string().uuid("contactId debe ser un UUID valido"),
});

const uuidSchema = z.string().uuid();

type CompanyRelation = { name: string | null } | Array<{ name: string | null }> | null;

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function getCompanyName(companies: CompanyRelation): string | null {
  if (Array.isArray(companies)) {
    return companies[0]?.name ?? null;
  }

  return companies?.name ?? null;
}

type SupabaseServerClient = Awaited<ReturnType<typeof requireAuth>>["supabase"];

async function getOrCreateCompanyId(params: {
  supabase: SupabaseServerClient;
  organizationId: string;
  createdBy: string;
  projectId: string | null;
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
  if (typeof existingId === "string" && uuidSchema.safeParse(existingId).success) {
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

  if (!insertError && insertedCompany?.id && uuidSchema.safeParse(insertedCompany.id).success) {
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
  if (!retryError && typeof retriedId === "string" && uuidSchema.safeParse(retriedId).success) {
    return retriedId;
  }

  throw new Error(
    `No se pudo resolver company_id para '${normalizedCompanyName}': ${insertError?.message ?? retryError?.message ?? "desconocido"}`
  );
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  if (!user?.id) {
    return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsedBody = classifyRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalido", details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }

  const { contactId } = parsedBody.data;

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, name, email, phone, company, company_id, source, temperature, score, notes, organization_id, project_id, companies(name)")
    .eq("id", contactId)
    .is("deleted_at", null)
    .single();

  if (contactErr || !contact) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  const joinedCompanyName = getCompanyName(contact.companies as CompanyRelation);
  const legacyCompanyName = normalizeOptionalText(contact.company);
  const resolvedCompanyName = joinedCompanyName ?? legacyCompanyName;

  let resolvedCompanyId = typeof contact.company_id === "string" ? contact.company_id : null;
  if (!resolvedCompanyId && legacyCompanyName) {
    try {
      resolvedCompanyId = await getOrCreateCompanyId({
        supabase,
        organizationId: contact.organization_id ?? orgId,
        createdBy: user.id,
        projectId: contact.project_id ?? null,
        companyName: legacyCompanyName,
      });
    } catch (companyError) {
      return NextResponse.json(
        {
          error: `Error resolviendo empresa del contacto: ${companyError instanceof Error ? companyError.message : "Unknown"}`,
        },
        { status: 500 }
      );
    }
  }

  const { data: contactActivities } = await supabase
    .from("activities").select("*").eq("contact_id", contactId);
  const acts = contactActivities ?? [];

  if (isAIEnabled()) {
    try {
      const result = await classifyLead(
        {
          name: contact.name,
          company: resolvedCompanyName ?? undefined,
          source: contact.source ?? undefined,
          notes: contact.notes ?? undefined,
        },
        acts.map((a) => ({
          type: a.type as "call" | "email" | "meeting" | "note" | "follow_up",
          description: a.description,
          date: a.created_at ? new Date(a.created_at).toISOString() : "unknown",
        }))
      );

      await supabase
        .from("contacts")
        .update({
          temperature: result.temperature,
          score: result.score,
          company_id: resolvedCompanyId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contactId);

      return NextResponse.json({
        ...result,
        company: resolvedCompanyName,
        companyId: resolvedCompanyId,
        mode: "ai",
      });
    } catch {
      // AI failed — fall through to rule-based scoring below
    }
  }

  const lastActivity = acts.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];

  const daysSinceLastActivity = lastActivity
    ? Math.floor((Date.now() - new Date(lastActivity.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const score = calculateLeadScore({
    temperature: contact.temperature as "cold" | "warm" | "hot",
    hasEmail: !!contact.email,
    hasPhone: !!contact.phone,
    hasCompany: !!resolvedCompanyId || !!resolvedCompanyName,
    activityCount: acts.length,
    daysSinceLastActivity,
    hasDeals: false,
    dealValue: 0,
  });

  const temperature = suggestTemperature(score);
  await supabase
    .from("contacts")
    .update({
      temperature,
      score,
      company_id: resolvedCompanyId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);

  return NextResponse.json({
    temperature,
    score,
    company: resolvedCompanyName,
    companyId: resolvedCompanyId,
    nextAction: "Revisar manualmente y dar seguimiento",
    reasoning: "Clasificacion basada en reglas (sin API key)",
    mode: "rules",
  });
}
