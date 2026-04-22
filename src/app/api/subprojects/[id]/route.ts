import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { z } from "zod";

const dateFieldSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
  })
  .refine((value) => {
    if (value === undefined || value === null) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }, "La fecha debe tener formato YYYY-MM-DD");

const updateSubprojectSchema = z
  .object({
    name: z
      .union([z.string(), z.undefined()])
      .transform((value) => (value === undefined ? undefined : value.trim()))
      .refine((value) => value === undefined || value.length > 0, "El nombre no puede estar vacio"),
    status: z.enum(["active", "paused", "completed"]).optional(),
    startDate: dateFieldSchema,
    endDate: dateFieldSchema,
    notes: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const trimmedValue = value.trim();
        return trimmedValue === "" ? null : trimmedValue;
      }),
  })
  .refine((value) => {
    if (value.startDate && value.endDate) {
      return value.endDate >= value.startDate;
    }
    return true;
  }, {
    path: ["endDate"],
    message: "La fecha de fin debe ser posterior o igual a la fecha de inicio",
  });

function toIsoDate(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return undefined;
  }

  return parsedDate.toISOString();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: subproject, error: subErr } = await supabase
    .from("subprojects")
    .select("*")
    .eq("id", id)
    .single();

  if (subErr || !subproject) {
    return NextResponse.json({ error: "Subproyecto no encontrado" }, { status: 404 });
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("subproject_id", id);

  return NextResponse.json({
    id: subproject.id, name: subproject.name, status: subproject.status,
    projectId: subproject.project_id, startDate: subproject.start_date ?? null,
    endDate: subproject.end_date ?? null, notes: subproject.notes ?? null,
    createdAt: subproject.created_at, updatedAt: subproject.updated_at,
    tasks: tasks ?? [],
  });
}


export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("subprojects").select("*").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Subproyecto no encontrado" }, { status: 404 });
  }

  const parsedBody = updateSubprojectSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalido", details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }

  const { name, status, startDate, endDate, notes } = parsedBody.data;

  const startDateIso = toIsoDate(startDate);
  const endDateIso = toIsoDate(endDate);

  if ((startDate !== undefined && startDateIso === undefined) || (endDate !== undefined && endDateIso === undefined)) {
    return NextResponse.json({ error: "Formato de fecha invalido" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("subprojects")
    .update({
      name: name ?? existing.name,
      status: status ?? existing.status,
      start_date: startDate !== undefined ? startDateIso : existing.start_date,
      end_date: endDate !== undefined ? endDateIso : existing.end_date,
      notes: notes !== undefined ? notes || null : existing.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id).select().single();

  if (dbError) {
    console.error("Error updating subproject", { id, message: dbError.message });
    return NextResponse.json({ error: "Error al actualizar subproyecto" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id, name: data.name, status: data.status,
    projectId: data.project_id, startDate: data.start_date ?? null,
    endDate: data.end_date ?? null, notes: data.notes ?? null,
    createdAt: data.created_at, updatedAt: data.updated_at,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PUT(request, context);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("subprojects").select("id").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Subproyecto no encontrado" }, { status: 404 });
  }

  const { error: dbError } = await supabase.from("subprojects").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
