import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import { suggestColumnMapping } from "@/lib/gemini";
import { IMPORT_TARGETS, type ImportTargetType } from "@/lib/import-schemas";

const MAX_FILE_SIZE = 10_000_000; // 10MB

export async function POST(request: NextRequest) {
  const { isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo administradores pueden importar datos masivos" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const targetType = formData.get("targetType") as ImportTargetType | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!targetType || !IMPORT_TARGETS[targetType]) {
    return NextResponse.json({ error: "Tipo de dato inválido" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "El archivo es muy grande (máximo 10MB)" }, { status: 413 });
  }

  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = parseSpreadsheet(buffer, file.name);
  } catch (err) {
    console.error("[admin/import/parse] failed to parse file", err);
    return NextResponse.json({ error: "No se pudo leer el archivo — confirma que sea un .csv o .xlsx válido" }, { status: 400 });
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: "El archivo no tiene filas de datos" }, { status: 400 });
  }

  const targetFields = IMPORT_TARGETS[targetType].fields.map((f) => ({ key: f.key, label: f.label }));

  let suggestedMapping: Record<string, string | null> = {};
  try {
    suggestedMapping = await suggestColumnMapping(targetFields, parsed.headers, parsed.rows);
  } catch (err) {
    console.error("[admin/import/parse] mapping suggestion failed", err);
    // No es fatal — el usuario mapea a mano si la IA no responde.
  }

  return NextResponse.json({
    headers: parsed.headers,
    rows: parsed.rows,
    totalRows: parsed.rows.length,
    sampleRows: parsed.rows.slice(0, 5),
    suggestedMapping,
  });
}
