// Tipos compartidos entre la API y la UI de los enlaces individuales de
// una Preescucha (un enlace por persona, para saber quien escucho).
// Modelo: scripts/migrations/112_preescucha_links.sql.

export const PREESCUCHA_MAX_LINKS = 200;
/** Tope de enlaces que se pueden crear en una sola llamada. */
export const PREESCUCHA_MAX_LINKS_PER_REQUEST = 50;

export interface PreescuchaLinkItem {
  id: string;
  slug: string;
  recipientName: string;
  contactId: string | null;
  revoked: boolean;
  createdAt: string;
  viewCount: number;
  playCount: number;
  downloadCount: number;
  lastActivityAt: string | null;
  /** Reproducciones por cancion: { [trackId]: cantidad }. */
  trackPlays: Record<string, number>;
}

export interface PreescuchaLinksResponse {
  /** Actividad que entro por el enlace general (sin persona asociada). */
  general: {
    viewCount: number;
    playCount: number;
    downloadCount: number;
    trackPlays: Record<string, number>;
  };
  links: PreescuchaLinkItem[];
}

export interface LinkStatRow {
  link_id: string | null;
  track_id: string | null;
  event_type: "view" | "play" | "download";
  total: number;
}

/** Agrupa las filas de preescucha_link_track_stats: reproducciones por cancion de cada enlace ("" = general). */
export function groupTrackPlays(rows: LinkStatRow[]): Map<string, Record<string, number>> {
  const byLink = new Map<string, Record<string, number>>();
  for (const row of rows) {
    if (row.event_type !== "play" || !row.track_id) continue;
    const key = row.link_id ?? "";
    const plays = byLink.get(key) ?? {};
    plays[row.track_id] = (plays[row.track_id] ?? 0) + row.total;
    byLink.set(key, plays);
  }
  return byLink;
}

/** Limpia una lista de nombres pegada a mano: uno por linea, sin vacios ni repetidos. */
export function parseRecipientNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, 120);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
