import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  PREESCUCHAS_BUCKET,
  PREESCUCHA_MAX_DAYS,
  PREESCUCHA_MAX_TRACKS,
  isUuid,
  listPreescuchaFiles,
  preescuchaFolder,
  removePreescuchaFiles,
} from "@/lib/preescuchas";
import { isValidCoverPath, isValidTrackPath } from "@/lib/preescucha-paths";

const updateSchema = z.object({
  title: z.string().trim().min(1, "El título es requerido").max(200),
  artistName: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  allowDownload: z.boolean(),
  /** Nueva fecha de vencimiento (ISO). Solo se puede mover dentro de los 30 dias desde la creacion. */
  expiresAt: z.string().optional(),
  /** string = caratula nueva ya subida · null = quitarla · ausente = dejarla como esta */
  coverPath: z.string().nullable().optional(),
  // Lista COMPLETA en el orden final: con `id` = cancion existente (se
  // conserva, se puede renombrar/reordenar); con `filePath` = cancion
  // nueva ya subida. Las existentes que no vengan se eliminan.
  tracks: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().trim().min(1, "Cada canción necesita un título").max(200),
        filePath: z.string().optional(),
        durationSeconds: z.number().int().min(0).max(86400).nullable().optional(),
      })
    )
    .min(1, "Deja al menos una canción")
    .max(PREESCUCHA_MAX_TRACKS, `Máximo ${PREESCUCHA_MAX_TRACKS} canciones`),
});

async function loadOwned(id: string) {
  const auth = await requireAuth();
  if (auth.error) return { ...auth, existing: null };
  if (!isUuid(id)) {
    return { ...auth, existing: null, error: NextResponse.json({ error: "Preescucha no encontrada" }, { status: 404 }) };
  }
  const { data: existing } = await auth.supabase
    .from("preescuchas")
    .select("id, project_id, cover_path, expires_at, purged_at, created_at, preescucha_tracks ( id, file_path )")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return { ...auth, existing: null, error: NextResponse.json({ error: "Preescucha no encontrada" }, { status: 404 }) };
  }
  if (!auth.allowedProjectIds.includes(existing.project_id)) {
    return { ...auth, existing: null, error: NextResponse.json({ error: "Sin acceso a esta preescucha" }, { status: 403 }) };
  }
  return { ...auth, existing };
}

