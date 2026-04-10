import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { contacts: contactList } = body;

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
