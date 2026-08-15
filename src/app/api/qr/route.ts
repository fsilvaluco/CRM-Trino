import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { generateQrSlug } from "@/lib/qr-slug";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapQr(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    label: row.label,
    destinationUrl: row.destination_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scanCount: Array.isArray(row.qr_scans) ? row.qr_scans.length : (row.qr_scans?.[0]?.count ?? 0),
    lastScannedAt: row.last_scanned_at ?? null,
  };
}

// GET /api/qr?projectId=xxx -- lista los QR de un proyecto con su contador
// de escaneos.
export async function GET(request: NextRequest) {
  const { supabase, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  }
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(projectId))) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("qr_codes")
    .select("*, qr_scans ( scanned_at )")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const withStats = (data ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scans = (row as any).qr_scans as Array<{ scanned_at: string }>;
    const lastScannedAt = scans.length > 0
      ? scans.reduce((latest, s) => (s.scanned_at > latest ? s.scanned_at : latest), scans[0].scanned_at)
      : null;
    return mapQr({ ...row, qr_scans: scans, last_scanned_at: lastScannedAt });
  });

  return NextResponse.json(withStats);
}

// POST /api/qr -- crea un QR nuevo. El slug se genera solo (reintenta si
// por mala suerte choca con uno existente -- con 7 caracteres del alfabeto
// usado la probabilidad es minúscula, pero no imposible).
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const destinationUrl = typeof body?.destinationUrl === "string" ? body.destinationUrl.trim() : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";

  if (!label) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  if (!destinationUrl) return NextResponse.json({ error: "El link de destino es requerido" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  try {
    new URL(destinationUrl);
  } catch {
    return NextResponse.json({ error: "El link de destino no es una URL válida (¿falta https://?)" }, { status: 400 });
  }
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(projectId))) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  let slug = generateQrSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: clash } = await supabase.from("qr_codes").select("id").eq("slug", slug).maybeSingle();
    if (!clash) break;
    slug = generateQrSlug();
  }

  const { data, error: dbError } = await supabase
    .from("qr_codes")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      slug,
      label,
      destination_url: destinationUrl,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: `Error al crear el QR: ${dbError.message}` }, { status: 500 });

  return NextResponse.json(mapQr({ ...data, qr_scans: [] }), { status: 201 });
}
