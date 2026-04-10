import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTask(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date ?? null,
    contactId: row.contact_id ?? null,
    companyId: row.company_id ?? null,
    dealId: row.deal_id ?? null,
    projectId: row.project_id ?? null,
    subprojectId: row.subproject_id ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactName: row.contacts?.name ?? null,
    companyName: row.companies?.name ?? null,
    dealTitle: row.deals?.title ?? null,
    projectName: row.projects?.name ?? null,
    subprojectName: row.subprojects?.name ?? null,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const contactId = searchParams.get("contactId");
  const companyId = searchParams.get("companyId");
  const dealId = searchParams.get("dealId");
  const projectId = searchParams.get("projectId");
  const subprojectId = searchParams.get("subprojectId");

  let query = supabase
    .from("tasks")
    .select("*, contacts ( name ), companies ( name ), deals ( title ), projects ( name ), subprojects ( name )")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (contactId) query = query.eq("contact_id", contactId);
  if (companyId) query = query.eq("company_id", companyId);
  if (dealId) query = query.eq("deal_id", dealId);
  if (projectId) query = query.eq("project_id", projectId);
  if (subprojectId) query = query.eq("subproject_id", subprojectId);
  // Filtrar por proyectos accesibles si el usuario es member
  if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) return NextResponse.json([]);
    query = query.in("project_id", allowedProjectIds);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapTask));
}


export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { title, description, priority, dueDate, contactId, companyId, dealId, projectId, subprojectId } = body as Record<string, string | undefined>;

  if (!title || title.trim() === "") {
    return NextResponse.json({ error: "El titulo es requerido" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("tasks")
    .insert({
      title: title.trim(),
      description: description || null,
      status: "sin_empezar",
      priority: priority || "medium",
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      contact_id: contactId || null,
      company_id: companyId || null,
      deal_id: dealId || null,
      project_id: projectId || null,
      subproject_id: subprojectId || null,
      completed_at: null,
      organization_id: orgId,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear tarea: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(mapTask(data), { status: 201 });
}
