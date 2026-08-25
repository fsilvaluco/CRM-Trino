import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissionsForMany, canEditModule } from "@/lib/project-roles";

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  let body: { primaryContactId?: string; mergeContactIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { primaryContactId, mergeContactIds } = body;

  if (!primaryContactId || !Array.isArray(mergeContactIds) || mergeContactIds.length === 0) {
    return NextResponse.json(
      { error: "Faltan primaryContactId o mergeContactIds" },
      { status: 400 }
    );
  }

  const idsToMerge = mergeContactIds.filter((id) => id !== primaryContactId);
  if (idsToMerge.length === 0) {
    return NextResponse.json({ error: "No hay contactos distintos para fusionar" }, { status: 400 });
  }

  // Verificar que todos pertenecen a esta organizacion antes de tocar nada
  const { data: allContacts, error: checkErr } = await supabase
    .from("contacts")
    .select("id, notes, project_id, artist_project_id")
    .eq("organization_id", orgId!)
    .in("id", [primaryContactId, ...idsToMerge]);

  if (checkErr || !allContacts || allContacts.length !== idsToMerge.length + 1) {
    return NextResponse.json({ error: "Alguno de los contactos no existe en tu organizacion" }, { status: 404 });
  }

  // Seguridad: no fusionar contactos de proyectos que no comparten
  // jerarquia. Katarsis y Trino son proyectos distintos aunque sean la
  // misma gente en la vida real -- solo se permite si estan en la misma
  // "raiz" (mismo sello, o relacion sello-artista).
  const involvedProjectIds = Array.from(
    new Set(
      allContacts.flatMap((c) => [c.project_id, c.artist_project_id].filter(Boolean))
    )
  ) as string[];

  const { data: involvedProjects } = await supabase
    .from("projects")
    .select("id, parent_project_id")
    .in("id", involvedProjectIds);

  function rootOf(projectId: string): string {
    const proj = involvedProjects?.find((p) => p.id === projectId);
    return proj?.parent_project_id ?? projectId;
  }

  const roots = new Set(involvedProjectIds.map(rootOf));
  if (roots.size > 1) {
    return NextResponse.json(
      {
        error:
          "No se pueden fusionar contactos de proyectos sin relacion sello-artista (ej. Katarsis y Trino son independientes).",
      },
      { status: 403 }
    );
  }

  // Antes esto exigía "isAdmin" (rol de ORGANIZACIÓN) -- sin chequear el
  // proyecto de los contactos en absoluto. Migrado a la matriz: exige
  // acceso Y puede_editar en Contactos de TODOS los proyectos involucrados
  // (ROLES.md, ítem 3 del rediseño de roles).
  if (!involvedProjectIds.every((pid) => allowedProjectIds.includes(pid))) {
    return NextResponse.json({ error: "Sin acceso a alguno de estos proyectos" }, { status: 403 });
  }
  const involvedPerms = await getProjectPermissionsForMany(supabase, user!.id, involvedProjectIds);
  if (!involvedProjectIds.every((pid) => canEditModule(involvedPerms.get(pid) ?? null, "contactos"))) {
    return NextResponse.json(
      { error: "Tu rol no puede editar Contactos en alguno de estos proyectos" },
      { status: 403 }
    );
  }

  // Mover referencias al contacto principal
  const tables: Array<{ table: string; column: string }> = [
    { table: "deals", column: "contact_id" },
    { table: "tasks", column: "contact_id" },
    { table: "activities", column: "contact_id" },
  ];

  for (const { table, column } of tables) {
    const { error: moveErr } = await supabase
      .from(table)
      .update({ [column]: primaryContactId })
      .in(column, idsToMerge);

    if (moveErr) {
      return NextResponse.json(
        { error: `No se pudo mover referencias en ${table}: ${moveErr.message}` },
        { status: 500 }
      );
    }
  }

  // lead_candidates.resulting_contact_id no tiene FK obligatoria pero se
  // actualiza igual para mantener trazabilidad
  await supabase
    .from("lead_candidates")
    .update({ resulting_contact_id: primaryContactId })
    .in("resulting_contact_id", idsToMerge);

  // Combinar notas de los contactos fusionados en el principal
  const primary = allContacts.find((c) => c.id === primaryContactId);
  const mergedNotes = allContacts
    .filter((c) => idsToMerge.includes(c.id) && c.notes)
    .map((c) => c.notes)
    .join("\n");

  if (mergedNotes) {
    const combined = primary?.notes ? `${primary.notes}\n${mergedNotes}` : mergedNotes;
    await supabase.from("contacts").update({ notes: combined }).eq("id", primaryContactId);
  }

  // Archivar (soft-delete) los contactos fusionados
  const { error: deleteErr } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", idsToMerge);

  if (deleteErr) {
    return NextResponse.json(
      { error: `Se movieron las referencias pero no se pudieron archivar los duplicados: ${deleteErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, primaryContactId, mergedCount: idsToMerge.length });
}
