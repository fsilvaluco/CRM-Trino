import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { contacts: contactList, projectId } = body;

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId es requerido. Los contactos importados deben pertenecer a un proyecto." },
      { status: 400 }
    );
  }

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

  if (!Array.isArray(contactList) || contactList.length === 0) {
    return NextResponse.json({ error: "Se requiere un array de contactos" }, { status: 400 });
  }

  const results = { imported: 0, failed: 0, errors: [] as string[] };

  for (const contact of contactList) {
    if (!contact.name) {
      results.failed++;
      results.errors.push(`Contacto sin nombre: ${JSON.stringify(contact)}`);
      continue;
    }
    const { error: dbError } = await supabase.from("contacts").insert({
      name: contact.name,
      email: contact.email || null,
      phone: contact.phone || null,
      company: contact.company || null,
      source: contact.source || "import",
      temperature: contact.temperature || "cold",
      score: contact.score || 0,
      notes: contact.notes || null,
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
