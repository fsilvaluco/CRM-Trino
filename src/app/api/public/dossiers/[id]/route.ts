import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { resolveDossierValues, DOSSIER_DATA_SOURCE_MAP } from "@/lib/dossier-data-sources";

// GET /api/public/dossiers/[id] -- SIN autenticación (mismo criterio que
// /api/public/eventos/[id]): el link se comparte con managers, sellos,
// venues, etc. sin cuenta. Se eligen a mano los campos devueltos -- nunca
// se expone nada de `dossiers`/`dossier_fields` fuera de lo necesario
// para pintar la página.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: dossier, error: dossierError } = await admin
    .from("dossiers")
    .select("id, organization_id, project_id, name, pdf_path, pdf_page_count")
    .eq("id", id)
    .single();

  if (dossierError || !dossier) {
    return NextResponse.json({ error: "Dossier no encontrado" }, { status: 404 });
  }

  const { data: fieldRows } = await admin
    .from("dossier_fields")
    .select("*")
    .eq("dossier_id", id)
    .order("page_number");

  const { data: fontRows } = await admin
    .from("project_fonts")
    .select("name, file_path, format")
    .eq("project_id", dossier.project_id);

  const values = await resolveDossierValues(admin, dossier.organization_id, dossier.project_id);

  const { data: pdfUrlData } = admin.storage.from("dossiers").getPublicUrl(dossier.pdf_path);

  return NextResponse.json({
    name: dossier.name,
    pdfUrl: pdfUrlData.publicUrl,
    pdfPageCount: dossier.pdf_page_count,
    // Tipografías propias del proyecto -- la página pública también las
    // necesita cargar (@font-face) si algún campo las usa.
    fonts: (fontRows ?? []).map((f) => ({
      name: f.name,
      format: f.format,
      url: admin.storage.from("fonts").getPublicUrl(f.file_path).data.publicUrl,
    })),
    fields: (fieldRows ?? []).map((r) => {
      const source = DOSSIER_DATA_SOURCE_MAP.get(r.data_source);
      return {
        id: r.id,
        pageNumber: r.page_number,
        xPct: Number(r.x_pct),
        yPct: Number(r.y_pct),
        fontFamily: r.font_family,
        fontSize: Number(r.font_size),
        color: r.color,
        bold: r.bold,
        textAlign: r.text_align,
        value: values[r.data_source] ?? null,
        format: source?.format ?? "number",
      };
    }),
  });
}
