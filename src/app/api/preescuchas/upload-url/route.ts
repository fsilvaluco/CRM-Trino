import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { COVER_EXT_BY_MIME, PREESCUCHAS_BUCKET, isUuid, preescuchaFolder } from "@/lib/preescuchas";

// POST /api/preescuchas/upload-url
// Body: { projectId, preescuchaId, kind: "track" | "cover", contentType? }
//
// Entrega una URL firmada de subida para UN archivo. El navegador sube
// directo a Supabase Storage con ella (los audios no pasan por este
// servidor). El bucket es privado y sin policies: esta ruta es la unica
// puerta de entrada, y solo firma rutas dentro de la carpeta de la
// preescucha, con nombre generado aqui.
export async function POST(request: NextRequest) {
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const projectId = body?.projectId;
  const preescuchaId = body?.preescuchaId;
  const kind = body?.kind;

  if (!isUuid(projectId) || !isUuid(preescuchaId)) {
    return NextResponse.json({ error: "projectId y preescuchaId son requeridos" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  // Si la preescucha ya existe (se esta editando), tiene que ser de este
  // mismo proyecto y seguir vigente. Si no existe todavia, es una creacion.
  const { data: existing } = await supabase
    .from("preescuchas")
    .select("project_id, expires_at, purged_at")
    .eq("id", preescuchaId)
    .maybeSingle();
  if (existing) {
    if (existing.project_id !== projectId) {
      return NextResponse.json({ error: "La preescucha no pertenece a este proyecto" }, { status: 403 });
    }
    if (existing.purged_at || new Date(existing.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Esta preescucha ya venció" }, { status: 409 });
    }
  }

  let ext: string;
  if (kind === "track") {
    ext = "mp3";
  } else if (kind === "cover") {
    const coverExt = COVER_EXT_BY_MIME[String(body?.contentType ?? "")];
    if (!coverExt) return NextResponse.json({ error: "La carátula debe ser JPG, PNG o WebP" }, { status: 400 });
    ext = coverExt;
  } else {
    return NextResponse.json({ error: "kind debe ser 'track' o 'cover'" }, { status: 400 });
  }

  const path = `${preescuchaFolder(projectId, preescuchaId)}/${randomUUID()}.${ext}`;
  const { data, error: signError } = await createAdminClient().storage.from(PREESCUCHAS_BUCKET).createSignedUploadUrl(path);
  if (signError || !data) {
    console.error("[preescuchas] no se pudo firmar la subida:", signError?.message);
    return NextResponse.json({ error: "No se pudo preparar la subida" }, { status: 500 });
  }

  return NextResponse.json({ path, token: data.token });
}
