import { SMARTLINK_PLATFORMS } from "@/lib/smartlink-platforms";

export interface SmartlinkLinkInput {
  platform: string;
  url: string;
  label?: string | null;
  featured?: boolean;
}

// Normaliza la lista de links que manda el formulario (POST y PUT usan la
// misma): filtra filas sin URL o con plataforma fuera del catalogo, y
// garantiza A LO MAS un `featured` por smartlink (el primero marcado gana)
// -- el destacado es "la plataforma que se empuja en esta campana", dos
// destacados no significan nada.
export function sanitizeSmartlinkLinks(input: SmartlinkLinkInput[]) {
  const validPlatformKeys = new Set(SMARTLINK_PLATFORMS.map((p) => p.key));
  let featuredTaken = false;
  return input
    .filter((l) => l && typeof l.url === "string" && l.url.trim() && typeof l.platform === "string" && validPlatformKeys.has(l.platform))
    .map((l) => {
      const featured = l.featured === true && !featuredTaken;
      if (featured) featuredTaken = true;
      return { platform: l.platform, url: l.url.trim(), label: l.label?.trim() || null, featured };
    });
}
