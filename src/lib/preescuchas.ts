import type { SupabaseClient } from "@supabase/supabase-js";
import { generateRandomSlug } from "@/lib/short-slug";

// ─── Preescuchas: reglas compartidas entre la API, el cron y la UI ────────
// Ver scripts/migrations/111_preescuchas.sql para el modelo completo.

export const PREESCUCHAS_BUCKET = "preescuchas";
/** Vigencia maxima. La base lo refuerza con un CHECK (expires_at <= created_at + 30 dias). */
export const PREESCUCHA_MAX_DAYS = 30;
export const PREESCUCHA_MAX_TRACKS = 40;
/** Mismo tope que el bucket (file_size_limit). ~20 min de MP3 a 320 kbps. */
export const PREESCUCHA_MAX_TRACK_BYTES = 50 * 1024 * 1024;
export const PREESCUCHA_MAX_COVER_BYTES = 5 * 1024 * 1024;

export const COVER_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Carpeta de una preescucha dentro del bucket: {projectId}/{preescuchaId}. */
export function preescuchaFolder(projectId: string, preescuchaId: string): string {
  return `${projectId}/${preescuchaId}`;
}

export interface PreescuchaTrackItem {
  id: string;
  title: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  playCount: number;
  downloadCount: number;
}

export interface PreescuchaItem {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  artistName: string | null;
  message: string | null;
  hasCover: boolean;
  allowDownload: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  /** true cuando ya paso la fecha de vencimiento (con o sin archivos borrados todavia). */
  expired: boolean;
  viewCount: number;
  tracks: PreescuchaTrackItem[];
}

export const PREESCUCHA_SELECT =
  "*, preescucha_tracks ( id, title, duration_seconds, size_bytes, position, play_count, download_count )";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPreescucha(row: any): PreescuchaItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracks = ((row.preescucha_tracks ?? []) as any[]).slice().sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    title: row.title,
    artistName: row.artist_name,
    message: row.message,
    hasCover: Boolean(row.cover_path),
    allowDownload: row.allow_download === true,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expired: Boolean(row.purged_at) || new Date(row.expires_at).getTime() <= Date.now(),
    viewCount: row.view_count ?? 0,
    tracks: tracks.map((t) => ({
      id: t.id,
      title: t.title,
      durationSeconds: t.duration_seconds,
      sizeBytes: t.size_bytes,
      playCount: t.play_count ?? 0,
      downloadCount: t.download_count ?? 0,
    })),
  };
}

// El slug es el unico secreto del link (no hay contrasena), por eso es mas
// largo que el de QR/Smartlinks: 12 caracteres de un alfabeto de 54 son
// ~69 bits, imposible de adivinar probando.
export async function generatePreescuchaSlug(supabase: SupabaseClient): Promise<string> {
  let slug = generateRandomSlug(12);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase.from("preescuchas").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = generateRandomSlug(12);
  }
  return slug;
}

/** Lista las rutas completas de todos los archivos de la carpeta de una preescucha. */
export async function listPreescuchaFiles(
  admin: SupabaseClient,
  folder: string
): Promise<{ paths: string[]; sizes: Map<string, number>; error: string | null }> {
  const { data, error } = await admin.storage.from(PREESCUCHAS_BUCKET).list(folder, { limit: 1000 });
  if (error) return { paths: [], sizes: new Map(), error: error.message };
  const sizes = new Map<string, number>();
  for (const f of data ?? []) {
    // Las "carpetas" vienen sin id; aqui solo hay archivos planos.
    if (!f.id) continue;
    sizes.set(`${folder}/${f.name}`, Number((f.metadata as { size?: number } | null)?.size ?? 0));
  }
  return { paths: [...sizes.keys()], sizes, error: null };
}

/**
 * Borra TODOS los archivos de la carpeta de una preescucha (audios,
 * caratula y cualquier archivo huerfano de una subida a medias).
 * Devuelve el mensaje de error si algo fallo -- quien llama decide si
 * reintenta mas tarde.
 */
export async function removePreescuchaFiles(admin: SupabaseClient, folder: string): Promise<string | null> {
  const { paths, error } = await listPreescuchaFiles(admin, folder);
  if (error) return error;
  if (paths.length === 0) return null;
  const { error: removeError } = await admin.storage.from(PREESCUCHAS_BUCKET).remove(paths);
  return removeError ? removeError.message : null;
}

/**
 * Borra los archivos de las preescuchas vencidas y las marca como
 * purgadas. La fila (titulo, fechas, contadores) queda como historial.
 *
 * La llama el cron diario, y tambien el listado de la app para el proyecto
 * que se esta mirando: asi el espacio se libera aunque el cron no este
 * configurado o falle un dia. Si el borrado en Storage falla, NO se marca
 * como purgada -- se reintenta en la siguiente pasada.
 */
export async function purgeExpiredPreescuchas(
  admin: SupabaseClient,
  options: { projectId?: string } = {}
): Promise<{ purged: number; errors: string[] }> {
  const result = { purged: 0, errors: [] as string[] };

  let query = admin
    .from("preescuchas")
    .select("id, project_id")
    .is("purged_at", null)
    .lte("expires_at", new Date().toISOString())
    .limit(200);
  if (options.projectId) query = query.eq("project_id", options.projectId);

  const { data, error } = await query;
  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const row of data ?? []) {
    const removeError = await removePreescuchaFiles(admin, preescuchaFolder(row.project_id, row.id));
    if (removeError) {
      result.errors.push(`${row.id}: ${removeError}`);
      continue;
    }
    const now = new Date().toISOString();
    const { error: tracksError } = await admin.from("preescucha_tracks").update({ file_path: null }).eq("preescucha_id", row.id);
    const { error: updateError } = await admin
      .from("preescuchas")
      .update({ purged_at: now, cover_path: null, updated_at: now })
      .eq("id", row.id);
    if (tracksError || updateError) {
      result.errors.push(`${row.id}: ${(tracksError ?? updateError)!.message}`);
      continue;
    }
    result.purged++;
  }

  return result;
}

/**
 * Busca una preescucha VIGENTE por slug para las rutas publicas. Devuelve
 * null si no existe, ya vencio o ya se borraron sus archivos -- las tres
 * cosas se ven igual desde afuera.
 */
export async function getActivePreescuchaBySlug(admin: SupabaseClient, slug: string) {
  const { data } = await admin
    .from("preescuchas")
    .select("id, project_id, slug, title, artist_name, message, cover_path, allow_download, expires_at, purged_at, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || data.purged_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data;
}

/**
 * Nombre de archivo para la descarga: "03 - Titulo.mp3". Solo ASCII (sin
 * tildes ni simbolos): Supabase Storage codifica dos veces los caracteres
 * no ASCII del nombre y "Canción" se descargaba como "Canci%C3%B3n".
 */
export function downloadFileName(position: number, title: string): string {
  const safe =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ._()&'-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "pista";
  return `${String(position + 1).padStart(2, "0")} - ${safe}.mp3`;
}
