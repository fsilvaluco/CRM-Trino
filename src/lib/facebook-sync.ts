import type { SupabaseClient } from "@supabase/supabase-js";

interface FacebookPageResponse {
  id: string;
  name: string;
  followers_count?: number;
  fan_count?: number;
  error?: { message: string };
}

/**
 * Sincroniza la Página de Facebook vinculada a la conexión de Meta. Usa el
 * mismo Page Access Token que Instagram (misma cuenta de Meta, mismo login)
 * — no requiere una conexión separada.
 *
 * `followers_count` es el campo moderno; `fan_count` (los "me gusta" de la
 * página) es el legado y sirve de respaldo si la Página todavía no expone
 * followers_count.
 */
export async function syncFacebookPage(
  supabase: SupabaseClient,
  orgId: string,
  accessToken: string,
  pageId: string,
  projectId: string
): Promise<{ followers: number; recordedAt: string }> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}?fields=followers_count,fan_count,name&access_token=${accessToken}`
  );

  if (!res.ok) {
    throw new Error(`Error al obtener datos de la Página de Facebook: ${res.status}`);
  }

  const data = (await res.json()) as FacebookPageResponse;

  if (data.error) {
    throw new Error(data.error.message);
  }

  const followers = data.followers_count ?? data.fan_count ?? 0;
  const recordedAt = new Date().toISOString().split("T")[0];

  const { error: insertError } = await supabase.from("social_metrics").insert({
    organization_id: orgId,
    project_id: projectId,
    platform: "facebook",
    followers,
    recorded_at: recordedAt,
  });

  if (insertError) {
    console.error("[facebook-sync] social_metrics insert failed", { orgId, projectId, insertError });
    throw new Error(`No se pudo guardar la métrica: ${insertError.message}`);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("artist_integrations")
    .update({ last_sync_at: now, updated_at: now })
    .eq("organization_id", orgId)
    .eq("platform", "facebook")
    .eq("project_id", projectId);

  if (updateError) {
    console.error("[facebook-sync] artist_integrations last_sync_at update failed", { orgId, projectId, updateError });
  }

  return { followers, recordedAt };
}
