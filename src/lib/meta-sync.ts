import type { SupabaseClient } from "@supabase/supabase-js";

interface InstagramMeResponse {
  id: string;
  followers_count: number;
  username: string;
  error?: { message: string };
}

export async function syncInstagram(
  supabase: SupabaseClient,
  orgId: string,
  accessToken: string,
  igUserId: string,
  projectId: string
): Promise<{ followers: number; recordedAt: string }> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count,username&access_token=${accessToken}`
  );

  if (!res.ok) {
    throw new Error(`Error al obtener datos de Instagram: ${res.status}`);
  }

  const data = (await res.json()) as InstagramMeResponse;

  if (data.error) {
    throw new Error(data.error.message);
  }

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
    .eq("platform", "instagram");

  if (updateError) {
    console.error("[meta-sync] artist_integrations last_sync_at update failed", {
      orgId,
      updateError,
    });
  }

  return { followers: data.followers_count, recordedAt };
}