// PUT /api/preescuchas/[id] -- edita los datos y reemplaza la lista de
// canciones (mismo patron de "guardado completo" que smartlinks).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, existing, error } = await loadOwned(id);
  if (error || !existing) return error!;

  if (existing.purged_at || new Date(existing.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Esta preescucha ya venció y no se puede editar. Crea una nueva." }, { status: 409 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminClient();
  const folder = preescuchaFolder(existing.project_id, existing.id);
  const files = await listPreescuchaFiles(admin, folder);
  if (files.error) return NextResponse.json({ error: "No se pudieron verificar los archivos subidos" }, { status: 500 });

  const existingTracks = new Map(
    ((existing.preescucha_tracks ?? []) as Array<{ id: string; file_path: string | null }>).map((t) => [t.id, t.file_path])
  );

  for (const t of input.tracks) {
    if (t.id) {
      if (!existingTracks.has(t.id)) {
        return NextResponse.json({ error: `La canción "${t.title}" ya no existe. Recarga la página.` }, { status: 400 });
      }
    } else if (!t.filePath || !isValidTrackPath(folder, t.filePath) || !files.sizes.has(t.filePath)) {
      return NextResponse.json({ error: `No se encontró el archivo de "${t.title}". Vuelve a subirlo.` }, { status: 400 });
    }
  }
  if (new Set(input.tracks.filter((t) => t.id).map((t) => t.id)).size !== input.tracks.filter((t) => t.id).length) {
    return NextResponse.json({ error: "Hay canciones repetidas en la lista" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    title: input.title,
    artist_name: input.artistName || null,
    message: input.message || null,
    allow_download: input.allowDownload,
    updated_at: new Date().toISOString(),
  };

  let coverPath = existing.cover_path as string | null;
  if (input.coverPath !== undefined) {
    if (input.coverPath !== null && (!isValidCoverPath(folder, input.coverPath) || !files.sizes.has(input.coverPath))) {
      return NextResponse.json({ error: "No se encontró la carátula. Vuelve a subirla." }, { status: 400 });
    }
    coverPath = input.coverPath;
    updates.cover_path = coverPath;
  }

  if (input.expiresAt) {
    const expiresAt = new Date(input.expiresAt);
    const maxExpiry = new Date(new Date(existing.created_at).getTime() + PREESCUCHA_MAX_DAYS * 24 * 60 * 60 * 1000);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "La fecha de vencimiento debe ser futura" }, { status: 400 });
    }
    if (expiresAt.getTime() > maxExpiry.getTime()) {
      return NextResponse.json(
        { error: `La vigencia máxima es de ${PREESCUCHA_MAX_DAYS} días desde que se creó la preescucha` },
        { status: 400 }
      );
    }
    updates.expires_at = expiresAt.toISOString();
  }

  const { error: dbError } = await supabase.from("preescuchas").update(updates).eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Canciones: actualizar las que siguen, insertar las nuevas, borrar las
  // que salieron de la lista.
  const keptIds = new Set(input.tracks.filter((t) => t.id).map((t) => t.id as string));
  const removedIds = [...existingTracks.keys()].filter((trackId) => !keptIds.has(trackId));

  for (const [position, t] of input.tracks.entries()) {
    if (t.id) {
      const { error: updError } = await supabase.from("preescucha_tracks").update({ title: t.title, position }).eq("id", t.id);
      if (updError) return NextResponse.json({ error: updError.message }, { status: 500 });
    } else {
      const { error: insError } = await supabase.from("preescucha_tracks").insert({
        preescucha_id: id,
        title: t.title,
        file_path: t.filePath,
        duration_seconds: t.durationSeconds ?? null,
        size_bytes: files.sizes.get(t.filePath!) ?? null,
        position,
      });
      if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
    }
  }
  if (removedIds.length > 0) {
    const { error: delError } = await supabase.from("preescucha_tracks").delete().in("id", removedIds);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  // Limpieza: cualquier archivo de la carpeta que ya nadie referencia
  // (canciones quitadas, caratula reemplazada, subidas a medias) se borra
  // para no ocupar espacio. Un fallo aqui no invalida el guardado.
  const referenced = new Set<string>();
  if (coverPath) referenced.add(coverPath);
  for (const t of input.tracks) {
    const path = t.id ? existingTracks.get(t.id) : t.filePath;
    if (path) referenced.add(path);
  }
  const orphans = files.paths.filter((p) => !referenced.has(p));
  if (orphans.length > 0) {
    const { error: removeError } = await admin.storage.from(PREESCUCHAS_BUCKET).remove(orphans);
    if (removeError) console.error("[preescuchas] no se pudieron borrar archivos sin uso:", removeError.message);
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/preescuchas/[id] -- elimina la preescucha ahora mismo: borra
// los archivos del bucket y la fila (con sus canciones y eventos).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, existing, error } = await loadOwned(id);
  if (error || !existing) return error!;

  // Primero los archivos: si esto falla no se borra la fila, para no dejar
  // audios sueltos en el bucket que ya nadie sabria que existen.
  const removeError = await removePreescuchaFiles(createAdminClient(), preescuchaFolder(existing.project_id, existing.id));
  if (removeError) {
    console.error("[preescuchas] no se pudieron borrar los archivos:", removeError);
    return NextResponse.json({ error: "No se pudieron borrar los archivos. Intenta de nuevo." }, { status: 500 });
  }

  const { error: dbError } = await supabase.from("preescuchas").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
