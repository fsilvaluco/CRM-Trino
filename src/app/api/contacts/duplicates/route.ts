import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any) {
  const projectName = Array.isArray(row.project) ? row.project[0]?.name : row.project?.name;
  const artistProjectName = Array.isArray(row.artist_project)
    ? row.artist_project[0]?.name
    : row.artist_project?.name;
  const companyName = Array.isArray(row.companies) ? row.companies[0]?.name : row.companies?.name;

  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    projectName: projectName ?? null,
    artistProjectName: artistProjectName ?? null,
    companyName: companyName ?? null,
    createdAt: row.created_at,
  };
}

// GET /api/contacts/duplicates -> agrupa por email o telefono (normalizados)
// dentro de toda la organizacion -- los duplicados pueden estar en
// proyectos distintos, asi que no se filtra por proyecto activo.
export async function GET() {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("contacts")
    .select(
      "id, name, email, phone, created_at, project:projects!contacts_project_id_fkey(name), artist_project:projects!contacts_artist_project_id_fkey(name), companies(name)"
    )
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const rows = (data ?? []).map(mapRow);

  const byEmail = new Map<string, typeof rows>();
  const byPhone = new Map<string, typeof rows>();

  for (const row of rows) {
    if (row.email) {
      const key = row.email.trim().toLowerCase();
      byEmail.set(key, [...(byEmail.get(key) ?? []), row]);
    }
    if (row.phone) {
      // normaliza dejando solo digitos, para que "+56 9 1234 5678" y
      // "56912345678" cuenten como el mismo telefono
      const key = row.phone.replace(/\D/g, "");
      if (key) byPhone.set(key, [...(byPhone.get(key) ?? []), row]);
    }
  }

  const seenGroups = new Set<string>();
  const groups: Array<{ matchType: "email" | "phone"; matchValue: string; contacts: typeof rows }> = [];

  for (const [key, group] of byEmail) {
    if (group.length > 1) {
      seenGroups.add(group.map((c) => c.id).sort().join(","));
      groups.push({ matchType: "email", matchValue: key, contacts: group });
    }
  }
  for (const [key, group] of byPhone) {
    if (group.length > 1) {
      const groupKey = group.map((c) => c.id).sort().join(",");
      if (!seenGroups.has(groupKey)) {
        seenGroups.add(groupKey);
        groups.push({ matchType: "phone", matchValue: key, contacts: group });
      }
    }
  }

  return NextResponse.json({ groups });
}
