// Catálogo de "datos en vivo" que se pueden posicionar en un Dossier +
// resolución de sus valores actuales. Ver migración 092 y CLAUDE.md
// (módulo Dossier). Instagram/Facebook ya sincronizan en vivo (Meta Graph
// API), Spotify es semi-automático (spotify_stats_snapshots), TikTok y
// YouTube son manuales por ahora (manual_platform_stats, migración 091).

export type DossierDataFormat = "number" | "percent" | "decimal";

export interface DossierDataSource {
  key: string;
  label: string;
  group: string;
  format: DossierDataFormat;
}

// Claves de métricas soportadas para la carga manual de TikTok/YouTube --
// usadas tanto por el formulario de carga como por el catálogo de abajo.
export const MANUAL_PLATFORM_METRIC_KEYS: Record<"tiktok" | "youtube", { key: string; label: string; format: DossierDataFormat }[]> = {
  tiktok: [
    { key: "followers", label: "Seguidores", format: "number" },
    { key: "total_viewers", label: "Total de espectadores", format: "number" },
    { key: "new_viewers", label: "Espectadores nuevos", format: "number" },
    { key: "likes", label: "Me gusta", format: "number" },
    { key: "profile_views", label: "Visualizaciones de perfil", format: "number" },
    { key: "comments", label: "Comentarios", format: "number" },
    { key: "shares", label: "Veces compartido", format: "number" },
  ],
  youtube: [
    { key: "subscribers", label: "Suscriptores", format: "number" },
    { key: "unique_viewers", label: "Usuarios únicos", format: "number" },
    { key: "views", label: "Visualizaciones", format: "number" },
    { key: "watch_time_hours", label: "Horas de visualización", format: "number" },
    { key: "ctr_pct", label: "Porcentaje click de impresiones", format: "percent" },
    { key: "impressions", label: "Impresiones", format: "number" },
    { key: "avg_view_duration_seconds", label: "Duración media (segundos)", format: "number" },
    { key: "comments", label: "Comentarios", format: "number" },
    { key: "shares", label: "Veces compartido", format: "number" },
  ],
};

export const DOSSIER_DATA_SOURCES: DossierDataSource[] = [
  { key: "instagram.followers", label: "IG · Seguidores", group: "Instagram", format: "number" },
  { key: "instagram.growth_pct_6m", label: "IG · Crecimiento de seguidores (6 meses)", group: "Instagram", format: "percent" },
  { key: "instagram.views_6m", label: "IG · Visualizaciones (6 meses)", group: "Instagram", format: "number" },
  { key: "instagram.engagement_rate", label: "IG · Tasa de engagement (aprox.)", group: "Instagram", format: "percent" },
  { key: "instagram.age_18_24_pct", label: "IG · Edad 18-24", group: "Instagram", format: "percent" },
  { key: "instagram.age_25_34_pct", label: "IG · Edad 25-34", group: "Instagram", format: "percent" },
  { key: "instagram.age_35_44_pct", label: "IG · Edad 35-44", group: "Instagram", format: "percent" },
  { key: "instagram.age_45_54_pct", label: "IG · Edad 45-54", group: "Instagram", format: "percent" },
  { key: "instagram.age_55_64_pct", label: "IG · Edad 55-64", group: "Instagram", format: "percent" },
  { key: "instagram.age_65_plus_pct", label: "IG · Edad 65+", group: "Instagram", format: "percent" },
  { key: "instagram.gender_female_pct", label: "IG · Género femenino", group: "Instagram", format: "percent" },
  { key: "instagram.gender_male_pct", label: "IG · Género masculino", group: "Instagram", format: "percent" },
  { key: "facebook.followers", label: "Facebook · Seguidores", group: "Facebook", format: "number" },
  { key: "spotify.followers", label: "Spotify · Seguidores", group: "Spotify", format: "number" },
  { key: "spotify.listeners", label: "Spotify · Oyentes", group: "Spotify", format: "number" },
  { key: "spotify.monthly_active_listeners", label: "Spotify · Oyentes activos mensuales", group: "Spotify", format: "number" },
  { key: "spotify.streams", label: "Spotify · Reproducciones", group: "Spotify", format: "number" },
  { key: "spotify.streams_per_listener", label: "Spotify · Reproducciones por oyente", group: "Spotify", format: "decimal" },
  { key: "spotify.saves", label: "Spotify · Guardado", group: "Spotify", format: "number" },
  { key: "spotify.playlist_adds", label: "Spotify · Agregado a playlist", group: "Spotify", format: "number" },
  ...MANUAL_PLATFORM_METRIC_KEYS.tiktok.map((m) => ({
    key: `tiktok.${m.key}`,
    label: `TikTok · ${m.label}`,
    group: "TikTok",
    format: m.format,
  })),
  ...MANUAL_PLATFORM_METRIC_KEYS.youtube.map((m) => ({
    key: `youtube.${m.key}`,
    label: `YouTube · ${m.label}`,
    group: "YouTube",
    format: m.format,
  })),
];

