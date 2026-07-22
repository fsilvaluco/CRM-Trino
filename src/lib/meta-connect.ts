import type { SupabaseClient } from "@supabase/supabase-js";
import { syncInstagram } from "@/lib/meta-sync";

export interface MetaAccountCandidate {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUserId: string;
  igUsername: string;
}

/**
 * Guarda la integración elegida y dispara el primer sync. Compartido entre
 * el callback de OAuth (caso de una sola cuenta candidata, no requiere
 * elegir) y el endpoint de finalize (caso de varias cuentas, el usuario
 * elige una en /analytics/connect-instagram).
 */
export async function finalizeMetaConnection(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string,
  candidate: MetaAccountCandidate,
  tokenExpiresInSeconds: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: upsertError } = await supabase.from("artist_integrations").upsert(
    {
      organization_id: orgId,
      platform: "instagram",
      project_id: projectId,
      access_token: candidate.pageAccessToken,
      token_expires_at: new Date(Date.now() + tokenExpiresInSeconds * 1000).toISOString(),
      account_id: candidate.igUserId,
      account_name: candidate.igUsername,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,platform,project_id" }
  );

  if (upsertError) {
    console.error("[meta-connect] upsert failed", upsertError);
    return { ok: false, error: "No se pudo guardar la integración" };
  }

  try {
    await syncInstagram(supabase, orgId, candidate.pageAccessToken, candidate.igUserId, projectId);
  } catch (syncError) {
    // No abortamos la conexión si el primer sync falla (ej. rate limit) —
    // la integración queda guardada y el usuario puede sincronizar manual.
    console.error("[meta-connect] initial sync failed", syncError);
  }

  return { ok: true };
}
