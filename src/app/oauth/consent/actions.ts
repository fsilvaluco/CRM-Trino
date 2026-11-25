"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isTrustedRedirectUri } from "@/lib/mcp/oauth-clients";

// Decision de la pantalla de autorizacion. Va como Server Action (y no como
// API route) porque Next valida el origen de la solicitud: otra pagina no
// puede aprobar un acceso a nombre de alguien con sesion abierta.
export async function decideAuthorization(formData: FormData) {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  const consentPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  if (!authorizationId) redirect("/oauth/consent");

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(consentPath)}`);

  let redirectUrl: string | null = null;
  if (approve) {
    // Se vuelve a validar el cliente en el servidor: el formulario no es
    // fuente confiable de a quien se le esta dando acceso.
    const { data: details } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (!details) redirect(`${consentPath}&error=1`);
    if ("authorization_id" in details && !isTrustedRedirectUri(details.redirect_uri)) {
      redirect(consentPath);
    }
    const { data } = await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
    redirectUrl = data?.redirect_url ?? null;
  } else {
    const { data } = await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    redirectUrl = data?.redirect_url ?? null;
  }

  redirect(redirectUrl ?? `${consentPath}&error=1`);
}
