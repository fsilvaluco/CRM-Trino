import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  PREESCUCHA_MAX_DAYS,
  PREESCUCHA_MAX_TRACKS,
  PREESCUCHA_SELECT,
  generatePreescuchaSlug,
  isUuid,
  listPreescuchaFiles,
  mapPreescucha,
  preescuchaFolder,
  purgeExpiredPreescuchas,
  removePreescuchaFiles,
} from "@/lib/preescuchas";
import { isValidCoverPath, isValidTrackPath } from "@/lib/preescucha-paths";

const createSchema = z.object({
  // El id lo genera el cliente: los archivos se suben ANTES de crear la
  // fila, a la carpeta {projectId}/{id}/ del bucket.
  id: z.string().refine(isUuid, "id inválido"),
  projectId: z.string().refine(isUuid, "projectId inválido"),
  title: z.string().trim().min(1, "El título es requerido").max(200),
  artistName: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  allowDownload: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).max(PREESCUCHA_MAX_DAYS),
  coverPath: z.string().nullable().optional(),
  tracks: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Cada canción necesita un título").max(200),
        filePath: z.string(),
        durationSeconds: z.number().int().min(0).max(86400).nullable().optional(),
      })
    )
    .min(1, "Agrega al menos una canción")
    .max(PREESCUCHA_MAX_TRACKS, `Máximo ${PREESCUCHA_MAX_TRACKS} canciones`),
});

// GET /api/preescuchas?projectId=xxx
export async function GET(request: NextRequest) {
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  // Respaldo del cron diario: al abrir el modulo se borran los archivos de
  // lo que ya vencio en este proyecto. Si falla no bloquea el listado.
  try {
    const purge = await purgeExpiredPreescuchas(createAdminClient(), { projectId });
    if (purge.errors.length > 0) console.error("[preescuchas] purga con errores:", purge.errors);
  } catch (err) {
    console.error("[preescuchas] no se pudo purgar:", err);
  }

  const { data, error: dbError } = await supabase
    .from("preescuchas")
    .select(PREESCUCHA_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapPreescucha));
}

// POST /api/preescuchas -- crea la preescucha con sus canciones. Los
// archivos ya estan en el bucket (subidos con /api/preescuchas/upload-url).
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;

  if (!allowedProjectIds.includes(input.projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const admin = createAdminClient();
  const folder = preescuchaFolder(input.projectId, input.id);

  // Solo se aceptan rutas dentro de la carpeta propia y que existan de
  // verdad en el bucket -- el tamano se toma de Storage, no del cliente.
  const files = await listPreescuchaFiles(admin, folder);
  if (files.error) return NextResponse.json({ error: "No se pudieron verificar los archivos subidos" }, { status: 500 });

  for (const t of input.tracks) {
    if (!isValidTrackPath(folder, t.filePath) || !files.sizes.has(t.filePath)) {
      return NextResponse.json({ error: `No se encontró el archivo de "${t.title}". Vuelve a subirlo.` }, { status: 400 });
    }
  }
  const coverPath = input.coverPath ?? null;
  if (coverPath && (!isValidCoverPath(folder, coverPath) || !files.sizes.has(coverPath))) {
    return NextResponse.json({ error: "No se encontró la carátula. Vuelve a subirla." }, { status: 400 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const slug = await generatePreescuchaSlug(supabase);

  const { data: created, error: dbError } = await supabase
    .from("preescuchas")
    .insert({
      id: input.id,
      organization_id: orgId,
      project_id: input.projectId,
      slug,
      title: input.title,
      artist_name: input.artistName || null,
      message: input.message || null,
      cover_path: coverPath,
      allow_download: input.allowDownload === true,
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      created_by: user!.id,
    })
    .select("id")
    .single();

  if (dbError || !created) {
    return NextResponse.json({ error: `Error al crear la preescucha: ${dbError?.message ?? "sin detalle"}` }, { status: 500 });
  }

  const { error: tracksError } = await supabase.from("preescucha_tracks").insert(
    input.tracks.map((t, i) => ({
      preescucha_id: input.id,
      title: t.title,
      file_path: t.filePath,
      duration_seconds: t.durationSeconds ?? null,
      size_bytes: files.sizes.get(t.filePath) ?? null,
      position: i,
    }))
  );

  if (tracksError) {
    // Sin canciones la preescucha no sirve: se deshace todo para no dejar
    // una fila vacia ni archivos ocupando espacio.
    await supabase.from("preescuchas").delete().eq("id", input.id);
    await removePreescuchaFiles(admin, folder);
    return NextResponse.json({ error: `Error al guardar las canciones: ${tracksError.message}` }, { status: 500 });
  }

  const { data: full } = await supabase.from("preescuchas").select(PREESCUCHA_SELECT).eq("id", input.id).single();
  return NextResponse.json(full ? mapPreescucha(full) : { id: input.id, slug }, { status: 201 });
}