export const DOSSIER_DATA_SOURCE_MAP = new Map(DOSSIER_DATA_SOURCES.map((d) => [d.key, d]));

export function formatDossierValue(value: number | null, format: DossierDataFormat): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (format === "percent") return `${Math.round(value * 10) / 10}%`;
  if (format === "decimal") return (Math.round(value * 100) / 100).toLocaleString("es-CL");
  return Math.round(value).toLocaleString("es-CL");
}

/**
 * Resuelve el valor ACTUAL de cada dato del catálogo para un proyecto --
 * usado tanto por el editor (para previsualizar) como por la página
 * pública del dossier (que renderiza siempre lo más reciente). Nunca
 * lanza por una fuente sin datos todavía: esos campos quedan en null y se
 * muestran como "—" (formatDossierValue).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveDossierValues(supabase: any, orgId: string, projectId: string): Promise<Record<string, number | null>> {
  const values: Record<string, number | null> = {};

  // ── Seguidores por plataforma (últimos registrados) ──────────────────────
  const { data: socialRows } = await supabase
    .from("social_metrics")
    .select("platform, followers, recorded_at")
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .order("recorded_at", { ascending: false });

  const latestByPlatform = new Map<string, { followers: number; recordedAt: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (socialRows ?? []) as any[]) {
    if (!latestByPlatform.has(row.platform)) {
      latestByPlatform.set(row.platform, { followers: row.followers, recordedAt: row.recorded_at });
    }
  }
  values["instagram.followers"] = latestByPlatform.get("instagram")?.followers ?? null;
  values["facebook.followers"] = latestByPlatform.get("facebook")?.followers ?? null;

  // Crecimiento de IG en 6 meses: compara contra el registro más antiguo
  // que caiga cerca de esa ventana (mismo criterio "todos los snapshots
  // guardados", no interpolado).
  const igLatest = latestByPlatform.get("instagram");
  if (igLatest) {
    const sixMonthsAgo = new Date(igLatest.recordedAt);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const older = ((socialRows ?? []) as any[])
      .filter((r) => r.platform === "instagram" && new Date(r.recorded_at) <= sixMonthsAgo)
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0];
    if (older && older.followers > 0) {
      values["instagram.growth_pct_6m"] = ((igLatest.followers - older.followers) / older.followers) * 100;
    } else {
      values["instagram.growth_pct_6m"] = null;
    }
  } else {
    values["instagram.growth_pct_6m"] = null;
  }

  // ── Instagram: visualizaciones/engagement de los últimos 6 meses ─────────
  const sixMonthsAgoIso = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString();
  })();
  const { data: igPosts } = await supabase
    .from("instagram_posts")
    .select("views, reach, likes, comments, saved, shares")
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .gte("posted_at", sixMonthsAgoIso);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts = (igPosts ?? []) as any[];
  const sumViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);
  const sumReach = posts.reduce((s, p) => s + (p.reach ?? 0), 0);
  const sumEngagement = posts.reduce((s, p) => s + (p.likes ?? 0) + (p.comments ?? 0) + (p.saved ?? 0) + (p.shares ?? 0), 0);
  values["instagram.views_6m"] = posts.length > 0 ? sumViews : null;
  // Aproximación (interacciones / alcance) -- no es el cálculo exacto que
  // usa Meta internamente, pero es el estándar más común para "engagement
  // rate" con los datos que expone la Graph API.
  values["instagram.engagement_rate"] = sumReach > 0 ? (sumEngagement / sumReach) * 100 : null;

  // ── Instagram: demografía (edad/género) ───────────────────────────────────
  const { data: demoRows } = await supabase
    .from("instagram_demographics")
    .select("breakdown_type, breakdown_value, value")
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .in("breakdown_type", ["age", "gender"]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const demo = (demoRows ?? []) as any[];
  const ageTotal = demo.filter((d) => d.breakdown_type === "age").reduce((s, d) => s + d.value, 0);
  const genderTotal = demo.filter((d) => d.breakdown_type === "gender").reduce((s, d) => s + d.value, 0);
  const ageMap: Record<string, string> = {
    "18-24": "instagram.age_18_24_pct",
    "25-34": "instagram.age_25_34_pct",
    "35-44": "instagram.age_35_44_pct",
    "45-54": "instagram.age_45_54_pct",
    "55-64": "instagram.age_55_64_pct",
    "65+": "instagram.age_65_plus_pct",
  };
  for (const [bucket, key] of Object.entries(ageMap)) {
    const row = demo.find((d) => d.breakdown_type === "age" && d.breakdown_value === bucket);
    values[key] = row && ageTotal > 0 ? (row.value / ageTotal) * 100 : null;
  }
  const female = demo.find((d) => d.breakdown_type === "gender" && d.breakdown_value === "F");
  const male = demo.find((d) => d.breakdown_type === "gender" && d.breakdown_value === "M");
  values["instagram.gender_female_pct"] = female && genderTotal > 0 ? (female.value / genderTotal) * 100 : null;
  values["instagram.gender_male_pct"] = male && genderTotal > 0 ? (male.value / genderTotal) * 100 : null;

  // ── Spotify (último snapshot cargado) ─────────────────────────────────────
  const { data: spotifyRows } = await supabase
    .from("spotify_stats_snapshots")
    .select("*")
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .order("period_end", { ascending: false })
    .limit(1);
  const spotify = spotifyRows?.[0] ?? null;
  values["spotify.followers"] = spotify?.followers ?? null;
  values["spotify.listeners"] = spotify?.listeners ?? null;
  values["spotify.monthly_active_listeners"] = spotify?.monthly_active_listeners ?? null;
  values["spotify.streams"] = spotify?.streams ?? null;
  values["spotify.streams_per_listener"] = spotify?.streams_per_listener != null ? Number(spotify.streams_per_listener) : null;
  values["spotify.saves"] = spotify?.saves ?? null;
  values["spotify.playlist_adds"] = spotify?.playlist_adds ?? null;

  // ── TikTok / YouTube (último snapshot manual cargado) ─────────────────────
  for (const platform of ["tiktok", "youtube"] as const) {
    const { data: manualRows } = await supabase
      .from("manual_platform_stats")
      .select("metrics")
      .eq("organization_id", orgId)
      .eq("project_id", projectId)
      .eq("platform", platform)
      .order("period_end", { ascending: false })
      .limit(1);
    const metrics = (manualRows?.[0]?.metrics ?? {}) as Record<string, number>;
    for (const { key } of MANUAL_PLATFORM_METRIC_KEYS[platform]) {
      values[`${platform}.${key}`] = metrics[key] ?? null;
    }
  }

  return values;
}
