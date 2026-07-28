import type { SupabaseClient } from "@supabase/supabase-js";

// Sin esto, un solo fetch colgado (Meta no responde, glitch de red, etc.)
// bloquea TODA la cadena de await para siempre -- fetch nativo de Node no
// tiene timeout por defecto. Con hasta ~150 llamadas seguidas por cuenta
// (posts + demografia), un solo cuelgue tumba el cron completo sin que
// nunca vuelva una respuesta. Se vio exactamente esto: corridas normales
// duraban 7-12s, la que fallo quedo pegada en 0 bytes por mas de 90s.
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface InstagramMeResponse {
  id: string;
  followers_count: number;
  username: string;
  profile_picture_url?: string;
  error?: { message: string };
}

export type AvatarSyncStatus =
  | "updated"
  | "skipped_manual_override"
  | "no_profile_picture_url"
  | "update_failed";

export async function syncInstagram(
  supabase: SupabaseClient,
  orgId: string,
  accessToken: string,
  igUserId: string,
  projectId: string
): Promise<{ followers: number; recordedAt: string; avatarStatus: AvatarSyncStatus; hasProfilePictureUrl: boolean }> {
  const res = await fetchWithTimeout(
    `https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count,username,profile_picture_url&access_token=${accessToken}`
  );

  if (!res.ok) {
    throw new Error(`Error al obtener datos de Instagram: ${res.status}`);
  }

  const data = (await res.json()) as InstagramMeResponse;

  if (data.error) {
    throw new Error(data.error.message);
  }

  console.log("[meta-sync] instagram graph response", {
    projectId,
    igUserId,
    hasProfilePictureUrl: Boolean(data.profile_picture_url),
    username: data.username,
  });

  const recordedAt = new Date().toISOString().split("T")[0];

  const { error: insertError } = await supabase.from("social_metrics").insert({
    organization_id: orgId,
    project_id: projectId,
    platform: "instagram",
    followers: data.followers_count,
    recorded_at: recordedAt,
  });

  if (insertError) {
    console.error("[meta-sync] social_metrics insert failed", {
      orgId,
      projectId,
      insertError,
    });
    throw new Error(`No se pudo guardar la métrica: ${insertError.message}`);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("artist_integrations")
    .update({ last_sync_at: now, updated_at: now })
    .eq("organization_id", orgId)
    .eq("platform", "instagram")
    .eq("project_id", projectId);

  if (updateError) {
    console.error("[meta-sync] artist_integrations last_sync_at update failed", {
      orgId,
      projectId,
      updateError,
    });
  }

  // Ícono del proyecto: usa la foto de perfil de Instagram como default,
  // pero NUNCA pisa una imagen que el usuario subió a mano
  // (avatar_source = 'manual').
  let avatarStatus: AvatarSyncStatus = "no_profile_picture_url";

  if (data.profile_picture_url) {
    const { data: project, error: projectFetchError } = await supabase
      .from("projects")
      .select("avatar_source")
      .eq("id", projectId)
      .maybeSingle();

    if (projectFetchError) {
      console.error("[meta-sync] projects avatar_source fetch failed", { projectId, projectFetchError });
    }

    if (project && project.avatar_source === "manual") {
      avatarStatus = "skipped_manual_override";
    } else {
      const { error: avatarError } = await supabase
        .from("projects")
        .update({ avatar_url: data.profile_picture_url, avatar_source: "instagram" })
        .eq("id", projectId);

      if (avatarError) {
        console.error("[meta-sync] avatar_url update failed", { projectId, avatarError });
        avatarStatus = "update_failed";
      } else {
        avatarStatus = "updated";
      }
    }
  }

  console.log("[meta-sync] avatar sync result", { projectId, avatarStatus });

  return {
    followers: data.followers_count,
    recordedAt,
    avatarStatus,
    hasProfilePictureUrl: Boolean(data.profile_picture_url),
  };
}

// ── Posts/Reels con metricas de Insights API ──────────────────────────────
// Nota sobre metricas: Meta deprecó "impressions" y "video_views" en Graph
// API v22 -- se reemplazan por "views". Si algun metric individual no
// aplica a un tipo de media puntual, la llamada completa puede fallar; se
// hace best-effort (se intenta con el set completo, y si falla se reintenta
// con un set reducido) en vez de romper todo el sync por un solo post raro.
const MEDIA_INSIGHTS_METRICS = ["views", "reach", "saved", "shares", "likes", "comments"];
const MEDIA_INSIGHTS_METRICS_FALLBACK = ["views", "reach", "likes", "comments"];

interface InstagramMediaItem {
  id: string;
  media_type?: string;
  caption?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp?: string;
}

async function fetchMediaInsights(
  mediaId: string,
  accessToken: string
): Promise<Record<string, number>> {
  for (const metrics of [MEDIA_INSIGHTS_METRICS, MEDIA_INSIGHTS_METRICS_FALLBACK]) {
    try {
      const res = await fetchWithTimeout(
        `https://graph.facebook.com/v22.0/${mediaId}/insights?metric=${metrics.join(",")}&access_token=${accessToken}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;
      const values: Record<string, number> = {};
      for (const entry of data.data ?? []) {
        values[entry.name] = entry.values?.[0]?.value ?? 0;
      }
      return values;
    } catch {
      // timeout u otro error de red en este intento -- probar el
      // siguiente set de metricas (o rendirse si era el ultimo) en vez de
      // tumbar el sync completo de la cuenta por un solo post.
      continue;
    }
  }
  return {};
}

/** Sincroniza los posts/reels recientes (hasta 25) con sus metricas de
 * Insights. "Reemplazado completo": pisa el estado actual de cada post, no
 * es un historico dia a dia -- igual filosofia que el catalogo de Merch. */
export async function syncInstagramPosts(
  supabase: SupabaseClient,
  orgId: string,
  accessToken: string,
  igUserId: string,
  projectId: string,
  limit = 25
): Promise<{ postsCount: number }> {
  const mediaRes = await fetchWithTimeout(
    `https://graph.facebook.com/v22.0/${igUserId}/media?fields=id,media_type,caption,permalink,media_url,thumbnail_url,timestamp&limit=${limit}&access_token=${accessToken}`
  );
  if (!mediaRes.ok) {
    throw new Error(`Error al listar posts de Instagram: ${mediaRes.status}`);
  }
  const mediaData = await mediaRes.json();
  if (mediaData.error) throw new Error(mediaData.error.message);

  const items: InstagramMediaItem[] = mediaData.data ?? [];

  const rows = [];
  for (const item of items) {
    const insights = await fetchMediaInsights(item.id, accessToken);
    rows.push({
      organization_id: orgId,
      project_id: projectId,
      ig_media_id: item.id,
      media_type: item.media_type ?? null,
      caption: item.caption ?? null,
      permalink: item.permalink ?? null,
      media_url: item.media_url ?? null,
      thumbnail_url: item.thumbnail_url ?? item.media_url ?? null,
      posted_at: item.timestamp ?? null,
      views: insights.views ?? null,
      reach: insights.reach ?? null,
      likes: insights.likes ?? null,
      comments: insights.comments ?? null,
      saved: insights.saved ?? null,
      shares: insights.shares ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("instagram_posts")
      .upsert(rows, { onConflict: "organization_id,project_id,ig_media_id" });
    if (error) {
      throw new Error(`No se pudieron guardar los posts de Instagram: ${error.message}`);
    }
  }

  return { postsCount: rows.length };
}

// ── Demografía de seguidores ───────────────────────────────────────────────
// "follower_demographics" reemplazo a las metricas viejas audience_gender_age
// / audience_country / audience_city. Requiere breakdown separado por
// dimension -- no se puede pedir genero+edad+pais en una sola llamada.
const DEMOGRAPHIC_BREAKDOWNS: Array<{ type: "gender" | "age" | "country" | "city"; breakdown: string }> = [
  { type: "gender", breakdown: "gender" },
  { type: "age", breakdown: "age" },
  { type: "country", breakdown: "country" },
  { type: "city", breakdown: "city" },
];

export async function syncInstagramDemographics(
  supabase: SupabaseClient,
  orgId: string,
  accessToken: string,
  igUserId: string,
  projectId: string
): Promise<{ breakdownsSynced: number }> {
  let breakdownsSynced = 0;

  for (const { type, breakdown } of DEMOGRAPHIC_BREAKDOWNS) {
    try {
      const res = await fetchWithTimeout(
        `https://graph.facebook.com/v22.0/${igUserId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${breakdown}&access_token=${accessToken}`
      );
      if (!res.ok) continue; // demografia es "nice to have" -- no bloquea el resto del sync
      const data = await res.json();
      if (data.error) continue;

      const breakdowns = data.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
      if (breakdowns.length === 0) continue;

      const rows = breakdowns.map((b: { dimension_values: string[]; value: number }) => ({
        organization_id: orgId,
        project_id: projectId,
        breakdown_type: type,
        breakdown_value: b.dimension_values?.[0] ?? "Desconocido",
        value: b.value,
        recorded_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("instagram_demographics")
        .upsert(rows, { onConflict: "organization_id,project_id,breakdown_type,breakdown_value" });

      if (!error) breakdownsSynced += rows.length;
    } catch {
      // timeout u otro error de red -- seguir con el siguiente breakdown
      continue;
    }
  }

  return { breakdownsSynced };
}
