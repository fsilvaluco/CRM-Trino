import type { SupabaseClient } from "@supabase/supabase-js";
import { syncInstagram } from "@/lib/meta-sync";
import { syncFacebookPage } from "@/lib/facebook-sync";

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
 *
 * Guarda DOS integraciones con el mismo login: Instagram (cuenta Business,
 * como antes) y Facebook (la Página que aloja esa cuenta de Instagram) —
 * mismo Page Access Token para ambas, no hay que volver a autenticar.
 * Conexiones existentes de antes de este cambio no obtienen la fila de
 * Facebook automáticamente: hay que reconectar una vez para que se cree.
 */
export async function finalizeMetaConnection(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string,
  candidate: MetaAccountCandidate,
  tokenExpiresInSeconds: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tokenExpiresAt = new Date(Date.now() + tokenExpiresInSeconds * 1000).toISOString();
  const now = new Date().toISOString();

  const { error: upsertError } = await supabase.from("artist_integrations").upsert(
    {
      organization_id: orgId,
      platform: "instagram",
      project_id: projectId,
      access_token: candidate.pageAccessToken,
      token_expires_at: tokenExpiresAt,
      account_id: candidate.igUserId,
      account_name: candidate.igUsername,
      updated_at: now,
    },
    { onConflict: "organization_id,platform,project_id" }
  );

  if (upsertError) {
    console.error("[meta-connect] instagram upsert failed", upsertError);
    return { ok: false, error: "No se pudo guardar la integración" };
  }

  const { error: fbUpsertError } = await supabase.from("artist_integrations").upsert(
    {
      organization_id: orgId,
      platform: "facebook",
      project_id: projectId,
      access_token: candidate.pageAccessToken,
      token_expires_at: tokenExpiresAt,
      account_id: candidate.pageId,
      account_name: candidate.pageName,
      updated_at: now,
    },
    { onConflict: "organization_id,platform,project_id" }
  );

  if (fbUpsertError) {
    // No abortamos la conexión de Instagram por esto — Facebook es
    // secundario en este flujo. Se puede reintentar reconectando.
    console.error("[meta-connect] facebook upsert failed", fbUpsertError);
  }

  try {
    await syncInstagram(supabase, orgId, candidate.pageAccessToken, candidate.igUserId, projectId);
  } catch (syncError) {
    // No abortamos la conexión si el primer sync falla (ej. rate limit) —
    // la integración queda guardada y el usuario puede sincronizar manual.
    console.error("[meta-connect] initial instagram sync failed", syncError);
  }

  if (!fbUpsertError) {
    try {
      await syncFacebookPage(supabase, orgId, candidate.pageAccessToken, candidate.pageId, projectId);
    } catch (syncError) {
      console.error("[meta-connect] initial facebook sync failed", syncError);
    }
  }

  return { ok: true };
}
