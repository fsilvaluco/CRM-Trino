// Que aplicaciones pueden pedir acceso a una cuenta de Artist Pro via OAuth.
//
// El registro dinamico de clientes (necesario para que Claude se conecte
// solo) permite que CUALQUIER aplicacion se registre en Supabase Auth. Para
// que eso no se pueda usar para enganar a alguien del equipo ("autoriza esta
// app"), la pantalla de autorizacion solo deja aprobar clientes cuya URL de
// retorno sea de Claude o de la propia maquina (Claude Code / Claude Desktop
// usan http://localhost). Se pueden sumar dominios con la variable de entorno
// MCP_OAUTH_ALLOWED_REDIRECT_HOSTS (lista separada por comas).

const DEFAULT_ALLOWED_HOSTS = ["claude.ai", "claude.com"];
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function allowedHosts(): string[] {
  const extra = (process.env.MCP_OAUTH_ALLOWED_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_HOSTS, ...extra];
}

export function isTrustedRedirectUri(redirectUri: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol === "http:") return LOOPBACK_HOSTS.includes(host);
  if (url.protocol !== "https:") return false;
  return allowedHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function redirectHost(redirectUri: string): string {
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
}
