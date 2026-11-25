/**
 * Destino posterior al login, tomado de `?next=` en la URL actual. Solo se
 * aceptan rutas internas ("/algo"); cualquier otra cosa (URL absoluta,
 * "//dominio", etc.) cae a "/" para que el login no sirva de redireccion
 * abierta hacia sitios externos.
 */
export function getSafeNextPath(search: string): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}
