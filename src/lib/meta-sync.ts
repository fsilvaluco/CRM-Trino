import type { SupabaseClient } from "@supabase/supabase-js";

interface InstagramMeResponse {
  id: string;
  followers_count: number;
  username: string;
  profile_picture_url?: string;
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
    `https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count,username,profile_picture_url&access_token=${accessToken}`
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
  if (data.profile_picture_url) {
    const { data: project } = await supabase
      .from("projects")
      .select("avatar_source")
      .eq("id", projectId)
      .maybeSingle();

    if (!project || project.avatar_source !== "manual") {
      const { error: avatarError } = await supabase
        .from("projects")
        .update({ avatar_url: data.profile_picture_url, avatar_source: "instagram" })
        .eq("id", projectId);

      if (avatarError) {
        console.error("[meta-sync] avatar_url update failed", { projectId, avatarError });
      }
    }
  }

  return { followers: data.followers_count, recordedAt };
}
