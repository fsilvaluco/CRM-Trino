import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { z } from "zod";

const createLeadCandidateSchema = z.object({
  source: z.enum(["email", "whatsapp"]),
  rawExcerpt: z.string().trim().min(1, "El fragmento es requerido"),
  signalReason: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v || null),
  threadReference: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v || null),
  detectedName: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v || null),
  detectedEmail: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v || null),
  detectedPhone: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v || null),
  detectedCompany: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v || null),
  projectId: z
    .union([z.string().uuid(), z.null(), z.undefined()])
    .transform((v) => v || null),
});

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: { message, details: details ?? null } },
    { status }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLeadCandidate(row: any) {
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    source: row.source,
    rawExcerpt: row.raw_excerpt,
    signalReason: row.signal_reason ?? null,
    threadReference: row.thread_reference ?? null,
    detectedName: row.detected_name ?? null,
    detectedEmail: row.detected_email ?? null,
    detectedPhone: row.detected_phone ?? null,
    detectedCompany: row.detected_company ?? null,
    status: row.status,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    resultingContactId: row.resulting_contact_id ?? null,
    resultingCompanyId: row.resulting_company_id ?? null,
    resultingTaskId: row.resulting_task_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET: lista la bandeja de leads pendientes (o filtrada por estado/proyecto)
// Usada por la pantalla de revisión en Artist Pro.
export async function GET(request: NextRequest) {
  const { supabase, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending_review";
  const projectIdParam = searchParams.get("projectId");

  let query = supabase
    .from("lead_candidates")
    .select("*")
    .eq("organization_id", orgId!)
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);
  if (projectIdParam) query = query.eq("project_id", projectIdParam);

  // Si no es admin, solo ve leads de sus proyectos asignados (o sin proyecto asignado aun)
  if (!isAdmin && allowedProjectIds) {
    query = query.or(
      `project_id.is.null,project_id.in.(${allowedProjectIds.join(",") || "00000000-0000-0000-0000-000000000000"})`
    );
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return errorResponse("No se pudo listar la bandeja de leads", 500, dbError.message);
  }

  return NextResponse.json((data ?? []).map(mapLeadCandidate));
}

// POST: usado por el job/detector (Gmail o WhatsApp) para insertar un candidato nuevo.
// No crea contact/company/task todavia -- eso pasa solo al aprobar (ver PATCH en [id]/route.ts).
export async function POST(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsedBody = createLeadCandidateSchema.safeParse(body);
  if (!parsedBody.success) {
    return errorResponse("Payload invalido", 400, parsedBody.error.flatten());
  }

  const {
    source,
    rawExcerpt,
    signalReason,
    threadReference,
    detectedName,
    detectedEmail,
    detectedPhone,
    detectedCompany,
    projectId,
  } = parsedBody.data;

  const insertPayload = {
    organization_id: orgId,
    project_id: projectId,
    source,
    raw_excerpt: rawExcerpt,
    signal_reason: signalReason,
    thread_reference: threadReference,
    detected_name: detectedName,
    detected_email: detectedEmail,
    detected_phone: detectedPhone,
    detected_company: detectedCompany,
    status: "pending_review",
  };

  // El indice unico (organization_id, source, thread_reference) evita duplicados
  // del mismo hilo -- si ya existe, lo devolvemos en vez de fallar.
  const { data, error: dbError } = await supabase
    .from("lead_candidates")
    .upsert(insertPayload, {
      onConflict: "organization_id,source,thread_reference",
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (dbError) {
    return errorResponse("No se pudo registrar el lead candidato", 500, dbError.message);
  }

  return NextResponse.json(mapLeadCandidate(data), { status: 201 });
}
