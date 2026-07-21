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
  accessToken: string
): Promise<{ followers: number; recordedAt: string }> {
  const res = await fetch(
    `https://graph.instagram.com/v21.0/me?fields=followers_count,username&access_token=${accessToken}`
  );

  if (!res.ok) {
    throw new Error(`Error al obtener datos de Instagram: ${res.status}`);
  }

  const data = (await res.json()) as InstagramMeResponse;

  if (data.error) {
    throw new Error(data.error.message);
  }

  const recordedAt = new Date().toISOString().split("T")[0];

  await supabase.from("social_metrics").insert({
    organization_id: orgId,
    platform: "instagram",
    followers: data.followers_count,
    recorded_at: recordedAt,
  });

  const now = new Date().toISOString();
  await supabase
    .from("artist_integrations")
    .update({ last_sync_at: now, updated_at: now })
    .eq("organization_id", orgId)
    .eq("platform", "instagram");

  return { followers: data.followers_count, recordedAt };
}
